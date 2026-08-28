const SALES = [
  { id: "ohio", label: "Ohio Selected Sale" },
  { id: "lexington", label: "Lexington Selected Sale" },
  { id: "harrisburg", label: "Harrisburg Sale" },
  { id: "london", label: "London Selected Yearling Sale" },
  { id: "unsure", label: "Not sure which sale yet" },
];

const REAL_SALES = SALES.filter((sale) => sale.id !== "unsure");

const OWNERS = [
  { id: "own_test", name: "Test Owner", email: "test@thestable.ca" },
  { id: "own_001", name: "Robert Sikkema", email: "robert@example.com" },
  { id: "own_002", name: "Brian L.", email: "brian@email.com" },
  { id: "own_003", name: "Mark D.", email: "markd@email.com" },
  { id: "own_004", name: "Jennifer S.", email: "jennifer@email.com" },
  { id: "own_005", name: "Anthony Demo", email: "anthony@example.com" },
];

const STORAGE_KEY = "thestable_yearling_responses_v3";
const DRAFT_KEY = "thestable_yearling_draft_v4_prototype_v2";
const BUILD_ID = "prototype_v2_state_machine";

const app = document.querySelector("#app");
const adminLink = document.querySelector("#adminLink");
const ownerLink = document.querySelector("#ownerLink");
const resetLink = document.querySelector("#resetLink");

const emptyDraft = {
  view: "welcome",
  owner: null,
  unmatched: false,
  name: "",
  email: "",
  interest: "",
  selectedSales: [],
  eligibilityPreferences: [],
  openToAnySale: false,
  unsureSale: false,
  saleIndex: 0,
  questionIndex: 0,
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

resetLink.addEventListener("click", () => {
  resetAll();
  render();
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadDraft() {
  const saved = localStorage.getItem(DRAFT_KEY);
  return saved ? { ...clone(emptyDraft), ...JSON.parse(saved) } : clone(emptyDraft);
}

function saveDraft() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function resetDraft() {
  draft = clone(emptyDraft);
  localStorage.removeItem(DRAFT_KEY);
}

function resetAll() {
  resetDraft();
  localStorage.removeItem(STORAGE_KEY);
}

function getResponses() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
}

function saveResponses(responses) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(responses));
}

