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

const CHART_COLORS = ["#003b86", "#d71920", "#4f7aa3", "#6f879d", "#7a2f34", "#8aa4c2"];

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
let draft = loadDraft();

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

function defaultQuestions(prefs = draft.defaultPrefs) {
  const questions = ["participation"];
  if (!prefs.participation) return questions;

  questions.push("gait");
  if (!prefs.gait) return questions;

  if (prefs.gait === "both") questions.push("sexTrotter", "sexPacer");
  else questions.push("sex");

  const sexReady = prefs.gait === "both" ? prefs.sexTrotter && prefs.sexPacer : prefs.sex;
  if (!sexReady) return questions;

  if (hasBucket(prefs)) {
    questions.push("bucketDetailMode");
    if (!prefs.bucketDetailMode) return questions;
    if (usesDetailedBuckets(prefs)) questions.push("bucketMatrix");
    else questions.push("bucketTypes", "maxYearlings", "bucketLevel");
  }
  if (hasSpecific(prefs)) questions.push("specificHorseCount", "specificShareSize");
  questions.push("applyMode");
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
    "2026 Yearling Sale Planning",
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
  if (draft.defaultIndex >= questions.length) draft.defaultIndex = questions.length - 1;
  return preferenceQuestionCard("Default preferences", questions[draft.defaultIndex], prefs, defaultActions, "Defaults");
}

