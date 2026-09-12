// ===== Questions module: block schema, storage, and default preset =====
// This file defines the data layer for a configurable, block-based
// questionnaire. It does not change any current behavior on its own —
// app.js keeps working exactly as before until it is wired to read from
// this module in a later step.

const DEFAULT_USD_PER_CAD = 1 / 1.4; // matches the rate the reference data was originally computed with

// ----- Admin settings cache -----
// Anthony's own configuration (exchange rate, confirmed buckets, question
// sets) now lives in the admin_settings table (key/value + jsonb) instead
// of localStorage — this is a robustness fix (survives a cleared cache or
// a different device), not a security fix, since none of this is owner
// personal data. Since these values are read synchronously throughout
// app.js's render functions but Supabase reads are async, a small cache is
// loaded once at startup (see loadAdminSettingsCache() in db.js) and these
// getters read that cache directly, same shape as the old localStorage
// reads. Setters write through to the database AND update the cache
// immediately, so a render right after a save sees the new value without
// waiting on the round trip.

let adminSettingsCache = {};

function getSetting(key, fallback) {
  return key in adminSettingsCache ? adminSettingsCache[key] : fallback;
}

async function setSetting(key, value) {
  adminSettingsCache[key] = value;
  const { error } = await supabaseAsAdmin().from("admin_settings").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) console.error(`setSetting(${key}) failed:`, error.message);
}

// admin_settings.value is jsonb NOT NULL — setSetting(key, null) would
// violate that constraint and fail silently (setSetting only logs the
// error, it doesn't throw), leaving the old value in place while the
// in-memory cache already moved on to null. Deleting the row is the
// correct way to clear a setting; getSetting()'s fallback then applies
// exactly as if it had never been set.
async function deleteSetting(key) {
  delete adminSettingsCache[key];
  const { error } = await supabaseAsAdmin().from("admin_settings").delete().eq("key", key);
  if (error) console.error(`deleteSetting(${key}) failed:`, error.message);
  return !error;
}

// ----- Exchange rate -----
// The single source of truth for CAD -> USD conversion, used by both the
// Sale History currency toggle and the Dashboard's capital figure. Stored
// as USD-per-1-CAD (e.g. 0.7143) so every conversion is just cad * rate.
function getExchangeRate() {
  const stored = Number(getSetting("exchange_rate", null));
  return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_USD_PER_CAD;
}

async function saveExchangeRate(usdPerCad) {
  await setSetting("exchange_rate", usdPerCad);
}

// ----- Confirmed buckets -----
// Separate from bucket_config (which drives the owner-intake question set).
// This is Anthony's actual, finalized offer for a sale year, decided AFTER
// reviewing demand on the dashboard's "Suggested buckets" panel — it does
// not feed back into what owners see in the intake form.

function loadConfirmedBuckets() {
  const stored = getSetting("confirmed_buckets", {});
  return stored && typeof stored === "object" ? stored : {};
}

async function saveConfirmedBuckets(bySaleYear) {
  await setSetting("confirmed_buckets", bySaleYear);
}

function getConfirmedBuckets(saleYearId) {
  const all = loadConfirmedBuckets();
  return all[saleYearId] || [];
}

async function saveConfirmedBucketsFor(saleYearId, buckets) {
  const all = loadConfirmedBuckets();
  all[saleYearId] = buckets;
  await saveConfirmedBuckets(all);
}

function newConfirmedBucket() {
  return { id: "cb_" + Math.random().toString(36).slice(2, 10), name: "New bucket", price: null, gait: "any", sex: "any", note: "" };
}