function money(value) {
  return `CAD $${Number(value || 0).toLocaleString("en-CA")}`;
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

function currentSalePhrase() {
  return currentSaleId() === "unsure" ? "if a suitable sale comes up" : `at the ${currentSaleLabel()}`;
}

function currentSaleResponse() {
  const saleId = currentSaleId();
  if (!draft.saleResponses[saleId]) {
    draft.saleResponses[saleId] = {
      participation: "",
      gait: "",
      sex: "",
      sexTrotter: "",
      sexPacer: "",
      eligibility: [],
      bucketType: "",
      maxYearlings: "",
      bucketLevel: "",
      bucketAmount: "",
      bucketUse: "",
      specificContact: "",
      specificHorseCount: "",
      specificShareSize: "",
      note: "",
    };
  }
  return draft.saleResponses[saleId];
}

function saleQuestions(response = currentSaleResponse()) {
  const questions = ["participation"];
  if (!response.participation) return questions;

  questions.push("gait");
  if (!response.gait) return questions;

  if (response.gait === "both") questions.push("sexTrotter", "sexPacer");
  else questions.push("sex");

  const hasSexAnswer = response.gait === "both"
    ? response.sexTrotter && response.sexPacer
    : response.sex;
  if (!hasSexAnswer) return questions;

  const hasBucket = response.participation === "bucket" || response.participation === "both";
  const hasSpecific = response.participation === "specific" || response.participation === "both";

  if (hasBucket) questions.push("bucketType", "maxYearlings", "bucketLevel", "bucketUse");
  if (hasSpecific) questions.push("specificContact", "specificHorseCount", "specificShareSize");
  questions.push("note");
  return questions;
}

function progressPercent() {
  if (draft.view === "welcome") return 5;
  if (draft.view === "identify") return 10;
  if (draft.view === "interest") return 16;
  if (draft.view === "sales") return 24;
  if (draft.view === "review") return 96;
  if (draft.view === "done") return 100;
  const salesCount = Math.max(1, draft.selectedSales.length);
  const current = draft.saleIndex * 10 + draft.questionIndex + 1;
  return Math.min(94, 24 + Math.round((current / (salesCount * 10)) * 68));
}

function render() {
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
  app.innerHTML = `${hero("2026 Yearling Sale Planning", "Help Anthony plan this year's yearling purchases and ownership opportunities.")}${ownerLayout()}`;
  bindOwner();
}

function ownerLayout() {
  return `
    <section class="single-flow">
      ${screenForView()}
      <div class="debug-state">Build: ${BUILD_ID} | View: ${draft.view} | Sale: ${currentSaleId() || "-"} | Question: ${draft.questionIndex}</div>
    </section>
  `;
}

function screenForView() {
  if (draft.view === "welcome") return welcomeCard();
  if (draft.view === "identify") return identifyCard();
  if (draft.view === "interest") return interestCard();
  if (draft.view === "sales") return salesCard();
  if (draft.view === "eligibility") return eligibilityCard();
  if (draft.view === "sale") return saleCard();
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
        ${draft.view === "sale" ? `<div class="notice">Sale selected: ${currentSaleLabel()}</div>` : ""}
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
    `<div class="field-stack">
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
    `${radioOptions("interest", draft.interest, [
      ["yes", "Yes, I am interested in yearlings", ""],
      ["maybe", "Maybe, keep me informed", ""],
      ["no", "No, not at all", "I am only interested in racehorses / current horses."],
    ])}
    <div class="actions"><button class="btn" type="button" data-go="identify">Back</button><button class="btn primary" type="button" data-interest-next ${!draft.interest ? "disabled" : ""}>Continue</button></div>`
  );
}

function salesCard() {
  return card(
    "Step 3",
    "Which yearling sales would you like Anthony to consider for you?",
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
    "Which state or jurisdiction programs are you interested in?",
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
    <div class="actions"><button class="btn" type="button" data-go="sales">Back</button><button class="btn primary" type="button" data-start-sales ${!draft.eligibilityPreferences.length ? "disabled" : ""}>Continue</button></div>`
  );
}

