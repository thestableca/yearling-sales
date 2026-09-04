const SALES = [
  { id: "ohio", label: "Ohio Selected Sale" },
  { id: "lexington", label: "Lexington Selected Sale" },
  { id: "harrisburg", label: "Harrisburg Sale" },
  { id: "london", label: "London Classic Yearling Sale" },
  { id: "unsure", label: "Not sure which sale yet" },
];

const REAL_SALES = SALES.filter((sale) => sale.id !== "unsure");

const OWNERS = [
  { id: "own_test", name: "Test Owner", email: "test@thestable.ca" },
  { id: "own_001", name: "Robert Sikkema", email: "robert@example.com" },
  { id: "own_002", name: "Brian L.", email: "brian@email.com" },
  { id: "own_003", name: "Mark D.", email: "markd@email.com" },
  { id: "own_004", name: "Jennifer S.", email: "jennifer@email.com" },
];

const STORAGE_KEY = "thestable_yearling_responses_v7";
const DRAFT_KEY = "thestable_yearling_draft_v7";
const BUILD_ID = "prototype_v3_bucket_percent_no_split_v7";
const OWNER_ROSTER_KEY = "thestable_owner_roster_v1";

function getOwnerRoster() {
  try {
    const parsed = JSON.parse(localStorage.getItem(OWNER_ROSTER_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOwnerRoster(roster) {
  localStorage.setItem(OWNER_ROSTER_KEY, JSON.stringify(roster));
}

// Parses one owner per line, formatted as "Name, email@example.com" (or
// "Name <email@example.com>", or just an email on its own). Blank lines and
// a header row containing "email" are skipped so a pasted spreadsheet
// export works without manual cleanup first.
function parseOwnerRosterText(text) {
  const emailPattern = /[^\s<>,;]+@[^\s<>,;]+\.[^\s<>,;]+/;
  return text.split("\n").map((line) => line.trim()).filter(Boolean).filter((line) => !/^name\b.*email/i.test(line)).map((line) => {
    const emailMatch = line.match(emailPattern);
    const email = emailMatch ? emailMatch[0].toLowerCase() : "";
    const name = line.replace(email, "").replace(/[,<>]/g, "").trim() || email;
    return email ? { name, email } : null;
  }).filter(Boolean);
}

// Parses one line of RFC 4180-ish CSV into cells, handling quoted fields
// (so a name like "Smith, Jane" in quotes doesn't split into two columns).
function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (char === '"') { inQuotes = false; }
      else current += char;
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

// Turns a CSV or spreadsheet-export text blob into owner rows. Looks for
// columns named like "name"/"email" in a header row; falls back to
// treating the first two columns as name/email when there's no
// recognizable header (e.g. a plain two-column list with no headers).
function parseOwnerRosterCsv(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const rows = lines.map(parseCsvLine);
  const header = rows[0].map((cell) => cell.toLowerCase());
  const nameIdx = header.findIndex((h) => /name/.test(h));
  const emailIdx = header.findIndex((h) => /e-?mail/.test(h));
  const hasHeader = nameIdx !== -1 || emailIdx !== -1;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const resolvedEmailIdx = emailIdx !== -1 ? emailIdx : dataRows[0]?.findIndex((c) => c.includes("@")) ?? 1;
  const resolvedNameIdx = nameIdx !== -1 ? nameIdx : (resolvedEmailIdx === 0 ? 1 : 0);
  return dataRows.map((cells) => {
    const email = (cells[resolvedEmailIdx] || "").trim().toLowerCase();
    const name = (cells[resolvedNameIdx] || "").trim() || email;
    return email && email.includes("@") ? { name, email } : null;
  }).filter(Boolean);
}

// Reads an owner list from an uploaded File — .csv/.txt as plain text,
// .xlsx/.xls via the SheetJS library (loaded from cdnjs the first time
// this runs). Returns parsed {name, email} rows either way.
async function parseOwnerRosterFile(file) {
  const isSpreadsheet = /\.(xlsx|xls)$/i.test(file.name);
  if (!isSpreadsheet) {
    const text = await file.text();
    return parseOwnerRosterCsv(text);
  }
  await ensureXlsxLibraryLoaded();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const csvText = XLSX.utils.sheet_to_csv(firstSheet);
  return parseOwnerRosterCsv(csvText);
}

let xlsxLibraryPromise = null;
function ensureXlsxLibraryLoaded() {
  if (window.XLSX) return Promise.resolve();
  if (xlsxLibraryPromise) return xlsxLibraryPromise;
  xlsxLibraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load the Excel-reading library. Check your internet connection and try again."));
    document.head.appendChild(script);
  });
  return xlsxLibraryPromise;
}

const BUCKET_TYPES = [
  ["premium", "Premium yearling bucket", "Focus on higher-quality yearlings."],
  ["balanced", "Balanced bucket", "A mix of quality and value."],
  ["value", "Value buys / sale bargains bucket", "Look for value opportunities at the sale."],
];

const BUCKET_LEVELS = [
  ["1", "1%", "Small"],
  ["2", "2%", "Starter"],
  ["5", "5%", "Medium"],
  ["10", "10%", "Strong"],
  ["20", "20%", "Large"],
  ["30", "30%", "Very large"],
  ["other", "Other %", "Custom"],
];

const MAX_YEARLING_OPTIONS = [
  ["no_preference", "No preference"],
  ["1", "1"],
  ["2", "2"],
  ["3", "3"],
  ["4", "4"],
  ["5plus", "5+"],
];

const CHART_COLORS = ["#071429", "#ad7f24", "#93a1bf", "#0b1d3a", "#c9a13f", "#45557a"];

function blankBucketMatrix() {
  return {
    trotter: blankBucketRows(),
    pacer: blankBucketRows(),
  };
}

function blankBucketRows() {
  return Object.fromEntries(BUCKET_TYPES.map(([id]) => [id, { enabled: false, level: "", amount: "", maxYearlings: "" }]));
}

const app = document.querySelector("#app");
const adminLink = document.querySelector("#adminLink");
const ownerLink = document.querySelector("#ownerLink");

const emptyPrefs = {
  participation: "",
  gait: "",
  sex: "",
  sexTrotter: "",
  sexPacer: "",
  bucketDetailMode: "",
  bucketTypes: [],
  maxYearlings: "",
  bucketLevel: "",
  bucketAmount: "",
  bucketMatrix: blankBucketMatrix(),
  specificHorseCount: "",
  specificShareSize: "",
  note: "",
};

const emptyDraft = {
  view: "welcome",
  owner: null,
  unmatched: false,
  resumedExisting: false,
  identifyError: "",
  name: "",
  email: "",
  interest: "",
  selectedSales: [],
  eligibilityPreferences: [],
  openToAnySale: false,
  unsureSale: false,
  defaultIndex: 0,
  applyMode: "",
  saleIndex: 0,
  questionIndex: 0,
  defaultPrefs: structuredClone(emptyPrefs),
  saleResponses: {},
};

let mode = "owner";
let adminLoggedIn = false;
let adminTab = "dashboard";
let draft = loadDraft();
// Preview mode shows the dashboard filled with fictional demo data so
// Anthony can see what a busy dashboard looks like, without ever writing
// that data into the same storage as real owner responses. It's a
// runtime-only flag (never persisted), so it always resets to off on
// reload — nobody can leave it on by accident the way a stored setting could.
let previewMode = false;
// CAD/USD toggle choice, shared across the Dashboard and Sale History tabs
// so picking USD on one and switching tabs doesn't silently reset it back
// to CAD — this is applied on every render() via applyCurrency(), not
// just when a .ccy-btn is clicked.
let selectedCurrency = "cad";

adminLink.addEventListener("click", () => {
  mode = "admin";
  adminLink.classList.add("hidden");
  ownerLink.classList.remove("hidden");
  render();
});

ownerLink.addEventListener("click", () => {
  mode = "owner";
  ownerLink.classList.add("hidden");
  adminLink.classList.remove("hidden");
  render();
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadDraft() {
  const saved = localStorage.getItem(DRAFT_KEY);
  if (!saved) return clone(emptyDraft);
  try {
    return normalizeDraft(JSON.parse(saved));
  } catch {
    return clone(emptyDraft);
  }
}

function saveDraft() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function resetDraft() {
  draft = clone(emptyDraft);
  localStorage.removeItem(DRAFT_KEY);
}

function getResponses() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveResponses(responses) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(responses));
}

function normalizeDraft(value = {}) {
  const next = { ...clone(emptyDraft), ...value };
  next.defaultPrefs = normalizePrefs(value.defaultPrefs);
  next.saleResponses = Object.fromEntries(Object.entries(value.saleResponses || {}).map(([saleId, prefs]) => [saleId, normalizePrefs(prefs)]));
  return next;
}

function normalizePrefs(value = {}) {
  return {
    ...clone(emptyPrefs),
    ...value,
    bucketTypes: Array.isArray(value.bucketTypes) ? value.bucketTypes : [],
    bucketMatrix: normalizeBucketMatrix(value.bucketMatrix),
  };
}

function normalizeBucketMatrix(matrix = {}) {
  const blank = blankBucketMatrix();
  Object.keys(blank).forEach((gait) => {
    Object.keys(blank[gait]).forEach((bucketType) => {
      blank[gait][bucketType] = {
        ...blank[gait][bucketType],
        ...(matrix?.[gait]?.[bucketType] || {}),
      };
    });
  });
  return blank;
}

function percent(value) {
  if (value === "" || value == null) return "";
  const number = Number(value);
  if (Number.isNaN(number)) return `${String(value)}%`;
  return `${Number.isInteger(number) ? number : number.toFixed(1)}%`;
}

function cleanPercent(value) {
  const cleaned = String(value || "").replace(",", ".").replace(/[^\d.]/g, "");
  const num = Number(cleaned);
  if (cleaned !== "" && Number.isFinite(num) && num > 100) return "100";
  return cleaned;
}

function saleById(id) {
  return SALES.find((sale) => sale.id === id);
}

function currentSaleId() {
  return draft.selectedSales[draft.saleIndex];
}

function currentSaleLabel() {
  return saleById(currentSaleId())?.label || "";
}

function hasBucket(prefs) {
  return prefs.participation === "bucket" || prefs.participation === "both";
}

function hasSpecific(prefs) {
  return prefs.participation === "specific" || prefs.participation === "both";
}

function usesDetailedBuckets(prefs) {
  return prefs.bucketDetailMode === "detailed";
}

function activeGaits(prefs) {
  if (prefs.gait === "both") return ["trotter", "pacer"];
  if (prefs.gait === "trotter" || prefs.gait === "pacer") return [prefs.gait];
  return [];
}

function bucketMatrixReady(prefs) {
  return activeGaits(prefs).some((gait) => BUCKET_TYPES.some(([bucketType]) => {
    const row = prefs.bucketMatrix?.[gait]?.[bucketType];
    return row?.enabled && row.level && (row.level !== "other" || row.amount);
  }));
}

// Question order/branching now comes from the active question set's
// blocks (see questions.js). currentQuestionSet() returns the set for
// the sale year currently being planned (falls back to the default
// preset, which reproduces the original hardcoded order exactly).
function currentQuestionSet() {
  return getQuestionSet("default");
}

function defaultQuestions(prefs = draft.defaultPrefs) {
  // Archived blocks (see archiveQuestionBlock()) are never shown to
  // owners — Anthony can restore one from Questions Builder any time,
  // but while archived it's as if it doesn't exist for the intake flow.
  const allBlocks = currentQuestionSet().blocks.filter((b) => !b.archived);
  const visible = visibleBlocks(allBlocks, prefs);
  const blocks = visible.filter((block) => block.type !== "bucket_config");
  const questions = blocks.map((block) => block.id);
  // applyMode is the final step, added only once the walk has reached
  // the natural end of the question set instead of stopping early on an
  // unanswered gating question.
  if (visible.length > 0 && questionSetComplete(allBlocks, prefs)) questions.push("applyMode");
  return questions;
}

function saleDetailQuestions(response = currentSaleResponse()) {
  return defaultQuestions(response).filter((question) => question !== "applyMode");
}

function currentSaleResponse() {
  const saleId = currentSaleId();
  if (!draft.saleResponses[saleId]) {
    draft.saleResponses[saleId] = clone(draft.defaultPrefs);
  }
  return draft.saleResponses[saleId];
}

function progressPercent() {
  const order = ["welcome", "identify", "interest", "sales", "eligibility", "defaults", "saleAmounts", "customChoice", "saleDetail", "review", "done"];
  if (draft.view === "defaults") return Math.min(80, 35 + draft.defaultIndex * 6);
  if (draft.view === "saleAmounts" || draft.view === "customChoice" || draft.view === "saleDetail") return Math.min(92, 78 + draft.saleIndex * 4 + draft.questionIndex);
  if (draft.view === "review") return 96;
  if (draft.view === "done") return 100;
  return Math.max(5, (order.indexOf(draft.view) + 1) * 6);
}

function render() {
  document.body.classList.toggle("admin-screen", mode === "admin");
  if (mode === "admin") renderAdmin();
  else renderOwner();
}

function hero(title, subtitle = "") {
  return `
    <section class="hero">
      <h1>${title}</h1>
      ${subtitle ? `<p>${subtitle}</p>` : ""}
    </section>
  `;
}

function renderOwner() {
  app.innerHTML = `${hero("2026 Yearling Sale Planning", "Set your preferences once, then choose whether they apply to all selected sales.")}${ownerLayout()}`;
  bindOwner();
}

function ownerLayout() {
  return `
    <section class="single-flow">
      ${screenForView()}
    </section>
  `;
}

function screenForView() {
  if (draft.view === "welcome") return welcomeCard();
  if (draft.view === "identify") return identifyCard();
  if (draft.view === "interest") return interestCard();
  if (draft.view === "sales") return salesCard();
  if (draft.view === "eligibility") return eligibilityCard();
  if (draft.view === "defaults") return defaultCard();
  if (draft.view === "saleAmounts") return saleAmountCard();
  if (draft.view === "customChoice") return customChoiceCard();
  if (draft.view === "saleDetail") return saleDetailCard();
  if (draft.view === "review") return reviewCard();
  return doneCard();
}

function card(meta, title, body, tag = "Question") {
  const pct = progressPercent();
  return `
    <article class="card">
      <div class="card-head">
        <div class="step-row"><span>${meta}</span><span>${pct}%</span></div>
        <div class="progress"><span style="width: ${pct}%"></span></div>
      </div>
      <div class="card-body">
        <span class="tag">${tag}</span>
        <h2>${title}</h2>
        ${body}
      </div>
    </article>
  `;
}

function welcomeCard() {
  return card(
    "Welcome",
    "Let's plan your 2026 buckets",
    `<p class="prompt">Use the email address you use with TheStable.ca. You can review your answers before submitting.</p>
     <div class="actions single"><button class="btn primary" type="button" data-go="identify">Let's Get Started</button></div>`,
    "Welcome"
  );
}

function identifyCard() {
  return card(
    "Step 1",
    "Who is completing this intake?",
    `${draft.identifyError ? `<p class="notice">${escapeHtml(draft.identifyError)}</p>` : ""}
     <div class="field-stack">
       <input class="input" id="nameInput" value="${escapeHtml(draft.name)}" placeholder="Your name">
       <input class="input" id="emailInput" type="email" value="${escapeHtml(draft.email)}" placeholder="you@example.com">
     </div>
     <div class="actions"><button class="btn" type="button" data-go="welcome">Back</button><button class="btn primary" type="button" data-identify>Continue</button></div>`
  );
}

function interestCard() {
  return card(
    "Step 2",
    "Are you interested in purchasing yearling shares in 2026?",
    `${draft.resumedExisting ? `<p class="notice">We found a previous submission for this email address and loaded it here. Continuing will update and replace that submission.</p>` : ""}
    ${radioOptions("interest", draft.interest, [
      ["yes", "Yes", ""],
      ["no", "No", ""],
    ])}
    <div class="actions"><button class="btn" type="button" data-go="identify">Back</button><button class="btn primary" type="button" data-interest-next ${!draft.interest ? "disabled" : ""}>Continue</button></div>`
  );
}

function salesCard() {
  return card(
    "Step 3",
    "Which yearling sales should TheStable consider for you?",
    `<p class="prompt">Select all that apply.</p>
     ${checkOptions("sales", draft.selectedSales, REAL_SALES.map((sale) => [sale.id, sale.label, ""]))}
     <div class="options">
       <button class="option ${draft.openToAnySale ? "selected" : ""}" type="button" data-any-sale><span class="mark check"></span><span><strong>I am open to any sale</strong></span></button>
       <button class="option ${draft.selectedSales.includes("unsure") ? "selected" : ""}" type="button" data-unsure-sale><span class="mark check"></span><span><strong>I am not sure which sale yet</strong></span></button>
     </div>
     <div class="actions"><button class="btn" type="button" data-go="interest">Back</button><button class="btn primary" type="button" data-go="eligibility" ${!draft.selectedSales.length ? "disabled" : ""}>Continue</button></div>`
  );
}

function eligibilityCard() {
  return card(
    "Step 4",
    "Which jurisdictions are you interested in?",
    `<p class="prompt">Select all that apply.</p>
     ${checkOptions("globalEligibility", draft.eligibilityPreferences, [
      ["ohio", "Ohio eligible", ""],
      ["kentucky", "Kentucky eligible", ""],
      ["new_jersey", "New Jersey eligible", ""],
      ["pennsylvania", "Pennsylvania eligible", ""],
      ["ontario", "Ontario eligible", ""],
      ["new_york", "New York eligible", ""],
      ["indiana", "Indiana eligible", ""],
      ["no_preference", "No strong preference", ""],
    ])}
    <div class="actions"><button class="btn" type="button" data-go="sales">Back</button><button class="btn primary" type="button" data-start-defaults ${!draft.eligibilityPreferences.length ? "disabled" : ""}>Continue</button></div>`
  );
}

function defaultCard() {
  const prefs = draft.defaultPrefs;
  const questions = defaultQuestions(prefs);
  if (draft.defaultIndex >= questions.length) draft.defaultIndex = Math.max(0, questions.length - 1);
  return preferenceQuestionCard("Default preferences", questions[draft.defaultIndex], prefs, defaultActions, "Defaults");
}

// Renders a question card generically from the active question set's
// block definitions instead of a hardcoded per-question switch. A block's
// `type` picks the input widget (single_select -> radioOptions,
// multi_select -> checkOptions, bucket_matrix -> the matrix editor); a
// handful of blocks that don't fit that generic shape (applyMode's
// dynamic options, bucketLevel's "Other %" free-text field) are handled
// as small, explicit special cases layered on top.
function preferenceQuestionCard(meta, question, prefs, actionsFn, tag) {
  if (question === "applyMode") {
    return card(meta, "Should these preferences apply to all selected sales?", `${radioOptions("applyMode", draft.applyMode, applyModeOptions(prefs))}${actionsFn(Boolean(draft.applyMode))}`, "Apply");
  }

  const block = currentQuestionSet().blocks.find((b) => b.id === question);
  if (!block) {
    // No question left to show (e.g. the question set was edited down to
    // nothing, or the requested block no longer exists). Surface this
    // instead of silently rendering a blank, dead-end card.
    return card(meta, "This question is no longer available", `<p class="notice">Please contact TheStable to continue — there's nothing left to answer here.</p><div class="actions single"><button class="btn" type="button" data-go="welcome">Start over</button></div>`, tag);
  }
  const blockTag = block.id === "participation" || block.id === "gait" || block.id === "sex" || block.id === "sexTrotter" || block.id === "sexPacer" ? tag
    : block.dependsOn && (block.dependsOn.blockId === "participation") && block.id.startsWith("specific") ? "After-sale shares"
    : block.dependsOn && (block.dependsOn.blockId === "participation" || block.dependsOn.blockId === "bucketDetailMode") ? "Bucket"
    : "Question";

  if (block.type === "bucket_matrix") {
    return card(meta, block.label, `${block.helpText ? `<p class="prompt">${block.helpText}</p>` : ""}${bucketMatrixHtml(prefs)}${actionsFn(bucketMatrixReady(prefs))}`, blockTag);
  }

  if (block.type === "text" || block.type === "number") {
    const value = prefs[block.id] || "";
    const inputType = block.type === "number" ? "number" : "text";
    return card(meta, block.label, `${helpText(block)}<div class="field-stack"><input class="input" type="${inputType}" data-text-field="${block.id}" data-target="${prefs === draft.defaultPrefs ? "default" : "sale"}" value="${escapeHtml(value)}" placeholder="Your answer"></div>${actionsFn(Boolean(String(value).trim()))}`, blockTag);
  }

  // The bucketTypes question's options must always match the buckets
  // configured in the Questions admin tab's bucket_config block — they
  // aren't kept as separate, independently-edited option lists, so
  // renaming/removing a bucket there can't leave this question offering
  // a bucket that no longer exists.
  const optionRows = block.id === "bucketTypes"
    ? bucketConfigOptionRows()
    : (block.options || []).map((o) => [o.value, o.label, o.help || ""]);

  if (block.type === "multi_select") {
    const selected = prefs[block.id] || [];
    if (!optionRows.length) {
      return card(meta, block.label, `${helpText(block)}<p class="notice">No answer options are configured for this question yet.</p>${actionsFn(true)}`, blockTag);
    }
    return card(meta, block.label, `${helpText(block)}${checkOptions(block.id, selected, optionRows, prefs)}${actionsFn(Boolean(selected.length))}`, blockTag);
  }

  // single_select: choiceOptions (grid, with an amount/help column) is
  // used for the value-style questions (maxYearlings, bucketLevel,
  // specificShareSize); radioOptions (simple list) for the rest.
  const value = prefs[block.id];
  if (block.id === "maxYearlings" || block.id === "specificShareSize") {
    const gridRows = (block.options || []).map((o) => [o.value, o.label, o.help || "", ""]);
    return card(meta, block.label, `${helpText(block)}${choiceOptions(block.id, value, gridRows, prefs)}${actionsFn(Boolean(value))}`, blockTag);
  }
  if (block.id === "bucketLevel") {
    const gridRows = (block.options || []).map((o) => [o.value, o.label, o.help || "", ""]);
    const otherInput = value === "other" ? `<div class="field-stack"><input class="input" id="bucketAmount" inputmode="decimal" value="${escapeHtml(prefs.bucketAmount)}" placeholder="Custom percentage, e.g. 12.5"></div>` : "";
    return card(meta, block.label, `${helpText(block)}${choiceOptions(block.id, value, gridRows, prefs)}${otherInput}${actionsFn(Boolean(value && (value !== "other" || prefs.bucketAmount)))}`, blockTag);
  }
  if (!optionRows.length) {
    // A select-type block with no options left to choose (e.g. every
    // option — or, for bucketTypes, every bucket — was removed in the
    // Questions admin tab). There is nothing an owner can select, so
    // don't strand them behind a disabled Continue button — let them
    // proceed past it instead.
    return card(meta, block.label, `${helpText(block)}<p class="notice">No answer options are configured for this question yet.</p>${actionsFn(true)}`, blockTag);
  }
  return card(meta, block.label, `${helpText(block)}${radioOptions(block.id, value, optionRows, prefs)}${actionsFn(Boolean(value))}`, blockTag);
}

function bucketConfigOptionRows() {
  const bucketConfig = currentQuestionSet().blocks.find((b) => b.type === "bucket_config");
  return (bucketConfig?.buckets || []).map((b) => [b.key, b.name, b.help || ""]);
}

function helpText(block) {
  return block.helpText ? `<p class="prompt">${block.helpText}</p>` : "";
}

function applyModeOptions(prefs) {
  const options = [["all", "Yes, use these preferences for all selected sales", ""]];
  if (hasBucket(prefs)) options.push(["amounts", "Yes, but let me adjust bucket percentages per sale", ""]);
  options.push(["custom", "No, I want to customize each selected sale", ""]);
  return options;
}

function defaultActions(canContinue) {
  return `<div class="actions"><button class="btn" type="button" data-default-back>Back</button><button class="btn primary" type="button" data-default-next ${!canContinue ? "disabled" : ""}>Continue</button></div>`;
}

function saleActions(canContinue) {
  return `<div class="actions"><button class="btn" type="button" data-sale-back>Back</button><button class="btn primary" type="button" data-sale-next ${!canContinue ? "disabled" : ""}>Continue</button></div>`;
}

function saleAmountCard() {
  const label = currentSaleLabel();
  const response = currentSaleResponse();
  if (usesDetailedBuckets(response)) {
    return card(
      `${label} - Bucket percentages`,
      `Adjust bucket combinations for ${label}`,
      `<p class="prompt">Your default matrix is already filled in. Change only what should be different for this sale.</p>${bucketMatrixHtml(response)}${saleActions(bucketMatrixReady(response))}`,
      "Per sale"
    );
  }

  return card(
    `${label} - Bucket percentage`,
    `What bucket share percentage should TheStable plan for you at the ${label}?`,
    `<p class="prompt">Leave the same as your default, or choose another percentage for this sale.</p>
     ${choiceOptions("bucketLevel", response.bucketLevel, BUCKET_LEVELS, response)}
    ${response.bucketLevel === "other" ? `<div class="field-stack"><input class="input" id="bucketAmount" inputmode="decimal" value="${escapeHtml(response.bucketAmount)}" placeholder="Custom percentage, e.g. 12.5"></div>` : ""}
    ${saleActions(Boolean(response.bucketLevel && (response.bucketLevel !== "other" || response.bucketAmount)))}`,
    "Per sale"
  );
}

function customChoiceCard() {
  const label = currentSaleLabel();
  return card(
    `${label} - Customize`,
    `Use your default preferences for ${label}?`,
    `${radioOptions("customChoice", currentSaleResponse().customChoice || "", [
      ["same", "Use my default preferences for this sale", ""],
      ["edit", "Customize this sale", ""],
    ], currentSaleResponse())}${saleActions(Boolean(currentSaleResponse().customChoice))}`,
    "Per sale"
  );
}

function saleDetailCard() {
  const response = currentSaleResponse();
  const questions = saleDetailQuestions(response);
  if (draft.questionIndex >= questions.length) draft.questionIndex = Math.max(0, questions.length - 1);
  return preferenceQuestionCard(currentSaleLabel(), questions[draft.questionIndex], response, saleActions, "Per sale");
}

function reviewCard() {
  const items = draft.selectedSales.map((saleId, index) => {
    const response = draft.saleResponses[saleId] || {};
    return `
      <div class="review-item">
        <strong>${saleById(saleId)?.label || saleId}</strong>
        <span>${summarizeSale(response)}</span>
        <button class="text-link" type="button" data-review-edit="${index}">Edit</button>
      </div>
    `;
  }).join("");

  return card(
    "Final step",
    "Review Your 2026 Yearling Sale Plan",
    `<div class="review-list">${items}</div>
     <div class="actions"><button class="btn" type="button" data-review-back>Back</button><button class="btn red" type="button" data-submit>Confirm & Submit</button></div>`,
    "Review"
  );
}

function doneCard() {
  return card("Complete", "Thank you!", `<p class="prompt">Your preferences have been submitted successfully.</p><p class="prompt">Want to change something later? Come back to this page and enter the same email address — your answers will load back in so you can update and resubmit them.</p><div class="actions single"><button class="btn primary" type="button" data-start-over>Close</button></div>`, "Complete");
}

function radioOptions(field, value, options, target = null) {
  return `<div class="options">${options.map(([id, label, help]) => `
    <button class="option ${value === id ? "selected" : ""}" data-radio="${field}" data-value="${id}" data-target="${target === draft.defaultPrefs ? "default" : target ? "sale" : "draft"}" type="button">
      <span class="mark radio"></span>
      <span><strong>${label}</strong>${help ? `<small>${help}</small>` : ""}</span>
    </button>
  `).join("")}</div>`;
}

function checkOptions(field, selected, options, target = null) {
  return `<div class="options">${options.map(([id, label, help]) => `
    <button class="option ${selected.includes(id) ? "selected" : ""}" data-check="${field}" data-value="${id}" data-target="${target === draft.defaultPrefs ? "default" : target ? "sale" : "draft"}" type="button">
      <span class="mark check"></span>
      <span><strong>${label}</strong>${help ? `<small>${help}</small>` : ""}</span>
    </button>
  `).join("")}</div>`;
}

function choiceOptions(field, value, options, target = null) {
  return `<div class="choice-grid">${options.map(([id, label, amount, help]) => `
    <button class="choice ${value === id ? "selected" : ""}" data-choice="${field}" data-value="${id}" data-target="${target === draft.defaultPrefs ? "default" : target ? "sale" : "draft"}" type="button">
      ${label}<span>${amount}</span>${help ? `<small>${help}</small>` : ""}
    </button>
  `).join("")}</div>`;
}

function bucketMatrixHtml(prefs) {
  const matrix = prefs.bucketMatrix || blankBucketMatrix();
  return `<div class="bucket-matrix">${activeGaits(prefs).map((gait) => `
    <section class="matrix-group">
      <h3>${labelFor("gait", gait)}${bucketSexLabel(prefs, gait) ? ` - ${bucketSexLabel(prefs, gait)}` : ""}</h3>
      <div class="matrix-rows">
        ${BUCKET_TYPES.map(([bucketType, label, help]) => {
          const row = matrix[gait]?.[bucketType] || { enabled: false, level: "", amount: "", maxYearlings: "" };
          return `
            <div class="matrix-row ${row.enabled ? "selected" : ""}">
              <button class="matrix-toggle" type="button" data-matrix-toggle="${bucketType}" data-gait="${gait}" data-target="${prefs === draft.defaultPrefs ? "default" : "sale"}">
                <span class="mark check"></span>
                <span><strong>${label}</strong><small>${help}</small></span>
              </button>
              <label>
                Share %
                <select class="input matrix-input" data-matrix-level="${bucketType}" data-gait="${gait}" data-target="${prefs === draft.defaultPrefs ? "default" : "sale"}" ${!row.enabled ? "disabled" : ""}>
                  <option value="">Choose</option>
                  ${BUCKET_LEVELS.map(([value, pct, amount]) => `<option value="${value}" ${row.level === value ? "selected" : ""}>${pct} - ${amount}</option>`).join("")}
                </select>
              </label>
              <label>
                Max yearlings
                <select class="input matrix-input" data-matrix-max="${bucketType}" data-gait="${gait}" data-target="${prefs === draft.defaultPrefs ? "default" : "sale"}" ${!row.enabled ? "disabled" : ""}>
                  ${MAX_YEARLING_OPTIONS.map(([value, labelValue]) => `<option value="${value}" ${row.maxYearlings === value ? "selected" : ""}>${labelValue}</option>`).join("")}
                </select>
              </label>
              ${row.enabled && row.level === "other" ? `<input class="input matrix-custom" data-matrix-amount="${bucketType}" data-gait="${gait}" data-target="${prefs === draft.defaultPrefs ? "default" : "sale"}" inputmode="decimal" value="${escapeHtml(row.amount)}" placeholder="Custom percentage, e.g. 12.5">` : ""}
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `).join("")}</div>`;
}

function bindOwner() {
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => {
    saveInputs();
    draft.view = button.dataset.go;
    saveDraft();
    render();
  }));
  document.querySelector("[data-identify]")?.addEventListener("click", identifyOwner);
  document.querySelector("[data-interest-next]")?.addEventListener("click", interestNext);
  document.querySelector("[data-start-defaults]")?.addEventListener("click", () => {
    draft.view = "defaults";
    draft.defaultIndex = 0;
    saveDraft();
    render();
  });
  document.querySelector("[data-default-next]")?.addEventListener("click", defaultNext);
  document.querySelector("[data-default-back]")?.addEventListener("click", defaultBack);
  document.querySelector("[data-start-over]")?.addEventListener("click", () => {
    resetDraft();
    render();
  });
  document.querySelector("[data-any-sale]")?.addEventListener("click", toggleAnySale);
  document.querySelector("[data-unsure-sale]")?.addEventListener("click", toggleUnsureSale);
  document.querySelector("[data-sale-next]")?.addEventListener("click", saleNext);
  document.querySelector("[data-sale-back]")?.addEventListener("click", saleBack);
  document.querySelector("[data-review-back]")?.addEventListener("click", reviewBack);
  document.querySelectorAll("[data-review-edit]").forEach((button) => button.addEventListener("click", () => reviewEdit(Number(button.dataset.reviewEdit))));
  document.querySelector("[data-submit]")?.addEventListener("click", submitResponse);

  document.querySelectorAll("[data-radio]").forEach((button) => button.addEventListener("click", () => setValue(button.dataset.radio, button.dataset.value, button.dataset.target)));
  document.querySelectorAll("[data-check]").forEach((button) => button.addEventListener("click", () => toggleValue(button.dataset.check, button.dataset.value, button.dataset.target)));
  document.querySelectorAll("[data-choice]").forEach((button) => button.addEventListener("click", () => setValue(button.dataset.choice, button.dataset.value, button.dataset.target)));
  document.querySelectorAll("[data-matrix-toggle]").forEach((button) => button.addEventListener("click", () => toggleMatrixRow(button.dataset.gait, button.dataset.matrixToggle, button.dataset.target)));
  document.querySelectorAll("[data-matrix-level]").forEach((select) => select.addEventListener("change", () => setMatrixValue(select.dataset.gait, select.dataset.matrixLevel, "level", select.value, select.dataset.target)));
  document.querySelectorAll("[data-matrix-max]").forEach((select) => select.addEventListener("change", () => setMatrixValue(select.dataset.gait, select.dataset.matrixMax, "maxYearlings", select.value, select.dataset.target)));
  document.querySelectorAll("[data-matrix-amount]").forEach((input) => input.addEventListener("input", () => setMatrixValue(input.dataset.gait, input.dataset.matrixAmount, "amount", cleanPercent(input.value), input.dataset.target, false)));
  document.querySelector("#bucketAmount")?.addEventListener("input", () => {
    saveInputs();
    updateContinueState(getActivePrefs());
  });
  document.querySelectorAll("[data-text-field]").forEach((input) => {
    input.addEventListener("input", () => {
      const target = getTarget(input.dataset.target);
      target[input.dataset.textField] = input.value;
      saveDraft();
      const button = document.querySelector("[data-default-next], [data-sale-next]");
      if (button) button.disabled = !input.value.trim();
    });
  });
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function identifyOwner() {
  const name = document.querySelector("#nameInput").value.trim();
  const email = document.querySelector("#emailInput").value.trim().toLowerCase();
  // Keep whatever was typed even when validation fails below, so a typo in
  // one field doesn't force re-typing both — re-rendering after an error
  // reads these back into the inputs' value attributes.
  draft.name = name;
  draft.email = email;
  if (!name || !email) {
    draft.identifyError = "Please enter both your name and email address.";
    render();
    return;
  }
  if (!EMAIL_PATTERN.test(email)) {
    draft.identifyError = "That email address doesn't look right. Please double-check it.";
    render();
    return;
  }
  const owner = OWNERS.find((item) => item.email.toLowerCase() === email);
  const existing = getResponses().find((response) => response.email.toLowerCase() === email);
  draft.owner = owner || null;
  draft.unmatched = !owner;
  draft.identifyError = "";
  if (existing) draft = { ...normalizeDraft(existing), view: "interest", name, email, owner: owner || null, unmatched: !owner, resumedExisting: true };
  else draft.view = "interest";
  saveDraft();
  render();
}

function interestNext() {
  if (draft.interest === "no") {
    draft.selectedSales = [];
    draft.saleResponses = {};
    submitResponse();
    return;
  }
  draft.view = "sales";
  saveDraft();
  render();
}

function getTarget(targetName) {
  if (targetName === "default") return draft.defaultPrefs;
  if (targetName === "sale") return currentSaleResponse();
  return draft;
}

function setValue(field, value, targetName) {
  const target = getTarget(targetName);
  target[field] = value;
  if (field === "participation") {
    resetBranchAnswers(target);
    draft.applyMode = "";
  }
  if (field === "gait") resetSexAnswers(target);
  if (field === "bucketDetailMode") {
    resetBucketDetails(target);
    draft.applyMode = "";
  }
  saveInputs();
  saveDraft();
  render();
}

function toggleValue(field, value, targetName) {
  if (field === "sales") {
    toggleInArray(draft.selectedSales, value);
    if (draft.selectedSales.includes(value)) {
      draft.selectedSales = draft.selectedSales.filter((saleId) => saleId !== "unsure");
      draft.openToAnySale = false;
      draft.unsureSale = false;
    }
  } else if (field === "globalEligibility") {
    if (value === "no_preference") draft.eligibilityPreferences = ["no_preference"];
    else {
      draft.eligibilityPreferences = draft.eligibilityPreferences.filter((item) => item !== "no_preference");
      toggleInArray(draft.eligibilityPreferences, value);
    }
  } else {
    toggleInArray(getTarget(targetName)[field], value);
  }
  saveDraft();
  render();
}

function toggleMatrixRow(gait, bucketType, targetName) {
  const target = getTarget(targetName);
  const row = target.bucketMatrix[gait][bucketType];
  row.enabled = !row.enabled;
  if (!row.enabled) {
    row.level = "";
    row.amount = "";
    row.maxYearlings = "";
  } else {
    row.level = row.level || target.bucketLevel || "";
    row.maxYearlings = row.maxYearlings || target.maxYearlings || "no_preference";
  }
  saveDraft();
  render();
}

function setMatrixValue(gait, bucketType, field, value, targetName, shouldRender = true) {
  const target = getTarget(targetName);
  target.bucketMatrix[gait][bucketType][field] = value;
  if (field === "level" && value !== "other") target.bucketMatrix[gait][bucketType].amount = "";
  saveDraft();
  if (shouldRender) render();
  else updateContinueState(target);
}

function getActivePrefs() {
  return draft.view === "defaults" ? draft.defaultPrefs : currentSaleResponse();
}

function updateContinueState(prefs) {
  const button = document.querySelector("[data-default-next], [data-sale-next]");
  if (!button) return;
  if (usesDetailedBuckets(prefs)) button.disabled = !bucketMatrixReady(prefs);
  else if (prefs.bucketLevel === "other") button.disabled = !prefs.bucketAmount;
}

function defaultNext() {
  saveInputs();
  const questions = defaultQuestions();
  if (questions[draft.defaultIndex] === "applyMode") {
    applyDefaultsToSales();
    if (draft.applyMode === "all") draft.view = "review";
    else if (draft.applyMode === "amounts" && hasBucket(draft.defaultPrefs)) draft.view = "saleAmounts";
    else draft.view = "customChoice";
    draft.saleIndex = 0;
    draft.questionIndex = 0;
  } else if (draft.defaultIndex < questions.length - 1) {
    draft.defaultIndex += 1;
  }
  saveDraft();
  render();
}

function defaultBack() {
  saveInputs();
  if (draft.defaultIndex > 0) draft.defaultIndex -= 1;
  else draft.view = "eligibility";
  saveDraft();
  render();
}

function saleNext() {
  saveInputs();
  if (draft.view === "saleAmounts") {
    if (draft.saleIndex < draft.selectedSales.length - 1) draft.saleIndex += 1;
    else draft.view = "review";
  } else if (draft.view === "customChoice") {
    if (currentSaleResponse().customChoice === "edit") {
      draft.view = "saleDetail";
      draft.questionIndex = 0;
    } else nextSaleOrReview();
  } else if (draft.view === "saleDetail") {
    const questions = saleDetailQuestions();
    if (draft.questionIndex < questions.length - 1) draft.questionIndex += 1;
    else {
      draft.view = "customChoice";
      nextSaleOrReview();
    }
  }
  saveDraft();
  render();
}

function saleBack() {
  saveInputs();
  if (draft.view === "saleAmounts") {
    if (draft.saleIndex > 0) draft.saleIndex -= 1;
    else draft.view = "defaults";
  } else if (draft.view === "customChoice") {
    if (draft.saleIndex > 0) draft.saleIndex -= 1;
    else draft.view = "defaults";
  } else if (draft.view === "saleDetail") {
    if (draft.questionIndex > 0) draft.questionIndex -= 1;
    else draft.view = "customChoice";
  }
  saveDraft();
  render();
}

function nextSaleOrReview() {
  if (draft.saleIndex < draft.selectedSales.length - 1) {
    draft.saleIndex += 1;
    draft.questionIndex = 0;
  } else {
    draft.view = "review";
  }
}

function reviewBack() {
  reviewEdit(draft.selectedSales.length - 1);
}

function reviewEdit(index) {
  draft.view = draft.applyMode === "custom" ? "customChoice" : draft.applyMode === "amounts" ? "saleAmounts" : "defaults";
  draft.saleIndex = Math.max(0, Math.min(index, draft.selectedSales.length - 1));
  draft.questionIndex = 0;
  saveDraft();
  render();
}

function applyDefaultsToSales() {
  draft.selectedSales.forEach((saleId) => {
    const customChoice = draft.saleResponses[saleId]?.customChoice || "";
    draft.saleResponses[saleId] = { ...clone(draft.defaultPrefs), customChoice };
  });
}

function toggleAnySale() {
  draft.openToAnySale = !draft.openToAnySale;
  draft.unsureSale = false;
  draft.selectedSales = draft.openToAnySale ? REAL_SALES.map((sale) => sale.id) : [];
  saveDraft();
  render();
}

function toggleUnsureSale() {
  const active = draft.selectedSales.includes("unsure");
  draft.openToAnySale = false;
  draft.unsureSale = !active;
  draft.selectedSales = active ? [] : ["unsure"];
  saveDraft();
  render();
}

function toggleInArray(array, value) {
  const index = array.indexOf(value);
  if (index >= 0) array.splice(index, 1);
  else array.push(value);
}

function resetBranchAnswers(target) {
  target.bucketDetailMode = "";
  target.bucketTypes = [];
  target.maxYearlings = "";
  target.bucketLevel = "";
  target.bucketAmount = "";
  target.bucketMatrix = blankBucketMatrix();
  target.specificHorseCount = "";
  target.specificShareSize = "";
}

function resetBucketDetails(target) {
  target.bucketTypes = [];
  target.maxYearlings = "";
  target.bucketLevel = "";
  target.bucketAmount = "";
  target.bucketMatrix = blankBucketMatrix();
}

function resetSexAnswers(target) {
  target.sex = "";
  target.sexTrotter = "";
  target.sexPacer = "";
}

function saveInputs() {
  const amount = document.querySelector("#bucketAmount");
  if (amount) {
    if (draft.view === "defaults") draft.defaultPrefs.bucketAmount = cleanPercent(amount.value);
    else currentSaleResponse().bucketAmount = cleanPercent(amount.value);
  }
}

// Block ids with dedicated, hand-written summary handling above/below.
// Any other block in the active question set (i.e. a custom question
// Anthony added in the Questions admin tab) is not covered by that
// hardcoded logic, so it's appended generically afterwards — otherwise
// an owner's answer to a custom question would be collected but never
// shown back to them on the review screen before they submit.
const KNOWN_SUMMARY_BLOCK_IDS = new Set([
  "participation", "gait", "sex", "sexTrotter", "sexPacer",
  "bucketDetailMode", "bucketMatrix", "bucketTypes", "maxYearlings", "bucketLevel",
  "specificHorseCount", "specificShareSize",
]);

function summarizeSale(response) {
  const parts = [
    labelFor("participation", response.participation),
    labelFor("gait", response.gait),
    sexSummary(response),
    draft.eligibilityPreferences.map((item) => labelFor("eligibility", item)).join(", "),
  ];
  if (hasBucket(response)) {
    if (usesDetailedBuckets(response)) {
      parts.push(summarizeBucketMatrix(response));
    } else {
      const amount = response.bucketLevel === "other" ? response.bucketAmount : response.bucketLevel;
      parts.push(response.bucketTypes.map((item) => labelFor("bucketTypes", item)).join(", "), labelFor("maxYearlings", response.maxYearlings), amount ? percent(amount) : "");
    }
  }
  if (hasSpecific(response)) {
    parts.push(labelFor("specificHorseCount", response.specificHorseCount), labelFor("specificShareSize", response.specificShareSize));
  }
  parts.push(...customAnswerSummaries(response));
  return parts.filter(Boolean).join(" | ");
}

function customAnswerSummaries(response) {
  const customBlocks = currentQuestionSet().blocks.filter(
    (block) => block.type !== "bucket_config" && !KNOWN_SUMMARY_BLOCK_IDS.has(block.id)
  );
  return customBlocks.map((block) => {
    const value = response[block.id];
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) return "";
    const answerText = Array.isArray(value)
      ? value.map((item) => labelFor(block.id, item) || item).join(", ")
      : labelFor(block.id, value) || value;
    return `${block.label}: ${answerText}`;
  }).filter(Boolean);
}

function summarizeBucketMatrix(response) {
  return selectedBucketRows(response).map((row) => {
    const max = row.maxYearlings && row.maxYearlings !== "no_preference" ? ` max ${labelFor("maxYearlings", row.maxYearlings)}` : "";
    return `${labelFor("gait", row.gait)} ${labelFor("bucketTypes", row.bucketType)} ${percent(row.amount)}${max}`;
  }).join("; ");
}

function selectedBucketRows(response) {
  return activeGaits(response).flatMap((gait) => BUCKET_TYPES.flatMap(([bucketType]) => {
    const row = response.bucketMatrix?.[gait]?.[bucketType];
    if (!row?.enabled) return [];
    const amount = row.level === "other" ? row.amount : row.level;
    return [{ gait, bucketType, amount: Number(amount || 0), maxYearlings: row.maxYearlings, sex: bucketSexValue(response, gait) }];
  }));
}

function bucketSexValue(response, gait) {
  if (response.gait === "both") return gait === "trotter" ? response.sexTrotter : response.sexPacer;
  return response.sex;
}

function bucketSexLabel(response, gait) {
  return labelFor("sex", bucketSexValue(response, gait));
}

function sexSummary(response) {
  if (response.gait === "both") {
    return [response.sexTrotter ? `Trotters: ${labelFor("sex", response.sexTrotter)}` : "", response.sexPacer ? `Pacers: ${labelFor("sex", response.sexPacer)}` : ""].filter(Boolean).join(", ");
  }
  return labelFor("sex", response.sex);
}

function submitResponse() {
  const response = {
    id: draft.owner?.id || `unmatched_${draft.email}`,
    ownerId: draft.owner?.id || null,
    name: draft.name || "Unknown",
    email: draft.email,
    unmatched: draft.unmatched,
    interest: draft.interest,
    selectedSales: draft.selectedSales,
    eligibilityPreferences: draft.eligibilityPreferences,
    applyMode: draft.applyMode,
    saleResponses: draft.saleResponses,
    submittedAt: new Date().toISOString(),
  };
  const responses = getResponses().filter((item) => item.email.toLowerCase() !== response.email.toLowerCase());
  responses.push(response);
  saveResponses(responses);
  resetDraft();
  draft.view = "done";
  render();
}

const ADMIN_PASSCODE_HASH = "0bab60e4cf58b621210d9fcf1605a3e61e38440672e241077e91e1cee2e1b5b6";

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function adminTabs() {
  const tabs = [
    ["dashboard", "Dashboard"],
    ["salehistory", "Sale History"],
    ["questions", "Questions Builder"],
    ["owners", "Owner Roster"],
  ];
  return `<div class="admin-tabs">${tabs.map(([id, label]) => `<button class="admin-tab ${adminTab === id ? "active" : ""}" type="button" data-admin-tab="${id}">${label}</button>`).join("")}</div>`;
}

function backToSiteLink() {
  return `<button class="back-to-site" type="button" id="backToSite">&larr; Back to site</button>`;
}

// Shared navy masthead banner (logo + section label) shown at the top of
// every admin tab, so Dashboard/Sale History/Questions Builder/Owner
// Roster all look consistent — previously only Dashboard had one and the
// other three used a plain title line instead.
function adminMasthead(label, rightContent = "") {
  return `
      <div class="masthead">
        <div class="brand">
          <img class="logo-img" src="../assets/thestable-logo-official.png" alt="TheStable.ca">
          <span class="div"></span>
          <span class="sub">${escapeHtml(label)}</span>
        </div>
        <div class="masthead-right">${rightContent}</div>
      </div>`;
}

// Clears every response/roster/history key this prototype writes to
// localStorage. Useful for wiping out data left behind from testing the
// owner-intake flow yourself, without needing to open devtools.
// window.confirm() is silently blocked inside a sandboxed iframe (how a
// published Artifact renders), so any destructive button relying on it
// looks like it does nothing there. Arms a button on first click (swaps
// its label to confirmText for 4s) and only runs onConfirm on a second
// click while armed.
function armDestructiveButton(button, confirmText, onConfirm) {
  const originalText = button.textContent;
  let armed = false;
  let armTimer = null;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!armed) {
      armed = true;
      button.textContent = confirmText;
      armTimer = setTimeout(() => {
        armed = false;
        button.textContent = originalText;
      }, 4000);
      return;
    }
    clearTimeout(armTimer);
    onConfirm();
  });
}

function resetDemoDataButton() {
  return `<button class="back-to-site" type="button" id="resetDemoData" title="Clears all responses, owner roster, and history stored in this browser">Reset demo data</button>`;
}

// Only shown on the Dashboard tab, where preview mode actually changes
// anything. previewMode itself is a runtime-only flag (see its
// declaration) — never written to localStorage, so it can't leak.
function previewToggleButton() {
  if (adminTab !== "dashboard") return "";
  return `<button class="back-to-site" type="button" id="previewToggle">${previewMode ? "Exit preview" : "Preview with demo data"}</button>`;
}

function bindAdminTabs() {
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      adminTab = button.getAttribute("data-admin-tab");
      render();
    });
  });
  document.querySelector("#backToSite")?.addEventListener("click", () => {
    mode = "owner";
    render();
  });
  const resetButton = document.querySelector("#resetDemoData");
  if (resetButton) {
    armDestructiveButton(resetButton, "Click again to confirm", () => {
      [STORAGE_KEY, DRAFT_KEY, OWNER_ROSTER_KEY, METRICS_HISTORY_KEY].forEach((key) => localStorage.removeItem(key));
      render();
    });
  }
  document.querySelector("#previewToggle")?.addEventListener("click", () => {
    previewMode = !previewMode;
    render();
  });
  document.querySelector("#previewOff")?.addEventListener("click", () => {
    previewMode = false;
    render();
  });
}

// ===== Questions admin tab =====
// Lets Anthony compose the owner-intake question set from block
// templates: add/remove/reorder blocks, edit each block's label/options,
// and configure bucket names + prices. Edits are saved immediately to
// the "default" question set in localStorage (see questions.js) and
// take effect on the owner intake flow right away.
let questionsEditorState = { expandedBlockId: null };

const BLOCK_TYPE_TEMPLATES = [
  { type: "single_select", label: "Single choice", description: "Owner picks exactly one option." },
  { type: "multi_select", label: "Multiple choice", description: "Owner can select several options." },
  { type: "yes_no", label: "Yes / No", description: "A simple two-option question." },
  { type: "text", label: "Short text", description: "Free-text answer." },
  { type: "number", label: "Number", description: "Numeric answer." },
];

function blockTypeLabel(type) {
  const found = BLOCK_TYPE_TEMPLATES.find((t) => t.type === type);
  if (found) return found.label;
  if (type === "bucket_matrix") return "Bucket matrix (detailed)";
  if (type === "bucket_config") return "Bucket configuration";
  return type;
}

function newBlockId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function renderQuestionsAdmin() {
  const questionSet = currentQuestionSet();
  const blocks = [...questionSet.blocks].sort((a, b) => a.sortOrder - b.sortOrder);
  const bucketConfig = blocks.find((b) => b.type === "bucket_config");
  const orderedBlocks = blocks.filter((b) => b.type !== "bucket_config" && !b.archived);
  const archivedBlocks = blocks.filter((b) => b.type !== "bucket_config" && b.archived);

  app.innerHTML = `
    <div class="refskin">
    <div class="wrap">
      <div class="refskin-topbar">${adminTabs()}<div class="topbar-right">${resetDemoDataButton()}${backToSiteLink()}</div></div>

      ${adminMasthead("Questions Builder")}

      <p class="dek">Compose the owner intake questionnaire from ready-made question blocks. Changes apply to the intake form immediately.</p>

      <div class="ref-panel" style="margin-top: 22px;">
        <div class="panel-head">
          <div>
            <div class="tag">Blocks</div>
            <h2>Question blocks</h2>
            <p>Shown to owners in this order. A block only appears once its dependency question has been answered.</p>
          </div>
        </div>
        <div class="panel-body">
          <div class="qb-block-list">
            ${orderedBlocks.map((block, index) => questionBlockRow(block, index, orderedBlocks.length)).join("") || `<p class="notice">No blocks yet — add one below.</p>`}
          </div>
          <div class="qb-add-row">
            <span>Add a block:</span>
            ${BLOCK_TYPE_TEMPLATES.map((t) => `<button class="btn" type="button" data-add-block-type="${t.type}" title="${escapeHtml(t.description)}">${t.label}</button>`).join("")}
          </div>
        </div>
      </div>

      ${archivedBlocks.length ? `
      <div class="ref-panel" style="margin-top: 18px;">
        <div class="panel-head">
          <div>
            <div class="tag">Archived</div>
            <h2>Archived questions</h2>
            <p>Hidden from owners, not shown on the Dashboard — but nothing is lost. Restore any of these any time.</p>
          </div>
        </div>
        <div class="panel-body">
          <div class="qb-block-list">
            ${archivedBlocks.map((block) => `
            <div class="qb-block qb-block-archived">
              <div class="qb-block-head">
                <div class="qb-block-title">
                  <strong>${escapeHtml(block.label || "(untitled question)")}</strong>
                  <span class="qb-block-type">${blockTypeLabel(block.type)}</span>
                </div>
                <div class="qb-block-controls">
                  <button class="btn primary" type="button" data-restore-block="${block.id}">Restore</button>
                </div>
              </div>
            </div>`).join("")}
          </div>
        </div>
      </div>` : ""}

      <div class="ref-panel" style="margin-top: 18px;">
        <div class="panel-head">
          <div>
            <div class="tag">Buckets</div>
            <h2>Bucket options</h2>
            <p>Names and prices offered when an owner's plan includes a pre-sale bucket. Suggested price comes from historical sale data when available.</p>
          </div>
        </div>
        <div class="panel-body">
          ${bucketConfigEditor(bucketConfig)}
        </div>
      </div>

      <div class="ref-panel" style="margin-top: 18px;">
        <div class="panel-head">
          <div>
            <div class="tag">Confirmed offer</div>
            <h2>Confirmed buckets</h2>
            <p>The buckets TheStable is actually going to offer this sale year — decide these after reviewing demand on the Dashboard's "Suggested buckets to offer" panel. Separate from the bucket options above (which drive what owners see in the intake form); this list is just for planning and shows on the Dashboard as the finalized offer. Add as many as you need.</p>
          </div>
        </div>
        <div class="panel-body">
          ${confirmedBucketsEditor(getConfirmedBuckets("default"))}
        </div>
      </div>

      <div class="ref-panel" style="margin-top: 18px;">
        <div class="panel-head">
          <div>
            <div class="tag">Exchange rate</div>
            <h2>CAD / USD conversion rate</h2>
            <p>Used by the CAD/USD switch on the Sale History and Dashboard pages. Not live — update it here whenever the actual rate has moved and you want the USD figures to reflect that.</p>
          </div>
        </div>
        <div class="panel-body">
          <div class="qb-add-row">
            <span>$1 USD =</span>
            <input class="input" id="exchangeRateInput" inputmode="decimal" style="max-width:140px;" value="${(1 / getExchangeRate()).toFixed(4)}">
            <span>CAD</span>
          </div>
          <p class="quiet" style="margin-top:8px;">Currently: $1 CAD = $${getExchangeRate().toFixed(4)} USD.</p>
        </div>
      </div>
    </div>
    </div>`;

  bindAdminTabs();
  bindQuestionsAdmin(questionSet);
}

function questionBlockRow(block, index, total) {
  const expanded = questionsEditorState.expandedBlockId === block.id;
  const dashboardImpact = CORE_QUESTION_DASHBOARD_IMPACT[block.id];
  const archiveTitle = dashboardImpact
    ? `Archiving this also affects ${dashboardImpact} on the Dashboard`
    : "Hides this question from owners and its Dashboard panel (if any) — restore any time from Archived questions below";
  return `
    <div class="qb-block ${expanded ? "expanded" : ""}">
      <div class="qb-block-head" data-toggle-block="${block.id}">
        <div class="qb-block-title">
          <strong>${escapeHtml(block.label || "(untitled question)")}</strong>
          <span class="qb-block-type">${blockTypeLabel(block.type)}</span>
          ${dashboardImpact ? `<span class="qb-core-flag" title="Drives ${escapeHtml(dashboardImpact)} on the Dashboard">Drives a Dashboard panel</span>` : ""}
        </div>
        <div class="qb-block-controls">
          <button class="btn" type="button" data-move-block="${block.id}" data-dir="up" ${index === 0 ? "disabled" : ""} title="Move up">&uarr;</button>
          <button class="btn" type="button" data-move-block="${block.id}" data-dir="down" ${index === total - 1 ? "disabled" : ""} title="Move down">&darr;</button>
          <button class="btn red" type="button" data-remove-block="${block.id}" title="${escapeHtml(archiveTitle)}">Archive</button>
        </div>
      </div>
      ${expanded ? questionBlockEditor(block) : ""}
    </div>`;
}

function questionBlockEditor(block) {
  const optionsEditor = block.id === "bucketTypes"
    ? `<p class="notice">This question's choices always match the buckets configured in the "Bucket options" section below — edit the bucket names there instead.</p>`
    : block.type === "single_select" || block.type === "multi_select" || block.type === "yes_no"
    ? `<div class="qb-options">
        <span class="qb-field-label">Options</span>
        ${(block.options || []).map((opt, i) => `
          <div class="qb-option-row">
            <input class="input" data-option-label="${block.id}" data-option-index="${i}" value="${escapeHtml(opt.label)}" placeholder="Option label">
            ${block.type !== "yes_no" ? `<button class="btn red" type="button" data-remove-option="${block.id}" data-option-index="${i}">Remove</button>` : ""}
          </div>`).join("")}
        ${block.type !== "yes_no" ? `<button class="btn" type="button" data-add-option="${block.id}">Add option</button>` : ""}
      </div>`
    : "";

  return `
    <div class="qb-block-body">
      <label class="qb-field">
        <span class="qb-field-label">Question text</span>
        <input class="input" data-block-label="${block.id}" value="${escapeHtml(block.label || "")}">
      </label>
      <label class="qb-field">
        <span class="qb-field-label">Help text (optional)</span>
        <input class="input" data-block-help="${block.id}" value="${escapeHtml(block.helpText || "")}">
      </label>
      ${optionsEditor}
    </div>`;
}

function confirmedBucketsEditor(buckets) {
  const gaitOptions = [["any", "Any gait"], ["trotter", "Trotters"], ["pacer", "Pacers"], ["both", "Both"]];
  const sexOptions = [["any", "Any"], ["colt", "Colts"], ["filly", "Fillies"], ["either", "Either"]];
  return `
    <div class="qb-bucket-list">
      ${buckets.length ? buckets.map((bucket, i) => `
        <div class="qb-confirmed-row">
          <input class="input" data-cb-name="${i}" value="${escapeHtml(bucket.name)}" placeholder="Bucket name">
          <input class="input" data-cb-price="${i}" inputmode="decimal" value="${bucket.price ?? ""}" placeholder="Price ($)">
          <select class="input" data-cb-gait="${i}">${gaitOptions.map(([v, l]) => `<option value="${v}" ${bucket.gait === v ? "selected" : ""}>${l}</option>`).join("")}</select>
          <select class="input" data-cb-sex="${i}">${sexOptions.map(([v, l]) => `<option value="${v}" ${bucket.sex === v ? "selected" : ""}>${l}</option>`).join("")}</select>
          <input class="input" data-cb-note="${i}" value="${escapeHtml(bucket.note || "")}" placeholder="Note (optional)">
          <button class="btn red" type="button" data-remove-confirmed="${i}">Remove</button>
        </div>`).join("") : `<p class="notice">No confirmed buckets yet — add one below once you've decided what to offer.</p>`}
    </div>
    <button class="btn" type="button" data-add-confirmed>Add confirmed bucket</button>`;
}

function bucketConfigEditor(bucketConfig) {
  if (!bucketConfig) return `<p class="notice">No bucket configuration on this question set.</p>`;
  return `
    <div class="qb-bucket-list">
      ${bucketConfig.buckets.map((bucket, i) => `
        <div class="qb-bucket-row">
          <input class="input" data-bucket-name="${i}" value="${escapeHtml(bucket.name)}" placeholder="Bucket name">
          <input class="input" data-bucket-price="${i}" inputmode="decimal" value="${bucket.price ?? ""}" placeholder="Price ($)">
          <span class="qb-suggested-price">${bucket.suggestedPrice != null ? `Suggested: $${Number(bucket.suggestedPrice).toLocaleString()}` : "No suggestion yet"}</span>
          <button class="btn red" type="button" data-remove-bucket="${i}">Remove</button>
        </div>`).join("")}
    </div>
    <button class="btn" type="button" data-add-bucket>Add bucket</button>`;
}

// Questions whose id a fixed Dashboard panel reads directly by name (via
// labelFor()/groupDemand() calls elsewhere in this file) — archiving one
// of these makes that specific panel show "Unknown" instead of real
// labels, even though old answers are preserved. Everything else is a
// question Anthony added himself, which the Dashboard already handles
// generically (see customQuestionPanels()) — archiving those has no
// such side effect.
const CORE_QUESTION_DASHBOARD_IMPACT = {
  participation: "the \"Suggested buckets to offer\" panel and the pre-sale/after-sale split",
  gait: "the \"Trotter vs. Pacer\" panel and the Gait column in Owner detail",
  sex: "the \"Colt / Filly\" panel and the Colt/Filly column in Owner detail",
  bucketTypes: "the \"Bucket type mix\" panel and \"Suggested buckets to offer\"",
  maxYearlings: "bucket suggestion sizing on the Dashboard",
  specificHorseCount: "the \"After-sale individual shares\" panel",
  specificShareSize: "the \"Share size\" and \"After-sale individual shares\" panels",
  eligibility: "the \"Requested jurisdictions\" panel",
};

// Archives a block instead of deleting it: it stops showing to owners and
// its Dashboard panel (if any) goes blank, but nothing is lost — Anthony
// can restore it from the "Archived questions" list at any time, and
// existing answers already collected are never touched.
function archiveQuestionBlock(id) {
  updateQuestionSet((set) => {
    const block = set.blocks.find((b) => b.id === id);
    if (block) block.archived = true;
  });
}

function restoreQuestionBlock(id) {
  updateQuestionSet((set) => {
    const block = set.blocks.find((b) => b.id === id);
    if (block) block.archived = false;
  });
}

function updateQuestionSet(mutator) {
  const questionSet = currentQuestionSet();
  mutator(questionSet);
  saveQuestionSet("default", questionSet);
  render();
}

function bindQuestionsAdmin(questionSet) {
  document.querySelectorAll("[data-toggle-block]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-toggle-block");
      questionsEditorState.expandedBlockId = questionsEditorState.expandedBlockId === id ? null : id;
      render();
    });
  });

  document.querySelectorAll("[data-move-block]").forEach((el) => {
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      const id = el.getAttribute("data-move-block");
      const dir = el.getAttribute("data-dir");
      updateQuestionSet((set) => {
        const ordered = [...set.blocks].filter((b) => b.type !== "bucket_config").sort((a, b) => a.sortOrder - b.sortOrder);
        const index = ordered.findIndex((b) => b.id === id);
        const swapWith = dir === "up" ? index - 1 : index + 1;
        if (swapWith < 0 || swapWith >= ordered.length) return;
        const tmp = ordered[index].sortOrder;
        ordered[index].sortOrder = ordered[swapWith].sortOrder;
        ordered[swapWith].sortOrder = tmp;
      });
    });
  });

  document.querySelectorAll("[data-remove-block]").forEach((el) => {
    const id = el.getAttribute("data-remove-block");
    const confirmLabel = CORE_QUESTION_DASHBOARD_IMPACT[id] ? "This affects a Dashboard panel — archive?" : "Confirm archive?";
    armDestructiveButton(el, confirmLabel, () => archiveQuestionBlock(id));
  });

  document.querySelectorAll("[data-restore-block]").forEach((el) => {
    el.addEventListener("click", () => restoreQuestionBlock(el.getAttribute("data-restore-block")));
  });

  document.querySelectorAll("[data-add-block-type]").forEach((el) => {
    el.addEventListener("click", () => {
      const type = el.getAttribute("data-add-block-type");
      updateQuestionSet((set) => {
        const maxSort = Math.max(0, ...set.blocks.filter((b) => b.type !== "bucket_config").map((b) => b.sortOrder));
        const id = newBlockId(type);
        const block = {
          id,
          type,
          label: "New question",
          helpText: "",
          sortOrder: maxSort + 1,
          dependsOn: null,
          required: true,
        };
        if (type === "single_select" || type === "multi_select") {
          block.options = [
            { value: "option_1", label: "Option 1", help: "" },
            { value: "option_2", label: "Option 2", help: "" },
          ];
        }
        if (type === "yes_no") {
          block.options = [
            { value: "yes", label: "Yes", help: "" },
            { value: "no", label: "No", help: "" },
          ];
        }
        set.blocks.push(block);
        questionsEditorState.expandedBlockId = id;
      });
    });
  });

  document.querySelectorAll("[data-block-label]").forEach((el) => {
    el.addEventListener("change", () => {
      const id = el.getAttribute("data-block-label");
      updateQuestionSet((set) => {
        const block = set.blocks.find((b) => b.id === id);
        if (block) block.label = el.value;
      });
    });
  });

  document.querySelectorAll("[data-block-help]").forEach((el) => {
    el.addEventListener("change", () => {
      const id = el.getAttribute("data-block-help");
      updateQuestionSet((set) => {
        const block = set.blocks.find((b) => b.id === id);
        if (block) block.helpText = el.value;
      });
    });
  });

  document.querySelectorAll("[data-option-label]").forEach((el) => {
    el.addEventListener("change", () => {
      const id = el.getAttribute("data-option-label");
      const index = Number(el.getAttribute("data-option-index"));
      updateQuestionSet((set) => {
        const block = set.blocks.find((b) => b.id === id);
        if (block && block.options[index]) block.options[index].label = el.value;
      });
    });
  });

  document.querySelectorAll("[data-add-option]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-add-option");
      updateQuestionSet((set) => {
        const block = set.blocks.find((b) => b.id === id);
        if (!block) return;
        const n = block.options.length + 1;
        block.options.push({ value: `option_${n}`, label: `Option ${n}`, help: "" });
      });
    });
  });

  document.querySelectorAll("[data-remove-option]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-remove-option");
      const index = Number(el.getAttribute("data-option-index"));
      updateQuestionSet((set) => {
        const block = set.blocks.find((b) => b.id === id);
        if (block) block.options.splice(index, 1);
      });
    });
  });

  document.querySelectorAll("[data-bucket-name]").forEach((el) => {
    el.addEventListener("change", () => {
      const index = Number(el.getAttribute("data-bucket-name"));
      updateQuestionSet((set) => {
        const bucketConfig = set.blocks.find((b) => b.type === "bucket_config");
        if (bucketConfig && bucketConfig.buckets[index]) bucketConfig.buckets[index].name = el.value;
      });
    });
  });

  document.querySelectorAll("[data-bucket-price]").forEach((el) => {
    el.addEventListener("change", () => {
      const index = Number(el.getAttribute("data-bucket-price"));
      updateQuestionSet((set) => {
        const bucketConfig = set.blocks.find((b) => b.type === "bucket_config");
        if (bucketConfig && bucketConfig.buckets[index]) {
          const num = Number(el.value);
          bucketConfig.buckets[index].price = el.value === "" || Number.isNaN(num) || num <= 0 ? null : num;
        }
      });
    });
  });

  document.querySelectorAll("[data-remove-bucket]").forEach((el) => {
    el.addEventListener("click", () => {
      const index = Number(el.getAttribute("data-remove-bucket"));
      updateQuestionSet((set) => {
        const bucketConfig = set.blocks.find((b) => b.type === "bucket_config");
        if (bucketConfig) bucketConfig.buckets.splice(index, 1);
      });
    });
  });

  const addBucketButton = document.querySelector("[data-add-bucket]");
  if (addBucketButton) {
    addBucketButton.addEventListener("click", () => {
      updateQuestionSet((set) => {
        const bucketConfig = set.blocks.find((b) => b.type === "bucket_config");
        if (!bucketConfig) return;
        bucketConfig.buckets.push({ key: newBlockId("bucket"), name: "New bucket", help: "", price: null, suggestedPrice: null });
      });
    });
  }

  const updateConfirmed = (mutator) => {
    const buckets = getConfirmedBuckets("default");
    mutator(buckets);
    saveConfirmedBucketsFor("default", buckets);
    render();
  };
  document.querySelectorAll("[data-cb-name]").forEach((el) => {
    el.addEventListener("change", () => {
      const index = Number(el.getAttribute("data-cb-name"));
      updateConfirmed((buckets) => { if (buckets[index]) buckets[index].name = el.value; });
    });
  });
  document.querySelectorAll("[data-cb-price]").forEach((el) => {
    el.addEventListener("change", () => {
      const index = Number(el.getAttribute("data-cb-price"));
      updateConfirmed((buckets) => {
        if (!buckets[index]) return;
        const num = Number(el.value);
        buckets[index].price = el.value === "" || Number.isNaN(num) || num <= 0 ? null : num;
      });
    });
  });
  document.querySelectorAll("[data-cb-gait]").forEach((el) => {
    el.addEventListener("change", () => {
      const index = Number(el.getAttribute("data-cb-gait"));
      updateConfirmed((buckets) => { if (buckets[index]) buckets[index].gait = el.value; });
    });
  });
  document.querySelectorAll("[data-cb-sex]").forEach((el) => {
    el.addEventListener("change", () => {
      const index = Number(el.getAttribute("data-cb-sex"));
      updateConfirmed((buckets) => { if (buckets[index]) buckets[index].sex = el.value; });
    });
  });
  document.querySelectorAll("[data-cb-note]").forEach((el) => {
    el.addEventListener("change", () => {
      const index = Number(el.getAttribute("data-cb-note"));
      updateConfirmed((buckets) => { if (buckets[index]) buckets[index].note = el.value; });
    });
  });
  document.querySelectorAll("[data-remove-confirmed]").forEach((el) => {
    el.addEventListener("click", () => {
      const index = Number(el.getAttribute("data-remove-confirmed"));
      updateConfirmed((buckets) => { buckets.splice(index, 1); });
    });
  });
  const addConfirmedButton = document.querySelector("[data-add-confirmed]");
  if (addConfirmedButton) {
    addConfirmedButton.addEventListener("click", () => {
      updateConfirmed((buckets) => { buckets.push(newConfirmedBucket()); });
    });
  }

  const rateInput = document.querySelector("#exchangeRateInput");
  if (rateInput) {
    rateInput.addEventListener("change", () => {
      const cadPerUsd = Number(rateInput.value);
      if (!Number.isFinite(cadPerUsd) || cadPerUsd <= 0) {
        rateInput.value = (1 / getExchangeRate()).toFixed(4);
        return;
      }
      saveExchangeRate(1 / cadPerUsd);
      render();
    });
  }
}

// ===== Sale History & Bucket Strategy admin tab =====
// Ported from the standalone "Sale History & Bucket Strategy" artifact: a
// historical look at every yearling sold at Lexington Selected, Harrisburg
// Book 1, and Ohio Jug between 2008 and 2025, checked against which of them
// went on to become a top performer. All figures below are the real
// analysis output from that artifact, not sample/placeholder data.
// Client-side currency toggle, ported verbatim from the reference artifact's
// own applyCurrency()/fmtK()/fmtFull() JS (see bindCurrencyToggle() below):
// every money figure renders once, in CAD, carrying data-cad/data-usd/
// data-style attributes, and a page-level click handler on .ccy-btn walks
// the DOM and rewrites .money/.money-range text in place - no server-side
// re-render on toggle, exactly like the reference.
function saleHistoryFxNote() {
  const cadPerUsd = 1 / getExchangeRate();
  return `using a fixed rate of $1 USD = $${cadPerUsd.toFixed(2)} CAD, set in Questions Builder`;
}

function shMoney(cad, usd, style = "k", suffix = "") {
  const text = style === "full" ? refFmtFull(cad) : refFmtK(cad);
  return `<span class="money" data-cad="${cad}" data-usd="${usd}" data-style="${style}">${text}${suffix}</span>`;
}

function shMoneyRange(cadLo, cadHi, usdLo, usdHi) {
  const loK = Math.round(cadLo / 1000);
  const hiK = Math.round(cadHi / 1000);
  return `<span class="money-range" data-cad-lo="${cadLo}" data-cad-hi="${cadHi}" data-usd-lo="${usdLo}" data-usd-hi="${usdHi}">$${loK}-${hiK}k</span>`;
}

function shCcyLabel() {
  return `<span class="ccy-label">CAD</span>`;
}

function refFmtK(value) {
  const k = value / 1000;
  const rounded = k >= 100 ? Math.round(k) : Math.round(k * 10) / 10;
  return "$" + rounded.toLocaleString("en-US", { maximumFractionDigits: 1 }) + "k";
}

function refFmtFull(value) {
  return "$" + Math.round(value).toLocaleString("en-US");
}

function renderSaleHistory() {
  app.innerHTML = `
    <div class="refskin">
    <div class="wrap">
      <div class="refskin-topbar">
        ${adminTabs()}
        <div class="topbar-right">
          ${resetDemoDataButton()}
          ${backToSiteLink()}
        </div>
      </div>

      ${adminMasthead("Sale History", `<div class="currency-toggle" role="group" aria-label="Currency">
            <button class="ccy-btn active" data-ccy="cad" type="button">CAD $</button>
            <button class="ccy-btn" data-ccy="usd" type="button">USD $</button>
          </div>`)}

      <div class="page-title-row">
        <h1>How should TheStable.ca build its buckets?</h1>
        <div class="as-of">Analysis run <strong>Sep 3, 2026</strong></div>
      </div>
      <div class="intro-block">
        <p class="dek">A look back at every yearling sold at Lexington Selected, Harrisburg Book 1, and Ohio Jug between 2008 and 2025, checked against which of them went on to become top performers. The goal: give TheStable.ca a fact-based way to decide how many horses to put in a bucket, at what price range, for the best odds, instead of relying only on gut feel. The same indicators also apply to after-sale horses offered individually in a similar price range.</p>
        <div class="definition-card"><b>What counts as a "top performer" here:</b> a horse that showed up anywhere on a season top-earner leaderboard, at 2, 3, or 4-plus years old, at least once, in a season after it was sold as a yearling. It's a simple yes/no flag: it doesn't matter how much a top performer earned or at what age it first got there, and it says nothing about any specific 2026 yearling. It only shows how often horses at a given price went on to become one.</div>
        <p class="currency-note">Prices on this page are shown in ${shCcyLabel()}. Use the CAD / USD switch at the top of the page to convert every figure, ${saleHistoryFxNote()}. This rate is not live and won't update on its own. If it has moved significantly by the time you use this, update it before relying on the USD figures.</p>
      </div>

      <div class="dash-panel">
        <div class="dash-eyebrow"><span class="dot"></span>The short version, at a glance</div>
        <div class="dash-grid">

          <div class="dash-card">
            <div class="dc-label">Odds of becoming a top performer, by price</div>
            <div class="curve-row">
              <div class="curve-bar-wrap"><div class="curve-bar-val">0.6</div><div class="curve-bar" style="height:6%"></div><div class="curve-bar-price">&lt;${shMoney(14000, 10000)}</div></div>
              <div class="curve-bar-wrap"><div class="curve-bar-val">1.3</div><div class="curve-bar" style="height:13%"></div><div class="curve-bar-price">${shMoneyRange(14000, 28000, 10000, 20000)}</div></div>
              <div class="curve-bar-wrap"><div class="curve-bar-val">2.2</div><div class="curve-bar" style="height:22%"></div><div class="curve-bar-price">${shMoneyRange(28000, 50000, 20000, 35714)}</div></div>
              <div class="curve-bar-wrap"><div class="curve-bar-val">3.2</div><div class="curve-bar" style="height:32%"></div><div class="curve-bar-price">${shMoneyRange(50000, 85000, 35714, 60714)}</div></div>
              <div class="curve-bar-wrap"><div class="curve-bar-val">5.4</div><div class="curve-bar" style="height:55%"></div><div class="curve-bar-price">${shMoneyRange(85000, 140000, 60714, 100000)}</div></div>
              <div class="curve-bar-wrap"><div class="curve-bar-val">6.5</div><div class="curve-bar" style="height:66%"></div><div class="curve-bar-price">${shMoneyRange(140000, 210000, 100000, 150000)}</div></div>
              <div class="curve-bar-wrap"><div class="curve-bar-val">8.3</div><div class="curve-bar" style="height:85%"></div><div class="curve-bar-price">${shMoneyRange(210000, 280000, 150000, 200000)}</div></div>
              <div class="curve-bar-wrap"><div class="curve-bar-val">9.8</div><div class="curve-bar last" style="height:100%"></div><div class="curve-bar-price">${shMoney(280000, 200000, "k", "+")}</div></div>
            </div>
            <div class="curve-foot">All top figures are %. Cheapest horses: <b>0.6%</b> became a top performer. Priciest: <b>9.8%</b> did.</div>
          </div>

          <div class="dash-card">
            <div class="dc-label">Colt vs. filly: who makes up the top performers</div>
            <div class="ring-wrap">
              <div class="ring" style="background: conic-gradient(var(--gold-light) 0% 58.9%, #45557a 58.9% 100%)"><div><strong>58.9%</strong><span>colt share</span></div></div>
              <div class="ring-legend">
                <div class="rl-row"><span class="rl-dot" style="background:var(--gold-light)"></span>Colt <b>58.9%</b></div>
                <div class="rl-row"><span class="rl-dot" style="background:#45557a"></span>Filly <b>41.1%</b></div>
              </div>
            </div>
            <div class="curve-foot" style="margin-top:16px;">Out of every 100 top performers, close to 59 were colts and 41 were fillies. That's because colts also have better odds individually: 3.2% of colts sold became a top performer, vs. 2.4% of fillies, at every sale and every price level, with no exceptions.</div>
          </div>

          <div class="dash-card">
            <div class="dc-label">Trotter vs. pacer: who makes up the top performers</div>
            <div class="ring-wrap">
              <div class="ring" style="background: conic-gradient(var(--gold-light) 0% 50.4%, #45557a 50.4% 100%)"><div><strong>50.4%</strong><span>pacer share</span></div></div>
              <div class="ring-legend">
                <div class="rl-row"><span class="rl-dot" style="background:var(--gold-light)"></span>Pacer <b>50.4%</b></div>
                <div class="rl-row"><span class="rl-dot" style="background:#45557a"></span>Trotter <b>49.6%</b></div>
              </div>
            </div>
            <div class="curve-foot" style="margin-top:16px;">Roughly an even split between pacers and trotters among top performers, across all 3 sales combined. Individually, trotters have a very slightly better per-horse chance (3.0% vs. 2.8% for pacers), but it isn't consistent at every venue. See the sale-by-sale table below.</div>
          </div>

          <div class="dash-card">
            <div class="dc-label">Best bucket shape found</div>
            <div class="verdict-num">5 horses</div>
            <div class="verdict-sub">A ${shMoney(170000, 121428.57, "full")} ${shCcyLabel()} bucket split into 5 horses around ${shMoney(35000, 25000)} each hit <b style="color:#fff">12.5%</b> odds of landing at least one top performer.</div>
            <div class="verdict-compare"><span>vs. 1 horse at ${shMoney(170000, 121428.57)}</span><b>8.1%</b></div>
          </div>

          <div class="dash-card">
            <div class="dc-label">Same budget, more horses wins</div>
            <div class="mini-bars">
              <div class="mini-bar-wrap"><div class="mini-bar-val">5.3%</div><div class="mini-bar" style="height:41%; background:#45557a"></div><div class="mini-bar-name">1 horse</div></div>
              <div class="mini-bar-wrap"><div class="mini-bar-val">5.1%</div><div class="mini-bar" style="height:39%; background:#45557a"></div><div class="mini-bar-name">2 horses</div></div>
              <div class="mini-bar-wrap"><div class="mini-bar-val">8.0%</div><div class="mini-bar" style="height:62%; background:var(--gold)"></div><div class="mini-bar-name">3 horses</div></div>
              <div class="mini-bar-wrap"><div class="mini-bar-val">8.1%</div><div class="mini-bar" style="height:63%; background:var(--gold-light)"></div><div class="mini-bar-name">4 horses</div></div>
            </div>
            <div class="curve-foot" style="margin-top:0;">Same ${shMoney(85000, 60714.29)} budget, split 4 different ways. 3 or 4 horses clearly beats 1 or 2. The full breakdown, at 3 different budget sizes, is in "One horse or several: building a bucket" below.</div>
          </div>

          <div class="dash-card">
            <div class="dc-label">Where top performers actually came from</div>
            <div class="verdict-num">392</div>
            <div class="verdict-sub">The <b style="color:#fff">${shMoney(49000, 35000)}&ndash;${shMoney(140000, 100000)}</b> range (the two biggest bands combined: 192 + 200) accounts for over 4 in 10 top performers, out of 931 found across all price levels.</div>
            <div class="verdict-compare"><span>share of all 931 top performers</span><b>42.1%</b></div>
          </div>

        </div>
      </div>

      <div class="meta-strip">
        <div class="meta-tile"><div class="n">2008&ndash;2025</div><div class="l">Years of sale data used</div></div>
        <div class="meta-tile"><div class="n">32,964</div><div class="l">Yearlings sold across the 3 sales in this study</div></div>
        <div class="meta-tile"><div class="n">931</div><div class="l">Of those went on to become a top earner</div></div>
        <div class="meta-tile"><div class="n">1 in 35</div><div class="l">Overall odds a yearling becomes a top performer</div></div>
      </div>

      <section class="block">
        <h2 class="section-title">How much does price matter?</h2>
        <p class="section-lead">Every yearling sold either did or didn't go on to become a top earner later in its racing career. This splits all of them into price groups and shows what share of each group actually made it. Read the ${shMoney(210000, 150000)}&ndash;${shMoney(280000, 200000)} bar as: 1 in about 12 horses bought in that price range went on to become a top performer.</p>
        <div class="ref-panel">
          <div class="band-chart">
            <div class="band-row"><div class="label">Under ${shMoney(14000, 10000)}</div><div class="band-track"><span style="width:6%; background:var(--band-1)"></span></div><div class="figs"><div class="pct">0.6%</div><div class="cnt">27 of 4,903</div></div></div>
            <div class="band-row"><div class="label">${shMoney(14000, 10000)} &ndash; ${shMoney(28000, 20000)}</div><div class="band-track"><span style="width:13%; background:var(--band-2)"></span></div><div class="figs"><div class="pct">1.3%</div><div class="cnt">98 of 7,461</div></div></div>
            <div class="band-row"><div class="label">${shMoney(28000, 20000)} &ndash; ${shMoney(50000, 35714.29)}</div><div class="band-track"><span style="width:23%; background:var(--band-3)"></span></div><div class="figs"><div class="pct">2.2%</div><div class="cnt">172 of 7,712</div></div></div>
            <div class="band-row"><div class="label">${shMoney(50000, 35714.29)} &ndash; ${shMoney(85000, 60714.29)}</div><div class="band-track"><span style="width:32%; background:var(--band-4)"></span></div><div class="figs"><div class="pct">3.2%</div><div class="cnt">192 of 6,061</div></div></div>
            <div class="band-row"><div class="label">${shMoney(85000, 60714.29)} &ndash; ${shMoney(140000, 100000)}</div><div class="band-track"><span style="width:56%; background:var(--band-5)"></span></div><div class="figs"><div class="pct">5.4%</div><div class="cnt">200 of 3,682</div></div></div>
            <div class="band-row"><div class="label">${shMoney(140000, 100000)} &ndash; ${shMoney(210000, 150000)}</div><div class="band-track"><span style="width:67%; background:var(--band-6)"></span></div><div class="figs"><div class="pct">6.5%</div><div class="cnt">111 of 1,704</div></div></div>
            <div class="band-row"><div class="label">${shMoney(210000, 150000)} &ndash; ${shMoney(280000, 200000)}</div><div class="band-track"><span style="width:85%; background:var(--band-7)"></span></div><div class="figs"><div class="pct">8.3%</div><div class="cnt">55 of 664</div></div></div>
            <div class="band-row"><div class="label">${shMoney(280000, 200000, "k", "+")}</div><div class="band-track"><span style="width:100%; background:var(--band-8)"></span></div><div class="figs"><div class="pct">9.8%</div><div class="cnt">76 of 777</div></div></div>
          </div>
        </div>
      </section>

      <section class="block">
        <h2 class="section-title">Colt or filly? Trotter or pacer?</h2>
        <p class="section-lead">Same split shown in "the short version" above, in more detail: out of every top performer, what share is colt vs. filly, and pacer vs. trotter.</p>
        <div class="ref-panel">
          <div class="totals-grid">
            <div class="totals-card">
              <div class="ttl">Colt vs. Filly: share of top performers</div>
              <div class="versus-row">
                <div class="versus-side"><div class="pct win">58.9%</div><div class="name">Colt</div><div class="n">3.2% odds per horse sold</div></div>
                <div class="versus-vs">VS</div>
                <div class="versus-side"><div class="pct">41.1%</div><div class="name">Filly</div><div class="n">2.4% odds per horse sold</div></div>
              </div>
            </div>
            <div class="totals-card">
              <div class="ttl">Trotter vs. Pacer: share of top performers</div>
              <div class="versus-row">
                <div class="versus-side"><div class="pct win">50.4%</div><div class="name">Pacer</div><div class="n">2.8% odds per horse sold</div></div>
                <div class="versus-vs">VS</div>
                <div class="versus-side"><div class="pct">49.6%</div><div class="name">Trotter</div><div class="n">3.0% odds per horse sold</div></div>
              </div>
            </div>
          </div>
          <p style="font-size:13px; color:var(--ink-soft); margin:18px 0 0; line-height:1.6;">Colts make up close to 59% of top performers, fillies the other 41%. That's partly because colts were sold in slightly bigger numbers to begin with, and partly because an individual colt has better odds (3.2% vs. 2.4% for fillies), at every sale and every price level, with no exceptions. Pacer vs. trotter is close to an even split, and (as the sale-by-sale table further down shows) which one edges ahead isn't consistent at every venue.</p>
        </div>
      </section>

      <section class="block">
        <h2 class="section-title">Does the colt/filly or trotter/pacer pattern hold at every price?</h2>
        <p class="section-lead">The table below combines price with sex and gait. Each cell shows what share of horses in that exact group (say, "pacer colts priced ${shMoney(85000, 60714.29)}&ndash;${shMoney(140000, 100000)}") became a top performer. Green numbers are the strongest cell in that price column.</p>
        <div class="ref-panel">
          <div class="matrix-grid" style="grid-template-columns: 118px repeat(6, 1fr);">
            <div class="hdr" style="background:transparent"></div>
            <div class="hdr">Under ${shMoney(28000, 20000)}</div>
            <div class="hdr">${shMoney(28000, 20000)}&ndash;${shMoney(85000, 60714.29)}</div>
            <div class="hdr">${shMoney(85000, 60714.29)}&ndash;${shMoney(140000, 100000)}</div>
            <div class="hdr">${shMoney(140000, 100000)}&ndash;${shMoney(210000, 150000)}</div>
            <div class="hdr">${shMoney(210000, 150000)}&ndash;${shMoney(280000, 200000)}</div>
            <div class="hdr">${shMoney(280000, 200000, "k", "+")}</div>
          </div>
          <div class="matrix-grid" style="margin-top:2px; grid-template-columns: 118px repeat(6, 1fr);">
            <div class="row-hdr">Trotter colt</div>
            <div class="cell"><div class="pct">1.2%</div><div class="n">2,863</div></div>
            <div class="cell"><div class="pct">3.1%</div><div class="n">3,309</div></div>
            <div class="cell"><div class="pct">5.5%</div><div class="n">901</div></div>
            <div class="cell hi"><div class="pct">8.2%</div><div class="n">464</div></div>
            <div class="cell"><div class="pct">7.7%</div><div class="n">195</div></div>
            <div class="cell hi"><div class="pct">11.6%</div><div class="n">258</div></div>

            <div class="row-hdr">Trotter filly</div>
            <div class="cell"><div class="pct">1.1%</div><div class="n">2,537</div></div>
            <div class="cell"><div class="pct">2.3%</div><div class="n">3,154</div></div>
            <div class="cell"><div class="pct">3.9%</div><div class="n">788</div></div>
            <div class="cell"><div class="pct">5.0%</div><div class="n">381</div></div>
            <div class="cell"><div class="pct">7.4%</div><div class="n">189</div></div>
            <div class="cell"><div class="pct">10.3%</div><div class="n">263</div></div>

            <div class="row-hdr">Pacer colt</div>
            <div class="cell hi"><div class="pct">1.4%</div><div class="n">2,884</div></div>
            <div class="cell hi"><div class="pct">2.7%</div><div class="n">3,794</div></div>
            <div class="cell hi"><div class="pct">6.3%</div><div class="n">1,160</div></div>
            <div class="cell"><div class="pct">5.9%</div><div class="n">544</div></div>
            <div class="cell hi"><div class="pct">11.3%</div><div class="n">168</div></div>
            <div class="cell"><div class="pct">8.1%</div><div class="n">148</div></div>

            <div class="row-hdr">Pacer filly</div>
            <div class="cell"><div class="pct">0.7%</div><div class="n">3,425</div></div>
            <div class="cell"><div class="pct">2.7%</div><div class="n">3,192</div></div>
            <div class="cell"><div class="pct">5.7%</div><div class="n">804</div></div>
            <div class="cell hi"><div class="pct">7.3%</div><div class="n">302</div></div>
            <div class="cell"><div class="pct">6.6%</div><div class="n">106</div></div>
            <div class="cell"><div class="pct">6.6%</div><div class="n">106</div></div>
          </div>
          <p style="font-size:13px; color:var(--ink-soft); margin:16px 0 0; line-height:1.6;">Trotter colts are the strongest combination once price climbs above ${shMoney(280000, 200000)}. At the cheap end, pacer colts hold a small edge. The columns on the far right (above ${shMoney(150000, 107142.86)}) are built on fewer horses (100 to 300), so treat those specific numbers as a rough signal rather than a precise one.</p>
        </div>
      </section>

      <section class="block">
        <h2 class="section-title">How old was the horse when it became a top performer?</h2>
        <p class="section-lead">A horse can show up on the leaderboard as a 2-year-old, a 3-year-old, or older ("aged," 4 and up). All three count as "top performer" everywhere else on this page. Split apart, the percentages below show how often each price group produced a top performer at that specific age. The odds drop a lot the longer it takes.</p>
        <div class="ref-panel">
          <div class="matrix-grid" style="grid-template-columns: 150px repeat(5, 1fr);">
            <div class="hdr" style="background:transparent"></div>
            <div class="hdr">Under ${shMoney(28000, 20000)}</div>
            <div class="hdr">${shMoney(28000, 20000)}&ndash;${shMoney(85000, 60714.29)}</div>
            <div class="hdr">${shMoney(85000, 60714.29)}&ndash;${shMoney(140000, 100000)}</div>
            <div class="hdr">${shMoney(140000, 100000)}&ndash;${shMoney(210000, 150000)}</div>
            <div class="hdr">${shMoney(210000, 150000, "k", "+")}</div>
          </div>
          <div class="matrix-grid" style="margin-top:2px; grid-template-columns: 150px repeat(5, 1fr);">
            <div class="row-hdr">Top performer at 2</div>
            <div class="cell"><div class="pct">0.5%</div></div>
            <div class="cell"><div class="pct">1.4%</div></div>
            <div class="cell"><div class="pct">3.2%</div></div>
            <div class="cell"><div class="pct">4.1%</div></div>
            <div class="cell hi"><div class="pct">5.6%</div></div>

            <div class="row-hdr">Top performer at 3</div>
            <div class="cell"><div class="pct">0.4%</div></div>
            <div class="cell"><div class="pct">1.3%</div></div>
            <div class="cell"><div class="pct">2.6%</div></div>
            <div class="cell"><div class="pct">3.2%</div></div>
            <div class="cell hi"><div class="pct">5.8%</div></div>

            <div class="row-hdr">Top performer at 4+</div>
            <div class="cell"><div class="pct">0.3%</div></div>
            <div class="cell"><div class="pct">0.7%</div></div>
            <div class="cell"><div class="pct">1.2%</div></div>
            <div class="cell hi"><div class="pct">1.8%</div></div>
            <div class="cell"><div class="pct">1.7%</div></div>
          </div>
          <p style="font-size:13px; color:var(--ink-soft); margin:16px 0 0; line-height:1.6;">A horse is roughly twice as likely to become a top performer at 2 or 3 as it is to first become one at 4 or older, at every price level. Worth keeping in mind: a horse that only becomes a top performer at 4+ has had two or three extra years of training and keep costs before that happened, on top of the purchase price. That cost isn't in this data, but the direction is real.</p>
        </div>
      </section>

      <section class="block">
        <h2 class="section-title">One horse or several: building a bucket</h2>
        <p class="section-lead">Everything above is about one horse at one price. A bucket usually buys several horses. This section answers: for a fixed amount of money, is it better to buy one expensive horse, or split it across two, three, four, or five cheaper ones?</p>
        <div class="ref-panel">
          <p style="font-size:13.5px; line-height:1.6; margin:0 0 18px;">To compare fairly, each horse in a split is scored using the real odds for its own price, not an average across a wide range. So "2 horses at ${shMoney(85000, 60714.29)}" is scored using the actual ${shMoney(85000, 60714.29)}&ndash;${shMoney(140000, 100000)} odds, not blended with ${shMoney(280000, 200000, "k", "+")} horses.</p>
          <div class="bucket-grid">
            <div class="bucket-card">
              <div class="ttl">${shMoney(85000, 60714.29, "full")} bucket</div>
              <div class="split-row"><div class="lbl">1 horse<span class="spend">around ${shMoney(85000, 60714.29)}</span></div><div class="val">5.3%</div></div>
              <div class="split-row"><div class="lbl">2 horses<span class="spend">around ${shMoney(40000, 28571.43)} each</span></div><div class="val">5.1%</div></div>
              <div class="split-row"><div class="lbl">3 horses<span class="spend">around ${shMoney(30000, 21428.57)} each</span></div><div class="val">8.0%</div></div>
              <div class="split-row win"><div class="lbl">4 horses<span class="spend">around ${shMoney(21000, 15000)} each</span></div><div class="val">8.1%</div></div>
            </div>
            <div class="bucket-card">
              <div class="ttl">${shMoney(170000, 121428.57, "full")} bucket</div>
              <div class="split-row"><div class="lbl">1 horse<span class="spend">around ${shMoney(170000, 121428.57)}</span></div><div class="val">8.1%</div></div>
              <div class="split-row"><div class="lbl">2 horses<span class="spend">around ${shMoney(85000, 60714.29)} each</span></div><div class="val">10.3%</div></div>
              <div class="split-row"><div class="lbl">4 horses<span class="spend">around ${shMoney(40000, 28571.43)} each</span></div><div class="val">9.9%</div></div>
              <div class="split-row win"><div class="lbl">5 horses<span class="spend">around ${shMoney(35000, 25000)} each</span></div><div class="val">12.5%</div></div>
            </div>
            <div class="bucket-card">
              <div class="ttl">${shMoney(210000, 150000, "full")} bucket</div>
              <div class="split-row"><div class="lbl">1 horse<span class="spend">around ${shMoney(210000, 150000)}</span></div><div class="val">9.7%</div></div>
              <div class="split-row"><div class="lbl">2 horses<span class="spend">around ${shMoney(105000, 75000)} each</span></div><div class="val">11.6%</div></div>
              <div class="split-row win"><div class="lbl">3 horses<span class="spend">around ${shMoney(70000, 50000)} each</span></div><div class="val">15.1%</div></div>
              <div class="split-row"><div class="lbl">5 horses<span class="spend">around ${shMoney(40000, 28571.43)} each</span></div><div class="val">12.2%</div></div>
            </div>
          </div>
          <p style="font-size:13px; color:var(--ink-soft); margin:18px 0 0; line-height:1.6;">In every bucket size tested, splitting the money across several horses beat spending it all on one horse. There isn't one single "best number of horses" across every budget, but one expensive horse was the weakest option every time.</p>
          <p style="font-size:13px; color:var(--ink-soft); margin:10px 0 0; line-height:1.6;"><strong>Why doesn't this match the "${shMoney(85000, 60714.29)}&ndash;${shMoney(140000, 100000)} has the most top performers" chart above?</strong> Those are two different questions. That chart counts total top performers found across the entire market at that price (a headcount across roughly 2,400 horses). This section asks something narrower: for one fixed budget, is it better to buy one horse or split it into several? A single ${shMoney(35000, 25000)} horse has lower odds (about 2.6%) than a single ${shMoney(100000, 71428.57)} horse (about 5.6%). But splitting ${shMoney(170000, 121428.57)} into 5 cheaper horses means 5 separate chances at a top performer instead of 1, and those chances add up faster than the odds fall. That's why 5 horses at ${shMoney(35000, 25000)} (12.5%) beats 2 horses at ${shMoney(85000, 60714.29)} (10.3%) for the same total spend, even though the ${shMoney(85000, 60714.29)} price point has better odds per horse.</p>
        </div>
      </section>

      <section class="block">
        <h2 class="section-title">Where did most top performers actually come from?</h2>
        <p class="section-lead">Every price band has a different number of horses in it, so this counts, in plain numbers, how many top performers each band actually produced.</p>
        <div class="ref-panel">
          <p style="font-size:13.5px; line-height:1.6; margin:0 0 14px;"><strong>Most top performers, in plain numbers, came from horses priced ${shMoney(49000, 35000)} to ${shMoney(140000, 100000)}.</strong> The ${shMoney(85000, 60714.29)}&ndash;${shMoney(140000, 100000)} band produced the single most (200), and the cheaper ${shMoney(49000, 35000)}&ndash;${shMoney(85000, 60714.29)} band is right behind it at 192, and those horses cost less to buy. Combined, these two neighboring bands account for 392 of the 931 top performers on this page, 42.1%, more than 4 in 10. That's simply where a large number of horses were bought at a decent price, so it's also where a large number of top performers turned up.</p>
          <div class="band-chart">
            <div class="band-row"><div class="label">Under ${shMoney(21000, 15000)}</div><div class="band-track"><span style="width:36%; background:var(--band-2)"></span></div><div class="figs"><div class="pct">72</div><div class="cnt">top performers here</div></div></div>
            <div class="band-row"><div class="label">${shMoney(21000, 15000)}&ndash;${shMoney(28000, 20000)}</div><div class="band-track"><span style="width:26%; background:var(--band-2)"></span></div><div class="figs"><div class="pct">53</div><div class="cnt">top performers here</div></div></div>
            <div class="band-row"><div class="label">${shMoney(28000, 20000)}&ndash;${shMoney(35000, 25000)}</div><div class="band-track"><span style="width:32%; background:var(--band-3)"></span></div><div class="figs"><div class="pct">64</div><div class="cnt">top performers here</div></div></div>
            <div class="band-row"><div class="label">${shMoney(35000, 25000)}&ndash;${shMoney(42000, 30000)}</div><div class="band-track"><span style="width:24%; background:var(--band-3)"></span></div><div class="figs"><div class="pct">49</div><div class="cnt">top performers here</div></div></div>
            <div class="band-row"><div class="label">${shMoney(42000, 30000)}&ndash;${shMoney(49000, 35000)}</div><div class="band-track"><span style="width:30%; background:var(--band-4)"></span></div><div class="figs"><div class="pct">59</div><div class="cnt">top performers here</div></div></div>
            <div class="band-row"><div class="label">${shMoney(49000, 35000)}&ndash;${shMoney(85000, 60714.29)}</div><div class="band-track"><span style="width:96%; background:var(--gold)"></span></div><div class="figs"><div class="pct">192</div><div class="cnt">top performers here</div></div></div>
            <div class="band-row"><div class="label">${shMoney(85000, 60714.29)}&ndash;${shMoney(140000, 100000)}<span style="display:block;font-size:10.5px;font-weight:500;color:var(--muted)">most top performers</span></div><div class="band-track"><span style="width:100%; background:var(--gold)"></span></div><div class="figs"><div class="pct">200</div><div class="cnt">top performers here</div></div></div>
            <div class="band-row"><div class="label">${shMoney(140000, 100000)}&ndash;${shMoney(210000, 150000)}</div><div class="band-track"><span style="width:56%; background:var(--band-6)"></span></div><div class="figs"><div class="pct">111</div><div class="cnt">top performers here</div></div></div>
            <div class="band-row"><div class="label">${shMoney(210000, 150000, "k", "+")}</div><div class="band-track"><span style="width:66%; background:var(--band-7)"></span></div><div class="figs"><div class="pct">131</div><div class="cnt">top performers here</div></div></div>
          </div>
        </div>
      </section>

      <section class="block">
        <h2 class="section-title">Does this pattern hold at every sale, or does it differ by venue?</h2>
        <p class="section-lead">Lexington, Harrisburg, and Ohio are three different sales with different buyers and different horses. This checks whether the price pattern above holds true at each one individually, or whether one sale behaves differently.</p>
        <div class="ref-panel">
          <table>
            <thead><tr><th>Sale</th><th>Under ${shMoney(28000, 20000)}</th><th>${shMoney(28000, 20000)}&ndash;${shMoney(85000, 60714.29)}</th><th>${shMoney(85000, 60714.29)}&ndash;${shMoney(140000, 100000)}</th><th>${shMoney(140000, 100000)}&ndash;${shMoney(210000, 150000)}</th><th>${shMoney(210000, 150000, "k", "+")}</th></tr></thead>
            <tbody>
              <tr><td class="venue-name">Lexington Selected</td><td>1.2%</td><td>3.1%</td><td>6.3%</td><td>6.6%</td><td>8.4%</td></tr>
              <tr><td class="venue-name">Harrisburg Book 1</td><td>0.9%</td><td>2.3%</td><td>4.3%</td><td>6.6%</td><td>10.4%</td></tr>
              <tr><td class="venue-name">Ohio Jug</td><td>1.1%</td><td>3.1%</td><td>7.4%</td><td>2.5%</td><td>9.1%</td></tr>
            </tbody>
          </table>
          <table style="margin-top:20px;">
            <thead><tr><th>Sale</th><th>Colt</th><th>Filly</th><th>Trotter</th><th>Pacer</th></tr></thead>
            <tbody>
              <tr><td class="venue-name">Lexington Selected</td><td class="win-cell">4.3%</td><td>3.0%</td><td>3.7%</td><td>3.8%</td></tr>
              <tr><td class="venue-name">Harrisburg Book 1</td><td class="win-cell">2.5%</td><td>2.1%</td><td>2.5%</td><td>2.4%</td></tr>
              <tr><td class="venue-name">Ohio Jug</td><td class="win-cell">2.4%</td><td>2.1%</td><td class="win-cell">2.8%</td><td>1.8%</td></tr>
            </tbody>
          </table>
          <p style="font-size:13px; color:var(--ink-soft); margin:16px 0 0; line-height:1.6;">Colts beat fillies at every sale, without exception. Trotters vs. pacers is close at Lexington and Harrisburg, but Ohio clearly favors trotters. Ohio's two highest price bands only have a handful of horses in them, so treat those two numbers as a weak signal rather than a solid one.</p>
        </div>
      </section>

      <div class="footer-note">
        This looks at every yearling sold at Lexington Selected, Harrisburg Book 1, and Ohio Jug from 2008 through 2025, checked against season top-earner rankings through 2025 (the 2026 racing season is still in progress and was excluded, since an unfinished season understates what a horse will eventually earn). "Top performer" means the horse appeared anywhere on a season top-earner leaderboard, at 2, 3, or 4-plus years old, at least once. Horses were matched between the sale records and the earnings leaderboards by name, which can occasionally miss a spelling variation or mix up two horses with the same name. This is a backward-looking pattern in past results, not a prediction about any specific 2026 yearling. It only shows how often horses in a given price range have become top performers, nothing more. Original sale prices were in USD; amounts are currently shown in ${shCcyLabel()}, ${saleHistoryFxNote()}.
      </div>
    </div>
    </div>`;

  bindAdminTabs();
  bindSaleHistory();
}

function bindSaleHistory() {
  bindCurrencyToggle();
}

// Client-side currency toggle, ported verbatim from the reference artifact's
// applyCurrency()/fmtK()/fmtFull() functions: walks every .money/.money-range
// span in the DOM and rewrites its text from the data-cad/data-usd/data-style
// attributes baked in at render time, instead of re-rendering the page.
// Also re-applies selectedCurrency immediately (not just on click), so
// switching tabs and coming back — a fresh render() — keeps showing
// whichever currency was last chosen instead of resetting to CAD.
function bindCurrencyToggle() {
  document.querySelectorAll(".ccy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedCurrency = btn.dataset.ccy;
      applyCurrency(selectedCurrency);
    });
  });
  if (document.querySelector(".ccy-btn")) applyCurrency(selectedCurrency);
}

function applyCurrency(ccy) {
  const rate = getExchangeRate();
  const toCcy = (cad) => (ccy === "usd" ? cad * rate : cad);
  document.querySelectorAll(".money").forEach((el) => {
    // Always convert live from the CAD figure using the current stored
    // rate, rather than trusting a pre-computed data-usd value — that way
    // editing the rate in Questions Builder retroactively updates every
    // figure on this page instead of requiring 50+ hardcoded numbers to
    // be recalculated by hand.
    const cad = parseFloat(el.dataset.cad);
    const raw = toCcy(cad);
    const suffix = el.textContent.trim().endsWith("+") ? "+" : "";
    const text = el.dataset.style === "full" ? refFmtFull(raw) : refFmtK(raw);
    el.textContent = text + suffix;
  });
  document.querySelectorAll(".money-range").forEach((el) => {
    const lo = toCcy(parseFloat(el.dataset.cadLo));
    const hi = toCcy(parseFloat(el.dataset.cadHi));
    const loK = Math.round(lo / 1000);
    const hiK = Math.round(hi / 1000);
    el.textContent = `$${loK}-${hiK}k`;
  });
  document.querySelectorAll(".ccy-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.ccy === ccy);
  });
  document.querySelectorAll(".ccy-label").forEach((el) => {
    el.textContent = ccy.toUpperCase();
  });
}

const METRICS_HISTORY_KEY = "thestable_dashboard_metrics_history_v1";

// Records today's dashboard totals so a trend ("vs. 14 days ago") can be
// shown once enough history has accumulated. One entry per calendar day;
// re-visiting the dashboard the same day overwrites today's entry instead
// of duplicating it.
// Fabricates a 14-day upward trend ending at today's real (preview)
// numbers, purely for display — never written to localStorage. Gives
// preview mode the same "filled-in sparkline" look as an established
// dashboard would have, without needing 14 real days of history.
function buildPreviewMetricsHistory(todayMetrics) {
  const history = [];
  for (let d = 13; d >= 0; d--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - d);
    const rampUp = 0.55 + (0.45 * (13 - d)) / 13;
    history.push({
      date: dt.toISOString().slice(0, 10),
      bucketOwnerCount: Math.round(todayMetrics.bucketOwnerCount * rampUp),
      afterSaleOwnerCount: Math.round(todayMetrics.afterSaleOwnerCount * rampUp),
      avgInvestment: Math.round(todayMetrics.avgInvestment * (0.85 + 0.15 * rampUp)),
      requestedCoveragePct: Math.round(todayMetrics.requestedCoveragePct * rampUp),
    });
  }
  history[history.length - 1] = { date: history[history.length - 1].date, ...todayMetrics };
  return history;
}

function recordMetricsSnapshot(metrics) {
  let history;
  try {
    const parsed = JSON.parse(localStorage.getItem(METRICS_HISTORY_KEY) || "[]");
    history = Array.isArray(parsed) ? parsed : [];
  } catch {
    history = [];
  }
  const today = new Date().toISOString().slice(0, 10);
  const withoutToday = history.filter((entry) => entry.date !== today);
  withoutToday.push({ date: today, ...metrics });
  withoutToday.sort((a, b) => a.date.localeCompare(b.date));
  localStorage.setItem(METRICS_HISTORY_KEY, JSON.stringify(withoutToday.slice(-90)));
  return withoutToday;
}

function trendFor(history, key, current) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const baseline = history.find((entry) => entry.date >= cutoffStr && entry.date !== new Date().toISOString().slice(0, 10));
  if (!baseline) return null;
  const past = Number(baseline[key] || 0);
  const delta = current - past;
  const pct = past ? (delta / past) * 100 : null;
  return { past, pctLabel: pct == null ? null : `${Math.abs(pct).toFixed(1)}%`, direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat", date: baseline.date };
}

function sparklinePoints(history, key, current) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const points = history.filter((entry) => entry.date >= cutoffStr && entry.date !== today).map((entry) => Number(entry[key] || 0));
  points.push(current);
  return points.slice(-7);
}

function vsBarsHtml(points, formatFn) {
  if (points.length < 2) return `<div class="vs-bars-empty">Not enough history yet — check back after a few more days of responses.</div>`;
  const max = Math.max(...points, 1);
  const bars = points.map((value, i) => {
    const isLast = i === points.length - 1;
    const height = Math.max(4, Math.round((value / max) * 100));
    const label = i === 0 || isLast ? `<span class="vsb-t">${formatFn(value)}</span>` : "";
    return `<div class="vsb${isLast ? " vsb-now" : ""}" style="height:${height}%">${label}</div>`;
  }).join("");
  return `<div class="vs-bars">${bars}</div><div class="vsb-axis"><span>${points.length > 1 ? "Earliest" : ""}</span><span>Now</span></div>`;
}

function renderOwnerRosterAdmin() {
  const roster = getOwnerRoster();
  const respondedEmails = new Set(getResponses().map((item) => (item.email || "").toLowerCase()));

  app.innerHTML = `
    <div class="refskin">
    <div class="wrap">
      <div class="refskin-topbar">${adminTabs()}<div class="topbar-right">${resetDemoDataButton()}${backToSiteLink()}</div></div>

      ${adminMasthead("Owner Roster")}

      <p class="dek">The full list of owners invited to respond, so the dashboard can show a real response rate. Import this once you have TheStable's owner list; until then the dashboard shows "no data" instead of a guess.</p>

      <div class="ref-panel" style="margin-top: 22px;">
        <div class="panel-head">
          <div>
            <div class="tag">Import</div>
            <h2>Add owners</h2>
            <p>Paste one owner per line: "Name, email@example.com" (or just an email). Pasting again adds new owners without duplicating existing ones.</p>
          </div>
        </div>
        <div class="panel-body">
          <textarea class="input" id="ownerRosterInput" rows="6" placeholder="Jane Smith, jane@example.com&#10;Mark Doe, markd@example.com" style="width:100%; font-family: inherit; resize: vertical;"></textarea>
          <div class="qb-add-row" style="margin-top: 12px;">
            <button class="btn primary" type="button" id="ownerRosterImport">Import pasted list</button>
            <button class="btn red" type="button" id="ownerRosterClear" ${roster.length ? "" : "disabled"}>Clear roster</button>
          </div>
          <div class="roster-upload-divider"><span>or</span></div>
          <label class="btn" id="ownerRosterFileLabel" style="display:inline-flex; cursor:pointer;">
            Upload CSV or Excel file
            <input type="file" id="ownerRosterFile" accept=".csv,.txt,.xlsx,.xls" style="display:none;">
          </label>
          <span class="qb-suggested-price" id="ownerRosterFileStatus"></span>
          <p class="quiet" style="margin-top:8px;">Works with a spreadsheet exported from Excel or Google Sheets. Include a header row with "Name" and "Email" columns if you can — if not, the first two columns are used.</p>
        </div>
      </div>

      <div class="ref-panel" style="margin-top: 18px;">
        <div class="panel-head">
          <div>
            <div class="tag">Roster</div>
            <h2>${roster.length} owner${roster.length === 1 ? "" : "s"} on file</h2>
            <p>${roster.length ? `${[...respondedEmails].filter((email) => roster.some((o) => o.email === email)).length} of ${roster.length} have responded so far.` : "No owners imported yet."}</p>
          </div>
        </div>
        <div style="overflow-x:auto;">
          ${roster.length ? `
          <table>
            <thead><tr><th>Owner</th><th>Email</th><th>Responded</th><th></th></tr></thead>
            <tbody>
              ${roster.map((owner, i) => `
              <tr>
                <td><div class="owner-name">${escapeHtml(owner.name)}</div></td>
                <td>${escapeHtml(owner.email)}</td>
                <td>${respondedEmails.has(owner.email) ? "Yes" : "Not yet"}</td>
                <td><button class="btn red" type="button" data-remove-owner="${i}">Remove</button></td>
              </tr>`).join("")}
            </tbody>
          </table>` : `<p class="notice" style="margin:18px 20px;">Paste owners above to build the roster.</p>`}
        </div>
      </div>
    </div>
    </div>`;

  bindAdminTabs();
  const mergeIntoRoster = (parsed) => {
    const existing = getOwnerRoster();
    const existingEmails = new Set(existing.map((o) => o.email));
    const merged = [...existing, ...parsed.filter((o) => !existingEmails.has(o.email))];
    saveOwnerRoster(merged);
    return merged.length - existing.length;
  };
  document.querySelector("#ownerRosterImport").addEventListener("click", () => {
    const textarea = document.querySelector("#ownerRosterInput");
    const parsed = parseOwnerRosterText(textarea.value);
    if (!parsed.length) return;
    mergeIntoRoster(parsed);
    renderOwnerRosterAdmin();
  });
  document.querySelector("#ownerRosterFile").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const status = document.querySelector("#ownerRosterFileStatus");
    status.textContent = "Reading file...";
    try {
      const parsed = await parseOwnerRosterFile(file);
      if (!parsed.length) {
        status.textContent = `No valid name/email rows found in "${file.name}".`;
        return;
      }
      const added = mergeIntoRoster(parsed);
      renderOwnerRosterAdmin();
      // renderOwnerRosterAdmin() just replaced this element, so the status
      // message has to be set again after the fact, on the new element.
      const newStatus = document.querySelector("#ownerRosterFileStatus");
      if (newStatus) newStatus.textContent = `Imported ${added} new owner${added === 1 ? "" : "s"} from "${file.name}" (${parsed.length} rows found).`;
    } catch (err) {
      status.textContent = err.message || "Could not read that file.";
    }
  });
  const clearButton = document.querySelector("#ownerRosterClear");
  if (clearButton && !clearButton.disabled) {
    armDestructiveButton(clearButton, "Confirm clear?", () => {
      saveOwnerRoster([]);
      renderOwnerRosterAdmin();
    });
  }
  document.querySelectorAll("[data-remove-owner]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.getAttribute("data-remove-owner"));
      const roster = getOwnerRoster();
      roster.splice(index, 1);
      saveOwnerRoster(roster);
      renderOwnerRosterAdmin();
    });
  });
}

// Builds a fictional dataset shaped like real intake responses, purely to
// preview a busy dashboard. Deterministic (no Math.random) so the preview
// looks the same every time instead of jittering on every render. Never
// touches localStorage — callers read this instead of getResponses() /
// getOwnerRoster() / bucketPriceFor() while previewMode is on.
function buildPreviewDataset() {
  const firstNames = ["Jane", "Mark", "Susan", "David", "Linda", "Michael", "Karen", "Robert", "Patricia", "James", "Nancy", "Thomas", "Sandra", "Daniel", "Betty", "Paul", "Carol", "Steven", "Ruth", "Kevin"];
  const lastNames = ["Smith", "Doe", "Miller", "Taylor", "Anderson", "Reed", "Clark", "Kessler", "Owens", "Foster", "Bennett", "Hayes", "Coleman", "Pierce", "Sutton", "Marsh", "Doyle", "Grant", "Wells", "Barrett"];
  const salesPool = REAL_SALES.map((s) => s.id);
  const bucketPool = [["premium"], ["balanced"], ["value"], ["premium", "balanced"], ["value"], ["balanced"]];
  const gaits = ["trotter", "pacer", "both"];
  const sexes = ["colt", "filly", "either"];
  const eligibilityPool = ["kentucky", "ohio", "ontario", "pennsylvania", "new_york"];
  const horseCounts = ["one", "two", "three_plus"];
  const shareSizes = ["1", "2_5", "5_10", "10plus", "depends"];

  const responses = [];
  for (let i = 0; i < 42; i++) {
    const sale = salesPool[i % salesPool.length];
    const gait = gaits[i % gaits.length];
    // Every 4th owner is also interested in after-sale individual shares
    // (participation "both"), so that panel has real preview data too —
    // matches how a real owner can want both a bucket and after-sale shares.
    const alsoAfterSale = i % 4 === 0;
    responses.push({
      id: "preview_" + i,
      ownerId: null,
      name: `${firstNames[i % firstNames.length]} ${lastNames[(i * 3) % lastNames.length]}`,
      email: `preview_owner${i}@example.com`,
      selectedSales: [sale],
      eligibilityPreferences: [eligibilityPool[i % eligibilityPool.length]],
      saleResponses: {
        [sale]: {
          participation: alsoAfterSale ? "both" : "bucket",
          gait,
          sex: sexes[i % sexes.length],
          sexTrotter: "",
          sexPacer: "",
          bucketDetailMode: "simple",
          bucketTypes: bucketPool[i % bucketPool.length],
          maxYearlings: "no_preference",
          bucketLevel: ["1", "2", "3", "5"][i % 4],
          bucketAmount: "",
          bucketMatrix: blankBucketMatrix(),
          specificHorseCount: alsoAfterSale ? horseCounts[i % horseCounts.length] : "",
          specificShareSize: alsoAfterSale ? shareSizes[i % shareSizes.length] : "",
          note: "",
        },
      },
      submittedAt: new Date(Date.now() - i * 3600000).toISOString(),
    });
  }

  const roster = responses.map((r) => ({ name: r.name, email: r.email }));
  for (let i = 0; i < 18; i++) {
    roster.push({ name: `${firstNames[(i + 7) % firstNames.length]} ${lastNames[(i + 11) % lastNames.length]}`, email: `preview_noresponse${i}@example.com` });
  }

  const prices = { premium: 15000, balanced: 8000, value: 3000 };
  const confirmedBuckets = [
    { id: "cb_preview_1", name: "Premium Trotter Colts", price: 15000, gait: "trotter", sex: "colt", note: "" },
    { id: "cb_preview_2", name: "Balanced — Any gait, Fillies", price: 8000, gait: "any", sex: "filly", note: "" },
    { id: "cb_preview_3", name: "Value Buys", price: 3000, gait: "any", sex: "any", note: "" },
  ];

  return { responses, roster, prices, confirmedBuckets };
}

function renderAdmin() {
  if (!adminLoggedIn) {
    app.innerHTML = `<article class="card login-card"><div class="card-body"><span class="tag">Admin</span><h2>Bucket Planning Login</h2><form id="loginForm"><div class="field-stack"><input class="input" id="passcode" type="password" placeholder="Passcode" autofocus></div><p class="notice hidden" id="loginError">Incorrect passcode.</p><div class="actions single"><button class="btn primary" type="submit" id="loginButton">Login</button></div></form></div></article>`;
    document.querySelector("#loginForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const entered = document.querySelector("#passcode").value;
      const enteredHash = await sha256Hex(entered);
      if (enteredHash === ADMIN_PASSCODE_HASH) {
        adminLoggedIn = true;
        render();
      } else {
        document.querySelector("#loginError").classList.remove("hidden");
      }
    });
    return;
  }
  if (adminTab === "questions") {
    renderQuestionsAdmin();
    return;
  }
  if (adminTab === "salehistory") {
    renderSaleHistory();
    return;
  }
  if (adminTab === "owners") {
    renderOwnerRosterAdmin();
    return;
  }

  const preview = previewMode ? buildPreviewDataset() : null;
  const responses = preview ? preview.responses : getResponses();
  const rows = flattenResponses(responses);
  const bucketRows = rows.filter((row) => hasBucket(row) && row.amount);
  const afterSaleRows = buildAfterSaleRows(responses);
  const ownerCount = new Set(responses.map((item) => item.email)).size;
  const bucketOwnerCount = new Set(bucketRows.map((row) => row.email)).size;
  const afterSaleOwnerCount = new Set(afterSaleRows.map((row) => row.email)).size;
  const totalPercent = bucketRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const saleDemand = groupDemand(bucketRows, (row) => row.saleLabel);
  // Same estimated-capital math as the hero figure, but broken out per
  // sale — only computed when at least one bucket type has a price set.
  const saleCapital = new Map();
  bucketRows.forEach((row) => {
    const price = bucketPriceFor(row.bucketTypes[0], preview ? preview.prices : null);
    if (price == null) return;
    const current = saleCapital.get(row.saleLabel) || 0;
    saleCapital.set(row.saleLabel, current + (Number(row.amount || 0) / 100) * price);
  });
  const bucketDemand = groupDemand(bucketRows, (row) => labelFor("bucketTypes", row.bucketTypes[0]));
  const gaitDemand = groupDemand(bucketRows, (row) => labelFor("gait", row.gait));
  const sexDemand = groupDemand(bucketRows, (row) => labelFor("sex", row.sex));
  const shareSizeDemand = groupDemand(bucketRows, bucketShareBand);
  const eligibilityDemand = groupMultiDemand(bucketRows, (row) => row.eligibility.map((item) => labelFor("eligibility", item)));
  const afterSaleEligibility = groupMultiDemand(afterSaleRows, (row) => row.eligibility.map((item) => labelFor("eligibility", item)));
  const previewPrices = preview ? preview.prices : null;
  const suggestions = buildBucketSuggestions(bucketRows, previewPrices);
  const confirmedBuckets = preview ? preview.confirmedBuckets : getConfirmedBuckets("default");

  const asOf = new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const ownerRoster = preview ? preview.roster : getOwnerRoster();
  const invitedCount = ownerRoster.length;
  // Two distinct percentages: how many of the *invited* owners have
  // responded at all (needs the imported roster as the denominator — "no
  // data" until Anthony imports one), versus how many of the owners who
  // *did* respond went on to ask for a pre-sale bucket (always computable
  // from response data alone).
  const responseRatePct = invitedCount ? Math.round((ownerCount / invitedCount) * 100) : null;
  const bucketInterestPct = ownerCount ? Math.round((bucketOwnerCount / ownerCount) * 100) : 0;
  // Estimated dollar figure: each row's requested share (%) times that
  // row's bucket-type price, summed. Rows whose bucket type has no price
  // set yet in the Questions Builder are excluded from the dollar total
  // (their share % still counts toward totalPercent above).
  const pricedRows = bucketRows.filter((row) => bucketPriceFor(row.bucketTypes[0], previewPrices) != null);
  const estimatedCapital = pricedRows.reduce((sum, row) => sum + (Number(row.amount || 0) / 100) * bucketPriceFor(row.bucketTypes[0], previewPrices), 0);
  const hasCapitalEstimate = pricedRows.length > 0;
  const requestedCoveragePct = Math.round(totalPercent);
  const avgInvestment = hasCapitalEstimate && bucketOwnerCount ? Math.round(estimatedCapital / bucketOwnerCount) : null;

  // Preview mode never writes a snapshot — otherwise fictional demo numbers
  // would pollute the real trend history shown once preview is turned off.
  // It fabricates its own flat 14-day history instead, purely for display.
  const metricsHistory = preview
    ? buildPreviewMetricsHistory({ bucketOwnerCount, afterSaleOwnerCount, avgInvestment: avgInvestment ?? 0, requestedCoveragePct })
    : recordMetricsSnapshot({ bucketOwnerCount, afterSaleOwnerCount, avgInvestment: avgInvestment ?? 0, requestedCoveragePct });
  const trendRow = (key, current, trendSuffix = " vs. 14 days ago") => {
    const trend = trendFor(metricsHistory, key, current);
    if (!trend || trend.pctLabel == null) return "";
    return `<span class="vs-trend ${trend.direction}">${trend.direction === "up" ? "&#9650;" : trend.direction === "down" ? "&#9660;" : ""} ${trend.pctLabel}${trendSuffix}</span>`;
  };
  const trendBars = (key, current, formatFn) => vsBarsHtml(sparklinePoints(metricsHistory, key, current), formatFn);

  app.innerHTML = `
    <div class="refskin dashboard-page">
    <div class="wrap">
      <div class="refskin-topbar">${adminTabs()}<div class="topbar-right">${previewToggleButton()}${resetDemoDataButton()}${backToSiteLink()}</div></div>

      ${preview ? `<div class="preview-banner">Previewing with fictional demo data — no real responses were touched. <button type="button" id="previewOff">Show my real data</button></div>` : ""}

      ${adminMasthead("Response Dashboard", `
          ${hasCapitalEstimate ? `<div class="currency-toggle" role="group" aria-label="Currency">
            <button class="ccy-btn active" data-ccy="cad" type="button">CAD $</button>
            <button class="ccy-btn" data-ccy="usd" type="button">USD $</button>
          </div>` : ""}
          <div class="as-of light">Responses as of <strong>${asOf}</strong></div>
          <button class="export-btn" type="button" id="exportCsv">Export CSV</button>`)}

      <!-- VERDICT -->
      <div class="verdict">
        <div class="verdict-top">
          <div>
            <div class="eyebrow"><span class="dot"></span> ${hasCapitalEstimate ? "Indicative capital, all sales" : "Requested bucket share, all sales"}</div>
            <div class="verdict-figure">${!bucketRows.length ? "No data" : hasCapitalEstimate ? `<span class="money" data-cad="${estimatedCapital}" data-style="full">${money(estimatedCapital)}</span><sup class="ccy-label">CAD</sup> <span class="verdict-figure-sub">(${percent(totalPercent)} requested share)</span>` : percent(totalPercent)}</div>
            <div class="verdict-label">${bucketRows.length ? `Total requested bucket interest across ${saleDemand.length} sale${saleDemand.length === 1 ? "" : "s"} currently in the intake. Non-binding, for planning only.${hasCapitalEstimate ? "" : " Set bucket prices in Questions Builder to also see a dollar figure here."}` : "No pre-sale bucket responses yet. This figure will fill in as owners submit the intake."}</div>
          </div>
          <div class="response-ring">
            <div class="ring" style="--pct:${responseRatePct ?? 0}">${responseRatePct == null ? `<div class="ring-empty">No data</div>` : `<div>${responseRatePct}%</div>`}</div>
            <div class="response-copy">
              <div class="n">${responseRatePct == null ? `No owners responded yet` : `${ownerCount} of ${invitedCount} owners responded`}</div>
              <div class="d">${ownerCount ? `${bucketInterestPct}% of respondents want a bucket &middot; ${afterSaleOwnerCount} also interested in after-sale shares` : "No responses yet"}</div>
            </div>
          </div>
        </div>

        <div class="verdict-strip">
          <div class="vs-item">
            <div class="vs-label">Pre-sale bucket buyers</div>
            <div class="vs-row"><span class="vs-value">${bucketOwnerCount}</span>${trendRow("bucketOwnerCount", bucketOwnerCount)}</div>
            ${trendBars("bucketOwnerCount", bucketOwnerCount, (v) => `${Math.round(v)}`)}
          </div>
          <div class="vs-item">
            <div class="vs-label">After-sale buyers</div>
            <div class="vs-row"><span class="vs-value">${afterSaleOwnerCount}</span>${trendRow("afterSaleOwnerCount", afterSaleOwnerCount)}</div>
            ${trendBars("afterSaleOwnerCount", afterSaleOwnerCount, (v) => `${Math.round(v)}`)}
          </div>
          <div class="vs-item">
            <div class="vs-label">Avg. investment / owner</div>
            <div class="vs-row"><span class="vs-value">${avgInvestment != null ? money(avgInvestment) : "No data"}</span>${avgInvestment != null ? trendRow("avgInvestment", avgInvestment) : ""}</div>
            ${avgInvestment != null ? trendBars("avgInvestment", avgInvestment, (v) => money(v)) : `<div class="vs-bars-empty">Set bucket prices in Questions Builder to see this.</div>`}
          </div>
          <div class="vs-item">
            <div class="vs-label">Requested bucket coverage</div>
            <div class="vs-row"><span class="vs-value">${requestedCoveragePct}%</span>${trendRow("requestedCoveragePct", requestedCoveragePct)}</div>
            ${trendBars("requestedCoveragePct", requestedCoveragePct, (v) => `${Math.round(v)}%`)}
          </div>
        </div>
      </div>

      <!-- CONFIRMED OFFER -->
      <div class="ref-panel">
        <div class="panel-head">
          <div>
            <div class="tag">Confirmed offer</div>
            <h2>Buckets we're offering</h2>
            <p>TheStable's finalized bucket lineup for this sale year, set in Questions Builder.</p>
          </div>
        </div>
        <div class="panel-body" style="padding-top: 4px;">
          ${confirmedBuckets.length ? `<div class="confirmed-bucket-list">${confirmedBuckets.map((b) => `
          <div class="confirmed-bucket-card">
            <div class="cbc-name">${escapeHtml(b.name)}</div>
            <div class="cbc-price">${b.price != null ? money(b.price) : "No price set"}</div>
            <div class="cbc-criteria">${[b.gait !== "any" ? labelFor("gait", b.gait) : null, b.sex !== "any" ? labelFor("sex", b.sex) : null].filter(Boolean).join(" &middot; ") || "Open to any gait/sex"}</div>
            ${b.note ? `<div class="cbc-note">${escapeHtml(b.note)}</div>` : ""}
          </div>`).join("")}</div>` : `<p class="quiet" style="padding:6px 4px;">No buckets confirmed yet. Review demand below, then set the final lineup in Questions Builder &rarr; Confirmed buckets.</p>`}
        </div>
      </div>

      <!-- SUGGESTIONS -->
      <div class="ref-panel" style="margin-top: 18px;">
        <div class="panel-head">
          <div>
            <div class="tag">Recommendation</div>
            <h2>Suggested buckets to offer</h2>
            <p>Ranked by requested share, owner count, and jurisdiction fit. Not final bucket capacity.</p>
          </div>
          <span class="ref-info-dot" tabindex="0">i<span class="tip">Suggestions are ranked by how much of a sale's owners have expressed interest, how many owners that represents, and whether the top requested share size fits the sale's jurisdiction rules. This is not a final decision on which buckets to actually offer.</span></span>
        </div>
        <div class="panel-body" style="padding-top: 4px;">
          ${suggestions.length ? suggestions.map((row) => `
          <div class="sugg-row">
            <div>
              <span class="status ${row.status.toLowerCase()}">${suggIcon(row.status)}${row.status}</span>
              <div class="sugg-title">${escapeHtml(row.saleLabel)} &middot; ${escapeHtml(labelFor("bucketTypes", row.bucketType))} &middot; ${escapeHtml(labelFor("gait", row.gait))} &middot; ${escapeHtml(labelFor("sex", row.sex))}</div>
              <div class="sugg-sub">${row.eligibility.length ? row.eligibility.map((item) => escapeHtml(item.label)).join(", ") : "No jurisdiction preference captured"}</div>
            </div>
            <div class="stat-block"><div class="num">${percent(row.total)}</div><div class="lbl">requested share</div></div>
            <div class="stat-block"><div class="num">${row.ownerCount}</div><div class="lbl">owner${row.ownerCount === 1 ? "" : "s"}</div></div>
            <div class="stat-block"><div class="num">${row.shareSizes.length ? escapeHtml(row.shareSizes[0].label) : "No data"}${row.topShareDollarBand ? ` <span class="stat-sub">(~${escapeHtml(row.topShareDollarBand)})</span>` : ""}</div><div class="lbl">top share size</div></div>
            <div class="fill-meter"><div class="bar"><span style="width:${Math.max(4, Math.min(100, row.total))}%"></span></div><div class="pct">${row.fillSignal}</div></div>
          </div>`).join("") : `<p class="quiet" style="padding:6px 4px;">No bucket suggestions yet. Suggestions will appear once owners submit pre-sale bucket responses.</p>`}
        </div>
      </div>

      <!-- ROW: sale demand + bucket type mix -->
      <div class="grid-2">
        <div class="ref-panel">
          <div class="panel-head">
            <h2>Interest by sale</h2>
            <span class="ref-info-dot" tabindex="0">i<span class="tip">Total requested bucket share and number of owners who expressed interest, per sale, based on pre-sale bucket responses collected so far.</span></span>
          </div>
          <div class="panel-body">
            ${refBarList(saleDemand, saleCapital)}
          </div>
        </div>
        <div class="ref-panel">
          <div class="panel-head">
            <h2>Bucket type mix</h2>
            <span class="ref-info-dot" tabindex="0">i<span class="tip">Share of total requested percentage that falls into each bucket type (Premium, Balanced, Value buys), based on what owners selected in their response.</span></span>
          </div>
          <div class="panel-body">
            ${refDonut(bucketDemand)}
          </div>
        </div>
      </div>

      <!-- ROW: gait / sex / share size -->
      <div class="grid-3">
        <div class="ref-panel">
          <div class="panel-head"><h2>Trotter vs. Pacer</h2></div>
          <div class="panel-body">${refBarList(gaitDemand)}</div>
        </div>
        <div class="ref-panel">
          <div class="panel-head"><h2>Colt / Filly</h2></div>
          <div class="panel-body">${refBarList(sexDemand)}</div>
        </div>
        <div class="ref-panel">
          <div class="panel-head"><h2>Share size</h2></div>
          <div class="panel-body">${refBarList(shareSizeDemand)}</div>
        </div>
      </div>

      <div class="grid-2">
        <div class="ref-panel">
          <div class="panel-head">
            <h2>Requested jurisdictions</h2>
            <span class="ref-info-dot" tabindex="0">i<span class="tip">State or province eligibility owners prefer, such as Kentucky, Ohio or Ontario.</span></span>
          </div>
          <div class="panel-body">${refBarList(eligibilityDemand)}</div>
        </div>
        <div class="ref-panel">
          <div class="panel-head"><h2>After-sale individual shares</h2><span class="ref-info-dot" tabindex="0">i<span class="tip">Useful after the sales, when remaining shares can be matched to owners who did not join a bucket or want extra horses.</span></span></div>
          <div class="panel-body">
            ${afterSaleRows.length ? `
            <div class="bar-list">
              <div class="bar-row"><div class="meta"><span class="name">How many horses</span></div>${miniChipRow(groupDemand(afterSaleRows, (row) => labelFor("specificHorseCount", row.specificHorseCount)))}</div>
              <div class="bar-row"><div class="meta"><span class="name">Typical share size</span></div>${miniChipRow(groupDemand(afterSaleRows, (row) => labelFor("specificShareSize", row.specificShareSize)))}</div>
              <div class="bar-row"><div class="meta"><span class="name">Preferred jurisdictions</span></div>${miniChipRow(afterSaleEligibility)}</div>
            </div>` : `<p class="quiet">No after-sale interest captured yet.</p>`}
          </div>
        </div>
      </div>

      ${customQuestionPanels(rows)}

      <!-- OWNER TABLE -->
      <div class="ref-panel" style="margin-top: 18px;">
        <div class="panel-head">
          <div>
            <div class="tag">Owners</div>
            <h2>Owner detail</h2>
            <p>Use this to see who sits behind a specific signal.</p>
          </div>
        </div>
        <div id="ownerTableBody">${refOwnerTableRows(rows)}</div>
      </div>
    </div>
    </div>
    <div id="globalTooltip" class="global-tooltip"></div>`;
  document.querySelector("#exportCsv").addEventListener("click", () => exportCsv(rows));
  bindOwnerTableFilters(rows);
  bindDashboardTooltips();
  bindCurrencyToggle();
  bindAdminTabs();
}

function suggIcon(status) {
  if (status === "Offer") return `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 2l2.2 5.6L18 8.4l-4.4 3.9L15 18l-5-3.3L5 18l1.4-5.7L2 8.4l5.8-.8z"/></svg>`;
  if (status === "Shortlist") return `<svg viewBox="0 0 20 20" fill="currentColor"><circle cx="10" cy="10" r="7"/></svg>`;
  return `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 3a7 7 0 100 14 7 7 0 000-14zm.75 3.5v3.9l3.3 2-0.75 1.2-4.05-2.4V6.5z"/></svg>`;
}

function refBarList(items, dollarByLabel = null) {
  const max = Math.max(1, ...items.map((item) => item.total));
  return `<div class="bar-list">
    ${items.length ? items.map((item) => {
      const dollar = dollarByLabel?.get(item.label);
      return `<div class="bar-row"><div class="meta"><span class="name">${escapeHtml(item.label)}</span><span class="amt">${percent(item.total)}${dollar ? ` (${money(dollar)})` : ""} &middot; ${item.ownerCount} owner${item.ownerCount === 1 ? "" : "s"}</span></div><div class="bar-track"><span style="width:${Math.max(4, (item.total / max) * 100)}%"></span></div></div>`;
    }).join("") : `<p class="quiet">No bucket data yet.</p>`}
  </div>`;
}

function miniChipRow(items) {
  return `<div class="amt">${items.length ? items.slice(0, 4).map((item) => `${escapeHtml(item.label)} (${item.count})`).join(", ") : "No data"}</div>`;
}

function refDonut(items) {
  const total = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
  if (!total || !items.length) {
    return `<p class="quiet">No bucket data yet.</p>`;
  }
  let startAngle = 0;
  const paths = items.slice(0, 6).map((item, index) => {
    const fraction = Number(item.total || 0) / total;
    const endAngle = startAngle + fraction * 360;
    const path = donutArcPath(startAngle, endAngle);
    const color = CHART_COLORS[index % CHART_COLORS.length];
    startAngle = endAngle;
    return `<path d="${path}" fill="${color}" stroke="#f8f6f1" stroke-width="1.5"/>`;
  }).join("");
  return `<div class="donut-row">
    <svg class="donut-svg" viewBox="0 0 120 120" width="116" height="116">${paths}</svg>
    <div class="legend">
      ${items.slice(0, 6).map((item, index) => `<div class="leg-row"><span class="sw" style="background:${CHART_COLORS[index % CHART_COLORS.length]}"></span><span class="name">${escapeHtml(item.label)}</span><span class="pct">${percent(Math.round((Number(item.total || 0) / total) * 1000) / 10)}</span><span class="amt">${item.ownerCount} owner${item.ownerCount === 1 ? "" : "s"}</span></div>`).join("")}
    </div>
  </div>`;
}

function donutArcPath(startDeg, endDeg) {
  const cx = 60, cy = 60, r = 58;
  const toXY = (deg) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [x1, y1] = toXY(startDeg);
  const [x2, y2] = toXY(endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  if (endDeg - startDeg >= 359.99) {
    return `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
  }
  return `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

// Generic dashboard panel for any question Anthony added in Questions
// Builder beyond the fixed set — a bar chart of answer counts for
// single/multi-select and yes/no questions, a simple list of the distinct
// answers given for text/number questions. This is intentionally plain:
// it's what makes a brand-new question show up on the dashboard with zero
// extra code, not a substitute for a purpose-built chart like the bucket
// suggestions panel above (see the "how it flows to the dashboard" answer
// this was built for — some questions still deserve a custom view).
function customQuestionPanels(rows) {
  const customBlocks = customTableColumns();
  if (!customBlocks.length) return "";
  const panels = customBlocks.map((block) => {
    const answered = rows.filter((row) => {
      const value = row._rawResponse?.[block.id];
      return value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && !value.length);
    });
    if (block.type === "text" || block.type === "number") {
      const distinctAnswers = [...new Set(answered.map((row) => String(row._rawResponse[block.id]).trim()).filter(Boolean))];
      return `<div class="ref-panel">
        <div class="panel-head"><h2>${escapeHtml(block.label)}</h2><span class="ref-info-dot" tabindex="0">i<span class="tip">Free-text question added in Questions Builder. Showing distinct answers given so far.</span></span></div>
        <div class="panel-body">${distinctAnswers.length ? `<p class="quiet" style="line-height:1.7;">${distinctAnswers.map((a) => escapeHtml(a)).join(" &middot; ")}</p>` : `<p class="quiet">No answers yet.</p>`}</div>
      </div>`;
    }
    const demand = groupDemand(answered, (row) => {
      const value = row._rawResponse[block.id];
      return Array.isArray(value) ? value.map((v) => labelFor(block.id, v) || v).join(", ") : (labelFor(block.id, value) || value);
    });
    return `<div class="ref-panel">
      <div class="panel-head"><h2>${escapeHtml(block.label)}</h2><span class="ref-info-dot" tabindex="0">i<span class="tip">Question added in Questions Builder. Shown here automatically — for a purpose-built chart like the bucket suggestions above, that needs custom design work.</span></span></div>
      <div class="panel-body">${refBarList(demand)}</div>
    </div>`;
  });
  // Two per row, same as the other secondary panels on this dashboard.
  const rowsOfTwo = [];
  for (let i = 0; i < panels.length; i += 2) rowsOfTwo.push(panels.slice(i, i + 2));
  return rowsOfTwo.map((pair) => `<div class="grid-2">${pair.join("")}</div>`).join("");
}

// Any question Anthony added in the Questions admin tab beyond the fixed
// set app.js already knows how to summarize (see KNOWN_SUMMARY_BLOCK_IDS)
// gets its own trailing column here too — same mechanism CSV export and
// the review screen already use, so a new question doesn't need code
// changes anywhere else to show up in the owner table.
function customTableColumns() {
  return currentQuestionSet().blocks.filter(
    (block) => block.type !== "bucket_config" && !KNOWN_SUMMARY_BLOCK_IDS.has(block.id)
  );
}

function customColumnValue(row, block) {
  const value = row._rawResponse?.[block.id];
  if (value === undefined || value === null || value === "") return "";
  return Array.isArray(value) ? value.map((item) => labelFor(block.id, item) || item).join(", ") : (labelFor(block.id, value) || value);
}

function refOwnerTableRows(rows) {
  const search = ownerTableFilters.search.trim().toLowerCase();
  const customColumns = customTableColumns();
  const filtered = rows.filter((row) => {
    if (ownerTableFilters.sale && row.sale !== ownerTableFilters.sale) return false;
    if (ownerTableFilters.type && !row.bucketTypes.some((item) => labelFor("bucketTypes", item) === ownerTableFilters.type)) return false;
    if (ownerTableFilters.gait && labelFor("gait", row.gait) !== ownerTableFilters.gait) return false;
    if (ownerTableFilters.sex && sexSummary(row) !== ownerTableFilters.sex) return false;
    if (search && !row.name.toLowerCase().includes(search) && !row.email.toLowerCase().includes(search)) return false;
    return true;
  });
  if (ownerTableFilters.pctSort) {
    filtered.sort((a, b) => (ownerTableFilters.pctSort === "asc" ? a.amount - b.amount : b.amount - a.amount));
  }
  const saleOptions = [...new Map(rows.map((row) => [row.sale, row.saleLabel])).entries()];
  const typeOptions = [...new Set(rows.flatMap((row) => row.bucketTypes.map((item) => labelFor("bucketTypes", item))))].filter(Boolean);
  const gaitOptions = [...new Set(rows.map((row) => labelFor("gait", row.gait)))].filter(Boolean);
  const sexOptions = [...new Set(rows.map((row) => sexSummary(row)))].filter(Boolean);
  return `<div style="overflow-x:auto;"><table><thead><tr>
      <th>Owner<input class="col-filter" id="ownerSearch" type="search" placeholder="Search name or email" value="${escapeHtml(ownerTableFilters.search)}"></th>
      <th>Sale<select class="col-filter" id="ownerSaleFilter"><option value="">All sales</option>${saleOptions.map(([id, label]) => `<option value="${id}" ${ownerTableFilters.sale === id ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></th>
      <th>Bucket %<select class="col-filter" id="ownerPctSort"><option value="">Unsorted</option><option value="asc" ${ownerTableFilters.pctSort === "asc" ? "selected" : ""}>Low to high</option><option value="desc" ${ownerTableFilters.pctSort === "desc" ? "selected" : ""}>High to low</option></select></th>
      <th>Type<select class="col-filter" id="ownerTypeFilter"><option value="">All types</option>${typeOptions.map((t) => `<option value="${escapeHtml(t)}" ${ownerTableFilters.type === t ? "selected" : ""}>${escapeHtml(t)}</option>`).join("")}</select></th>
      <th>Gait<select class="col-filter" id="ownerGaitFilter"><option value="">All gaits</option>${gaitOptions.map((g) => `<option value="${escapeHtml(g)}" ${ownerTableFilters.gait === g ? "selected" : ""}>${escapeHtml(g)}</option>`).join("")}</select></th>
      <th>Colt / Filly<select class="col-filter" id="ownerSexFilter"><option value="">All</option>${sexOptions.map((s) => `<option value="${escapeHtml(s)}" ${ownerTableFilters.sex === s ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}</select></th>
      ${customColumns.map((block) => `<th>${escapeHtml(block.label)}</th>`).join("")}
    </tr></thead><tbody>
      ${filtered.length ? filtered.map((row) => `<tr><td><div class="owner-name">${escapeHtml(row.name)}</div><div class="owner-email">${escapeHtml(row.email)}</div></td><td>${escapeHtml(row.saleLabel)}</td><td class="pct-cell">${row.amount ? percent(row.amount) : ""}</td><td>${row.bucketTypes.map((item) => escapeHtml(labelFor("bucketTypes", item))).join(", ")}</td><td>${escapeHtml(labelFor("gait", row.gait))}</td><td>${escapeHtml(sexSummary(row))}</td>${customColumns.map((block) => `<td>${escapeHtml(customColumnValue(row, block))}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${6 + customColumns.length}">${rows.length ? "No owners match your filters." : "No owner data yet."}</td></tr>`}
    </tbody></table></div>
    <div class="foot-note">Showing ${filtered.length} of ${rows.length} owner row${rows.length === 1 ? "" : "s"}. Use the filters above to refine.</div>`;
}

function bindDashboardTooltips() {
  const tooltip = document.getElementById("globalTooltip");
  if (!tooltip) return;
  document.querySelectorAll(".ref-info-dot").forEach((dot) => {
    const show = () => {
      const tipEl = dot.querySelector(".tip");
      if (!tipEl) return;
      tooltip.textContent = tipEl.textContent;
      tooltip.classList.add("show");
      const dotBox = dot.getBoundingClientRect();
      const tipBox = tooltip.getBoundingClientRect();
      let left = dotBox.left + dotBox.width / 2 - tipBox.width / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - tipBox.width - 8));
      const top = dotBox.top - tipBox.height - 10;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    };
    const hide = () => tooltip.classList.remove("show");
    dot.addEventListener("mouseenter", show);
    dot.addEventListener("mouseleave", hide);
    dot.addEventListener("focus", show);
    dot.addEventListener("blur", hide);
  });
}

function bucketShareBand(row) {
  const amount = Number(row.amount || 0);
  if (amount <= 1) return "1%";
  if (amount <= 2) return "2%";
  if (amount <= 5) return "3-5%";
  if (amount <= 10) return "6-10%";
  if (amount <= 20) return "11-20%";
  return "More than 20%";
}

function money(value) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function bucketPriceFor(bucketType, previewPrices = null) {
  if (previewPrices) return previewPrices[bucketType] ?? null;
  const bucketConfig = currentQuestionSet().blocks.find((b) => b.type === "bucket_config");
  const bucket = bucketConfig?.buckets.find((b) => b.key === bucketType);
  const price = Number(bucket?.price);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function shareBandDollarLabel(bandLabel, bucketPrice) {
  if (!bucketPrice) return null;
  const match = bandLabel.match(/(\d+)(?:-(\d+))?%/);
  if (!match) return null;
  const lo = Number(match[1]);
  const hi = match[2] ? Number(match[2]) : lo;
  const loAmt = money((lo / 100) * bucketPrice);
  const hiAmt = money((hi / 100) * bucketPrice);
  return lo === hi ? loAmt : `${loAmt} – ${hiAmt}`;
}

function groupDemand(rows, keyFn) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = keyFn(row) || "Unknown";
    const item = groups.get(key) || { label: key, total: 0, owners: new Set(), count: 0 };
    item.total += Number(row.amount || 0);
    item.owners.add(row.email);
    item.count += 1;
    groups.set(key, item);
  });
  return [...groups.values()].map((item) => ({ ...item, ownerCount: item.owners.size })).sort(sortDemand);
}

function groupMultiDemand(rows, valuesFn) {
  const groups = new Map();
  rows.forEach((row) => {
    const values = valuesFn(row).filter(Boolean);
    (values.length ? values : ["Unknown"]).forEach((key) => {
      const item = groups.get(key) || { label: key, total: 0, owners: new Set(), count: 0 };
      item.total += Number(row.amount || 0);
      item.owners.add(row.email);
      item.count += 1;
      groups.set(key, item);
    });
  });
  return [...groups.values()].map((item) => ({ ...item, ownerCount: item.owners.size })).sort(sortDemand);
}

function sortDemand(a, b) {
  if (b.total !== a.total) return b.total - a.total;
  return b.count - a.count;
}

function buildBucketSuggestions(rows, previewPrices = null) {
  return buildPlanningRows(rows).map((row) => {
    const relatedRows = rows.filter((item) => item.sale === row.sale && item.bucketTypes[0] === row.bucketType && item.gait === row.gait && item.sex === row.sex);
    const eligibility = groupMultiDemand(relatedRows, (item) => item.eligibility.map((id) => labelFor("eligibility", id))).slice(0, 3);
    const shareSizes = groupDemand(relatedRows, bucketShareBand).slice(0, 2);
    const bucketPrice = bucketPriceFor(row.bucketType, previewPrices);
    const topShareDollarBand = shareSizes.length ? shareBandDollarLabel(shareSizes[0].label, bucketPrice) : null;
    const score = row.total + row.ownerCount * 8;
    const status = row.total >= 80 || (row.total >= 45 && row.ownerCount >= 3) ? "Offer" : row.total >= 30 || row.ownerCount >= 2 ? "Shortlist" : "Watch";
    const fillSignal = `${(row.total / 100).toFixed(1)}×`;
    return { ...row, eligibility, shareSizes, topShareDollarBand, score, status, fillSignal };
  }).sort((a, b) => b.score - a.score);
}

const ownerTableFilters = { search: "", sale: "", type: "", gait: "", sex: "", pctSort: "" };

function bindOwnerTableFilters(rows) {
  const rerender = () => {
    document.querySelector("#ownerTableBody").innerHTML = refOwnerTableRows(rows);
    bindOwnerTableFilters(rows);
  };
  const bind = (id, key, event = "input") => {
    const el = document.querySelector(`#${id}`);
    if (!el) return;
    el.addEventListener(event, () => {
      ownerTableFilters[key] = el.value;
      rerender();
    });
  };
  bind("ownerSearch", "search");
  bind("ownerSaleFilter", "sale", "change");
  bind("ownerPctSort", "pctSort", "change");
  bind("ownerTypeFilter", "type", "change");
  bind("ownerGaitFilter", "gait", "change");
  bind("ownerSexFilter", "sex", "change");
}

function buildAfterSaleRows(responses) {
  return responses.flatMap((response) => response.selectedSales.flatMap((saleId) => {
    const saleResponse = response.saleResponses[saleId] || {};
    if (!hasSpecific(saleResponse)) return [];
    return [{
      name: response.name,
      email: response.email,
      sale: saleId,
      saleLabel: saleById(saleId)?.label || saleId,
      eligibility: response.eligibilityPreferences || [],
      participation: saleResponse.participation,
      specificHorseCount: saleResponse.specificHorseCount,
      specificShareSize: saleResponse.specificShareSize,
    }];
  }));
}

function buildPlanningRows(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const bucketType = row.bucketTypes[0] || "unspecified";
    const key = [row.sale, bucketType, row.gait, row.sex].join("|");
    const item = groups.get(key) || {
      sale: row.sale,
      saleLabel: row.saleLabel,
      bucketType,
      gait: row.gait,
      sex: row.sex,
      total: 0,
      owners: new Set(),
      maxCounts: {},
      names: [],
    };
    item.total += Number(row.amount || 0);
    item.owners.add(row.email);
    item.maxCounts[row.maxYearlings || "no_preference"] = (item.maxCounts[row.maxYearlings || "no_preference"] || 0) + 1;
    item.names.push(row.name);
    groups.set(key, item);
  });
  return [...groups.values()].map((item) => ({
    ...item,
    ownerCount: item.owners.size,
    average: item.total / Math.max(1, item.owners.size),
    maxPreference: Object.entries(item.maxCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "no_preference",
  })).sort((a, b) => b.total - a.total);
}

function flattenResponses(responses) {
  return responses.flatMap((response) => response.selectedSales.flatMap((saleId) => {
    const saleResponse = response.saleResponses[saleId] || {};
    if (usesDetailedBuckets(saleResponse)) {
      return selectedBucketRows(saleResponse).map((bucketRow) => ({
        name: response.name,
        email: response.email,
        sale: saleId,
        saleLabel: saleById(saleId)?.label || saleId,
        eligibility: response.eligibilityPreferences || [],
        amount: bucketRow.amount,
        bucketTypes: [bucketRow.bucketType],
        maxYearlings: bucketRow.maxYearlings,
        gait: bucketRow.gait,
        sex: bucketRow.sex,
        participation: saleResponse.participation,
        _rawResponse: saleResponse,
      }));
    }

    if (hasBucket(saleResponse) && saleResponse.bucketTypes?.length) {
      const amount = saleResponse.bucketLevel === "other" ? saleResponse.bucketAmount : saleResponse.bucketLevel;
      return activeGaits(saleResponse).flatMap((gait) => saleResponse.bucketTypes.map((bucketType) => ({
          name: response.name,
          email: response.email,
          sale: saleId,
          saleLabel: saleById(saleId)?.label || saleId,
          eligibility: response.eligibilityPreferences || [],
          amount: Number(amount || 0),
          bucketTypes: [bucketType],
          maxYearlings: saleResponse.maxYearlings,
          gait,
          sex: bucketSexValue(saleResponse, gait),
          participation: saleResponse.participation,
          specificHorseCount: saleResponse.specificHorseCount,
          specificShareSize: saleResponse.specificShareSize,
          _rawResponse: saleResponse,
        })));
    }

    const amount = saleResponse.bucketLevel === "other" ? saleResponse.bucketAmount : saleResponse.bucketLevel;
    return { name: response.name, email: response.email, sale: saleId, saleLabel: saleById(saleId)?.label || saleId, eligibility: response.eligibilityPreferences || [], amount: Number(amount || 0), ...saleResponse, _rawResponse: saleResponse };
  }));
}

function exportCsv(rows) {
  if (!rows.length) {
    alert("There is no owner data to export yet.");
    return;
  }
  // Any question Anthony added in the Questions admin tab beyond the
  // fixed set below gets its own trailing CSV column, keyed by its
  // current label, so admin-added questions aren't silently dropped
  // from the export.
  const customBlocks = currentQuestionSet().blocks.filter(
    (block) => block.type !== "bucket_config" && !KNOWN_SUMMARY_BLOCK_IDS.has(block.id)
  );
  const header = ["name", "email", "sale", "participation", "bucket_percent", "bucket_types", "max_yearlings", "gait", "sex", "eligibility", ...customBlocks.map((b) => b.label)];
  const csv = [header.join(","), ...rows.map((row) => [
    row.name,
    row.email,
    row.saleLabel,
    labelFor("participation", row.participation),
    row.amount,
    row.bucketTypes.map((item) => labelFor("bucketTypes", item)).join("; "),
    labelFor("maxYearlings", row.maxYearlings),
    labelFor("gait", row.gait),
    sexSummary(row),
    row.eligibility.map((item) => labelFor("eligibility", item)).join("; "),
    ...customBlocks.map((block) => {
      const value = row._rawResponse?.[block.id];
      if (value === undefined || value === null || value === "") return "";
      return Array.isArray(value) ? value.map((item) => labelFor(block.id, item) || item).join("; ") : (labelFor(block.id, value) || value);
    }),
  ].map((value) => `"${String(value || "").replaceAll('"', '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "thestable-yearling-responses.csv";
  link.click();
  URL.revokeObjectURL(url);
}

// Fallback labels for fields that aren't part of the block-based question
// set (sales/eligibility choices are asked earlier in the flow, outside
// currentQuestionSet()). Block-backed fields (participation, gait, sex,
// bucketTypes, maxYearlings, specificHorseCount, specificShareSize, ...)
// resolve their option labels from the live question set below instead,
// so a label Anthony edits in the Questions admin tab is reflected here
// and in CSV exports without needing a matching code change.
const FALLBACK_LABELS = {
  eligibility: { ohio: "Ohio eligible", kentucky: "Kentucky eligible", new_jersey: "New Jersey eligible", pennsylvania: "Pennsylvania eligible", ontario: "Ontario eligible", new_york: "New York eligible", indiana: "Indiana eligible", no_preference: "No strong preference" },
  bucketTypes: { premium: "Premium", value: "Value Buy", balanced: "Balanced" },
};

// bucket_config is the single source of truth for bucket names — see
// bucketConfigOptionRows(). bucketTypes must resolve labels from there
// first (not from its own block.options), or a bucket renamed/removed
// in the Questions admin tab would still show its old name everywhere
// this label is used (review screen, CSV export, dashboard charts).
function labelFor(field, value) {
  if (field === "bucketTypes") {
    const bucketConfig = currentQuestionSet().blocks.find((b) => b.type === "bucket_config");
    const bucket = bucketConfig?.buckets.find((b) => b.key === value);
    if (bucket) return bucket.name;
    return FALLBACK_LABELS.bucketTypes[value] || "";
  }
  const block = currentQuestionSet().blocks.find((b) => b.id === field);
  const optionLabel = block?.options?.find((o) => o.value === value)?.label;
  if (optionLabel) return optionLabel;
  return FALLBACK_LABELS[field]?.[value] || "";
}

function escapeHtml(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

render();
