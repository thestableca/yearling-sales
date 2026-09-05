// Data access layer: reads/writes the real Supabase tables and reshapes
// rows into the same nested `response` object shape the rest of app.js
// already expects (submitResponse()'s shape) — { id, ownerId, name, email,
// unmatched, interest, selectedSales, eligibilityPreferences, applyMode,
// saleResponses, submittedAt }. Keeping that in-memory shape unchanged
// means flattenResponses(), the Dashboard, Sale History, and CSV export
// all keep working without a rewrite — only the storage layer underneath
// them changes.
//
// Per the schema migration notes: never trust a row read back from the
// database to exactly match the expected shape without normalizing it —
// normalizeDraft()/normalizePrefs() in app.js already do this for
// saleResponses; buildResponseFromRows() below does the equivalent for
// data coming out of Postgres.

// sale_year_id -> sale_id lookup, populated by loadSaleYears() so response
// rows (which store sale_year_id) can be reshaped back into the
// saleResponses[saleId] structure the UI expects. Refreshed on demand.
let saleYearIdToSaleId = new Map();

async function loadSaleYears() {
  const { data, error } = await supabasePublic()
    .from("sale_years")
    .select("id, sale_id, year, label, is_current")
    .order("sale_id");
  if (error) {
    console.error("loadSaleYears failed:", error.message);
    return [];
  }
  saleYearIdToSaleId = new Map(data.map((row) => [row.id, row.sale_id]));
  return data;
}

// Maps sale_id -> current sale_year_id, needed when writing a response
// (the UI works in terms of sale_id, e.g. "ohio"; the database scopes by
// sale_year_id). Assumes one is_current=true row per sale, matching the
// seed data — see database_schema_design.md.
let saleIdToCurrentSaleYearId = new Map();

async function loadCurrentSaleYearMap() {
  const { data, error } = await supabasePublic()
    .from("sale_years")
    .select("id, sale_id")
    .eq("is_current", true);
  if (error) {
    console.error("loadCurrentSaleYearMap failed:", error.message);
    return new Map();
  }
  saleIdToCurrentSaleYearId = new Map(data.map((row) => [row.sale_id, row.id]));
  return saleIdToCurrentSaleYearId;
}

function buildResponseFromRows(submission, responseRows, ownerEmailFallback) {
  const saleResponses = {};
  responseRows
    .filter((row) => row.submission_id === submission.id)
    .forEach((row) => {
      const saleId = saleYearIdToSaleId.get(row.sale_year_id);
      if (saleId) saleResponses[saleId] = normalizePrefs(row.answers || {});
    });
  return {
    id: submission.owner_id || `unmatched_${submission.email}`,
    ownerId: submission.owner_id || null,
    name: submission.name || "Unknown",
    email: submission.email || ownerEmailFallback || "",
    unmatched: !!submission.unmatched,
    interest: submission.interest,
    selectedSales: Object.keys(saleResponses),
    eligibilityPreferences: submission.eligibility_preferences || [],
    applyMode: submission.apply_mode || "",
    saleResponses,
    submittedAt: submission.submitted_at,
  };
}

// Fetches a single owner's own submission + responses, for the owner-facing
// side of the site. Relies on the "owner can manage own submission"/"owner
// can manage own responses" RLS policies (matched against the signed-in
// owner's verified auth email) — a signed-in owner querying any other
// email's row simply gets nothing back, enforced server-side.
async function fetchOwnSubmission(email) {
  await loadSaleYears();
  const currentYear = await getCurrentSaleYearNumber();
  const { data: submission, error: subError } = await supabaseAsOwner()
    .from("submissions")
    .select("*")
    .eq("email", email.toLowerCase())
    .eq("year", currentYear)
    .maybeSingle();
  if (subError || !submission) {
    if (subError) console.error("fetchOwnSubmission failed:", subError.message);
    return null;
  }
  const { data: responseRows, error: respError } = await supabaseAsOwner()
    .from("responses")
    .select("*")
    .eq("submission_id", submission.id);
  if (respError) {
    console.error("fetchOwnSubmission (responses) failed:", respError.message);
    return null;
  }
  return buildResponseFromRows(submission, responseRows || [], email);
}

// Replaces the old localStorage-backed getResponses(). Admin-only per RLS
// (is_admin()) — callers on the owner-facing side never need the full list.
async function fetchAllResponses() {
  await loadSaleYears();
  const { data: submissions, error: subError } = await supabaseAsAdmin()
    .from("submissions")
    .select("*")
    .order("submitted_at", { ascending: false });
  if (subError) {
    console.error("fetchAllResponses (submissions) failed:", subError.message);
    return [];
  }
  const { data: responseRows, error: respError } = await supabaseAsAdmin()
    .from("responses")
    .select("*");
  if (respError) {
    console.error("fetchAllResponses (responses) failed:", respError.message);
    return [];
  }
  return submissions.map((submission) => buildResponseFromRows(submission, responseRows));
}