function saleCard() {
  const response = currentSaleResponse();
  const questions = saleQuestions(response);
  if (draft.questionIndex >= questions.length) draft.questionIndex = questions.length - 1;
  const question = questions[draft.questionIndex];
  const label = currentSaleLabel();
  const phrase = currentSalePhrase();

  const screens = {
    participation: () => card(
      `${label} - Question 1`,
      `What type of yearling opportunity are you most interested in ${phrase}?`,
      `${radioOptions("participation", response.participation, [
        ["bucket", "A bucket Anthony builds before buying", ""],
        ["specific", "Individual horse shares after the sale", "If shares remain available after Anthony has filled the buckets."],
        ["both", "Both pre-sale bucket and after-sale individual shares", ""],
      ])}${saleActions(Boolean(response.participation))}`,
      label
    ),
    gait: () => card(
      `${label} - Question 2`,
      `Which gait should Anthony consider for you ${phrase}?`,
      `${radioOptions("gait", response.gait, [
        ["trotter", "Trotters", ""],
        ["pacer", "Pacers", ""],
        ["both", "Both trotters and pacers", ""],
      ])}${saleActions(Boolean(response.gait))}`,
      label
    ),
    sex: () => card(
      `${label} - Question 3`,
      `Which sex should Anthony consider for you ${phrase}?`,
      `${radioOptions("sex", response.sex, [
        ["colt", "Colts", ""],
        ["filly", "Fillies", ""],
        ["both", "Both colts and fillies", ""],
      ])}${saleActions(Boolean(response.sex))}`,
      label
    ),
    sexTrotter: () => card(
      `${label} - Question 3`,
      `For trotters, which sex should Anthony consider for you ${phrase}?`,
      `${radioOptions("sexTrotter", response.sexTrotter, [
        ["colt", "Colts", ""],
        ["filly", "Fillies", ""],
        ["both", "Both colts and fillies", ""],
      ])}${saleActions(Boolean(response.sexTrotter))}`,
      label
    ),
    sexPacer: () => card(
      `${label} - Question 4`,
      `For pacers, which sex should Anthony consider for you ${phrase}?`,
      `${radioOptions("sexPacer", response.sexPacer, [
        ["colt", "Colts", ""],
        ["filly", "Fillies", ""],
        ["both", "Both colts and fillies", ""],
      ])}${saleActions(Boolean(response.sexPacer))}`,
      label
    ),
    bucketType: () => card(
      `${label} - Bucket`,
      "What type of bucket would you prefer Anthony to build for you?",
      `${radioOptions("bucketType", response.bucketType, [
        ["premium", "Premium yearling bucket", "Focus on one higher-quality yearling."],
        ["value", "Value buys / sale bargains bucket", "Look for value opportunities at the sale."],
        ["balanced", "Balanced bucket", "A mix of quality and value."],
      ])}${saleActions(Boolean(response.bucketType))}`,
      "Bucket"
    ),
    maxYearlings: () => card(
      `${label} - Bucket`,
      "How many yearlings are you comfortable being included in through this sale bucket?",
      `${choiceOptions("maxYearlings", response.maxYearlings, [
        ["1", "One yearling only", "1", ""],
        ["2", "Up to 2 yearlings", "2", ""],
        ["3", "Up to 3 yearlings", "3", ""],
        ["4", "Up to 4 yearlings", "4", ""],
        ["5plus", "5 or more is OK", "5+", ""],
      ])}${saleActions(Boolean(response.maxYearlings))}`,
      "Bucket"
    ),
    bucketLevel: () => card(
      `${label} - Bucket`,
      `What total bucket participation level should Anthony plan for you ${phrase}?`,
      `<p class="prompt">Examples below are based on a CAD $50,000 bucket.</p>
       ${choiceOptions("bucketLevel", response.bucketLevel, [
        ["500", "1% total bucket level", "CAD $500", "Based on CAD $50,000"],
        ["1000", "2% total bucket level", "CAD $1,000", "Based on CAD $50,000"],
        ["2500", "5% total bucket level", "CAD $2,500", "Based on CAD $50,000"],
        ["5000", "10% total bucket level", "CAD $5,000", "Based on CAD $50,000"],
        ["10000", "20% total bucket level", "CAD $10,000", "Based on CAD $50,000"],
        ["other", "Other amount", "Enter CAD", ""],
      ])}
      ${response.bucketLevel === "other" ? `<div class="field-stack"><input class="input" id="bucketAmount" inputmode="numeric" value="${escapeHtml(response.bucketAmount)}" placeholder="Custom CAD amount"></div>` : ""}
      ${saleActions(Boolean(response.bucketLevel && (response.bucketLevel !== "other" || response.bucketAmount)))}`,
      "Bucket"
    ),
    bucketUse: () => card(
      `${label} - Bucket`,
      "If Anthony creates multiple matching buckets at this sale, how should your amount be used?",
      `${radioOptions("bucketUse", response.bucketUse, [
        ["one_best", "Use my full amount in one best-fit bucket", ""],
        ["split", "Split my amount across matching buckets", ""],
        ["ask_before_split", "Ask me before splitting across buckets", ""],
        ["one_bucket_only", "Only include me in one bucket for this sale", ""],
      ])}${saleActions(Boolean(response.bucketUse))}`,
      "Bucket"
    ),
    specificContact: () => card(
      `${label} - After-sale shares`,
      "Would you like to be contacted if individual horse shares remain available after this sale?",
      `${radioOptions("specificContact", response.specificContact, [
        ["match_preferences", "Yes, if they match my preferences", ""],
        ["all_available", "Yes, send me all available remaining shares", ""],
        ["bucket_only", "No, pre-sale bucket opportunities only", ""],
      ])}${saleActions(Boolean(response.specificContact))}`,
      "After-sale shares"
    ),
    specificHorseCount: () => card(
      `${label} - After-sale shares`,
      "How many individual horses would you usually consider buying shares in after the sale?",
      `${radioOptions("specificHorseCount", response.specificHorseCount, [
        ["one", "One horse only", ""],
        ["two", "Up to 2 horses", ""],
        ["three_plus", "3 or more horses is OK", ""],
      ])}${saleActions(Boolean(response.specificHorseCount))}`,
      "After-sale shares"
    ),
    specificShareSize: () => card(
      `${label} - After-sale shares`,
      "For individual horse shares after the sale, what share size would you usually consider?",
      `${choiceOptions("specificShareSize", response.specificShareSize, [
        ["1", "Around 1%", "Small share", ""],
        ["2_5", "2% to 5%", "Medium share", ""],
        ["5_10", "5% to 10%", "Larger share", ""],
        ["10plus", "10% or more", "Major share", ""],
        ["depends", "Depends on the horse", "Flexible", ""],
      ])}${saleActions(Boolean(response.specificShareSize))}`,
      "After-sale shares"
    ),
    note: () => card(
      `${label} - Note`,
      "Anything else you would like Anthony to know about this sale?",
      `<div class="field-stack"><textarea class="input" id="noteInput" placeholder="Optional note">${escapeHtml(response.note || "")}</textarea></div>${saleActions(true)}`,
      "Optional"
    ),
  };

  return screens[question]();
}