function preferenceQuestionCard(meta, question, prefs, actionsFn, tag) {
  const screens = {
    participation: () => card(meta, "What type of yearling opportunity are you most interested in?", `${radioOptions("participation", prefs.participation, [
      ["bucket", "Pre-sale bucket", "Buckets are planned first, then yearlings are purchased to match the budget."],
      ["specific", "After-sale individual shares", "Contact me if individual shares remain available after buckets are filled."],
      ["both", "Both pre-sale bucket and after-sale individual shares", ""],
    ], prefs)}${actionsFn(Boolean(prefs.participation))}`, tag),
    gait: () => card(meta, "Which gait should TheStable consider for you?", `${radioOptions("gait", prefs.gait, [
      ["trotter", "Trotters", ""],
      ["pacer", "Pacers", ""],
      ["both", "Both trotters and pacers", ""],
    ], prefs)}${actionsFn(Boolean(prefs.gait))}`, tag),
    sex: () => card(meta, "Which colt / filly preference should TheStable consider for you?", `${radioOptions("sex", prefs.sex, [
      ["colt", "Colts", ""],
      ["filly", "Fillies", ""],
      ["both", "Both colts and fillies", ""],
    ], prefs)}${actionsFn(Boolean(prefs.sex))}`, tag),
    sexTrotter: () => card(meta, "For trotters, which colt / filly preference should TheStable consider for you?", `${radioOptions("sexTrotter", prefs.sexTrotter, [
      ["colt", "Colts", ""],
      ["filly", "Fillies", ""],
      ["both", "Both colts and fillies", ""],
    ], prefs)}${actionsFn(Boolean(prefs.sexTrotter))}`, tag),
    sexPacer: () => card(meta, "For pacers, which colt / filly preference should TheStable consider for you?", `${radioOptions("sexPacer", prefs.sexPacer, [
      ["colt", "Colts", ""],
      ["filly", "Fillies", ""],
      ["both", "Both colts and fillies", ""],
    ], prefs)}${actionsFn(Boolean(prefs.sexPacer))}`, tag),
    bucketDetailMode: () => card(meta, "Should your bucket preferences be the same for every gait and bucket type?", `${radioOptions("bucketDetailMode", prefs.bucketDetailMode, [
      ["simple", "Yes, keep one bucket preference for everything", "Fastest option."],
      ["detailed", "No, set preferences by gait and bucket type", "Use this if premium trotters and value pacers should be handled differently."],
    ], prefs)}${actionsFn(Boolean(prefs.bucketDetailMode))}`, "Bucket"),
    bucketMatrix: () => card(meta, "Which bucket ideas fit your interest?", `<p class="prompt">Select the bucket ideas that fit you, then set your intended share percentage. Maximum yearlings is optional guidance.</p>${bucketMatrixHtml(prefs)}${actionsFn(bucketMatrixReady(prefs))}`, "Bucket"),
    bucketTypes: () => card(meta, "Which bucket types would you consider?", `<p class="prompt">Select all that apply.</p>${checkOptions("bucketTypes", prefs.bucketTypes, BUCKET_TYPES, prefs)}${actionsFn(Boolean(prefs.bucketTypes.length))}`, "Bucket"),
    maxYearlings: () => card(meta, "Do you have a maximum number of yearlings you prefer in a bucket?", `${choiceOptions("maxYearlings", prefs.maxYearlings, [
      ["no_preference", "No preference", "TheStable can decide", ""],
      ["1", "One yearling only", "1", ""],
      ["2", "Up to 2 yearlings", "2", ""],
      ["3", "Up to 3 yearlings", "3", ""],
      ["4", "Up to 4 yearlings", "4", ""],
      ["5plus", "5 or more is OK", "5+", ""],
    ], prefs)}${actionsFn(Boolean(prefs.maxYearlings))}`, "Bucket"),
    bucketLevel: () => card(meta, "What share percentage would you consider in each selected bucket?", `<p class="prompt">Choose the percentage you would like to reserve in a bucket. Dollar indications can be added later once estimates are confirmed.</p>${choiceOptions("bucketLevel", prefs.bucketLevel, BUCKET_LEVELS, prefs)}${prefs.bucketLevel === "other" ? `<div class="field-stack"><input class="input" id="bucketAmount" inputmode="decimal" value="${escapeHtml(prefs.bucketAmount)}" placeholder="Custom percentage, e.g. 12.5"></div>` : ""}${actionsFn(Boolean(prefs.bucketLevel && (prefs.bucketLevel !== "other" || prefs.bucketAmount)))}`, "Bucket"),
    specificHorseCount: () => card(meta, "How many individual horses would you usually consider buying shares in after a sale?", `${radioOptions("specificHorseCount", prefs.specificHorseCount, [
      ["one", "One horse only", ""],
      ["two", "Up to 2 horses", ""],
      ["three_plus", "3 or more horses is OK", ""],
    ], prefs)}${actionsFn(Boolean(prefs.specificHorseCount))}`, "After-sale shares"),
    specificShareSize: () => card(meta, "For individual horse shares after a sale, what share size would you usually consider?", `${choiceOptions("specificShareSize", prefs.specificShareSize, [
      ["1", "Around 1%", "Small share", ""],
      ["2_5", "2% to 5%", "Medium share", ""],
      ["5_10", "5% to 10%", "Larger share", ""],
      ["10plus", "10% or more", "Major share", ""],
      ["depends", "Depends on the horse", "Flexible", ""],
    ], prefs)}${actionsFn(Boolean(prefs.specificShareSize))}`, "After-sale shares"),
    applyMode: () => card(meta, "Should these preferences apply to all selected sales?", `${radioOptions("applyMode", draft.applyMode, applyModeOptions(prefs))}${actionsFn(Boolean(draft.applyMode))}`, "Apply")
  };
  return screens[question]();
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
  if (draft.questionIndex >= questions.length) draft.questionIndex = questions.length - 1;
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
  return card("Complete", "Thank you!", `<p class="prompt">Your preferences have been submitted successfully.</p><div class="actions single"><button class="btn primary" type="button" data-start-over>Close</button></div>`, "Complete");
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
  return `<div class="bucket-matrix">${activeGaits(prefs).map((gait) => `
    <section class="matrix-group">
      <h3>${labelFor("gait", gait)}${bucketSexLabel(prefs, gait) ? ` - ${bucketSexLabel(prefs, gait)}` : ""}</h3>
      <div class="matrix-rows">
        ${BUCKET_TYPES.map(([bucketType, label, help]) => {
          const row = prefs.bucketMatrix[gait][bucketType];
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
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function identifyOwner() {
  const name = document.querySelector("#nameInput").value.trim();
  const email = document.querySelector("#emailInput").value.trim().toLowerCase();
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
  draft.name = name;
  draft.email = email;
  draft.owner = owner || null;
  draft.unmatched = !owner;
  draft.identifyError = "";
  if (existing) draft = { ...clone(emptyDraft), ...existing, view: "interest", name, email, owner: owner || null, unmatched: !owner, resumedExisting: true };
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
  return parts.filter(Boolean).join(" | ");
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

function renderAdmin() {
  if (!adminLoggedIn) {
    app.innerHTML = `<article class="card login-card"><div class="card-body"><span class="tag">Admin</span><h2>Bucket Planning Login</h2><div class="field-stack"><input class="input" id="passcode" type="password" placeholder="Passcode"></div><p class="notice hidden" id="loginError">Incorrect passcode.</p><div class="actions single"><button class="btn primary" type="button" id="loginButton">Login</button></div></div></article>`;
    document.querySelector("#loginButton").addEventListener("click", async () => {
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
  const responses = getResponses();
  const rows = flattenResponses(responses);
  const bucketRows = rows.filter((row) => hasBucket(row) && row.amount);
  const afterSaleRows = buildAfterSaleRows(responses);
  const ownerCount = new Set(responses.map((item) => item.email)).size;
  const bucketOwnerCount = new Set(bucketRows.map((row) => row.email)).size;
  const afterSaleOwnerCount = new Set(afterSaleRows.map((row) => row.email)).size;
  const totalPercent = bucketRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const saleDemand = groupDemand(bucketRows, (row) => row.saleLabel);
  const bucketDemand = groupDemand(bucketRows, (row) => labelFor("bucketTypes", row.bucketTypes[0]));
  const gaitDemand = groupDemand(bucketRows, (row) => labelFor("gait", row.gait));
  const sexDemand = groupDemand(bucketRows, (row) => labelFor("sex", row.sex));
  const gaitSexDemand = groupDemand(bucketRows, (row) => `${labelFor("gait", row.gait)} / ${labelFor("sex", row.sex)}`);
  const shareSizeDemand = groupDemand(bucketRows, bucketShareBand);
  const eligibilityDemand = groupMultiDemand(bucketRows, (row) => row.eligibility.map((item) => labelFor("eligibility", item)));
  const afterSaleEligibility = groupMultiDemand(afterSaleRows, (row) => row.eligibility.map((item) => labelFor("eligibility", item)));
  const suggestions = buildBucketSuggestions(bucketRows);
  const summaryItems = [
    summaryItem("Most popular sale", saleDemand[0]),
    summaryItem("Top requested jurisdiction", eligibilityDemand[0]),
    summaryItem("Most requested gait", gaitDemand[0]),
    summaryItem("Most common share size", shareSizeDemand[0]),
  ];

  app.innerHTML = `
    <section class="admin-dashboard">
        <div class="admin-titlebar">
          <div>
            <span class="eyebrow">2026 Yearling Sale Planning</span>
            <h1>Bucket Builder Dashboard</h1>
            <p>See where owner demand is strongest before deciding which yearling buckets to offer.</p>
          </div>
          <div class="admin-actions"><button class="btn primary" type="button" id="exportCsv">Export CSV</button></div>
        </div>

        <section class="admin-grid">
          ${kpiCard("Responses", ownerCount, "Unique owners who submitted the intake.", "unique owners")}
          ${kpiCard("Pre-sale bucket buyers", bucketOwnerCount, "Owners who selected pre-sale buckets or both.", "owners")}
          ${kpiCard("Requested bucket shares", percent(totalPercent), "Total of requested bucket percentages across selected bucket ideas. This is demand input, not final bucket capacity.", "total requested")}
          ${kpiCard("After-sale buyers", afterSaleOwnerCount, "Owners who want to look at individual shares after the sales.", "owners")}
        </section>

        <section class="summary-strip">
          ${summaryItems.join("")}
        </section>

        <section class="admin-section">
          <div class="section-title"><div><span class="tag">Recommendation</span><h2>Suggested Buckets to Offer</h2></div><p>Algorithmic suggestions based on sale, bucket type, gait, colt/filly, jurisdiction, share demand and number of buyers.</p></div>
          ${suggestionPanel(suggestions)}
        </section>

        <section class="dashboard-grid">
          ${barPanel("Popular Sales", saleDemand, "Requested bucket shares by sale.")}
          ${barPanel("Requested Jurisdictions", eligibilityDemand, "State or province eligibility owners prefer, such as Kentucky, Ohio or Ontario.")}
          ${barPanel("Trotter vs Pacer", gaitDemand, "Requested bucket shares by gait.")}
          ${barPanel("Colt / Filly", sexDemand, "Requested bucket shares by colt/filly preference.")}
          ${barPanel("Gait + Colt/Filly", gaitSexDemand, "Demand for combinations such as Pacer/Filly or Trotter/Colt.")}
          ${barPanel("Share Size", shareSizeDemand, "Shows whether demand comes from many small buyers or fewer larger buyers.")}
        </section>

        <section class="diagram-grid compact">
          ${donutPanel("Bucket Type Mix", bucketDemand)}
          ${donutPanel("Sale Mix", saleDemand)}
          ${donutPanel("Jurisdiction Mix", eligibilityDemand)}
        </section>

        ${afterSalePanel(afterSaleRows, afterSaleEligibility)}
        ${ownerTable(rows)}
    </section>`;
  document.querySelector("#exportCsv").addEventListener("click", () => exportCsv(rows));
  bindOwnerTableFilters(rows);
  bindInfoTips();
}

function kpiCard(label, value, help, note) {
  return `<div class="kpi"><small>${label}${infoTip(help)}</small><strong>${value}</strong><span>${note}</span></div>`;
}

function infoTip(text) {
  return `<button class="info-tip" type="button" title="${escapeHtml(text)}" aria-label="${escapeHtml(text)}" data-tip="${escapeHtml(text)}">i</button>`;
}

function bindInfoTips() {
  document.querySelectorAll(".info-tip").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const wasActive = button.classList.contains("active");
      document.querySelectorAll(".info-tip.active").forEach((item) => item.classList.remove("active"));
      if (!wasActive) {
        button.classList.add("active");
        setTimeout(() => {
          document.addEventListener("click", closeInfoTips, { once: true });
        }, 0);
      }
    });
  });
}

function closeInfoTips() {
  document.querySelectorAll(".info-tip.active").forEach((item) => item.classList.remove("active"));
}

function summaryItem(label, item) {
  return `<article class="summary-card"><small>${label}</small><strong>${item ? escapeHtml(item.label) : "No data"}</strong><span>${item ? `${percent(item.total)} requested | ${item.ownerCount} owner${item.ownerCount === 1 ? "" : "s"}` : "Submit responses or load demo data"}</span></article>`;
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

function buildBucketSuggestions(rows) {
  return buildPlanningRows(rows).map((row) => {
    const relatedRows = rows.filter((item) => item.sale === row.sale && item.bucketTypes[0] === row.bucketType && item.gait === row.gait && item.sex === row.sex);
    const eligibility = groupMultiDemand(relatedRows, (item) => item.eligibility.map((id) => labelFor("eligibility", id))).slice(0, 3);
    const shareSizes = groupDemand(relatedRows, bucketShareBand).slice(0, 2);
    const score = row.total + row.ownerCount * 8;
    const status = row.total >= 80 || (row.total >= 45 && row.ownerCount >= 3) ? "Offer" : row.total >= 30 || row.ownerCount >= 2 ? "Shortlist" : "Watch";
    const fillSignal = row.total >= 100 ? `${(row.total / 100).toFixed(1)}x a 100% bucket` : `${percent(row.total)} of a 100% bucket`;
    return { ...row, eligibility, shareSizes, score, status, fillSignal };
  }).sort((a, b) => b.score - a.score);
}

function suggestionPanel(rows) {
  return `<article class="panel suggestion-panel">
    <div class="suggestion-list">
      ${rows.length ? rows.map((row) => `<div class="suggestion-row">
        <div>
          <span class="status-pill ${row.status.toLowerCase()}">${row.status}</span>
          <strong>${escapeHtml(row.saleLabel)} | ${labelFor("bucketTypes", row.bucketType)} | ${labelFor("gait", row.gait)} | ${labelFor("sex", row.sex)}</strong>
          <small>${row.eligibility.length ? row.eligibility.map((item) => item.label).join(", ") : "No jurisdiction preference captured"}</small>
        </div>
        <div><strong>${percent(row.total)}</strong><span>requested share</span></div>
        <div><strong>${row.ownerCount}</strong><span>owners</span></div>
        <div><strong>${percent(row.average)}</strong><span>avg share</span></div>
        <div><strong>${row.fillSignal}</strong><span>vs 100% bucket ${infoTip("This compares current demand with one theoretical full bucket for this exact sale/type/gait/colt-filly idea. It is only a planning signal, not a final bucket count.")}</span></div>
        <div><strong>${row.shareSizes.map((item) => item.label).join(", ") || "No data"}</strong><span>buyer size mix</span></div>
      </div>`).join("") : `<p class="quiet">No bucket suggestions yet.</p>`}
    </div>
  </article>`;
}

const ownerTableFilters = { search: "", sale: "" };

function ownerTable(rows) {
  return `<article class="panel owner-panel">
    <div class="section-title"><div><span class="tag">Owners</span><h2>Owner Detail</h2></div><p>Use this to see who sits behind a specific signal.</p></div>
    <div class="owner-table-filters">
      <input class="input" id="ownerSearch" type="search" placeholder="Search by name or email" value="${escapeHtml(ownerTableFilters.search)}">
      <select class="input" id="ownerSaleFilter">
        <option value="">All sales</option>
        ${REAL_SALES.map((sale) => `<option value="${sale.id}" ${ownerTableFilters.sale === sale.id ? "selected" : ""}>${escapeHtml(sale.label)}</option>`).join("")}
      </select>
    </div>
    <div id="ownerTableBody">${ownerTableRows(rows)}</div>
  </article>`;
}

function ownerTableRows(rows) {
  const search = ownerTableFilters.search.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (ownerTableFilters.sale && row.sale !== ownerTableFilters.sale) return false;
    if (search && !row.name.toLowerCase().includes(search) && !row.email.toLowerCase().includes(search)) return false;
    return true;
  });
  return `<div class="table-wrap compact-table"><table><thead><tr><th>Owner</th><th>Sale</th><th>Bucket %</th><th>Type</th><th>Gait</th><th>Colt / Filly</th></tr></thead><tbody>
      ${filtered.length ? filtered.map((row) => `<tr><td>${escapeHtml(row.name)}<br><small>${escapeHtml(row.email)}</small></td><td>${escapeHtml(row.saleLabel)}</td><td>${row.amount ? percent(row.amount) : ""}</td><td>${row.bucketTypes.map((item) => labelFor("bucketTypes", item)).join(", ")}</td><td>${labelFor("gait", row.gait)}</td><td>${sexSummary(row)}</td></tr>`).join("") : `<tr><td colspan="6">${rows.length ? "No owners match your search." : "No owner data yet."}</td></tr>`}
    </tbody></table></div>`;
}

function bindOwnerTableFilters(rows) {
  const searchInput = document.querySelector("#ownerSearch");
  const saleSelect = document.querySelector("#ownerSaleFilter");
  if (!searchInput || !saleSelect) return;
  const rerender = () => {
    document.querySelector("#ownerTableBody").innerHTML = ownerTableRows(rows);
  };
  searchInput.addEventListener("input", () => {
    ownerTableFilters.search = searchInput.value;
    rerender();
  });
  saleSelect.addEventListener("change", () => {
    ownerTableFilters.sale = saleSelect.value;
    rerender();
  });
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

function barPanel(title, items, note) {
  const max = Math.max(1, ...items.map((item) => item.total));
  return `<article class="panel"><div class="panel-head"><div><h3>${title}${infoTip(note)}</h3></div></div>
    <div class="bar-list">
      ${items.length ? items.map((item) => `<div class="bar-row"><div class="bar-meta"><strong>${escapeHtml(item.label)}</strong><span>${percent(item.total)} | ${item.ownerCount} owner${item.ownerCount === 1 ? "" : "s"}</span></div><div class="bar-track"><span style="width:${Math.max(4, (item.total / max) * 100)}%"></span></div></div>`).join("") : `<p class="quiet">No bucket data yet.</p>`}
    </div>
  </article>`;
}

function donutPanel(title, items) {
  const total = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const gradient = total ? donutGradient(items, total) : "#e4e9f1";
  const top = items[0];
  const note = top ? `${top.label} has the largest share of current responses.` : "No data yet.";
  return `<article class="panel diagram-panel">
    <div class="panel-head"><div><h3>${title}${infoTip(note)}</h3></div></div>
    <div class="donut-wrap">
      <div class="donut" style="background:${gradient}"><div><strong>${top ? percent(top.total) : "0%"}</strong><span>${top ? escapeHtml(top.label) : "No data"}</span></div></div>
      <div class="legend-list">
        ${items.length ? items.slice(0, 6).map((item, index) => `<div class="legend-row"><span class="legend-swatch" style="background:${CHART_COLORS[index % CHART_COLORS.length]}"></span><strong>${escapeHtml(item.label)}</strong><em>${percent(item.total)}</em></div>`).join("") : `<p class="quiet">No data yet.</p>`}
      </div>
    </div>
  </article>`;
}

function donutGradient(items, total) {
  let start = 0;
  const parts = items.map((item, index) => {
    const size = (Number(item.total || 0) / total) * 100;
    const end = start + size;
    const color = CHART_COLORS[index % CHART_COLORS.length];
    const part = `${color} ${start}% ${end}%`;
    start = end;
    return part;
  });
  return `conic-gradient(${parts.join(", ")})`;
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

function afterSalePanel(rows, eligibilityDemand) {
  const horseCounts = groupDemand(rows, (row) => labelFor("specificHorseCount", row.specificHorseCount));
  const shareSizes = groupDemand(rows, (row) => labelFor("specificShareSize", row.specificShareSize));
  return `<article class="panel after-sale-panel"><div class="panel-head"><div><h3>After-Sale Individual Shares${infoTip("Useful after the sales, when remaining shares can be matched to owners who did not join a bucket or want extra horses.")}</h3></div></div>
    <div class="after-sale-grid">
      <div class="mini-section"><strong>How many horses to show${infoTip("How many individual horses these owners would normally consider after a sale.")}</strong>${miniList(horseCounts, "count")}</div>
      <div class="mini-section"><strong>Typical share size${infoTip("The share size owners expect when buying individual horses after the sale.")}</strong>${miniList(shareSizes, "count")}</div>
      <div class="mini-section"><strong>Preferred jurisdictions${infoTip("State or province eligibility preferences from owners interested in individual shares after the sales.")}</strong>${miniList(eligibilityDemand, "count")}</div>
    </div>
  </article>`;
}

function miniList(items, metric) {
  return `<div class="chip-list">${items.length ? items.slice(0, 5).map((item) => `<span class="data-chip">${escapeHtml(item.label)} <b>${metric === "total" ? percent(item.total) : item.count}</b></span>`).join("") : `<span class="data-chip">No data</span>`}</div>`;
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
        })));
    }

    const amount = saleResponse.bucketLevel === "other" ? saleResponse.bucketAmount : saleResponse.bucketLevel;
    return { name: response.name, email: response.email, sale: saleId, saleLabel: saleById(saleId)?.label || saleId, eligibility: response.eligibilityPreferences || [], amount: Number(amount || 0), ...saleResponse };
  }));
}