// ----- Block schema -----
// A block looks like:
// {
//   id: "gait",                    // stable key; answers are stored keyed on this, never on the label
//   type: "single_select",         // single_select | multi_select | yes_no | bucket_config | text | number
//   label: "Which gait...",
//   helpText: "",                  // optional prompt text shown above the options
//   options: [{ value, label, help }],
//   required: true,
//   dependsOn: null,                // or { blockId, op, value } — op: equals | includes | notEmpty
//   sortOrder: 0,
//   gatesProgress: true             // default true; see visibleBlocks() below
// }
//
// gatesProgress: most blocks must be answered before anything later can
// appear (the walk stops and waits). A few blocks don't individually block
// progress to what comes after — e.g. priceTierMatrix is optional-feeling
// (an owner can leave every tier row unfilled and still continue), so the
// flow is allowed to move on (e.g. reveal applyMode) even while it's blank.
// Set gatesProgress: false on a block to opt out of blocking the walk.

// A block's dependsOn is either a single { blockId, op, value } condition,
// or an array of them (all must be satisfied) — used when a block only
// becomes relevant once several earlier answers are all in, e.g.
// bucketDetailMode needing both sexTrotter and sexPacer once gait="both".
function blockDependsOnSatisfied(block, answers) {
  if (!block.dependsOn) return true;
  if (Array.isArray(block.dependsOn)) {
    return block.dependsOn.every((condition) => conditionSatisfied(condition, answers));
  }
  return conditionSatisfied(block.dependsOn, answers);
}

function conditionSatisfied(condition, answers) {
  const { blockId, op, value } = condition;
  const parentValue = answers[blockId];
  if (op === "notEmpty") {
    if (Array.isArray(parentValue)) return parentValue.length > 0;
    return Boolean(parentValue);
  }
  if (op === "equals") return parentValue === value;
  if (op === "includes") {
    if (Array.isArray(parentValue)) return parentValue.includes(value);
    return parentValue === value;
  }
  // "in": parentValue must equal one of several values, e.g. gait is
  // "trotter" OR "pacer" (but not "both", which routes to a different
  // pair of blocks instead). value is an array for this op.
  if (op === "in") return Array.isArray(value) && value.includes(parentValue);
  return true;
}

function blockAnswered(block, answers) {
  const value = answers[block.id];
  if (block.type === "multi_select") return Array.isArray(value) && value.length > 0;
  if (block.type === "bucket_matrix" || block.type === "price_tier_matrix") return Boolean(value && value.ready);
  if (block.type === "per_horse_shares") return Array.isArray(value) && value.length > 0 && value.every((v) => v);
  return value !== undefined && value !== null && value !== "";
}

// Returns the ordered list of blocks that should currently be shown,
// given the blocks defined for a question set and the answers so far.
// This mirrors how defaultQuestions() in app.js currently reveals one
// question (or a small related set of questions) at a time: blocks are
// walked in sortOrder and grouped whenever consecutive blocks share the
// exact same dependsOn (e.g. sexTrotter + sexPacer both depend on
// gait="both", and are shown/required together as a pair). A group only
// becomes visible once its dependsOn is satisfied, and the walk stops
// right after the first group containing an unanswered gating block —
// nothing after it can be reached yet, even if its own dependsOn would
// otherwise be satisfied by a hypothetical future answer. Bucket-config
// blocks and blocks marked gatesProgress: false are never "answered" in
// this sense — they don't block the walk, though they still render.
function visibleBlocks(blocks, answers) {
  return walkBlocks(blocks, answers).visible;
}

// True once the walk has reached the natural end of the question set —
// every block whose dependsOn is (reachably) satisfied has been shown
// and answered — rather than stopping early on an unanswered gating
// block. This is what tells app.js it's safe to reveal the final
// applyMode step.
function questionSetComplete(blocks, answers) {
  return walkBlocks(blocks, answers).complete;
}

