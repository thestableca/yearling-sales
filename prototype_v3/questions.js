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

async function saveQuestionSets(sets) {
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

async function saveQuestionSet(saleYearId, questionSet) {
  const sets = loadQuestionSets();
  sets[saleYearId] = questionSet;
  await saveQuestionSets(sets);
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
        id: "gait",
        type: "single_select",
        label: "For after-sale individual shares, which gait should TheStable consider for you?",
        sortOrder: 30,
        dependsOn: { blockId: "participation", op: "in", value: ["specific", "both"] },
        required: true,
        options: [
          { value: "trotter", label: "Trotters", help: "" },
          { value: "pacer", label: "Pacers", help: "" },
          { value: "both", label: "Both trotters and pacers", help: "" },
        ],
      },
      {
        id: "sex",
        type: "single_select",
        label: "For after-sale individual shares, which colt / filly preference should TheStable consider for you?",
        sortOrder: 40,
        dependsOn: [{ blockId: "participation", op: "in", value: ["specific", "both"] }, { blockId: "gait", op: "in", value: ["trotter", "pacer"] }],
        required: true,
        options: [
          { value: "colt", label: "Colts", help: "" },
          { value: "filly", label: "Fillies", help: "" },
          { value: "both", label: "Both colts and fillies", help: "" },
        ],
      },
      {
        id: "sexTrotter",
        type: "single_select",
        label: "For after-sale trotters, which colt / filly preference should TheStable consider for you?",
        sortOrder: 41,
        dependsOn: [{ blockId: "participation", op: "in", value: ["specific", "both"] }, { blockId: "gait", op: "equals", value: "both" }],
        required: true,
        options: [
          { value: "colt", label: "Colts", help: "" },
          { value: "filly", label: "Fillies", help: "" },
          { value: "both", label: "Both colts and fillies", help: "" },
        ],
      },
      {
        id: "sexPacer",
        type: "single_select",
        label: "For after-sale pacers, which colt / filly preference should TheStable consider for you?",
        sortOrder: 42,
        dependsOn: [{ blockId: "participation", op: "in", value: ["specific", "both"] }, { blockId: "gait", op: "equals", value: "both" }],
        required: true,
        options: [
          { value: "colt", label: "Colts", help: "" },
          { value: "filly", label: "Fillies", help: "" },
          { value: "both", label: "Both colts and fillies", help: "" },
        ],
      },
      {
        id: "specificHorseCount",
        type: "single_select",
        label: "How many individual horses would you usually consider buying shares in after a sale?",
        sortOrder: 60,
        dependsOn: { blockId: "participation", op: "in", value: ["specific", "both"] },
        required: true,
        gatesProgress: false,
        options: [
          { value: "one", label: "One horse only", help: "" },
          { value: "two", label: "Up to 2 horses", help: "" },
          { value: "three_plus", label: "3 or more horses is OK", help: "" },
        ],
      },
      {
        id: "specificShareSize",
        type: "single_select",
        label: "For individual horse shares after a sale, what share size would you usually consider?",
        helpText: "If you'd take a share in more than one horse, this is the size you'd want in each of them by default. You can specify a different size per horse next, if you'd like.",
        sortOrder: 61,
        dependsOn: { blockId: "participation", op: "in", value: ["specific", "both"] },
        required: true,
        gatesProgress: false,
        options: [
          { value: "1", label: "Around 1%", help: "Small share" },
          { value: "2_5", label: "2% to 5%", help: "Medium share" },
          { value: "5_10", label: "5% to 10%", help: "Larger share" },
          { value: "10plus", label: "10% or more", help: "Major share" },
          { value: "custom", label: "Custom percentage", help: "Enter your own" },
        ],
      },
      {
        id: "specificShareSizePerHorse",
        type: "yes_no",
        label: "Does that share size apply to every horse, or would you like to set a different size for each one?",
        sortOrder: 62,
        dependsOn: { blockId: "specificHorseCount", op: "in", value: ["two", "three_plus"] },
        required: true,
        gatesProgress: false,
        options: [
          { value: "no", label: "Same size for all of them", help: "" },
          { value: "yes", label: "Let me set a size per horse", help: "" },
        ],
      },
      {
        id: "specificShareSizesByHorse",
        type: "per_horse_shares",
        label: "What share size would you want in each horse?",
        sortOrder: 63,
        dependsOn: { blockId: "specificShareSizePerHorse", op: "equals", value: "yes" },
        required: true,
        gatesProgress: false,
      },
      defaultBucketConfig(),
    ],
  };
}