function saleActions(canContinue) {
  return `<div class="actions"><button class="btn" type="button" data-sale-back>Back</button><button class="btn primary" type="button" data-sale-next ${!canContinue ? "disabled" : ""}>Continue</button></div>`;
}

function reviewCard() {
  const items = draft.selectedSales.map((saleId) => {
    const response = draft.saleResponses[saleId] || {};
    return `
      <div class="review-item">
        <strong>${saleById(saleId)?.label || saleId}</strong>
        <span>${summarizeSale(response)}</span>
      </div>
    `;
  }).join("");

  return card(
    "Final step",
    "Review Your 2026 Yearling Sale Plan",
    `<div class="review-list">${items || `<p class="prompt">No sales selected.</p>`}</div>
     <div class="actions"><button class="btn" type="button" data-review-back>Back</button><button class="btn red" type="button" data-submit>Confirm & Submit</button></div>`,
    "Review"
  );
}

function doneCard() {
  return card(
    "Complete",
    "Thank you!",
    `<p class="prompt">Your preferences have been submitted successfully.</p>
     <div class="actions single"><button class="btn primary" type="button" data-start-over>Close</button></div>`,
    "Complete"
  );
}

function summarizeSale(response) {
  const parts = [
    labelFor("participation", response.participation),
    labelFor("gait", response.gait),
    sexSummary(response),
    draft.eligibilityPreferences?.length ? draft.eligibilityPreferences.map((item) => labelFor("eligibility", item)).join(", ") : "",
  ];

  if (response.participation === "bucket" || response.participation === "both") {
    const amount = response.bucketLevel === "other" ? response.bucketAmount : response.bucketLevel;
    parts.push(labelFor("bucketType", response.bucketType), labelFor("maxYearlings", response.maxYearlings), amount ? money(amount) : "", labelFor("bucketUse", response.bucketUse));
  }

  if (response.participation === "specific" || response.participation === "both") {
    parts.push(labelFor("specificContact", response.specificContact), labelFor("specificHorseCount", response.specificHorseCount), labelFor("specificShareSize", response.specificShareSize));
  }

  return parts.filter(Boolean).join(" | ");
}

function sexSummary(response) {
  if (response.gait === "both") {
    return [
      response.sexTrotter ? `Trotters: ${labelFor("sex", response.sexTrotter)}` : "",
      response.sexPacer ? `Pacers: ${labelFor("sex", response.sexPacer)}` : "",
    ].filter(Boolean).join(", ");
  }
  return labelFor("sex", response.sex);
}

function radioOptions(field, value, options) {
  return `<div class="options">${options.map(([id, label, help]) => `
    <button class="option ${value === id ? "selected" : ""}" data-radio="${field}" data-value="${id}" type="button">
      <span class="mark radio"></span>
      <span><strong>${label}</strong>${help ? `<small>${help}</small>` : ""}</span>
    </button>
  `).join("")}</div>`;
}