// A block counts as "sale-specific" — genuinely able to differ from one
// sale to the next, and so worth re-asking during "customize this
// sale" — only if it (transitively) dependsOn "participation", the one
// question that decides bucket vs. after-sale vs. both. That's true
// today for priceTierMatrix and specificShareSizesByHorse: an owner
// might reasonably want a different bucket at Ohio than at Lexington.
// Everything else — participation itself, and any other question,
// built-in or added later in Questions Builder — describes the owner,
// not the sale, so it can only ever have one answer and must not be
// asked a second time once "customize this sale" starts a fresh walk
// through the same question set. Used by saleDetailQuestions() in
// app.js to filter what actually gets asked again, while the full
// block list (participation included) still has to go into the walk
// itself so priceTierMatrix/specificShareSizesByHorse stay reachable —
// blockReachable() requires a dependency's parent to already be in the
// walk's visible set, not just present in the answers object.
function isSaleSpecificBlock(block, allBlocks) {
  const byId = new Map(allBlocks.map((b) => [b.id, b]));
  let current = block;
  const seen = new Set();
  while (current) {
    if (seen.has(current.id)) return false; // guard against a cyclical dependsOn, which should never exist but must not infinite-loop if it somehow does
    seen.add(current.id);
    const parentIds = current.dependsOn
      ? (Array.isArray(current.dependsOn) ? current.dependsOn : [current.dependsOn]).map((c) => c.blockId)
      : [];
    if (parentIds.includes("participation")) return true;
    if (parentIds.length !== 1) return false; // multiple parents or none — not a simple chain back to participation
    current = byId.get(parentIds[0]);
  }
  return false;
}

function walkBlocks(blocks, answers) {
  const sorted = [...blocks].sort((a, b) => a.sortOrder - b.sortOrder);
  const visible = [];
  const visibleIds = new Set();
  let i = 0;
  let complete = true;
  while (i < sorted.length) {
    const block = sorted[i];
    if (!blockReachable(block, answers, visibleIds)) {
      i += 1;
      continue;
    }
    // Collect the run of consecutive blocks sharing this exact dependsOn.
    const group = [block];
    let j = i + 1;
    while (j < sorted.length && sameDependsOn(sorted[j].dependsOn, block.dependsOn)) {
      if (blockReachable(sorted[j], answers, visibleIds)) group.push(sorted[j]);
      j += 1;
    }
    visible.push(...group);
    group.forEach((b) => visibleIds.add(b.id));
    const blocksGate = group.some(
      (b) => b.type !== "bucket_config" && b.gatesProgress !== false
    );
    const groupComplete = group.every(
      (b) => b.type === "bucket_config" || b.gatesProgress === false || blockAnswered(b, answers)
    );
    if (blocksGate && !groupComplete) {
      complete = false;
      break;
    }
    i = j;
  }
  return { visible, complete };
}

// A block is reachable only once its dependsOn condition is satisfied
// AND its dependsOn parent(s) were themselves actually reached (added to
// the visible set already), not merely present somewhere in answers.
// This keeps the walk correct even for answer combinations that a real
// user could never produce (stale/unreachable leftover values), which
// matters once Anthony can edit question sets and reset-on-change
// clearing can't be relied on to keep answers internally consistent.
function blockReachable(block, answers, visibleIds) {
  if (!blockDependsOnSatisfied(block, answers)) return false;
  const conditions = Array.isArray(block.dependsOn) ? block.dependsOn : block.dependsOn ? [block.dependsOn] : [];
  return conditions.every((condition) => visibleIds.has(condition.blockId));
}

function sameDependsOn(a, b) {
  return JSON.stringify(a || null) === JSON.stringify(b || null);
}

// ----- Storage -----

function loadQuestionSets() {
  const stored = getSetting("question_sets", {});
  return stored && typeof stored === "object" ? stored : {};
}

// skipCacheUpdate: when true, writes to the database WITHOUT touching
// adminSettingsCache — used by updateQuestionSet() in app.js when a
// newer local edit has already moved the cache forward past what this
// particular save call is writing; overwriting the cache here would
// silently erase that newer edit from what's rendered (see its own,
// longer comment for the full race this closes).
async function saveQuestionSets(sets, { skipCacheUpdate = false } = {}) {
  if (skipCacheUpdate) {
    const { error } = await supabaseAsAdmin().from("admin_settings").upsert({ key: "question_sets", value: sets, updated_at: new Date().toISOString() });
    if (error) console.error("saveQuestionSets(skipCacheUpdate) failed:", error.message);
    return;
  }
  await setSetting("question_sets", sets);
}