// Replaces the old localStorage-backed submitResponse() write.
//
// Uses a real database upsert (submissions_email_year_unique constraint,
// see supabase/migrations/*_fix_email_normalization.sql) instead of a
// select-then-insert-or-update — the old pattern had a real race
// condition (two concurrent submits, e.g. two browser tabs, could both
// "not find an existing row" and both insert, creating duplicates) which
// an upsert on a real constraint closes atomically at the database level
// regardless of what the client does.
//
// The submission's `year` comes from the CURRENT sale year (is_current
// in sale_years), not the system clock's calendar year — a previous
// version used new Date().getFullYear(), which would have silently
// scoped a resubmission to a DIFFERENT year than the owner's original
// submission the moment the sale runs past December 31st, making them
// unfindable as "the same owner" and defeating the whole point of this
// upsert. sale_years.year already exists specifically to avoid the
// calendar year ever being trusted for this.
async function persistSubmission(response) {
  await loadCurrentSaleYearMap();

  const currentYear = await getCurrentSaleYearNumber();

  const submissionPayload = {
    owner_id: response.ownerId || null,
    year: currentYear,
    interest: response.interest,
    name: response.name,
    email: response.email,
    unmatched: response.unmatched,
    eligibility_preferences: response.eligibilityPreferences,
    apply_mode: response.applyMode,
    updated_at: new Date().toISOString(),
  };

  const { data: upserted, error: upsertError } = await supabaseAsOwner()
    .from("submissions")
    .upsert(submissionPayload, { onConflict: "email,year" })
    .select("id")
    .single();
  if (upsertError) return { ok: false, message: upsertError.message };
  const submissionId = upserted.id;

  // Clear old per-sale responses before re-inserting current ones, so a
  // resubmission that drops a previously-selected sale doesn't leave a
  // stale row behind. Note: this delete-then-insert is not atomic — if
  // the insert below fails after this succeeds, the owner's prior
  // responses are gone. Acceptable here because submitResponse() in
  // app.js surfaces any failure to the owner with a "please try again"
  // message rather than silently declaring success, so a failed
  // resubmission is visible and re-submittable, not silently lost.
  const { error: deleteError } = await supabaseAsOwner().from("responses").delete().eq("submission_id", submissionId);
  if (deleteError) return { ok: false, message: deleteError.message };

  const skippedSales = [];
  const responseRows = Object.entries(response.saleResponses || {})
    .map(([saleId, prefs]) => {
      const saleYearId = saleIdToCurrentSaleYearId.get(saleId);
      if (!saleYearId) {
        // A selected sale has no current sale_year row — e.g. Anthony
        // deactivated it between when the owner started the form and
        // when they submitted. Previously this silently dropped the
        // owner's answers for that sale with no trace anywhere. Now it's
        // surfaced back to the caller so the UI can tell the owner,
        // instead of quietly losing part of their submission.
        skippedSales.push(saleId);
        return null;
      }
      return {
        submission_id: submissionId,
        owner_id: response.ownerId || null,
        sale_year_id: saleYearId,
        answers: prefs,
      };
    })
    .filter(Boolean);

  if (responseRows.length) {
    const { error: responsesError } = await supabaseAsOwner().from("responses").insert(responseRows);
    if (responsesError) return { ok: false, message: responsesError.message };
  }

  if (skippedSales.length) {
    console.error("persistSubmission: these selected sales had no active sale_year and were not saved:", skippedSales);
    return { ok: true, skippedSales };
  }

  return { ok: true };
}

// The submissions.year to scope a submission to — the year of whichever
// sale_year is currently marked is_current, not the system clock's
// calendar year (see persistSubmission's comment for why). Falls back to
// the system year only if, unexpectedly, no sale_year is marked current
// at all (so a submission still gets written rather than failing outright).
async function getCurrentSaleYearNumber() {
  const { data, error } = await supabasePublic()
    .from("sale_years")
    .select("year")
    .eq("is_current", true)
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    console.error("getCurrentSaleYearNumber: no is_current sale_year found, falling back to system clock year:", error?.message);
    return new Date().getFullYear();
  }
  return data.year;
}

// Loads Anthony's admin settings (exchange rate, confirmed buckets,
// question sets) into the in-memory cache that questions.js's getters
// read synchronously — see adminSettingsCache in questions.js.
//
// Called at startup (before we know if this visitor will sign in as
// admin), so it uses supabasePublic(): the "anyone can read question
// sets" RLS policy means the question_sets key comes back either way
// (needed so the intake form knows what to ask for a signed-out owner);
// the other, admin-only keys (exchange_rate, confirmed_buckets) simply
// don't come back for a non-admin caller. refreshAdminSettingsCache()
// below re-loads with full admin access once an admin session exists, so
// the admin UI still sees everything after logging in.
async function loadAdminSettingsCache() {
  const { data, error } = await supabasePublic().from("admin_settings").select("key, value");
  if (error) {
    console.error("loadAdminSettingsCache failed:", error.message);
    return;
  }
  adminSettingsCache = Object.fromEntries(data.map((row) => [row.key, row.value]));
}

async function refreshAdminSettingsCache() {
  const { data, error } = await supabaseAsAdmin().from("admin_settings").select("key, value");
  if (error) {
    console.error("refreshAdminSettingsCache failed:", error.message);
    return;
  }
  adminSettingsCache = Object.fromEntries(data.map((row) => [row.key, row.value]));
}