function checkOptions(field, selected, options) {
  return `<div class="options">${options.map(([id, label, help]) => `
    <button class="option ${selected.includes(id) ? "selected" : ""}" data-check="${field}" data-value="${id}" type="button">
      <span class="mark check"></span>
      <span><strong>${label}</strong>${help ? `<small>${help}</small>` : ""}</span>
    </button>
  `).join("")}</div>`;
}

function choiceOptions(field, value, options) {
  return `<div class="choice-grid">${options.map(([id, label, amount, help]) => `
    <button class="choice ${value === id ? "selected" : ""}" data-choice="${field}" data-value="${id}" type="button">
      ${label}<span>${amount}</span>${help ? `<small>${help}</small>` : ""}
    </button>
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
  document.querySelector("[data-start-sales]")?.addEventListener("click", startSelectedSales);
  document.querySelector("[data-any-sale]")?.addEventListener("click", toggleAnySale);
  document.querySelector("[data-unsure-sale]")?.addEventListener("click", toggleUnsureSale);
  document.querySelector("[data-sale-next]")?.addEventListener("click", saleNext);
  document.querySelector("[data-sale-back]")?.addEventListener("click", saleBack);
  document.querySelector("[data-review-back]")?.addEventListener("click", reviewBack);
  document.querySelector("[data-submit]")?.addEventListener("click", submitResponse);
  document.querySelector("[data-start-over]")?.addEventListener("click", () => {
    resetDraft();
    render();
  });

  document.querySelectorAll("[data-radio]").forEach((button) => button.addEventListener("click", () => setRadio(button.dataset.radio, button.dataset.value)));
  document.querySelectorAll("[data-check]").forEach((button) => button.addEventListener("click", () => toggleCheck(button.dataset.check, button.dataset.value)));
  document.querySelectorAll("[data-choice]").forEach((button) => button.addEventListener("click", () => setRadio(button.dataset.choice, button.dataset.value)));
}

function identifyOwner() {
  const name = document.querySelector("#nameInput").value.trim();
  const email = document.querySelector("#emailInput").value.trim().toLowerCase();
  if (!name || !email) return;

  const owner = OWNERS.find((item) => item.email.toLowerCase() === email);
  const existing = getResponses().find((response) => response.email.toLowerCase() === email);

  draft.name = name;
  draft.email = email;
  draft.owner = owner || null;
  draft.unmatched = !owner;

  if (existing) {
    draft = {
      ...clone(emptyDraft),
      ...existing,
      view: "interest",
      owner: owner || null,
      name,
      email,
      unmatched: !owner,
      saleIndex: 0,
      questionIndex: 0,
    };
  } else {
    draft.view = "interest";
  }

  saveDraft();
  render();
}

function interestNext() {
  if (draft.interest === "no") {
    submitResponse();
    return;
  }
  draft.view = "sales";
  saveDraft();
  render();
}

function startSelectedSales() {
  draft.view = "sale";
  draft.saleIndex = 0;
  draft.questionIndex = 0;
  saveDraft();
  render();
}

function setRadio(field, value) {
  if (field === "interest") {
    draft.interest = value;
    if (value === "no") {
      draft.selectedSales = [];
      draft.saleResponses = {};
    }
  } else {
    const response = currentSaleResponse();
    response[field] = value;
    if (field === "participation") resetBranchAnswers(response);
    if (field === "gait") resetSexAnswers(response);
  }
  saveInputs();
  saveDraft();
  render();
}