// A previously-saved question set (from before interest/sales/eligibility
// existed as blocks) won't have them — without this, someone who once
// edited any question via Questions Builder would silently keep seeing
// the old hardcoded interest/sales/eligibility screens forever, since a
// saved set always wins over defaultQuestionSet() below. Backfills any
// fixedPosition block missing from a stored set (matched by id) from the
// current default, leaving every other saved block/edit untouched.
function withFixedPositionBlocksBackfilled(questionSet) {
  const defaults = defaultQuestionSet();
  const defaultFixed = defaults.blocks.filter((b) => b.fixedPosition);
  const existingIds = new Set(questionSet.blocks.map((b) => b.id));
  const missing = defaultFixed.filter((b) => !existingIds.has(b.id));
  if (!missing.length) return questionSet;
  return { ...questionSet, blocks: [...missing, ...questionSet.blocks] };
}

function getQuestionSet(saleYearId) {
  const sets = loadQuestionSets();
  if (sets[saleYearId]) return withFixedPositionBlocksBackfilled(sets[saleYearId]);
  return defaultQuestionSet();
}

async function saveQuestionSet(saleYearId, questionSet, options = {}) {
  const sets = loadQuestionSets();
  sets[saleYearId] = questionSet;
  await saveQuestionSets(sets, options);
}

// A fresh read of just the question_sets row, straight from the
// database rather than the (possibly stale) in-memory cache — updates
// the cache as a side effect too, so a subsequent loadQuestionSets()
// sees it. Exists specifically for updateQuestionSet() below: two
// admins (Robert, or later Anthony/Kelly) editing Questions Builder in
// separate sessions each hold their own in-memory copy of the set:
// without re-reading here immediately before applying an edit,
// whichever admin's save reaches the database SECOND would overwrite
// the first admin's edit entirely (saveQuestionSet always writes the
// complete blocks array, there's no partial/diff update) - the first
// edit would be silently gone, with no error anywhere. Re-reading
// fresh right before mutating means each edit is applied on top of
// whatever the other admin most recently saved, so both edits survive
// as long as they don't touch the exact same block/field.
//
// Also returns the row's current updated_at timestamp as a version
// token — updateQuestionSetsIfUnchanged() below uses it to detect
// whether ANOTHER session (not just another turn in this session's own
// queue) has written in between this read and this session's own save,
// which a purely in-process queue can never see on its own.
// Deliberately does NOT write its result into adminSettingsCache. This
// is called mid-flight inside updateQuestionSet(), which may run while
// the cache already holds a newer, not-yet-saved local edit from a
// LATER updateQuestionSet() call in the same session (queued behind
// this one) - overwriting the cache with what's currently in the
// database here would silently erase that newer local edit before it
// ever gets its own turn to save, the same "lost update" bug this
// whole mechanism exists to prevent, just moved one level down.
// Callers that want the fresh value get it as a return value instead.
async function loadQuestionSetsFresh() {
  const { data, error } = await supabaseAsAdmin().from("admin_settings").select("value, updated_at").eq("key", "question_sets").maybeSingle();
  if (error) {
    console.error("loadQuestionSetsFresh failed, falling back to cached value:", error.message);
    return { sets: loadQuestionSets(), updatedAt: null };
  }
  const sets = data?.value && typeof data.value === "object" ? data.value : {};
  return { sets, updatedAt: data?.updated_at ?? null };
}