function exportCsv(rows) {
  if (!rows.length) {
    alert("There is no owner data to export yet.");
    return;
  }
  const header = ["name", "email", "sale", "participation", "bucket_percent", "bucket_types", "max_yearlings", "gait", "sex", "eligibility"];
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
  ].map((value) => `"${String(value || "").replaceAll('"', '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "thestable-yearling-responses.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function labelFor(field, value) {
  const labels = {
    participation: { bucket: "Pre-sale bucket", specific: "After-sale individual shares", both: "Both" },
    gait: { trotter: "Trotters", pacer: "Pacers", both: "Both" },
    sex: { colt: "Colts", filly: "Fillies", both: "Both" },
    eligibility: { ohio: "Ohio eligible", kentucky: "Kentucky eligible", new_jersey: "New Jersey eligible", pennsylvania: "Pennsylvania eligible", ontario: "Ontario eligible", new_york: "New York eligible", indiana: "Indiana eligible", no_preference: "No strong preference" },
    bucketTypes: { premium: "Premium", value: "Value Buy", balanced: "Balanced" },
    maxYearlings: { no_preference: "No preference", "1": "1", "2": "2", "3": "3", "4": "4", "5plus": "5+" },
    specificHorseCount: { one: "One horse only", two: "Up to 2 horses", three_plus: "3+ horses is OK" },
    specificShareSize: { "1": "Around 1%", "2_5": "2% to 5%", "5_10": "5% to 10%", "10plus": "10%+", depends: "Depends" },
  };
  return labels[field]?.[value] || "";
}

function escapeHtml(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

render();
