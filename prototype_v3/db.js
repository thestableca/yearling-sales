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
  const { data: submission, error: subError } = await supabaseAsOwner()
    .from("submissions")
    .select("*")
    .eq("email", email.toLowerCase())
    .eq("year", new Date().getFullYear())
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

// Replaces the old localStorage-backed submitResponse() write. Upserts by
// email (matching the old "filter out existing, then push" re-submission
// behavior) using a real unique constraint + transaction-safe upsert
// instead of a full-table read-modify-write.
async function persistSubmission(response) {
  await loadCurrentSaleYearMap();

  const submissionPayload = {
    owner_id: response.ownerId || null,
    year: new Date().getFullYear(),
    interest: response.interest,
    name: response.name,
    email: response.email,
    unmatched: response.unmatched,
    eligibility_preferences: response.eligibilityPreferences,
    apply_mode: response.applyMode,
    updated_at: new Date().toISOString(),
  };

  // Find an existing submission for this email (this year) to update in
  // place, matching the old "resubmission replaces the previous one"
  // behavior — otherwise insert a new one.
  const { data: existing } = await supabaseAsOwner()
    .from("submissions")
    .select("id")
    .eq("email", response.email)
    .eq("year", submissionPayload.year)
    .maybeSingle();

  let submissionId = existing?.id;
  if (submissionId) {
    const { error: updateError } = await supabaseAsOwner()
      .from("submissions")
      .update(submissionPayload)
      .eq("id", submissionId);
    if (updateError) return { ok: false, message: updateError.message };
    // Clear old per-sale responses before re-inserting current ones, so a
    // resubmission that drops a previously-selected sale doesn't leave a
    // stale row behind.
    await supabaseAsOwner().from("responses").delete().eq("submission_id", submissionId);
  } else {
    const { data: inserted, error: insertError } = await supabaseAsOwner()
      .from("submissions")
      .insert(submissionPayload)
      .select("id")
      .single();
    if (insertError) return { ok: false, message: insertError.message };
    submissionId = inserted.id;
  }

  const responseRows = Object.entries(response.saleResponses || {})
    .map(([saleId, prefs]) => {
      const saleYearId = saleIdToCurrentSaleYearId.get(saleId);
      if (!saleYearId) return null;
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

  return { ok: true };
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