// Optimistic-concurrency write: succeeds only if the row's updated_at
// is STILL exactly what it was when this session read it (expectedUpdatedAt).
// If another session (a different browser/tab, so a different in-process
// queue that this session's own queue cannot see) saved in between this
// session's read and this write, the WHERE clause matches zero rows, the
// write is a no-op, and this returns {ok: false} so the caller can re-read
// fresh and retry the whole mutate-and-save cycle against the newest data
// instead of blindly overwriting it. When no row exists yet (fresh install,
// expectedUpdatedAt === null), falls back to a plain insert.
async function saveQuestionSetsIfUnchanged(sets, expectedUpdatedAt) {
  const nowIso = new Date().toISOString();
  if (expectedUpdatedAt === null) {
    const { error } = await supabaseAsAdmin().from("admin_settings").insert({ key: "question_sets", value: sets, updated_at: nowIso });
    if (error) {
      // Someone else's insert may have landed first (unique key conflict) — that's also a "changed since we read" case.
      return { ok: false };
    }
    return { ok: true };
  }
  const { data, error } = await supabaseAsAdmin()
    .from("admin_settings")
    .update({ value: sets, updated_at: nowIso })
    .eq("key", "question_sets")
    .eq("updated_at", expectedUpdatedAt)
    .select("key");
  if (error) {
    console.error("saveQuestionSetsIfUnchanged failed:", error.message);
    return { ok: false, error };
  }
  return { ok: data && data.length > 0 };
}

// ----- Question set test mode -----
// The Questions Builder always edits the one real, live question set
// (there's no separate sandbox/staging question set) — so an admin
// freely experimenting there (adding test questions, reordering
// things) is editing what real owners see on the live intake form
// right now. This gives a safety net for that: "Start test mode"
// snapshots the current set before any test edits happen, and
// "Restore original questions" puts that exact snapshot straight
// back, undoing every test edit in one step regardless of how many
// were made. Persisted (not just an in-memory flag) so the banner and
// the ability to restore survive a refresh or a closed tab mid-test.
function loadQuestionSetBackup() {
  return getSetting("question_sets_backup", null);
}

async function startQuestionSetTestMode() {
  const backup = loadQuestionSetBackup();
  // Only snapshot once — starting test mode again while a backup
  // already exists must never overwrite it with mid-test edits, or
  // "restore" would restore the wrong thing.
  if (!backup) {
    // loadQuestionSets() returns adminSettingsCache's "question_sets"
    // entry BY REFERENCE, not a copy — storing that reference directly
    // as the backup means the very next saveQuestionSet() call (which
    // mutates that same cached object in place via sets[saleYearId] =
    // ...) silently corrupts the backup too, with no edit having
    // touched the backup on purpose. Deep-cloning here is what actually
    // makes this a snapshot rather than a second name for the live data.
    const sets = JSON.parse(JSON.stringify(loadQuestionSets()));
    await setSetting("question_sets_backup", { savedAt: new Date().toISOString(), sets });
  }
}

async function restoreQuestionSetBackup() {
  const backup = loadQuestionSetBackup();
  if (!backup) return false;
  await saveQuestionSets(backup.sets);
  return await deleteSetting("question_sets_backup");
}

// ----- Default preset: reproduces today's live question set exactly -----
// Built from the current hardcoded questions in app.js so that shipping
// this module changes nothing until Anthony actually edits a question set.

function defaultBucketConfig() {
  return {
    id: "bucket_config",
    type: "bucket_config",
    label: "Bucket options",
    sortOrder: 100,
    dependsOn: { blockId: "participation", op: "in", value: ["bucket", "both"] },
    buckets: [
      { key: "premium", name: "Premium yearling bucket", help: "Focus on higher-quality yearlings.", price: null, suggestedPrice: null },
      { key: "balanced", name: "Balanced bucket", help: "A mix of quality and value.", price: null, suggestedPrice: null },
      { key: "value", name: "Value buys / sale bargains bucket", help: "Look for value opportunities at the sale.", price: null, suggestedPrice: null },
    ],
  };
}