function toggleCheck(field, value) {
  if (field === "sales") {
    toggleInArray(draft.selectedSales, value);
    if (draft.selectedSales.includes(value)) {
      draft.selectedSales = draft.selectedSales.filter((saleId) => saleId !== "unsure");
      draft.openToAnySale = false;
      draft.unsureSale = false;
    }
  } else if (field === "globalEligibility") {
    if (value === "no_preference") {
      draft.eligibilityPreferences = ["no_preference"];
    } else {
      draft.eligibilityPreferences = draft.eligibilityPreferences.filter((item) => item !== "no_preference");
      toggleInArray(draft.eligibilityPreferences, value);
    }
  } else {
    const response = currentSaleResponse();
    if (value === "no_preference") response.eligibility = ["no_preference"];
    else {
      response.eligibility = response.eligibility.filter((item) => item !== "no_preference");
      toggleInArray(response[field], value);
    }
  }
  saveDraft();
  render();
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

function resetBranchAnswers(response) {
  response.bucketType = "";
  response.maxYearlings = "";
  response.bucketLevel = "";
  response.bucketAmount = "";
  response.bucketUse = "";
  response.specificContact = "";
  response.specificHorseCount = "";
  response.specificShareSize = "";
}

function resetSexAnswers(response) {
  response.sex = "";
  response.sexTrotter = "";
  response.sexPacer = "";
}

function saveInputs() {
  const bucketAmount = document.querySelector("#bucketAmount");
  if (bucketAmount && currentSaleId()) currentSaleResponse().bucketAmount = bucketAmount.value.replace(/[^\d]/g, "");

  const noteInput = document.querySelector("#noteInput");
  if (noteInput && currentSaleId()) currentSaleResponse().note = noteInput.value.trim();
}

function saleNext() {
  saveInputs();
  const questions = saleQuestions();

  if (draft.questionIndex < questions.length - 1) {
    draft.questionIndex += 1;
  } else if (draft.saleIndex < draft.selectedSales.length - 1) {
    draft.saleIndex += 1;
    draft.questionIndex = 0;
  } else {
    draft.view = "review";
  }

  saveDraft();
  render();
}

function saleBack() {
  saveInputs();

  if (draft.questionIndex > 0) {
    draft.questionIndex -= 1;
  } else if (draft.saleIndex > 0) {
    draft.saleIndex -= 1;
    draft.questionIndex = Math.max(0, saleQuestions().length - 1);
  } else {
    draft.view = "sales";
  }

  saveDraft();
  render();
}

function reviewBack() {
  draft.view = "sale";
  draft.saleIndex = Math.max(0, draft.selectedSales.length - 1);
  draft.questionIndex = Math.max(0, saleQuestions().length - 1);
  saveDraft();
  render();
}

function submitResponse() {
  saveInputs();

  const response = {
    id: draft.owner?.id || `unmatched_${draft.email}`,
    ownerId: draft.owner?.id || null,
    name: draft.name || draft.owner?.name || "Unknown",
    email: draft.email,
    unmatched: draft.unmatched,
    interest: draft.interest,
    selectedSales: draft.selectedSales,
    eligibilityPreferences: draft.eligibilityPreferences,
    openToAnySale: draft.openToAnySale,
    unsureSale: draft.unsureSale,
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

function renderAdmin() {
  if (!adminLoggedIn) {
    app.innerHTML = `
      ${hero("Admin Dashboard")}
      <article class="card">
        <div class="card-body">
          <span class="tag">Login</span>
          <h2>Enter admin passcode</h2>
          <div class="field-stack"><input class="input" id="passcode" type="password" placeholder="Passcode"></div>
          <div class="actions single"><button class="btn primary" type="button" id="loginButton">Login</button></div>
          <p class="prompt">Prototype passcode: stable2026</p>
        </div>
      </article>
    `;
    document.querySelector("#loginButton").addEventListener("click", () => {
      if (document.querySelector("#passcode").value === "stable2026") {
        adminLoggedIn = true;
        render();
      }
    });
    return;
  }

  const responses = getResponses();
  const filters = getFiltersFromDom();
  const rows = flattenResponses(responses).filter((row) => matchesFilters(row, filters));
  const totalCapital = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const bucketRows = rows.filter((row) => row.participation === "bucket" || row.participation === "both");

  app.innerHTML = `
    ${hero("Admin Dashboard", "Filter owner interest by sale, bucket type, gait, sex, eligibility and amount.")}
    <section class="admin-grid">
      <div class="kpi"><small>Responses</small><strong>${responses.length}</strong></div>
      <div class="kpi"><small>Filtered rows</small><strong>${rows.length}</strong></div>
      <div class="kpi"><small>Indicative capital</small><strong>${money(totalCapital)}</strong></div>
      <div class="kpi"><small>Bucket rows</small><strong>${bucketRows.length}</strong></div>
    </section>
    <article class="card">
      <div class="card-body">
        <h2>Filters</h2>
        <div class="filters">
          ${select("filterSale", "Sale", filters.sale, [["", "All sales"], ...SALES.map((sale) => [sale.id, sale.label])])}
          ${select("filterParticipation", "Participation", filters.participation, [["", "All"], ["bucket", "Pre-sale bucket"], ["specific", "After-sale shares"], ["both", "Both"]])}
          ${select("filterGait", "Gait", filters.gait, [["", "All"], ["trotter", "Trotter"], ["pacer", "Pacer"], ["both", "Both"]])}
          ${select("filterSex", "Sex", filters.sex, [["", "All"], ["colt", "Colt"], ["filly", "Filly"], ["both", "Both"]])}
          <label><span class="prompt">Minimum amount</span><input class="input" id="filterMin" value="${escapeHtml(filters.min)}" inputmode="numeric"></label>
        </div>
        <div class="admin-actions">
          <button class="btn primary" type="button" id="applyFilters">Apply Filters</button>
          <button class="btn" type="button" id="seedDemo">Load Demo Data</button>
          <button class="btn" type="button" id="exportCsv">Export CSV</button>
          <button class="btn red" type="button" id="clearData">Clear Prototype Data</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Owner</th>
                <th>Email</th>
                <th>Sale</th>
                <th>Participation</th>
                <th>Amount</th>
                <th>Bucket type</th>
                <th>Max yearlings</th>
                <th>Gait</th>
                <th>Sex</th>
                <th>Eligibility</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr>
                  <td>${escapeHtml(row.name)}${row.unmatched ? " (unmatched)" : ""}</td>
                  <td>${escapeHtml(row.email)}</td>
                  <td>${escapeHtml(row.saleLabel)}</td>
                  <td>${labelFor("participation", row.participation)}</td>
                  <td>${row.amount ? money(row.amount) : ""}</td>
                  <td>${labelFor("bucketType", row.bucketType)}</td>
                  <td>${labelFor("maxYearlings", row.maxYearlings)}</td>
                  <td>${labelFor("gait", row.gait)}</td>
                  <td>${sexSummary(row)}</td>
                  <td>${row.eligibility.map((item) => labelFor("eligibility", item)).join(", ")}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </article>
  `;

  document.querySelector("#applyFilters").addEventListener("click", render);
  document.querySelector("#seedDemo").addEventListener("click", seedDemoData);
  document.querySelector("#exportCsv").addEventListener("click", () => exportCsv(rows));
  document.querySelector("#clearData").addEventListener("click", () => {
    if (confirm("Clear all prototype responses?")) {
      localStorage.removeItem(STORAGE_KEY);
      render();
    }
  });
}

function getFiltersFromDom() {
  return {
    sale: document.querySelector("#filterSale")?.value || "",
    participation: document.querySelector("#filterParticipation")?.value || "",
    gait: document.querySelector("#filterGait")?.value || "",
    sex: document.querySelector("#filterSex")?.value || "",
    min: document.querySelector("#filterMin")?.value.replace(/[^\d]/g, "") || "",
  };
}

function select(id, label, value, options) {
  return `
    <label>
      <span class="prompt">${label}</span>
      <select class="input" id="${id}">
        ${options.map(([optionValue, optionLabel]) => `<option value="${optionValue}" ${value === optionValue ? "selected" : ""}>${optionLabel}</option>`).join("")}
      </select>
    </label>
  `;
}

function flattenResponses(responses) {
  return responses.flatMap((response) => response.selectedSales.map((saleId) => {
    const saleResponse = response.saleResponses[saleId] || {};
    const amount = saleResponse.bucketLevel === "other" ? saleResponse.bucketAmount : saleResponse.bucketLevel;
    return {
      name: response.name,
      email: response.email,
      unmatched: response.unmatched,
      sale: saleId,
      saleLabel: saleById(saleId)?.label || saleId,
      amount: Number(amount || 0),
      ...saleResponse,
      eligibility: response.eligibilityPreferences || saleResponse.eligibility || [],
    };
  }));
}

function matchesFilters(row, filters) {
  if (filters.sale && row.sale !== filters.sale) return false;
  if (filters.participation && row.participation !== filters.participation) return false;
  if (filters.gait && row.gait !== filters.gait) return false;
  if (filters.sex) {
    const sexValues = [row.sex, row.sexTrotter, row.sexPacer].filter(Boolean);
    if (!sexValues.includes(filters.sex) && !sexValues.includes("both")) return false;
  }
  if (filters.min && Number(row.amount || 0) < Number(filters.min)) return false;
  return true;
}

function exportCsv(rows) {
  const header = ["name", "email", "sale", "participation", "amount_cad", "bucket_type", "max_yearlings", "gait", "sex", "eligibility"];
  const csv = [
    header.join(","),
    ...rows.map((row) => header.map((key) => {
      const value = key === "amount_cad"
        ? row.amount
        : key === "bucket_type"
          ? row.bucketType
          : key === "max_yearlings"
            ? row.maxYearlings
            : key === "eligibility"
              ? row.eligibility.join("; ")
              : key === "sex"
                ? sexSummary(row)
                : row[key] || "";
      return `"${String(value).replaceAll('"', '""')}"`;
    }).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "thestable-yearling-responses.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function seedDemoData() {
  saveResponses([
    demo("Brian L.", "brian@email.com", "lexington", "bucket", "premium", "1", "trotter", "colt", "", "", ["kentucky", "new_jersey"], 10000),
    demo("Mark D.", "markd@email.com", "ohio", "bucket", "value", "3", "trotter", "filly", "", "", ["ohio"], 5000),
    demo("Jennifer S.", "jennifer@email.com", "london", "specific", "", "", "pacer", "filly", "", "", ["ontario"], 2500),
    demo("Robert Sikkema", "robert@example.com", "harrisburg", "both", "balanced", "2", "both", "", "filly", "colt", ["pennsylvania", "new_jersey"], 7500),
  ]);
  render();
}

function demo(name, email, saleId, participation, bucketType, maxYearlings, gait, sex, sexTrotter, sexPacer, eligibility, amount) {
  return {
    id: email,
    ownerId: email,
    name,
    email,
    unmatched: false,
    interest: "yes",
    selectedSales: [saleId],
    openToAnySale: false,
    unsureSale: saleId === "unsure",
    submittedAt: new Date().toISOString(),
    saleResponses: {
      [saleId]: {
        participation,
        gait,
        sex,
        sexTrotter,
        sexPacer,
        eligibility,
        bucketType,
        maxYearlings,
        bucketLevel: String(amount),
        bucketAmount: "",
        bucketUse: "one_best",
        specificContact: participation === "specific" || participation === "both" ? "match_preferences" : "",
        specificHorseCount: participation === "specific" || participation === "both" ? "two" : "",
        specificShareSize: participation === "specific" || participation === "both" ? "2_5" : "",
        note: "",
      },
    },
  };
}

function labelFor(field, value) {
  const labels = {
    participation: { bucket: "Pre-sale bucket", specific: "After-sale individual shares", both: "Both" },
    gait: { trotter: "Trotters", pacer: "Pacers", both: "Both" },
    sex: { colt: "Colts", filly: "Fillies", both: "Both" },
    eligibility: {
      ohio: "Ohio eligible",
      kentucky: "Kentucky eligible",
      new_jersey: "New Jersey eligible",
      pennsylvania: "Pennsylvania eligible",
      ontario: "Ontario eligible",
      new_york: "New York eligible",
      indiana: "Indiana eligible",
      no_preference: "No strong preference",
    },
    bucketType: { premium: "Premium", value: "Value buys / sale bargains", balanced: "Balanced" },
    maxYearlings: { "1": "1", "2": "2", "3": "3", "4": "4", "5plus": "5+" },
    bucketUse: { one_best: "One best-fit bucket", split: "Split across buckets", ask_before_split: "Ask before splitting", one_bucket_only: "One bucket only" },
    specificContact: { match_preferences: "If they match preferences", all_available: "All remaining shares", bucket_only: "Pre-sale bucket only" },
    specificHorseCount: { one: "One horse only", two: "Up to 2 horses", three_plus: "3+ horses is OK" },
    specificShareSize: { "1": "Around 1%", "2_5": "2% to 5%", "5_10": "5% to 10%", "10plus": "10%+", depends: "Depends" },
  };
  return labels[field]?.[value] || "";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

render();