function defaultQuestionSet() {
  return {
    blocks: [
      // These three blocks (interest/sales/eligibility) drive the first
      // three screens of the owner intake flow, BEFORE the participation
      // question. Their sortOrder is negative to keep them first in the
      // Questions Builder list and to leave room between them and
      // "participation" (10) for anything inserted later. Editing their
      // label/help/options here changes what an owner sees on those three
      // screens (see interestCard()/salesCard()/eligibilityCard() in
      // app.js) — but unlike the blocks below, their POSITION in the flow
      // is fixed (interest -> sales -> eligibility -> participation, in
      // that order, always first): they can't be archived, reordered, or
      // depend on another block, because later parts of the flow (e.g.
      // which sale a "Confirmed Buckets" or Sale Detail question applies
      // to) assume all three are always answered first.
      {
        id: "interest",
        type: "yes_no",
        label: "Are you interested in purchasing yearling shares in 2026?",
        sortOrder: -30,
        dependsOn: null,
        required: true,
        fixedPosition: true,
        options: [
          { value: "yes", label: "Yes", help: "" },
          { value: "no", label: "No", help: "" },
        ],
      },
      {
        id: "sales",
        type: "multi_select",
        label: "Which yearling sales should TheStable consider for you?",
        sortOrder: -20,
        dependsOn: null,
        required: true,
        fixedPosition: true,
        // In calendar order (Ohio first in the year, Harrisburg last), per
        // Robert's confirmation, so any list built from these options
        // (this question, Dashboard panels via SALES()) reads chronologically.
        options: [
          { value: "ohio", label: "Ohio Selected Sale", help: "" },
          { value: "lexington", label: "Lexington Selected Sale", help: "" },
          { value: "london", label: "London Classic Yearling Sale", help: "" },
          { value: "harrisburg", label: "Harrisburg Sale", help: "" },
        ],
      },
      {
        id: "eligibility",
        type: "multi_select",
        label: "Which jurisdictions are you interested in?",
        sortOrder: -10,
        dependsOn: null,
        required: true,
        fixedPosition: true,
        options: [
          { value: "ohio", label: "Ohio eligible", help: "" },
          { value: "kentucky", label: "Kentucky eligible", help: "" },
          { value: "new_jersey", label: "New Jersey eligible", help: "" },
          { value: "pennsylvania", label: "Pennsylvania eligible", help: "" },
          { value: "ontario", label: "Ontario eligible", help: "" },
          { value: "new_york", label: "New York eligible", help: "" },
          { value: "indiana", label: "Indiana eligible", help: "" },
          { value: "no_preference", label: "No strong preference", help: "" },
        ],
      },
      {
        id: "participation",
        type: "single_select",
        label: "What type of yearling opportunity are you most interested in?",
        sortOrder: 10,
        dependsOn: null,
        required: true,
        options: [
          { value: "bucket", label: "Pre-sale bucket", help: "Buckets are planned first, then yearlings are purchased to match the budget." },
          { value: "specific", label: "After-sale individual shares", help: "Contact me if individual shares remain available after buckets are filled." },
          { value: "both", label: "Both pre-sale bucket and after-sale individual shares", help: "" },
        ],
      },
      {
        id: "priceTierMatrix",
        type: "price_tier_matrix",
        label: "What would you like TheStable to consider for your pre-sale bucket at this sale?",
        helpText: "You aren't choosing a bucket that already exists. Add each price range that interests you at this sale, along with your gait and sex preference. You can add more than one preference within the same price range. TheStable builds the actual bucket for this sale afterward based on demand like yours plus historical sale data, then reaches out separately once it's ready to ask how much you'd like to invest.",
        sortOrder: 20,
        dependsOn: { blockId: "participation", op: "in", value: ["bucket", "both"] },
        required: true,
        gatesProgress: false,
      },
      {
        id: "specificShareSizesByHorse",
        type: "per_horse_shares",
        label: "For after-sale individual shares, what would you want for each horse?",
        helpText: "Starts with one horse. Set the percentage, gait, and colt/filly preference for it, and add more if you'd want different ones in another.",
        sortOrder: 30,
        dependsOn: { blockId: "participation", op: "in", value: ["specific", "both"] },
        required: true,
        gatesProgress: false,
      },
      defaultBucketConfig(),
    ],
  };
}
