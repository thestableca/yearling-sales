// "Confirmed buckets" (Questions Builder → planning list of the buckets
// TheStable will actually offer, plus its matching "Buckets we're
// offering" Dashboard panel) is hidden for this sale season — there's no
// intake data yet to plan against, and this is Phase 2 of the 5-phase
// process (Anthony designing buckets from demand + Sale History), a step
// that doesn't need this UI to happen this year. Nothing is deleted: the
// data (getConfirmedBuckets()/saveConfirmedBucketsFor()) and both panels'
// code are untouched, just not rendered. Flip this back to true once
// there's real demand data to plan a confirmed offer against.
const SHOW_CONFIRMED_BUCKETS = false;

// Owner Roster (import an invited-owner list so the Dashboard can show a
// real "X of Y invited" response rate) is hidden this season, per
// Robert's decision (2026-09-08): owners are authenticated via Resend
// magic-link, not via a pre-imported roster, so this list currently
// serves no purpose. It stays relevant for next year IF TheStable starts
// sending invite emails from this tool itself (then it needs to know who
// to invite) — that's an open question for the post-season evaluation,
// not decided now. Nothing is deleted: getOwnerRoster()/saveOwnerRoster()
// and the whole import UI are untouched, just not rendered/linked to.
// The Dashboard already degrades gracefully with an empty roster (shows
// "Import an owner roster..." instead of a response-rate %), so hiding
// this causes no broken state anywhere else.
const SHOW_OWNER_ROSTER = false;

// SALES/REAL_SALES are now derived from the "sales" block's own options
// (see defaultQuestionSet() in questions.js) so that editing a sale's name
// or adding a new one in Questions Builder updates every place that reads
// the sale list, instead of needing a separate hardcoded array kept in
// sync by hand. Functions (not consts) because they must read the block
// AFTER questions.js/the question-set cache is ready, not at module load.
function SALES() {
  const block = currentQuestionSet().blocks.find((b) => b.id === "sales");
  const fromBlock = (block?.options || []).map((o) => ({ id: o.value, label: o.label }));
  return [...fromBlock, { id: "unsure", label: "Not sure which sale yet" }];
}

function REAL_SALES() {
  return SALES().filter((sale) => sale.id !== "unsure");
}

const OWNERS = [
  { id: "own_test", name: "Test Owner", email: "test@thestable.ca" },
  { id: "own_001", name: "Robert Sikkema", email: "robert@example.com" },
  { id: "own_002", name: "Brian L.", email: "brian@email.com" },
  { id: "own_003", name: "Mark D.", email: "markd@email.com" },
  { id: "own_004", name: "Jennifer S.", email: "jennifer@email.com" },
];

const DRAFT_KEY = "thestable_yearling_draft_v7";
const BUILD_ID = "prototype_v3_bucket_percent_no_split_v7";

// Anthony's pasted/imported "expected owners" list (used only to show
// who hasn't responded yet — not the authentication source, and not the
// same as the real `owners` database table populated by actual sign-ins).
// Lives in admin_settings now (see questions.js's getSetting/setSetting)
// instead of localStorage, for the same robustness reason as the other
// admin config: it should survive a cleared cache or a different device.
function getOwnerRoster() {
  const stored = getSetting("owner_roster", []);
  return Array.isArray(stored) ? stored : [];
}

async function saveOwnerRoster(roster) {
  await setSetting("owner_roster", roster);
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

// Price-tier preference, asked per sale instead of a fixed bucket name —
// an owner isn't choosing a bucket TheStable already built (that would
// require it to already exist before anyone has said what they want);
// they're saying what price range interests them at THIS sale, and
// Anthony builds the actual bucket for that sale afterward using this
// demand plus the Sale History analysis. See salePriceTierCard() below.
const PRICE_TIERS = [
  ["budget", "Budget", "Lower price range, value-focused"],
  ["mid", "Mid-range", "Balance of price and quality"],
  ["premium", "Premium", "Higher price range, quality-focused"],
];

// Real historical odds of becoming a top performer, broken down by price
// tier AND gait AND sex, re-derived directly from the same JUVENIQ
// dataset the Sale History page uses (24,676 horses, 2014-2023,
// season-scoped matching). Price tiers match the budget/mid/premium
// split owners choose from in the intake question (budget = up to
// $50,000 USD, mid = $50,000-$100,000, premium = $100,000-$150,000).
// Premium is capped at $150,000, not open-ended, per Robert's
// confirmation that TheStable essentially never pays more than that for
// a yearling — an open "$100k+" premium band would have been inflated by
// a handful of much pricier horses (some $300k+) TheStable would never
// realistically buy, overstating what a real premium bucket's odds are.
// Only counts horses with a known trotter/pacer gait and
// colt/filly sex (a small "other" sex/gait group in the raw data is
// excluded here, since an owner's own answer is always one of these
// three gait options and three sex options, never "other") — so this is
// NOT the same denominator as an earlier, coarser price-tier-only
// version of this table, and its "both/both" cell reads slightly higher
// than that version did as a result. Lets the "Suggested buckets to
// offer" panel show a historical odds signal specific to the exact
// gait/sex combination owners actually asked for, not just their price
// tier, without mixing that signal into the demand ranking — see
// buildBucketSuggestions().
const PRICE_TIER_GAIT_SEX_ODDS = {
  budget: {
    trotter: {
      colt: { odds: 1.84, n: 3967, top: 73 },
      filly: { odds: 1.38, n: 4290, top: 59 },
      both: { odds: 1.60, n: 8257, top: 132 },
    },
    pacer: {
      colt: { odds: 2.01, n: 3535, top: 71 },
      filly: { odds: 1.22, n: 4658, top: 57 },
      both: { odds: 1.56, n: 8193, top: 128 },
    },
    both: {
      colt: { odds: 1.92, n: 7502, top: 144 },
      filly: { odds: 1.30, n: 8948, top: 116 },
      both: { odds: 1.58, n: 16450, top: 260 },
    },
  },
  mid: {
    trotter: {
      colt: { odds: 5.10, n: 921, top: 47 },
      filly: { odds: 4.14, n: 1064, top: 44 },
      both: { odds: 4.58, n: 1985, top: 91 },
    },
    pacer: {
      colt: { odds: 5.59, n: 1128, top: 63 },
      filly: { odds: 4.55, n: 1011, top: 46 },
      both: { odds: 5.10, n: 2139, top: 109 },
    },
    both: {
      colt: { odds: 5.37, n: 2049, top: 110 },
      filly: { odds: 4.34, n: 2075, top: 90 },
      both: { odds: 4.85, n: 4124, top: 200 },
    },
  },
  premium: {
    trotter: {
      colt: { odds: 9.20, n: 326, top: 30 },
      filly: { odds: 5.26, n: 323, top: 17 },
      both: { odds: 7.24, n: 649, top: 47 },
    },
    pacer: {
      colt: { odds: 6.48, n: 355, top: 23 },
      filly: { odds: 5.70, n: 263, top: 15 },
      both: { odds: 6.15, n: 618, top: 38 },
    },
    both: {
      colt: { odds: 7.78, n: 681, top: 53 },
      filly: { odds: 5.46, n: 586, top: 32 },
      both: { odds: 6.71, n: 1267, top: 85 },
    },
  },
};

// Same idea as PRICE_TIER_GAIT_SEX_ODDS, but split further by sale venue
// (lexington/harrisburg/ohio — the three sales JUVENIQ has data for;
// "london" has none, see priceTierGaitSexOdds() below for how that's
// handled). A cell gets a full { odds, n, top } object only when its
// exact (venue, tier, gait, sex) group has at least 30 horses sold in
// the JUVENIQ dataset — thinner than that would be a falsely precise
// percentage, not a real signal. Below that floor, the cell is still
// filled in, but with only { n }: that venue really did sell that few
// horses in this exact group (a volume gap at that venue, e.g. Ohio's
// small yearling pool overall — not a shortage of top performers
// specifically, which is a different thing easy to conflate with this).
// With premium capped at $150,000 (see PRICE_TIER_GAIT_SEX_ODDS above),
// every one of Ohio's premium cells falls under that 30-horse floor
// (n=3-25). oddsStatBlocks() in app.js is what turns an { n }-only cell
// into the "too few horses sold here" message instead of a percentage.
const PRICE_TIER_GAIT_SEX_VENUE_ODDS = {
  lexington: {
    budget: {
      trotter: { colt: { odds: 2.63, n: 1217, top: 32 }, filly: { odds: 1.73, n: 1101, top: 19 }, both: { odds: 2.20, n: 2318, top: 51 } },
      pacer: { colt: { odds: 3.28, n: 946, top: 31 }, filly: { odds: 1.40, n: 998, top: 14 }, both: { odds: 2.31, n: 1944, top: 45 } },
      both: { colt: { odds: 2.91, n: 2163, top: 63 }, filly: { odds: 1.57, n: 2099, top: 33 }, both: { odds: 2.25, n: 4262, top: 96 } },
    },
    mid: {
      trotter: { colt: { odds: 7.13, n: 477, top: 34 }, filly: { odds: 5.50, n: 436, top: 24 }, both: { odds: 6.35, n: 913, top: 58 } },
      pacer: { colt: { odds: 6.40, n: 500, top: 32 }, filly: { odds: 6.35, n: 378, top: 24 }, both: { odds: 6.38, n: 878, top: 56 } },
      both: { colt: { odds: 6.76, n: 977, top: 66 }, filly: { odds: 5.90, n: 814, top: 48 }, both: { odds: 6.37, n: 1791, top: 114 } },
    },
    premium: {
      trotter: { colt: { odds: 10.11, n: 178, top: 18 }, filly: { odds: 6.79, n: 162, top: 11 }, both: { odds: 8.53, n: 340, top: 29 } },
      pacer: { colt: { odds: 7.36, n: 163, top: 12 }, filly: { odds: 7.76, n: 116, top: 9 }, both: { odds: 7.53, n: 279, top: 21 } },
      both: { colt: { odds: 8.80, n: 341, top: 30 }, filly: { odds: 7.19, n: 278, top: 20 }, both: { odds: 8.08, n: 619, top: 50 } },
    },
  },
  harrisburg: {
    budget: {
      trotter: { colt: { odds: 1.21, n: 2147, top: 26 }, filly: { odds: 1.06, n: 2634, top: 28 }, both: { odds: 1.13, n: 4781, top: 54 } },
      pacer: { colt: { odds: 1.59, n: 1948, top: 31 }, filly: { odds: 1.04, n: 3074, top: 32 }, both: { odds: 1.25, n: 5022, top: 63 } },
      both: { colt: { odds: 1.39, n: 4095, top: 57 }, filly: { odds: 1.05, n: 5708, top: 60 }, both: { odds: 1.19, n: 9803, top: 117 } },
    },
    mid: {
      trotter: { colt: { odds: 2.19, n: 411, top: 9 }, filly: { odds: 3.02, n: 596, top: 18 }, both: { odds: 2.68, n: 1007, top: 27 } },
      pacer: { colt: { odds: 4.58, n: 568, top: 26 }, filly: { odds: 3.25, n: 585, top: 19 }, both: { odds: 3.90, n: 1153, top: 45 } },
      both: { colt: { odds: 3.58, n: 979, top: 35 }, filly: { odds: 3.13, n: 1181, top: 37 }, both: { odds: 3.33, n: 2160, top: 72 } },
    },
    premium: {
      trotter: { colt: { odds: 8.33, n: 144, top: 12 }, filly: { odds: 3.80, n: 158, top: 6 }, both: { odds: 5.96, n: 302, top: 18 } },
      pacer: { colt: { odds: 6.21, n: 177, top: 11 }, filly: { odds: 4.17, n: 144, top: 6 }, both: { odds: 5.30, n: 321, top: 17 } },
      both: { colt: { odds: 7.17, n: 321, top: 23 }, filly: { odds: 3.97, n: 302, top: 12 }, both: { odds: 5.62, n: 623, top: 35 } },
    },
  },
  ohio: {
    budget: {
      trotter: { colt: { odds: 2.49, n: 603, top: 15 }, filly: { odds: 2.16, n: 555, top: 12 }, both: { odds: 2.33, n: 1158, top: 27 } },
      pacer: { colt: { odds: 1.40, n: 641, top: 9 }, filly: { odds: 1.88, n: 586, top: 11 }, both: { odds: 1.63, n: 1227, top: 20 } },
      both: { colt: { odds: 1.93, n: 1244, top: 24 }, filly: { odds: 2.02, n: 1141, top: 23 }, both: { odds: 1.97, n: 2385, top: 47 } },
    },
    mid: {
      trotter: { colt: { odds: 12.12, n: 33, top: 4 }, filly: { odds: 6.25, n: 32, top: 2 }, both: { odds: 9.23, n: 65, top: 6 } },
      pacer: { colt: { odds: 8.33, n: 60, top: 5 }, filly: { odds: 6.25, n: 48, top: 3 }, both: { odds: 7.41, n: 108, top: 8 } },
      both: { colt: { odds: 9.68, n: 93, top: 9 }, filly: { odds: 6.25, n: 80, top: 5 }, both: { odds: 8.09, n: 173, top: 14 } },
    },
    // Premium ($100k-$150k) is thin across the board at Ohio -- unlike
    // budget/mid, none of these 9 cells reach the 30-horse floor, so
    // every one is { n } only (no odds/top), letting the UI show exactly
    // how few horses Ohio sold in that group instead of just "no data".
    premium: {
      trotter: { colt: { n: 4 }, filly: { n: 3 }, both: { n: 7 } },
      pacer: { colt: { n: 15 }, filly: { n: 3 }, both: { n: 18 } },
      both: { colt: { n: 19 }, filly: { n: 6 }, both: { n: 25 } },
    },
  },
};

// Returns BOTH odds figures for a suggestion row, never silently
// substituting one for the other: `venue` (that sale's own JUVENIQ
// figure, only when its exact tier/gait/sex group has at least 30
// horses — otherwise null) and `pooled` (the all-sales figure, always
// present when the pooled table has this tier/gait/sex combination at
// all). Showing both side by side, always, is deliberate — Robert's
// call after reviewing an earlier version that quietly swapped in the
// pooled figure for Ohio (and any venue with thin data) whenever the
// venue-specific one wasn't reliable: that made Ohio's numbers look
// exactly as precise as Lexington's or Harrisburg's, when they're
// actually a different, less specific kind of figure. The UI is
// responsible for making clear which is which.
function priceTierGaitSexOdds(saleId, tier, gait, sex) {
  // sex is optional on the bucket price-tier question ("No preference"
  // saves it as "") — the odds tables below only have colt/filly/both
  // cells, so an owner who picked no preference has to be looked up
  // under "both" (which already means "either sex" there), or every
  // no-preference row would silently show no odds at all in either
  // column, not just the per-venue one.
  const sexKey = sex || "both";
  const venueCell = PRICE_TIER_GAIT_SEX_VENUE_ODDS[saleId]?.[tier]?.[gait]?.[sexKey] || null;
  const pooledCell = PRICE_TIER_GAIT_SEX_ODDS[tier]?.[gait]?.[sexKey] || null;
  return { venue: venueCell, pooled: pooledCell };
}

// Renders the suggestion row's two historical-odds figures side by side,
// always both, never one silently standing in for the other. A venue
// cell can be: a full { odds, n, top } object (reliable, >=30 horses
// sold in this exact group at this sale), an { n } object with no odds
// (that venue DID sell horses in this exact group, just too few of
// them became a top performer to trust a %, e.g. Ohio's premium tier),
// or missing entirely. Per Robert's request, the on-page wording is
// kept simple and non-technical (no raw n counts shown) — the fuller
// "how many horses were actually sold here" detail lives in this
// comment and in PRICE_TIER_GAIT_SEX_VENUE_ODDS's own n values, for
// whoever maintains this later, not in the UI itself.
function oddsStatBlocks(odds) {
  if (!odds || !odds.pooled) {
    return `<div class="stat-block odds-block"><div class="num">&ndash;</div><div class="lbl">historical odds</div></div>`;
  }
  const venueBlock = odds.venue?.odds !== undefined
    ? `<div class="stat-block odds-block"><div class="num">${round1(odds.venue.odds)}%</div><div class="lbl repeat-lbl">this sale</div></div>`
    : `<div class="stat-block odds-block odds-missing"><div class="num">&ndash;</div><div class="lbl">too few horses sold in this group at this sale</div></div>`;
  const pooledBlock = `<div class="stat-block odds-block odds-pooled"><div class="num">${round1(odds.pooled.odds)}%</div><div class="lbl repeat-lbl">all sales combined</div></div>`;
  return venueBlock + pooledBlock;
}

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

// A list of price-tier preferences for THIS sale, not a fixed bucket name
// or a percentage — an owner is saying which price ranges interest them
// (Anthony builds the actual bucket afterward from this demand plus Sale
// History; a percentage would be meaningless before that bucket, and how
// many horses it holds, actually exists). An array rather than one row
// per tier, since an owner can want more than one combination within the
// same tier (e.g. Premium trotter colts AND, separately, Premium pacer
// fillies) — those are two distinct preferences, not one row that would
// have to pick between them.
function blankPriceTierMatrix() {
  return [];
}

function newPriceTierRow() {
  return { tier: "", gait: "", sex: "" };
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
  priceTierMatrix: blankPriceTierMatrix(),
  specificHorseCount: "",
  specificHorseCountExact: "",
  specificShareSize: "",
  specificShareSizeCustom: "",
  specificShareSizePerHorse: "",
  specificShareSizesByHorse: [],
  note: "",
};

const emptyDraft = {
  view: "welcome",
  owner: null,
  unmatched: false,
  resumedExisting: false,
  identifyError: "",
  authLinkSent: false,
  submitting: false,
  submitError: "",
  submitWarning: "",
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
let selectedCurrency = "usd";

// Admin screens (Dashboard/Sale History/Owner Roster) read responses
// synchronously via getResponses() below, matching how they always worked
// against localStorage. Since the real data now lives in Supabase (an
// async fetch), responsesCache holds the last successful fetch and
// refreshAdminData() populates it before rendering — render() itself stays
// synchronous throughout the admin screens, only the load/refresh step is
// async. responsesLoading distinguishes "haven't fetched yet" (show a
// loading state) from "fetched, zero responses" (show the real empty state).
let responsesCache = [];
let responsesLoading = false;

async function refreshAdminData() {
  responsesLoading = true;
  render();
  const [responses] = await Promise.all([fetchAllResponses(), refreshAdminSettingsCache()]);
  responsesCache = responses;
  responsesLoading = false;
  render();
}

adminLink.addEventListener("click", () => {
  mode = "admin";
  if (isAdminSignedIn()) refreshAdminData();
  render();
});

ownerLink.addEventListener("click", () => {
  mode = "owner";
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

// Synchronous read of the last-fetched responses — see responsesCache /
// refreshAdminData() above for how this is kept up to date.
function getResponses() {
  return responsesCache;
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
    priceTierMatrix: normalizePriceTierMatrix(value.priceTierMatrix),
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

// Accepts the current array-of-rows shape, but also tolerates the older
// one-row-per-tier object shape a draft already sitting in someone's
// browser localStorage might still have (from before this rebuild) —
// converts it into rows instead of dropping that in-progress answer.
function normalizePriceTierMatrix(matrix) {
  if (Array.isArray(matrix)) {
    return matrix
      .filter((row) => row && typeof row === "object")
      .map((row) => ({ ...newPriceTierRow(), ...row }));
  }
  if (matrix && typeof matrix === "object") {
    return Object.entries(matrix)
      .filter(([, row]) => row?.enabled)
      .map(([tier, row]) => ({ tier, gait: row.gait || "", sex: row.sex || "" }));
  }
  return [];
}

// Math.round(v*10)/10 before toFixed(1) avoids toFixed's binary-float
// rounding errors (e.g. (1.45).toFixed(1) === "1.4", not "1.5").
function round1(value) {
  return (Math.round(value * 10) / 10).toFixed(1);
}

function percent(value) {
  if (value === "" || value == null) return "";
  const number = Number(value);
  if (Number.isNaN(number)) return `${String(value)}%`;
  return `${Number.isInteger(number) ? number : round1(number)}%`;
}

function cleanPercent(value) {
  const cleaned = String(value || "").replace(",", ".").replace(/[^\d.]/g, "");
  const num = Number(cleaned);
  if (cleaned !== "" && Number.isFinite(num) && num > 100) return "100";
  return cleaned;
}

function saleById(id) {
  return SALES().find((sale) => sale.id === id);
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

// Ready once at least one preference row has both a price tier and a
// gait choice — sex is optional (an owner may genuinely have no
// preference). No percentage is asked here; see blankPriceTierMatrix()
// for why.
function priceTierMatrixReady(prefs) {
  return (prefs.priceTierMatrix || []).some((row) => row?.tier && row?.gait);
}

// Not just "the array isn't empty" — priceTierMatrix now always starts
// with one blank row (see priceTierMatrixHtml()) so an owner can fill
// it in immediately instead of clicking "Add" first, which means an
// empty, untouched row shouldn't count as a real answer here.
function priceTierMatrixHasAnyEntry(matrix) {
  return Array.isArray(matrix) && matrix.some((row) => row?.tier || row?.gait || row?.sex);
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
  // fixedPosition blocks (interest/sales/eligibility) are excluded too —
  // they have their own dedicated draft.view screens BEFORE this walk
  // ever starts (see interestCard()/salesCard()/eligibilityCard()), so
  // they must never appear a second time as a "defaults" step.
  const allBlocks = currentQuestionSet().blocks.filter((b) => !b.archived && !b.fixedPosition);
  const visible = visibleBlocks(allBlocks, prefs);
  const blocks = visible.filter((block) => block.type !== "bucket_config");
  const questions = blocks.map((block) => block.id);
  // applyMode is the final step, added only once the walk has reached
  // the natural end of the question set instead of stopping early on an
  // unanswered gating question. Skipped entirely with only one sale
  // selected — "apply to all selected sales or customize each" has
  // nothing to ask when there's only one sale to apply to.
  if (visible.length > 0 && draft.selectedSales.length > 1 && questionSetComplete(allBlocks, prefs)) questions.push("applyMode");
  return questions;
}

// "Customize this sale" re-runs the same question walk as the shared
// defaults phase, since priceTierMatrix/specificShareSizesByHorse
// (dependsOn: participation) are meant to be genuinely re-editable per
// sale — an owner might want a different bucket at Ohio than at
// Lexington. Every other question describes the owner, not the sale
// (participation itself included, plus any custom question added in
// Questions Builder, whatever position it's placed at), so re-asking
// it here would just repeat something already answered once during
// defaults with no way for the answer to differ. Filtered out by
// isSaleSpecificBlock() rather than dropped from the walk itself — the
// full block list, participation included, still has to feed
// defaultQuestions()'s reachability check or priceTierMatrix/
// specificShareSizesByHorse would never become reachable at all.
function saleDetailQuestions(response = currentSaleResponse()) {
  const allBlocks = currentQuestionSet().blocks.filter((b) => !b.archived && !b.fixedPosition);
  return defaultQuestions(response)
    .filter((question) => question !== "applyMode")
    .filter((question) => isSaleSpecificBlock(allBlocks.find((b) => b.id === question), allBlocks));
}

function currentSaleResponse() {
  const saleId = currentSaleId();
  if (!draft.saleResponses[saleId]) {
    draft.saleResponses[saleId] = clone(draft.defaultPrefs);
  }
  return draft.saleResponses[saleId];
}

// The "defaults" walk's question count isn't fixed: which questions are
// even visible depends on answers given earlier in that same walk (e.g.
// sexTrotter/sexPacer only exist once gait="both" is answered), so it
// can grow or shrink as an owner moves through it — and it changes again
// whenever Anthony edits the question set in Questions Builder. A fixed
// "X% per question" step used to hit its ceiling early on a longer walk,
// then jump straight to review's fixed number; scaling by the count at
// each step instead made the bar occasionally move backwards, since that
// count itself moves. Approaching (never reaching) the ceiling with a
// shrinking-step curve sidesteps both: always forward, never overshoots,
// and naturally slows down the more questions there turn out to be.
function approachCeiling(start, ceiling, index, softness = 4) {
  return Math.round(start + (ceiling - start) * (1 - softness / (index + softness + 1)));
}

function progressPercent() {
  const order = ["welcome", "identify", "interest", "sales", "eligibility", "defaults", "customChoice", "saleDetail", "review", "done"];
  if (draft.view === "defaults") return approachCeiling(35, 88, draft.defaultIndex, 2);
  if (draft.view === "customChoice" || draft.view === "saleDetail") {
    const stepsDone = draft.saleIndex * 4 + draft.questionIndex;
    return approachCeiling(78, 92, stepsDone, 2);
  }
  if (draft.view === "review") return 90;
  if (draft.view === "done") return 100;
  return Math.max(5, (order.indexOf(draft.view) + 1) * 6);
}

function render() {
  document.body.classList.toggle("admin-screen", mode === "admin");
  adminLink.classList.toggle("hidden", mode === "admin");
  ownerLink.classList.toggle("hidden", mode !== "admin");
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
  app.innerHTML = `${hero("2026 Yearling Sale Planning", "Set your preferences once, then choose whether they apply to all selected sales or specify each sale separately.")}${ownerLayout()}`;
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
    "Tell us what you're looking for in 2026",
    `<p class="prompt">Share your preferences for the 2026 yearling sales. This is not a commitment. It just helps TheStable understand what owners are interested in before deciding on the actual buckets, using this together with sale history. Use the email address you use with TheStable.ca. You can review your answers before submitting.</p>
     <div class="actions single"><button class="btn primary" type="button" data-go="identify">Let's Get Started</button></div>`,
    "Welcome"
  );
}

function identifyCard() {
  if (draft.authLinkSent) {
    return card(
      "Step 1",
      "Check your email",
      `<p>We sent a one-time sign-in link to <strong>${escapeHtml(draft.email)}</strong>. Click the link in that email to continue. It may take a minute to arrive. Worth a check in your spam folder too.</p>
       <div class="actions single"><button class="btn" type="button" id="useDifferentEmail">Use a different email</button></div>`
    );
  }
  return card(
    "Step 1",
    "Who is completing this intake?",
    `${draft.identifyError ? `<p class="notice">${escapeHtml(draft.identifyError)}</p>` : ""}
     <div class="field-stack">
       <input class="input" id="nameInput" value="${escapeHtml(draft.name)}" placeholder="Your name">
       <input class="input" id="emailInput" type="email" value="${escapeHtml(draft.email)}" placeholder="you@example.com">
     </div>
     <div class="actions"><button class="btn" type="button" data-go="welcome">Back</button><button class="btn primary" type="button" data-identify id="identifyButton">Send me a sign-in link</button></div>`
  );
}

// interestCard()/salesCard()/eligibilityCard() render the fixed-position
// "interest"/"sales"/"eligibility" blocks from questions.js's
// defaultQuestionSet() — their question text and options come from those
// blocks (editable in Questions Builder), while the screen ORDER and
// draft.* state they write to stay exactly as before; see the
// fixedPosition comment on those blocks in questions.js for why.
function questionBlock(id) {
  return currentQuestionSet().blocks.find((b) => b.id === id);
}

function interestCard() {
  const block = questionBlock("interest");
  const options = (block?.options || []).map((o) => [o.value, o.label, o.help || ""]);
  return card(
    "Step 2",
    block?.label || "Are you interested in purchasing yearling shares in 2026?",
    `${draft.resumedExisting ? `<p class="notice">We found a previous submission for this email address and loaded it here. Continuing will update and replace that submission.</p>` : ""}
    ${block?.helpText ? `<p class="prompt">${escapeHtml(block.helpText)}</p>` : ""}
    ${radioOptions("interest", draft.interest, options)}
    <div class="actions"><button class="btn" type="button" data-go="identify">Back</button><button class="btn primary" type="button" data-interest-next ${!draft.interest ? "disabled" : ""}>Continue</button></div>`
  );
}

function salesCard() {
  const block = questionBlock("sales");
  const options = (block?.options || []).map((o) => [o.value, o.label, o.help || ""]);
  return card(
    "Step 3",
    block?.label || "Which yearling sales should TheStable consider for you?",
    `<p class="prompt">${block?.helpText ? escapeHtml(block.helpText) : "Select all that apply."}</p>
     ${checkOptions("sales", draft.selectedSales, options)}
     <div class="options">
       <button class="option ${draft.openToAnySale ? "selected" : ""}" type="button" data-any-sale><span class="mark check"></span><span><strong>I am open to any sale</strong></span></button>
       <button class="option ${draft.selectedSales.includes("unsure") ? "selected" : ""}" type="button" data-unsure-sale><span class="mark check"></span><span><strong>I am not sure which sale yet</strong></span></button>
     </div>
     <div class="actions"><button class="btn" type="button" data-go="interest">Back</button><button class="btn primary" type="button" data-go="eligibility" ${!draft.selectedSales.length ? "disabled" : ""}>Continue</button></div>`
  );
}

function eligibilityCard() {
  const block = questionBlock("eligibility");
  const options = (block?.options || []).map((o) => [o.value, o.label, o.help || ""]);
  return card(
    "Step 4",
    block?.label || "Which jurisdictions are you interested in?",
    `<p class="prompt">${block?.helpText ? escapeHtml(block.helpText) : "Select all that apply."}</p>
     ${checkOptions("globalEligibility", draft.eligibilityPreferences, options)}
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
    return card(meta, "This question is no longer available", `<p class="notice">There's nothing left to answer here. Please contact TheStable to continue.</p><div class="actions single"><button class="btn" type="button" data-go="welcome">Start over</button></div>`, tag);
  }
  const blockTag = block.id === "participation" || block.id === "gait" || block.id === "sex" || block.id === "sexTrotter" || block.id === "sexPacer" ? tag
    : block.id.startsWith("specific") ? "After-sale shares"
    : block.dependsOn && (block.dependsOn.blockId === "participation" || block.dependsOn.blockId === "bucketDetailMode") ? "Bucket"
    : "Question";

  if (block.type === "bucket_matrix") {
    return card(meta, block.label, `${block.helpText ? `<p class="prompt">${block.helpText}</p>` : ""}${bucketMatrixHtml(prefs)}${actionsFn(bucketMatrixReady(prefs))}`, blockTag);
  }

  if (block.type === "price_tier_matrix") {
    return card(meta, block.label, `${block.helpText ? `<p class="prompt">${block.helpText}</p>` : ""}${priceTierMatrixHtml(prefs)}${actionsFn(priceTierMatrixReady(prefs))}`, blockTag);
  }

  if (block.type === "per_horse_shares") {
    return card(meta, block.label, `${block.helpText ? `<p class="prompt">${block.helpText}</p>` : ""}${perHorseSharesHtml(prefs)}${actionsFn(perHorseSharesReady(prefs))}`, blockTag);
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
  // used for the value-style questions (maxYearlings, bucketLevel);
  // radioOptions (simple list) for the rest.
  const value = prefs[block.id];
  if (block.id === "maxYearlings") {
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
  return [
    ["all", "Yes, use these preferences for all selected sales", ""],
    ["custom", "No, I want to customize each selected sale", ""],
  ];
}

function defaultActions(canContinue) {
  return `<div class="actions"><button class="btn" type="button" data-default-back>Back</button><button class="btn primary" type="button" data-default-next ${!canContinue ? "disabled" : ""}>Continue</button></div>`;
}

function saleActions(canContinue) {
  return `<div class="actions"><button class="btn" type="button" data-sale-back>Back</button><button class="btn primary" type="button" data-sale-next ${!canContinue ? "disabled" : ""}>Continue</button></div>`;
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
     ${draft.submitError ? `<p class="notice">${escapeHtml(draft.submitError)}</p>` : ""}
     <div class="actions"><button class="btn" type="button" data-review-back ${draft.submitting ? "disabled" : ""}>Back</button><button class="btn red" type="button" data-submit ${draft.submitting ? "disabled" : ""}>${draft.submitting ? "Submitting…" : "Confirm & Submit"}</button></div>`,
    "Review"
  );
}

function doneCard() {
  const warning = draft.submitWarning ? `<p class="notice">${escapeHtml(draft.submitWarning)}</p>` : "";
  return card("Complete", "Thank you!", `<p class="prompt">Your preferences have been submitted successfully.</p>${warning}<p class="prompt">Want to change something later? Come back to this page and enter the same email address. Your answers will load back in so you can update and resubmit them.</p><div class="actions single"><button class="btn primary" type="button" data-start-over>Close</button></div>`, "Complete");
}

function radioOptions(field, value, options, target = null) {
  const targetName = target === draft.defaultPrefs ? "default" : target ? "sale" : "draft";
  const anyArmed = options.some(([id]) => armedBranchChange === `${field}:${id}:${targetName}`);
  const banner = anyArmed ? `<p class="confirm-banner">Click the highlighted option one more time to confirm this change. It will clear your answers to the questions after this one.</p>` : "";
  return `${banner}<div class="options">${options.map(([id, label, help]) => {
    const isArmed = armedBranchChange === `${field}:${id}:${targetName}`;
    return `
    <button class="option ${value === id ? "selected" : ""} ${isArmed ? "armed-confirm" : ""}" data-radio="${field}" data-value="${id}" data-target="${targetName}" type="button">
      <span class="mark radio"></span>
      <span><strong>${label}</strong>${isArmed ? `<small class="confirm-hint">Click again to confirm</small>` : help ? `<small>${help}</small>` : ""}</span>
    </button>
  `;
  }).join("")}</div>`;
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

function newPerHorseShareRow() {
  return { percent: "", gait: "", sex: "" };
}

// One row per horse, each with its own share size plus (only when the
// owner picked "both" earlier) its own gait and colt/filly choice — so
// "3 trotter colts at 5% and 2 pacer fillies at 8%" can be entered as
// five distinct rows instead of one shared answer that can't tell them
// apart. Starts with a single blank row (most owners just want one
// share size), with an "Add another horse" button for anyone who wants
// to specify more.
function perHorseSharesHtml(prefs) {
  const targetName = prefs === draft.defaultPrefs ? "default" : "sale";
  if (!prefs.specificShareSizesByHorse || !prefs.specificShareSizesByHorse.length) {
    prefs.specificShareSizesByHorse = [newPerHorseShareRow()];
  }
  const rows = prefs.specificShareSizesByHorse;
  const rowHtml = rows.map((row, index) => {
    return `
      <section class="matrix-group">
        <h3>Horse ${index + 1}${rows.length > 1 ? `<button class="text-link" type="button" data-remove-per-horse-share-row="${index}" data-target="${targetName}" aria-label="Remove this horse">Remove</button>` : ""}</h3>
        <div class="matrix-row per-horse-share-row">
          <label>
            Percentage
            <input class="input matrix-input" inputmode="decimal" data-per-horse-share-field="percent" data-per-horse-share-index="${index}" data-target="${targetName}" value="${escapeHtml(row.percent)}" placeholder="e.g. 5">
          </label>
          <label>
            Gait
            <select class="input matrix-input" data-per-horse-share-field="gait" data-per-horse-share-index="${index}" data-target="${targetName}">
              <option value="">No preference</option>
              <option value="trotter" ${row.gait === "trotter" ? "selected" : ""}>Trotter</option>
              <option value="pacer" ${row.gait === "pacer" ? "selected" : ""}>Pacer</option>
            </select>
          </label>
          <label>
            Colt / filly
            <select class="input matrix-input" data-per-horse-share-field="sex" data-per-horse-share-index="${index}" data-target="${targetName}">
              <option value="">No preference</option>
              <option value="colt" ${row.sex === "colt" ? "selected" : ""}>Colt</option>
              <option value="filly" ${row.sex === "filly" ? "selected" : ""}>Filly</option>
            </select>
          </label>
        </div>
      </section>
    `;
  }).join("");
  return `<div class="bucket-matrix">${rowHtml}<button class="btn" type="button" data-add-per-horse-share-row data-target="${targetName}">Add another horse</button></div>`;
}

function perHorseSharesReady(prefs) {
  const rows = prefs.specificShareSizesByHorse || [];
  if (!rows.length) return false;
  return rows.every((row) => Boolean(row.percent));
}

// Renders the owner's list of price-tier preferences for this sale: each
// row is its own price tier + gait + sex combination, with an "Add
// another preference" affordance so e.g. "Premium trotter colts" and
// "Premium pacer fillies" can both be recorded as separate rows instead
// of one row per tier forcing a single combination. No percentage/amount
// is asked here — see blankPriceTierMatrix() for why.
function priceTierMatrixHtml(prefs) {
  if (!prefs.priceTierMatrix || !prefs.priceTierMatrix.length) {
    prefs.priceTierMatrix = [newPriceTierRow()];
  }
  const rows = prefs.priceTierMatrix;
  const targetName = prefs === draft.defaultPrefs ? "default" : "sale";
  const rowHtml = rows.map((row, index) => `
      <div class="matrix-row price-tier-row">
        <label>
          Price tier
          <select class="input matrix-input" data-tier-row-field="tier" data-tier-row-index="${index}" data-target="${targetName}">
            <option value="">Choose</option>
            ${PRICE_TIERS.map(([id, label]) => `<option value="${id}" ${row.tier === id ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
        <label>
          Gait
          <select class="input matrix-input" data-tier-row-field="gait" data-tier-row-index="${index}" data-target="${targetName}">
            <option value="">Choose</option>
            <option value="trotter" ${row.gait === "trotter" ? "selected" : ""}>Trotters</option>
            <option value="pacer" ${row.gait === "pacer" ? "selected" : ""}>Pacers</option>
            <option value="both" ${row.gait === "both" ? "selected" : ""}>Both</option>
          </select>
        </label>
        <label>
          Colt / filly
          <select class="input matrix-input" data-tier-row-field="sex" data-tier-row-index="${index}" data-target="${targetName}">
            <option value="">No preference</option>
            <option value="colt" ${row.sex === "colt" ? "selected" : ""}>Colts</option>
            <option value="filly" ${row.sex === "filly" ? "selected" : ""}>Fillies</option>
            <option value="both" ${row.sex === "both" ? "selected" : ""}>Both</option>
          </select>
        </label>
        ${rows.length > 1 ? `<button class="btn" type="button" data-remove-tier-row="${index}" data-target="${targetName}" aria-label="Remove this preference">Remove</button>` : ""}
      </div>
    `).join("");
  return `<div class="bucket-matrix"><div class="matrix-rows price-tier-rows">${rowHtml}</div><button class="btn" type="button" data-add-tier-row data-target="${targetName}">Add another preference</button></div>`;
}

function bindOwner() {
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => {
    saveInputs();
    draft.view = button.dataset.go;
    saveDraft();
    armedBranchChange = null;
    clearTimeout(armedBranchChangeTimer);
    render();
  }));
  document.querySelector("[data-identify]")?.addEventListener("click", identifyOwner);
  document.querySelector("#useDifferentEmail")?.addEventListener("click", async () => {
    await ownerSignOut();
    draft.authLinkSent = false;
    draft.identifyError = "";
    saveDraft();
    render();
  });
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
  document.querySelectorAll("[data-add-tier-row]").forEach((button) => button.addEventListener("click", () => addPriceTierRow(button.dataset.target)));
  document.querySelectorAll("[data-remove-tier-row]").forEach((button) => button.addEventListener("click", () => removePriceTierRow(Number(button.dataset.removeTierRow), button.dataset.target)));
  document.querySelectorAll("[data-tier-row-field]").forEach((select) => select.addEventListener("change", () => setPriceTierRowValue(Number(select.dataset.tierRowIndex), select.dataset.tierRowField, select.value, select.dataset.target)));
  document.querySelectorAll("[data-per-horse-share-field]").forEach((el) => {
    const isSelect = el.tagName === "SELECT";
    // A gait change can reveal or hide that row's colt/filly dropdown
    // (see perHorseSharesHtml's needsSex), so it needs a real re-render,
    // not just updateContinueState — unlike the percent input, which
    // stays a plain text box either way and would lose cursor focus on
    // every keystroke if it re-rendered too.
    el.addEventListener(isSelect ? "change" : "input", () => setPerHorseShareRowValue(Number(el.dataset.perHorseShareIndex), el.dataset.perHorseShareField, isSelect ? el.value : cleanPercent(el.value), el.dataset.target, isSelect));
  });
  document.querySelectorAll("[data-add-per-horse-share-row]").forEach((button) => button.addEventListener("click", () => addPerHorseShareRow(button.dataset.target)));
  document.querySelectorAll("[data-remove-per-horse-share-row]").forEach((button) => button.addEventListener("click", () => removePerHorseShareRow(Number(button.dataset.removePerHorseShareRow), button.dataset.target)));
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

async function identifyOwner() {
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
  draft.identifyError = "";
  saveDraft();
  const identifyButton = document.querySelector("#identifyButton");
  if (identifyButton) {
    identifyButton.disabled = true;
    identifyButton.textContent = "Sending…";
  }
  const result = await requestOwnerMagicLink(email);
  if (!result.ok) {
    draft.identifyError = result.message;
    render();
    return;
  }
  draft.authLinkSent = true;
  saveDraft();
  render();
}

// Called once a magic-link redirect has produced a real owner session
// (see restoreOwnerSession in supabase-client.js). Looks up the verified
// owner record and any existing submission for this email, then moves the
// draft into the intake flow — this is the sign-in-verified equivalent of
// the old identifyOwner owner-matching step, now backed by the real
// `owners`/`submissions` tables instead of the hardcoded OWNERS array.
async function resumeAfterOwnerSignIn() {
  const email = ownerEmail();
  if (!email) return;

  const { data: ownerRow } = await supabaseAsOwner()
    .from("owners")
    .select("id, name, email")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  // A blank name means the owners row exists only because the magic-link
  // function auto-created it on first contact (see
  // send-owner-magic-link/index.ts) — treat that the same as "not on
  // TheStable's roster," i.e. unmatched, until a real name is on file.
  const owner = ownerRow?.name ? ownerRow : null;

  const currentYear = await getCurrentSaleYearNumber();
  const { data: existingSubmission } = await supabaseAsOwner()
    .from("submissions")
    .select("id")
    .eq("email", email.toLowerCase())
    .eq("year", currentYear)
    .maybeSingle();

  draft.email = email;
  draft.name = draft.name || owner?.name || "";
  draft.owner = owner ? { id: owner.id, name: owner.name, email: owner.email } : null;
  draft.unmatched = !owner;
  draft.authLinkSent = false;

  if (existingSubmission) {
    const existing = await fetchOwnSubmission(email);
    if (existing) {
      draft = { ...normalizeDraft(existing), view: "interest", name: draft.name, email, owner: draft.owner, unmatched: draft.unmatched, resumedExisting: true };
    }
  } else if (draft.view === "welcome" || draft.view === "identify") {
    draft.view = "interest";
  }
  saveDraft();
}

async function interestNext() {
  if (draft.interest === "no") {
    draft.selectedSales = [];
    draft.saleResponses = {};
    await submitResponse();
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

// Fields whose value change wipes other, already-answered fields further
// down the flow (see resetBranchAnswers/resetBucketDetails below) —
// changing your mind on one of these after already answering
// later questions (e.g. going back and switching participation from
// "bucket" to "specific" after already filling in bucket percentages)
// silently discarded that later work with no warning. Only actually
// destructive when (a) the value is really changing, not just re-clicking
// the option already selected, and (b) something downstream was actually
// answered yet to lose — re-clicking the same value, or changing a field
// before anything downstream has been touched, needs no confirmation at all.
const BRANCH_FIELDS_WITH_DEPENDENTS = new Set(["participation", "bucketDetailMode"]);

function hasDownstreamAnswers(field, target) {
  if (field === "participation") {
    return Boolean(
      target.bucketDetailMode || target.bucketTypes?.length || target.bucketLevel || target.bucketAmount ||
      target.specificShareSizesByHorse?.some((row) => row.percent) || bucketMatrixHasAnyEntry(target.bucketMatrix) ||
      priceTierMatrixHasAnyEntry(target.priceTierMatrix)
    );
  }
  if (field === "bucketDetailMode") {
    return Boolean(target.bucketTypes?.length || target.bucketLevel || target.bucketAmount || bucketMatrixHasAnyEntry(target.bucketMatrix));
  }
  return false;
}

function bucketMatrixHasAnyEntry(matrix) {
  if (!matrix) return false;
  return Object.values(matrix).some((byGait) => Object.values(byGait || {}).some((row) => row?.enabled));
}

// Tracks which specific radio option is "armed" (clicked once, awaiting a
// second confirming click) when switching it would wipe downstream
// answers — keyed by `${field}:${value}` so switching to a DIFFERENT
// option resets the arming rather than confirming the wrong choice.
// Mirrors armDestructiveButton's click-again-to-confirm pattern (used
// elsewhere in the admin UI) rather than window.confirm(), which is a
// blocking native popup that doesn't fit a plain choice button and (per
// armDestructiveButton's own comment) is silently blocked entirely inside
// a sandboxed iframe context.
let armedBranchChange = null;
let armedBranchChangeTimer = null;

function setValue(field, value, targetName) {
  const target = getTarget(targetName);
  if (target[field] === value) return; // re-clicking the already-selected option changes nothing — must not wipe anything either

  const armKey = `${field}:${value}:${targetName}`;
  if (BRANCH_FIELDS_WITH_DEPENDENTS.has(field) && hasDownstreamAnswers(field, target)) {
    if (armedBranchChange !== armKey) {
      armedBranchChange = armKey;
      clearTimeout(armedBranchChangeTimer);
      armedBranchChangeTimer = setTimeout(() => { armedBranchChange = null; render(); }, 8000);
      render();
      return;
    }
    armedBranchChange = null;
    clearTimeout(armedBranchChangeTimer);
  }

  target[field] = value;
  if (field === "participation") {
    resetBranchAnswers(target);
    draft.applyMode = "";
  }
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
    // A custom multi_select question added via Questions Builder has no
    // entry in emptyPrefs (that object only knows about the fixed,
    // built-in fields), so the first time an owner clicks one of its
    // options, target[field] is still undefined here. Without this,
    // toggleInArray(undefined, value) throws, crashing the click.
    // Initialize it to an empty array on first use, same shape a
    // multi_select field would have had if it were built in.
    const target = getTarget(targetName);
    if (target[field] === undefined) target[field] = [];
    toggleInArray(target[field], value);
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

function addPriceTierRow(targetName) {
  const target = getTarget(targetName);
  target.priceTierMatrix.push(newPriceTierRow());
  saveDraft();
  render();
}

function removePriceTierRow(index, targetName) {
  const target = getTarget(targetName);
  target.priceTierMatrix.splice(index, 1);
  saveDraft();
  render();
}

function setPriceTierRowValue(index, field, value, targetName) {
  const target = getTarget(targetName);
  const row = target.priceTierMatrix[index];
  if (!row) return;
  row[field] = value;
  saveDraft();
  updateContinueState(target);
}

function addPerHorseShareRow(targetName) {
  const target = getTarget(targetName);
  target.specificShareSizesByHorse.push(newPerHorseShareRow());
  saveDraft();
  render();
}

function removePerHorseShareRow(index, targetName) {
  const target = getTarget(targetName);
  target.specificShareSizesByHorse.splice(index, 1);
  saveDraft();
  render();
}

function setPerHorseShareRowValue(index, field, value, targetName, shouldRender = false) {
  const target = getTarget(targetName);
  const row = target.specificShareSizesByHorse[index];
  if (!row) return;
  row[field] = value;
  if (field === "gait") row.sex = ""; // that row's colt/filly choice no longer necessarily applies
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
  else if (Array.isArray(prefs.specificShareSizesByHorse) && prefs.specificShareSizesByHorse.length) button.disabled = !perHorseSharesReady(prefs);
  else if (Array.isArray(prefs.priceTierMatrix)) button.disabled = !priceTierMatrixReady(prefs);
}

function defaultNext() {
  saveInputs();
  const questions = defaultQuestions();
  if (questions[draft.defaultIndex] === "applyMode") {
    applyDefaultsToSales();
    if (draft.applyMode === "all") draft.view = "review";
    else draft.view = "customChoice";
    draft.saleIndex = 0;
    draft.questionIndex = 0;
  } else if (draft.defaultIndex < questions.length - 1) {
    draft.defaultIndex += 1;
  } else if (draft.selectedSales.length === 1) {
    // Only one sale selected, so applyMode was never asked (nothing to
    // apply to besides that one sale) — go straight to review as if
    // "all" had been chosen.
    draft.applyMode = "all";
    applyDefaultsToSales();
    draft.view = "review";
    draft.saleIndex = 0;
    draft.questionIndex = 0;
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
  if (draft.view === "customChoice") {
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
  if (draft.view === "customChoice") {
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
  draft.view = draft.applyMode === "custom" ? "customChoice" : "defaults";
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
  draft.selectedSales = draft.openToAnySale ? REAL_SALES().map((sale) => sale.id) : [];
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
  target.priceTierMatrix = blankPriceTierMatrix();
  target.specificShareSizesByHorse = [];
}

function resetBucketDetails(target) {
  target.bucketTypes = [];
  target.maxYearlings = "";
  target.bucketLevel = "";
  target.bucketAmount = "";
  target.bucketMatrix = blankBucketMatrix();
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
  "interest", "sales", "eligibility",
  "participation", "gait",
  "priceTierMatrix",
  "specificShareSizesByHorse",
]);

function summarizeSale(response) {
  const parts = [
    labelFor("participation", response.participation),
  ];
  if (hasSpecific(response)) {
    parts.push(summarizeSpecificShareSizesByHorse(response));
  }
  parts.push(draft.eligibilityPreferences.map((item) => labelFor("eligibility", item)).join(", "));
  if (hasBucket(response)) {
    parts.push(summarizePriceTierMatrix(response));
  }
  parts.push(...customAnswerSummaries(response));
  return parts.filter(Boolean).join(" | ");
}

const SINGULAR_GAIT_LABEL = { trotter: "Trotter", pacer: "Pacer" };
const SINGULAR_SEX_LABEL = { colt: "Colt", filly: "Filly" };

// gait/sex used to be their own question blocks, so labelFor("gait",
// value) / labelFor("sex", value) resolved a label from that block's
// options. Both blocks were removed from the question set once gait
// and colt/filly became per-row fields (on priceTierMatrix and the
// after-sale per-horse screen) instead of standalone questions —
// labelFor() falls back to a block lookup that no longer exists for
// either field, so it now silently returns "" for every value. These
// two literal maps are the replacement: every place that used to read
// a bucket-context gait/sex value via labelFor() needs one of these
// instead, not a block-backed lookup.
const GAIT_LABEL = { trotter: "Trotter", pacer: "Pacer", both: "Trotter or Pacer" };
// "either" is Confirmed Buckets' own spelling for the same "no sex
// preference" concept priceTierMatrix/after-sale rows call "both" —
// both map to the same label here.
const SEX_LABEL = { colt: "Colt", filly: "Filly", both: "Colt or Filly", either: "Colt or Filly" };
function gaitLabel(value) {
  return value ? GAIT_LABEL[value] || value : "";
}
function sexLabel(value) {
  return value ? SEX_LABEL[value] || value : "";
}

// One entry per horse, e.g. "5% Trotter Colt, 8% Pacer Filly" — the
// count of horses is implicit in how many entries there are, no
// separate "how many horses" answer to also summarize alongside it.
function summarizeSpecificShareSizesByHorse(response) {
  const rows = response.specificShareSizesByHorse || [];
  if (!rows.length) return "";
  return rows.map((row) => {
    const bits = [row.percent ? `${row.percent}%` : "?"];
    if (row.gait) bits.push(SINGULAR_GAIT_LABEL[row.gait] || row.gait);
    if (row.sex) bits.push(SINGULAR_SEX_LABEL[row.sex] || row.sex);
    return bits.join(" ");
  }).join(", ");
}

function summarizePriceTierMatrix(response) {
  return selectedPriceTierRows(response).map((row) => {
    const rowGaitLabel = row.gait ? gaitLabel(row.gait) : "any gait";
    const rowSexLabel = row.sex ? sexLabel(row.sex) : "any sex";
    return `${labelFor("priceTiers", row.tier)}: ${rowGaitLabel}, ${rowSexLabel}`;
  }).join("; ");
}

function selectedPriceTierRows(response) {
  return (response.priceTierMatrix || []).filter((row) => row?.tier && row?.gait);
}

function customAnswerSummaries(response) {
  const customBlocks = currentQuestionSet().blocks.filter(
    (block) => block.type !== "bucket_config" && !block.archived && !KNOWN_SUMMARY_BLOCK_IDS.has(block.id)
  );
  return customBlocks.map((block) => {
    const value = response[block.id];
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) return "";
    const answerText = Array.isArray(value)
      ? value.map((item) => labelFor(block.id, item) || item).join(", ")
      : labelFor(block.id, value) || value;
    return `${shortTitleFor(block)}: ${answerText}`;
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

// Colt/filly is only ever chosen per horse now (on the per-horse share
// screen), not as a single upfront answer — asking for one general
// preference and then letting an owner override it per horse created
// two answers that could contradict each other. This rolls the
// per-horse choices back into one label for places (review screen,
// owner table) that show one line per sale: the shared value if every
// horse that specified one agrees, "Mixed" if they don't, or blank if
// no horse specified a preference at all.
// The owner table's rows are flattened per price-tier row when a sale
// has bucket preferences (see flattenResponses()); that flattened row
// already carries its own bucket-tier gait/sex directly (row.gait,
// row.sex), separate from any after-sale per-horse choices. Only fall
// back to the per-horse rows (via _rawResponse, which always carries
// the full, unflattened sale response) when the row itself has no
// gait/sex of its own — i.e. this is a pure after-sale row.
function gaitSummary(response) {
  if (response.gait) return gaitLabel(response.gait);
  const rows = (response._rawResponse || response).specificShareSizesByHorse || [];
  const choices = [...new Set(rows.map((row) => row.gait).filter(Boolean))];
  if (choices.length === 0) return "";
  if (choices.length === 1) return SINGULAR_GAIT_LABEL[choices[0]] || choices[0];
  return "Mixed";
}

function sexSummary(response) {
  if (response.sex) return sexLabel(response.sex);
  const rows = (response._rawResponse || response).specificShareSizesByHorse || [];
  const choices = [...new Set(rows.map((row) => row.sex).filter(Boolean))];
  if (choices.length === 0) return "";
  if (choices.length === 1) return SINGULAR_SEX_LABEL[choices[0]] || choices[0];
  return "Mixed";
}

async function submitResponse() {
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
  draft.submitting = true;
  draft.submitError = "";
  render();
  const result = await persistSubmission(response);
  draft.submitting = false;
  if (!result.ok) {
    draft.submitError = "We couldn't save your submission. Please try again. " + result.message;
    render();
    return;
  }
  const skippedSales = result.skippedSales;
  resetDraft();
  draft.view = "done";
  if (skippedSales?.length) {
    const labels = skippedSales.map((saleId) => saleById(saleId)?.label || saleId).join(", ");
    draft.submitWarning = `Your answers were saved, but ${labels} ${skippedSales.length === 1 ? "is" : "are"} not currently open for this year's intake, so ${skippedSales.length === 1 ? "that sale wasn't" : "those sales weren't"} included. Please contact TheStable if this seems wrong.`;
  }
  render();
}

function adminTabs() {
  const tabs = [
    ["dashboard", "Dashboard"],
    ["salehistory", "Sale History"],
    ["questions", "Questions Builder"],
    ...(SHOW_OWNER_ROSTER ? [["owners", "Owner Roster"]] : []),
    ["settings", "Settings"],
  ];
  return `<div class="admin-tabs">${tabs.map(([id, label]) => `<button class="admin-tab ${adminTab === id ? "active" : ""}" type="button" data-admin-tab="${id}">${label}</button>`).join("")}</div>`;
}

function backToSiteLink() {
  const accountButton = isAdminSignedIn() ? `<button class="back-to-site" type="button" id="adminAccountLink">Account</button>` : "";
  const logoutButton = isAdminSignedIn() ? `<button class="back-to-site" type="button" id="adminLogout">Log out</button>` : "";
  return `${accountButton}${logoutButton}<button class="back-to-site" type="button" id="backToSite">&larr; Back to site</button>`;
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

// Note: real responses, the owner roster, metrics history, question sets,
// exchange rate, and confirmed buckets all live in Supabase now — this
// button only clears the local in-progress intake draft in this browser.
// Clearing real data is an admin-database action, not a local browser
// reset, and isn't exposed here on purpose.
function resetDemoDataButton() {
  return `<button class="back-to-site" type="button" id="resetDemoData" title="Clears the local in-progress intake draft in this browser. Does not delete real data.">Reset local draft</button>`;
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
  document.querySelector("#adminLogout")?.addEventListener("click", async () => {
    await adminSignOut();
    mode = "owner";
    render();
  });
  document.querySelector("#adminAccountLink")?.addEventListener("click", () => {
    adminTab = "account";
    render();
  });
  const resetButton = document.querySelector("#resetDemoData");
  if (resetButton) {
    armDestructiveButton(resetButton, "Click again to confirm", () => {
      // Only DRAFT_KEY still lives in the browser — owner roster, metrics
      // history, question sets, exchange rate, and confirmed buckets all
      // moved to the database (admin_settings table), and real responses
      // live there too. This button intentionally only clears the local
      // in-progress draft now.
      [DRAFT_KEY].forEach((key) => localStorage.removeItem(key));
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

// The Questions Builder always edits the one real, live question set —
// there's no separate sandbox to experiment in. This banner (and the
// backup/restore it drives) is the safety net for that: "Start test
// mode" snapshots the live set before any test edits, then any number
// of adds/reorders/archives can be tried freely, and "Restore original
// questions" puts that exact snapshot straight back in one step.
// Whether a backup exists (not a separate in-memory flag) is the
// single source of truth for whether test mode is "on", so the banner
// and the ability to restore both survive a page refresh.
function questionSetTestModeBanner() {
  const backup = loadQuestionSetBackup();
  if (!backup) {
    return `<div class="test-mode-banner" style="background:#eef3ff;border-color:#3a5a9c;color:#1f3a6b;">
      <div class="test-mode-text"><strong>Not in test mode</strong><span>Right now, any change here goes live immediately for real owners. Click "Start test mode" first if you just want to try things out.</span></div>
      <button class="btn" type="button" id="startTestMode">Start test mode</button>
    </div>`;
  }
  const savedAt = new Date(backup.savedAt);
  const savedAtLabel = Number.isNaN(savedAt.getTime()) ? "" : savedAt.toLocaleString();
  return `<div class="test-mode-banner">
    <div class="test-mode-text"><strong>Test mode is on</strong><span>Owners can see whatever you change here right now. Your original questions were saved${savedAtLabel ? ` at ${escapeHtml(savedAtLabel)}` : ""}. Click "Restore original questions" any time to undo every test change in one step, back to exactly how it was.</span></div>
    <button class="btn red" type="button" id="restoreQuestionSetBackup" title="Click again to confirm">Restore original questions</button>
  </div>`;
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

      ${questionSetTestModeBanner()}

      <div class="ref-panel" style="margin-top: 22px;">
        <div class="panel-head">
          <div>
            <div class="tag">Blocks</div>
            <h2>Question blocks</h2>
            <p style="max-width: none;">Shown to owners in this order. A block only appears once its dependency question has been answered. "Fixed position" and "Custom-built panel" are automatic labels, not something you set yourself. "Fixed position": always first (interest, sales, jurisdictions), can't be moved. "Custom-built panel": a specific Dashboard chart reads that exact question by name (e.g. Trotter/Pacer), so archiving it empties that chart. Every question still gets its own generic Dashboard panel automatically either way.</p>
          </div>
        </div>
        <div class="panel-body">
          <div class="qb-block-list">
            ${orderedBlocks.map((block) => questionBlockRow(block, reorderableBlocks(questionSet.blocks))).join("") || `<p class="notice">No blocks yet. Add one below.</p>`}
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
            <p>Hidden from owners and not shown on the Dashboard, but nothing is lost. Restore any of these any time.</p>
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
            <p>These bucket names appear as the answer choices owners pick from on the intake questionnaire, whenever their plan includes a pre-sale bucket. Renaming or adding one here changes what owners see there immediately.</p>
          </div>
        </div>
        <div class="panel-body">
          ${bucketConfigEditor(bucketConfig)}
        </div>
      </div>

      ${SHOW_CONFIRMED_BUCKETS ? `
      <div class="ref-panel" style="margin-top: 18px;">
        <div class="panel-head">
          <div>
            <div class="tag">Confirmed offer</div>
            <h2>Confirmed buckets</h2>
            <p>The buckets TheStable is actually going to offer this sale year. Decide these after reviewing demand on the Dashboard's "Suggested buckets to offer" panel. This is separate from the bucket options above, which drive what owners see in the intake form. This list is just for planning, and shows on the Dashboard as the finalized offer. Add as many as you need.</p>
          </div>
        </div>
        <div class="panel-body">
          ${confirmedBucketsEditor(getConfirmedBuckets("default"))}
        </div>
      </div>` : ""}
    </div>
    </div>`;

  bindAdminTabs();
  bindQuestionsAdmin(questionSet);
}

function renderAdminSettings() {
  app.innerHTML = `
    <div class="refskin">
    <div class="wrap">
      <div class="refskin-topbar">${adminTabs()}<div class="topbar-right">${backToSiteLink()}</div></div>

      ${adminMasthead("Settings")}

      <p class="dek">System-wide settings that aren't tied to one specific sale year's questions. Currently just the CAD/USD conversion rate.</p>

      <div class="ref-panel" style="margin-top: 22px; max-width: 480px;">
        <div class="panel-head">
          <div>
            <div class="tag">Exchange rate</div>
            <h2>CAD / USD conversion rate</h2>
            <p>Used by the CAD/USD switch on the Dashboard page. The Sale History page's historical figures use each sale year's own real rate instead, see that page for details. This rate is not live. Update it here whenever the actual current rate has moved and you want the Dashboard's USD figures to reflect that.</p>
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
  const rateInput = document.querySelector("#exchangeRateInput");
  if (rateInput) {
    rateInput.addEventListener("change", () => {
      const cadPerUsd = Number(rateInput.value);
      if (!Number.isFinite(cadPerUsd) || cadPerUsd <= 0) {
        rateInput.value = (1 / getExchangeRate()).toFixed(4);
        return;
      }
      saveExchangeRate(1 / cadPerUsd).catch((err) => console.error("Failed to save exchange rate:", err));
      render();
    });
  }
}

function questionBlockRow(block, reorderable) {
  const expanded = questionsEditorState.expandedBlockId === block.id;
  const dashboardImpact = CORE_QUESTION_DASHBOARD_IMPACT[block.id];
  const archiveTitle = dashboardImpact
    ? `Archiving this also affects ${dashboardImpact} on the Dashboard`
    : "Hides this question from owners and its Dashboard panel (if any). Restore any time from Archived questions below.";
  // interest/sales/eligibility always run first, in that fixed order —
  // later parts of the flow depend on it — so they can't be reordered or
  // archived here, only their question text/help/options edited.
  let controls;
  if (block.fixedPosition) {
    controls = `<span class="qb-fixed-flag" title="This question always appears first, in a fixed order. Its text and options can be edited, but not its position.">Fixed position</span>`;
  } else {
    const index = reorderable.findIndex((b) => b.id === block.id);
    // Disabled not just at the array ends, but also right at a
    // dependency boundary — e.g. "priceTierMatrix" can't move above
    // "participation" (the question it depends on) even though
    // participation isn't fixedPosition, since owners would then never
    // see it (see blockSwapAllowed()). Without this the arrow looked
    // clickable but silently did nothing at that boundary.
    const upDisabled = index <= 0 || !blockSwapAllowed(reorderable, index, index - 1);
    const downDisabled = index === -1 || index >= reorderable.length - 1 || !blockSwapAllowed(reorderable, index, index + 1);
    controls = `<button class="btn" type="button" data-move-block="${block.id}" data-dir="up" ${upDisabled ? "disabled" : ""} title="Move up">&uarr;</button>
       <button class="btn" type="button" data-move-block="${block.id}" data-dir="down" ${downDisabled ? "disabled" : ""} title="Move down">&darr;</button>
       <button class="btn red" type="button" data-remove-block="${block.id}" title="${escapeHtml(archiveTitle)}">Archive</button>`;
  }
  return `
    <div class="qb-block ${expanded ? "expanded" : ""}">
      <div class="qb-block-head" data-toggle-block="${block.id}">
        <div class="qb-block-title">
          <strong>${escapeHtml(block.label || "(untitled question)")}</strong>
          <span class="qb-block-type">${blockTypeLabel(block.type)}</span>
          ${dashboardImpact ? `<span class="qb-core-flag" title="A specifically-built Dashboard chart reads this exact question: ${escapeHtml(dashboardImpact)}. Archiving it empties that chart, unlike a question you added yourself, which always gets its own generic panel automatically.">Custom-built panel</span>` : ""}
        </div>
        <div class="qb-block-controls">
          ${controls}
        </div>
      </div>
      ${expanded ? questionBlockEditor(block) : ""}
    </div>`;
}

function questionBlockEditor(block) {
  const optionsEditor = block.id === "bucketTypes"
    ? `<p class="notice">This question's choices always match the buckets configured in the "Bucket options" section below. Edit the bucket names there instead.</p>`
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
        <span class="qb-field-label">Short title for the Dashboard (optional)</span>
        <input class="input" data-block-short-title="${block.id}" value="${escapeHtml(block.shortTitle || "")}" placeholder="e.g. Repeat buyer? A few words, not the full question">
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
        </div>`).join("") : `<p class="notice">No confirmed buckets yet. Add one below once you've decided what to offer.</p>`}
    </div>
    <button class="btn" type="button" data-add-confirmed>Add confirmed bucket</button>`;
}

// Price/suggestedPrice fields on a bucket are stored but not read or
// shown anywhere else in the app yet (owners only ever see name/help via
// bucketConfigOptionRows()) — hidden from this editor for now so it
// doesn't look like filling in a price does something it doesn't. The
// data itself is untouched; re-add the inputs here if/when a real use
// for a per-bucket price is built.
function bucketConfigEditor(bucketConfig) {
  if (!bucketConfig) return `<p class="notice">No bucket configuration on this question set.</p>`;
  return `
    <div class="qb-bucket-list">
      ${bucketConfig.buckets.map((bucket, i) => `
        <div class="qb-bucket-row">
          <input class="input" data-bucket-name="${i}" value="${escapeHtml(bucket.name)}" placeholder="Bucket name">
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
  sales: "the \"Interest by sale\" panel and every sale-scoped figure on the Dashboard",
  participation: "the \"Suggested buckets to offer\" panel and the pre-sale/after-sale split",
  gait: "the \"Trotter vs. Pacer\" panel and the Gait column in Owner detail",
  priceTierMatrix: "the \"Price tier mix\" panel and \"Suggested buckets to offer\"",
  specificShareSizesByHorse: "the \"After-sale individual shares\" panel and the Colt/Filly column in Owner detail",
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

// Restoring only ever flipped `archived` back to false, leaving the
// block's sortOrder exactly as it was the moment it got archived —
// whatever that happened to be (e.g. a low or even negative value from
// whenever it was first created, well before ever being archived).
// That could restore it back in among, or even before, the
// fixedPosition blocks, which must always stay first — restoring a
// question should never be able to displace those. Now it's placed at
// the end of the reorderable list instead (the same safe default a
// brand new block gets — see the "Add a block" handler below), then
// the whole list is renumbered to clean sequential values, same
// pattern the move handler already uses.
function restoreQuestionBlock(id) {
  updateQuestionSet((set) => {
    const block = set.blocks.find((b) => b.id === id);
    if (!block) return;
    block.archived = false;
    const ordered = reorderableBlocks(set.blocks);
    const withoutRestored = ordered.filter((b) => b.id !== id);
    withoutRestored.push(block);
    withoutRestored.forEach((b, i) => { b.sortOrder = (i + 1) * 10; });
  });
}

// The reorderable subset used by the up/down arrows: excludes
// bucket_config (always pinned last, sortOrder 100, no arrows of its
// own) and fixedPosition blocks (interest/sales/eligibility — always
// first, no arrows of their own either). Keeping both out of this list
// means a move can never accidentally swap sortOrder with one of them.
function reorderableBlocks(blocks) {
  return [...blocks].filter((b) => b.type !== "bucket_config" && !b.fixedPosition && !b.archived).sort((a, b) => a.sortOrder - b.sortOrder);
}

function blockDependsOnIds(block) {
  if (!block.dependsOn) return [];
  const conditions = Array.isArray(block.dependsOn) ? block.dependsOn : [block.dependsOn];
  return conditions.map((c) => c.blockId);
}

// A block can only ever be shown to an owner after the block(s) it
// dependsOn — see blockReachable() in questions.js, which requires the
// parent to already be visible (i.e. earlier in sortOrder) before a
// dependent block can appear at all. Swapping two positions in the
// Questions Builder must never let a block end up ahead of something
// it depends on (it would silently stop appearing to owners, with no
// error anywhere) or behind something that depends on it (same problem,
// the other direction). Checked against the *whole* reorderable list,
// not just the two blocks trading places, since a block further down
// the list can depend on either one of them.
function blockSwapAllowed(ordered, index, swapWith) {
  // Simulate the swap on a copy and check every block's dependsOn is
  // still satisfied position-wise (its parent(s) still come before it).
  const simulated = [...ordered];
  [simulated[index], simulated[swapWith]] = [simulated[swapWith], simulated[index]];
  const positionOf = new Map(simulated.map((block, i) => [block.id, i]));
  return simulated.every((block) => {
    const parentIds = blockDependsOnIds(block);
    return parentIds.every((parentId) => {
      const parentPos = positionOf.get(parentId);
      // A parent outside the reorderable set (fixedPosition, e.g.
      // "participation" never depends on one of those today, but stay
      // safe) is always earlier by construction — nothing to check.
      if (parentPos === undefined) return true;
      return parentPos < positionOf.get(block.id);
    });
  });
}

// Applies mutator to a FRESH read of the question set and saves it back
// with an optimistic-concurrency check (see saveQuestionSetsIfUnchanged
// in questions.js), retrying the whole read-mutate-save cycle if the
// database row changed underneath it. Two admin sessions (Robert, or
// later Anthony/Kelly) editing Questions Builder at the same time each
// hold their own in-memory copy AND their own independent in-process
// queue (see below) — neither session can see the other session's
// queue, so serializing turns only within one session's queue is not
// enough on its own: both sessions can read-fresh before either has
// saved. Confirmed directly with a real two-tab test (test_11d) that
// this exact scenario silently lost one tab's edit even after the
// in-process queue below was added. The fix has to be enforced by the
// database itself, not by anything either browser tab can decide alone
// — hence the conditional update keyed on admin_settings.updated_at:
// it only succeeds if updated_at is STILL exactly what this turn read,
// i.e. nothing else wrote in between. If another session's save landed
// first, the conditional write matches zero rows, this turn re-reads
// the newest data and reruns the mutator against THAT, and retries —
// so both edits survive as long as they don't touch the exact same
// block/field (two admins each adding their own new question both end
// up in the final set; two admins editing the SAME block's label at
// the exact same instant still has one win, since that's a genuine
// conflict with no correct merge, but that's a much narrower window
// than silently losing an entire unrelated edit).
//
// This requires every mutator passed here to read/write only through
// its `set` parameter, never close over blocks from an outer
// currentQuestionSet() call, and to be safe to run MORE THAN ONCE (a
// retry re-invokes it against newer data) — see the move-block handler
// above for why that matters, and why newBlockId() calls were moved
// outside every mutator (Math.random()-based, so calling it inside a
// mutator that might retry would generate a different id each time).
//
// Per-session turns are still serialized through a local queue on top
// of this, purely so that several rapid clicks in the SAME tab (e.g.
// clicking "add block" five times fast) apply and render in the order
// they were clicked instead of their retries interleaving unpredictably
// — the cross-session correctness comes entirely from the database
// check above, not from this queue.
let questionSetSaveQueue = Promise.resolve();

async function saveQuestionSetWithRetry(mutator, attemptsLeft = 5) {
  const { sets: freshSets, updatedAt } = await loadQuestionSetsFresh();
  const freshQuestionSet = freshSets["default"] ? withFixedPositionBlocksBackfilled(freshSets["default"]) : defaultQuestionSet();
  mutator(freshQuestionSet);
  const sets = { ...freshSets, default: freshQuestionSet };
  const result = await saveQuestionSetsIfUnchanged(sets, updatedAt);
  if (result.ok) {
    adminSettingsCache["question_sets"] = sets;
    render();
    return;
  }
  if (attemptsLeft <= 1) {
    console.error("saveQuestionSetWithRetry: giving up after repeated concurrent-write conflicts");
    adminSettingsCache["question_sets"] = sets;
    render();
    return;
  }
  await saveQuestionSetWithRetry(mutator, attemptsLeft - 1);
}

function updateQuestionSet(mutator) {
  questionSetSaveQueue = questionSetSaveQueue
    .catch(() => {}) // a previous failure must not block this turn from even attempting
    .then(() => saveQuestionSetWithRetry(mutator))
    .catch((err) => console.error("Failed to save question set:", err));
}

function bindQuestionsAdmin(questionSet) {
  document.querySelector("#startTestMode")?.addEventListener("click", async () => {
    await startQuestionSetTestMode();
    render();
  });

  const restoreButton = document.querySelector("#restoreQuestionSetBackup");
  if (restoreButton) {
    armDestructiveButton(restoreButton, "Click again to confirm", async () => {
      await restoreQuestionSetBackup();
      render();
    });
  }

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
      // The bounds/dependency check runs here, BEFORE updateQuestionSet
      // is even called, rather than as an early-return inside its
      // mutator — updateQuestionSet always writes to the database once
      // its mutator has run, whether or not that mutator actually
      // changed anything. Calling it for a no-op move would still fire
      // a real (if harmless) background save, which only wastes a
      // write in normal use but can race a legitimate save landing
      // right after it (e.g. an admin's next action, or a test/QA
      // script restoring a known state) since neither one is awaited
      // against the other. This check runs against the current
      // (possibly soon-to-be-stale) local copy purely to decide whether
      // to show the confirmation at all — updateQuestionSet's mutator
      // below re-derives everything from the block being moved by id,
      // not from this outer `ordered` array, so it stays correct even
      // if a concurrent edit from another admin session lands between
      // this check and the actual save (see updateQuestionSet's own
      // comment for why that matters).
      const orderedForCheck = reorderableBlocks(currentQuestionSet().blocks);
      const checkIndex = orderedForCheck.findIndex((b) => b.id === id);
      const checkSwapWith = dir === "up" ? checkIndex - 1 : checkIndex + 1;
      if (checkIndex === -1 || checkSwapWith < 0 || checkSwapWith >= orderedForCheck.length) return;
      if (!blockSwapAllowed(orderedForCheck, checkIndex, checkSwapWith)) return;
      updateQuestionSet((set) => {
        const ordered = reorderableBlocks(set.blocks);
        const index = ordered.findIndex((b) => b.id === id);
        const swapWith = dir === "up" ? index - 1 : index + 1;
        // Re-validated against whatever set this mutator actually ends
        // up running against (the fresh, just-re-read one) - a
        // concurrent edit from another session could have archived this
        // block, moved it, or changed what it dependsOn since the
        // check above ran.
        if (index === -1 || swapWith < 0 || swapWith >= ordered.length) return;
        if (!blockSwapAllowed(ordered, index, swapWith)) return;
        [ordered[index], ordered[swapWith]] = [ordered[swapWith], ordered[index]];
        // Always renumber to clean, unique sequential values instead of
        // swapping sortOrder numbers in place — swapping alone is a no-op
        // whenever two blocks already share a sortOrder (which has
        // happened before), silently leaving the up/down arrow doing
        // nothing. Renumbering after every move also makes ties
        // impossible going forward. Starts at 10 (not 0) to stay clear
        // of fixedPosition blocks' negative sortOrders.
        ordered.forEach((block, i) => { block.sortOrder = (i + 1) * 10; });
      });
    });
  });

  document.querySelectorAll("[data-remove-block]").forEach((el) => {
    const id = el.getAttribute("data-remove-block");
    const confirmLabel = CORE_QUESTION_DASHBOARD_IMPACT[id] ? "This affects a Dashboard panel. Archive anyway?" : "Confirm archive?";
    armDestructiveButton(el, confirmLabel, () => archiveQuestionBlock(id));
  });

  document.querySelectorAll("[data-restore-block]").forEach((el) => {
    el.addEventListener("click", () => restoreQuestionBlock(el.getAttribute("data-restore-block")));
  });

  document.querySelectorAll("[data-add-block-type]").forEach((el) => {
    el.addEventListener("click", () => {
      const type = el.getAttribute("data-add-block-type");
      // Generated ONCE, outside the mutator: updateQuestionSet() now
      // runs its mutator twice (once against the local copy for an
      // instant render, once against a freshly-read copy right before
      // saving — see its own comment for why). newBlockId() is random,
      // so calling it a second time inside the mutator would give the
      // saved block a different id than the one just rendered locally,
      // silently desyncing the UI (questionsEditorState.expandedBlockId
      // below, and the id itself) from what's actually in the database.
      const id = newBlockId(type);
      updateQuestionSet((set) => {
        const maxSort = Math.max(0, ...set.blocks.filter((b) => b.type !== "bucket_config").map((b) => b.sortOrder));
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

  document.querySelectorAll("[data-block-short-title]").forEach((el) => {
    el.addEventListener("change", () => {
      const id = el.getAttribute("data-block-short-title");
      updateQuestionSet((set) => {
        const block = set.blocks.find((b) => b.id === id);
        if (block) block.shortTitle = el.value;
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
      // Generated once, outside the mutator - same reason as the
      // "add block" handler above (newBlockId() is random).
      const newBucketKey = newBlockId("bucket");
      updateQuestionSet((set) => {
        const bucketConfig = set.blocks.find((b) => b.type === "bucket_config");
        if (!bucketConfig) return;
        bucketConfig.buckets.push({ key: newBucketKey, name: "New bucket", help: "", price: null, suggestedPrice: null });
      });
    });
  }

  const updateConfirmed = (mutator) => {
    const buckets = getConfirmedBuckets("default");
    mutator(buckets);
    saveConfirmedBucketsFor("default", buckets).catch((err) => console.error("Failed to save confirmed buckets:", err));
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
}

// ===== Sale History & Bucket Strategy admin tab =====
// A historical look at every yearling sold at Lexington Selected,
// Harrisburg Book 1&2, and Ohio Jug from 2014 through 2023 (2014 is the
// first year Ohio Jug has any data at all; 2024/2025 are excluded because
// their horses' 2yo/3yo seasons aren't over yet), checked against which
// of them went on to become a top performer. All figures below are
// computed directly from the real JUVENIQ database
// (sale_results/top_performers tables) using the methodology in that
// project's JUVENIQ_REGELS_EN_PLAN.md — not sample/placeholder data, and
// not the earlier 2008-2025 version of this page, which silently gave
// Lexington/Harrisburg years of data Ohio could never have and matched
// horse names to top-performer appearances without checking the season
// was actually the right one for that horse's age.
// Client-side currency toggle, ported verbatim from the reference artifact's
// own applyCurrency()/fmtK()/fmtFull() JS (see bindCurrencyToggle() below):
// every money figure renders once, in CAD, carrying data-cad/data-usd/
// data-style attributes, and a page-level click handler on .ccy-btn walks
// the DOM and rewrites .money/.money-range text in place - no server-side
// re-render on toggle, exactly like the reference.
function saleHistoryFxNote() {
  return `<span class="ccy-fx-note">using each sale year's actual historical annual-average exchange rate (Bank of Canada), not a single fixed rate</span>`;
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
            <button class="ccy-btn${selectedCurrency === "usd" ? " active" : ""}" data-ccy="usd" type="button">USD $</button>
            <button class="ccy-btn${selectedCurrency === "cad" ? " active" : ""}" data-ccy="cad" type="button">CAD $</button>
          </div>`)}

      <div class="page-title-row">
        <h1>What past sales tell us about building a bucket</h1>
        <div class="as-of">Analysis run <strong>Sep 3, 2026</strong></div>
      </div>
      <div class="intro-block">
        <p class="dek">This page looks back at every yearling sold at Lexington Selected, Harrisburg Book 1&amp;2, and Ohio Jug from 2014 through 2023, and checks which of them later became a top performer. The goal: help TheStable.ca decide how many horses to put in a bucket, and at what price range, based on real past results instead of gut feel alone. The same numbers apply to after-sale horses sold individually at a similar price. Important: this shows patterns in the past. It is not a prediction about any specific 2026 yearling.</p>
        <div class="definition-card"><b>What counts as a "top performer" here:</b> a horse that appeared on a season top-earner leaderboard as a 2- or 3-year-old, in the correct season after it was sold. Nothing more, nothing less. It doesn't matter how much that horse earned or how old it was when it first got there. This is a simple yes/no flag, checked carefully so a horse with the same name sold in a different year is never counted by mistake. This dataset has 1,858 reused horse names, so that check matters.</div>
      </div>

      <div class="dash-panel">
        <div class="dash-eyebrow"><span class="dot"></span>The short version, at a glance</div>
        <div class="dash-grid">

          <div class="dash-card">
            <div class="dc-label">Odds of becoming a top performer, by price</div>
            <div class="curve-row">
              <div class="curve-bar-wrap"><div class="curve-bar-val">0.55</div><div class="curve-bar-track"><div class="curve-bar" style="height:6%"></div></div><div class="curve-bar-price">&lt;${shMoney(19313, 15000)}</div></div>
              <div class="curve-bar-wrap"><div class="curve-bar-val">1.6</div><div class="curve-bar-track"><div class="curve-bar" style="height:16%"></div></div><div class="curve-bar-price">${shMoneyRange(19313, 38626, 15000, 30000)}</div></div>
              <div class="curve-bar-wrap"><div class="curve-bar-val">2.5</div><div class="curve-bar-track"><div class="curve-bar" style="height:25%"></div></div><div class="curve-bar-price">${shMoneyRange(38626, 64376, 30000, 50000)}</div></div>
              <div class="curve-bar-wrap"><div class="curve-bar-val">4.6</div><div class="curve-bar-track"><div class="curve-bar" style="height:47%"></div></div><div class="curve-bar-price">${shMoneyRange(64376, 96564, 50000, 75000)}</div></div>
              <div class="curve-bar-wrap"><div class="curve-bar-val">4.8</div><div class="curve-bar-track"><div class="curve-bar" style="height:49%"></div></div><div class="curve-bar-price">${shMoneyRange(96564, 128752, 75000, 100000)}</div></div>
              <div class="curve-bar-wrap"><div class="curve-bar-val">6.2</div><div class="curve-bar-track"><div class="curve-bar" style="height:63%"></div></div><div class="curve-bar-price">${shMoneyRange(128752, 160940, 100000, 125000)}</div></div>
              <div class="curve-bar-wrap"><div class="curve-bar-val">7.6</div><div class="curve-bar-track"><div class="curve-bar" style="height:77%"></div></div><div class="curve-bar-price">${shMoneyRange(160940, 193128, 125000, 150000)}</div></div>
              <div class="curve-bar-wrap"><div class="curve-bar-val">9.8</div><div class="curve-bar-track"><div class="curve-bar last" style="height:100%"></div></div><div class="curve-bar-price">${shMoney(193128, 150000, "k", "+")}</div></div>
            </div>
            <div class="curve-foot">All top figures are %. Cheapest horses: <b>0.55%</b> became a top performer. Priciest: <b>9.8%</b> did. Bands are sized around TheStable's realistic buying range. Most yearlings TheStable considers sell for under ${shMoney(193128, 150000)}.</div>
          </div>

          <div class="dash-card">
            <div class="dc-label">Colt vs. filly: who makes up the top performers</div>
            <div class="ring-wrap">
              <div class="ring ring-solid" style="background: conic-gradient(var(--gold-light) 0% 56.0%, #d8dee8 56.0% 100%)"></div>
              <div class="ring-legend">
                <div class="rl-row"><span class="rl-dot" style="background:var(--gold-light)"></span>Colt <b>56.0%</b></div>
                <div class="rl-row"><span class="rl-dot" style="background:#d8dee8"></span>Filly <b>44.0%</b></div>
              </div>
            </div>
            <div class="curve-foot" style="margin-top:16px;">Out of every 100 top performers, 56 were colts and 44 were fillies. That's because colts also have better odds individually: 3.3% of colts sold became a top performer, vs. 2.3% of fillies, across all three sales combined. See the sale-by-sale table below for whether that holds at every individual venue.</div>
          </div>

          <div class="dash-card">
            <div class="dc-label">Trotter vs. pacer: who makes up the top performers</div>
            <div class="ring-wrap">
              <div class="ring ring-solid" style="background: conic-gradient(var(--gold-light) 0% 52.5%, #d8dee8 52.5% 100%)"></div>
              <div class="ring-legend">
                <div class="rl-row"><span class="rl-dot" style="background:var(--gold-light)"></span>Trotter <b>52.5%</b></div>
                <div class="rl-row"><span class="rl-dot" style="background:#d8dee8"></span>Pacer <b>47.5%</b></div>
              </div>
            </div>
            <div class="curve-foot" style="margin-top:16px;">Roughly an even split between trotters and pacers among top performers, across all 3 sales combined. Individually, trotters have a slightly better per-horse chance (2.9% vs. 2.7% for pacers), but it isn't consistent at every venue. See the sale-by-sale table below.</div>
          </div>

          <div class="dash-card" style="grid-column: span 3;">
            <div class="dc-label">Example: splitting one budget several ways</div>
            <div class="verdict-num">5 horses</div>
            <div class="verdict-sub">For a ${shMoney(103000, 80000, "full")} ${shCcyLabel()} budget specifically, splitting it into 5 horses around ${shMoney(20600, 16000)} each gives <b style="color:#fff">7.7%</b> odds of landing at least one top performer. This is one example, not a general rule. See "One horse or several: building a bucket" below for why the best split size changes with the budget.</div>
            <div class="mini-bars" style="margin-top:14px;">
              <div class="mini-bar-wrap"><div class="mini-bar-val">4.8%</div><div class="mini-bar" style="height:62%; background:#e8ebf0"></div><div class="mini-bar-name">1 horse</div></div>
              <div class="mini-bar-wrap"><div class="mini-bar-val">4.9%</div><div class="mini-bar" style="height:64%; background:#c7cede"></div><div class="mini-bar-name">2 horses</div></div>
              <div class="mini-bar-wrap"><div class="mini-bar-val">4.7%</div><div class="mini-bar" style="height:61%; background:#a6b1c9"></div><div class="mini-bar-name">3 horses</div></div>
              <div class="mini-bar-wrap"><div class="mini-bar-val">6.2%</div><div class="mini-bar" style="height:81%; background:#8592b0"></div><div class="mini-bar-name">4 horses</div></div>
              <div class="mini-bar-wrap"><div class="mini-bar-val">7.7%</div><div class="mini-bar" style="height:100%; background:var(--gold)"></div><div class="mini-bar-name">5 horses</div></div>
            </div>
            <div class="curve-foot" style="margin-top:10px;"><b>What this percentage does and doesn't mean:</b> it's the chance that at least one of the horses becomes a top performer. It is not a prediction of how much of the bucket's money that one horse represents, and not a guarantee of profit. With 5 horses, a "win" can be just 1 of the 5 hitting. The other 4 may not. This assumes each horse's chance is independent of the others, which won't always hold exactly. Horses from the same bloodline or consignor, for instance, aren't fully independent bets.</div>
          </div>
          </div>

        </div>
      </div>

      <div class="meta-strip">
        <div class="meta-tile"><div class="n">2014&ndash;2023</div><div class="l">Years of sale data used (all 3 sales, same period)</div></div>
        <div class="meta-tile"><div class="n">24,676</div><div class="l">Yearlings sold across the 3 sales in this study</div></div>
        <div class="meta-tile"><div class="n">658</div><div class="l">Of those went on to become a top earner</div></div>
        <div class="meta-tile"><div class="n">1 in 37</div><div class="l">Overall odds a yearling becomes a top performer</div></div>
      </div>

      <section class="block">
        <h2 class="section-title">How much does price matter?</h2>
        <p class="section-lead">Every yearling sold either did or didn't go on to become a top earner later in its racing career. This splits all of them into price groups and shows what share of each group actually made it. Read the ${shMoney(160940, 125000)}&ndash;${shMoney(193128, 150000)} bar as: about 1 in 13 horses bought in that price range went on to become a top performer.</p>
        <div class="ref-panel">
          <div class="band-chart">
            <div class="band-row"><div class="label">Under ${shMoney(19313, 15000)}</div><div class="band-track"><span style="width:6%; background:var(--band-1)"></span></div><div class="figs"><div class="pct">0.55%</div><div class="cnt">35 of 6,414</div></div></div>
            <div class="band-row"><div class="label">${shMoney(19313, 15000)} &ndash; ${shMoney(38626, 30000)}</div><div class="band-track"><span style="width:16%; background:var(--band-2)"></span></div><div class="figs"><div class="pct">1.6%</div><div class="cnt">111 of 6,924</div></div></div>
            <div class="band-row"><div class="label">${shMoney(38626, 30000)} &ndash; ${shMoney(64376, 50000)}</div><div class="band-track"><span style="width:25%; background:var(--band-3)"></span></div><div class="figs"><div class="pct">2.5%</div><div class="cnt">114 of 4,602</div></div></div>
            <div class="band-row"><div class="label">${shMoney(64376, 50000)} &ndash; ${shMoney(96564, 75000)}</div><div class="band-track"><span style="width:47%; background:var(--band-4)"></span></div><div class="figs"><div class="pct">4.6%</div><div class="cnt">134 of 2,913</div></div></div>
            <div class="band-row"><div class="label">${shMoney(96564, 75000)} &ndash; ${shMoney(128752, 100000)}</div><div class="band-track"><span style="width:49%; background:var(--band-5)"></span></div><div class="figs"><div class="pct">4.8%</div><div class="cnt">66 of 1,379</div></div></div>
            <div class="band-row"><div class="label">${shMoney(128752, 100000)} &ndash; ${shMoney(160940, 125000)}</div><div class="band-track"><span style="width:63%; background:var(--band-6)"></span></div><div class="figs"><div class="pct">6.2%</div><div class="cnt">58 of 940</div></div></div>
            <div class="band-row"><div class="label">${shMoney(160940, 125000)} &ndash; ${shMoney(193128, 150000)}</div><div class="band-track"><span style="width:77%; background:var(--band-7)"></span></div><div class="figs"><div class="pct">7.6%</div><div class="cnt">27 of 354</div></div></div>
            <div class="band-row"><div class="label">${shMoney(193128, 150000, "k", "+")}</div><div class="band-track"><span style="width:100%; background:var(--band-8)"></span></div><div class="figs"><div class="pct">9.8%</div><div class="cnt">113 of 1,150</div></div></div>
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
                <div class="versus-side"><div class="pct win">56.0%</div><div class="name">Colt</div><div class="n">3.3% odds per horse sold</div></div>
                <div class="versus-vs">VS</div>
                <div class="versus-side"><div class="pct">44.0%</div><div class="name">Filly</div><div class="n">2.3% odds per horse sold</div></div>
              </div>
            </div>
            <div class="totals-card">
              <div class="ttl">Trotter vs. Pacer: share of top performers</div>
              <div class="versus-row">
                <div class="versus-side"><div class="pct win">52.5%</div><div class="name">Trotter</div><div class="n">2.9% odds per horse sold</div></div>
                <div class="versus-vs">VS</div>
                <div class="versus-side"><div class="pct">47.5%</div><div class="name">Pacer</div><div class="n">2.7% odds per horse sold</div></div>
              </div>
            </div>
          </div>
          <p style="font-size:13px; color:var(--ink-soft); margin:18px 0 0; line-height:1.6;">Colts make up 56% of top performers, fillies the other 44%. That's partly because colts were sold in slightly bigger numbers to begin with, and partly because an individual colt has better odds (3.3% vs. 2.3% for fillies) across the combined data. Trotter vs. pacer is close to an even split, and (as the sale-by-sale table further down shows) which one edges ahead isn't consistent at every venue.</p>
        </div>
      </section>

      <section class="block">
        <h2 class="section-title">Does the colt/filly or trotter/pacer pattern hold at every price?</h2>
        <p class="section-lead">The table below combines price with sex and gait. Each cell shows what share of horses in that exact group (say, "pacer colts priced ${shMoney(96564, 75000)}&ndash;${shMoney(128752, 100000)}") became a top performer. Green numbers are the strongest cell in that price column.</p>
        <div class="ref-panel">
          <div class="matrix-grid" style="grid-template-columns: 118px repeat(6, 1fr);">
            <div class="hdr" style="background:transparent"></div>
            <div class="hdr">Under ${shMoney(38626, 30000)}</div>
            <div class="hdr">${shMoney(38626, 30000)}&ndash;${shMoney(64376, 50000)}</div>
            <div class="hdr">${shMoney(64376, 50000)}&ndash;${shMoney(96564, 75000)}</div>
            <div class="hdr">${shMoney(96564, 75000)}&ndash;${shMoney(128752, 100000)}</div>
            <div class="hdr">${shMoney(128752, 100000)}&ndash;${shMoney(193128, 150000)}</div>
            <div class="hdr">${shMoney(193128, 150000, "k", "+")}</div>
          </div>
          <div class="matrix-grid" style="margin-top:2px; grid-template-columns: 118px repeat(6, 1fr);">
            <div class="row-hdr">Trotter colt</div>
            <div class="cell"><div class="pct">1.39%</div><div class="n">41 of 2,940</div></div>
            <div class="cell hi"><div class="pct">3.12%</div><div class="n">32 of 1,027</div></div>
            <div class="cell hi"><div class="pct">5.40%</div><div class="n">34 of 630</div></div>
            <div class="cell"><div class="pct">4.47%</div><div class="n">13 of 291</div></div>
            <div class="cell hi"><div class="pct">9.20%</div><div class="n">30 of 326</div></div>
            <div class="cell hi"><div class="pct">12.26%</div><div class="n">39 of 318</div></div>

            <div class="row-hdr">Trotter filly</div>
            <div class="cell"><div class="pct">1.04%</div><div class="n">33 of 3,170</div></div>
            <div class="cell"><div class="pct">2.32%</div><div class="n">26 of 1,120</div></div>
            <div class="cell"><div class="pct">4.24%</div><div class="n">31 of 731</div></div>
            <div class="cell"><div class="pct">3.90%</div><div class="n">13 of 333</div></div>
            <div class="cell"><div class="pct">5.26%</div><div class="n">17 of 323</div></div>
            <div class="cell"><div class="pct">9.04%</div><div class="n">35 of 387</div></div>

            <div class="row-hdr">Pacer colt</div>
            <div class="cell hi"><div class="pct">1.70%</div><div class="n">42 of 2,473</div></div>
            <div class="cell"><div class="pct">2.73%</div><div class="n">29 of 1,062</div></div>
            <div class="cell"><div class="pct">4.91%</div><div class="n">36 of 733</div></div>
            <div class="cell hi"><div class="pct">6.84%</div><div class="n">27 of 395</div></div>
            <div class="cell"><div class="pct">6.48%</div><div class="n">23 of 355</div></div>
            <div class="cell"><div class="pct">11.16%</div><div class="n">25 of 224</div></div>

            <div class="row-hdr">Pacer filly</div>
            <div class="cell"><div class="pct">0.85%</div><div class="n">30 of 3,523</div></div>
            <div class="cell"><div class="pct">2.38%</div><div class="n">27 of 1,135</div></div>
            <div class="cell"><div class="pct">4.67%</div><div class="n">33 of 706</div></div>
            <div class="cell"><div class="pct">4.26%</div><div class="n">13 of 305</div></div>
            <div class="cell"><div class="pct">5.70%</div><div class="n">15 of 263</div></div>
            <div class="cell"><div class="pct">6.93%</div><div class="n">14 of 202</div></div>
          </div>
          <p style="font-size:13px; color:var(--ink-soft); margin:16px 0 0; line-height:1.6;">Each cell shows "X of Y": X horses became a top performer, out of Y sold in that exact price/sex/gait group. Trotter colts hold the edge at the higher end of the range, and pacer colts at the cheap end and around ${shMoney(96564, 75000)}&ndash;${shMoney(128752, 100000)}. <b>The right-hand column (above ${shMoney(193128, 150000)}) is built on 202-387 horses per cell.</b> That's enough to be a reasonable signal, but still narrower than the cheaper columns, so treat it as a bit less precise than the rest of the table.</p>
          <p style="font-size:13px; color:var(--ink-soft); margin:10px 0 0; line-height:1.6;"><b style="color:var(--ink);">Why do fillies score noticeably lower than colts even where the horse counts are similar?</b> Take ${shMoney(128752, 100000)}&ndash;${shMoney(193128, 150000)}: trotter colts and trotter fillies were sold in almost the same numbers (326 vs. 323). But 30 of the 326 colts went on to become a top performer, against only 17 of the 323 fillies. That's nearly twice as many, out of nearly the same group size. This isn't a group-size effect. It's a real difference in how many of each actually became a top performer. The same pattern repeats in most other columns of this table too.</p>
        </div>
      </section>

      <section class="block">
        <h2 class="section-title">How old was the horse when it became a top performer?</h2>
        <p class="section-lead">A horse can show up on the leaderboard as a 2-year-old, a 3-year-old, or older ("aged," 4 and up). All three count as "top performer" everywhere else on this page. Split apart, the percentages below show how often each price group produced a top performer at that specific age. The odds drop the longer it takes.</p>
        <p class="currency-note">This section only uses sale years 2014-2022, not 2014-2023 like the rest of the page. Confirming "became a top performer at 4+" needs that horse's age-4 season to be over, which for a 2023 yearling won't happen until 2027. 2023 sales are excluded here so every figure reflects a fully-closed outcome, not a still-pending one.</p>
        <div class="ref-panel">
          <div class="matrix-grid" style="grid-template-columns: 150px repeat(5, 1fr);">
            <div class="hdr" style="background:transparent"></div>
            <div class="hdr">Under ${shMoney(38626, 30000)}</div>
            <div class="hdr">${shMoney(38626, 30000)}&ndash;${shMoney(64376, 50000)}</div>
            <div class="hdr">${shMoney(64376, 50000)}&ndash;${shMoney(96564, 75000)}</div>
            <div class="hdr">${shMoney(96564, 75000)}&ndash;${shMoney(128752, 100000)}</div>
            <div class="hdr">${shMoney(128752, 100000, "k", "+")}</div>
          </div>
          <div class="matrix-grid" style="margin-top:2px; grid-template-columns: 150px repeat(5, 1fr);">
            <div class="row-hdr">Top performer at 2</div>
            <div class="cell"><div class="pct">0.7%</div></div>
            <div class="cell"><div class="pct">1.5%</div></div>
            <div class="cell"><div class="pct">3.0%</div></div>
            <div class="cell"><div class="pct">3.1%</div></div>
            <div class="cell hi"><div class="pct">5.7%</div></div>

            <div class="row-hdr">Top performer at 3</div>
            <div class="cell"><div class="pct">0.7%</div></div>
            <div class="cell"><div class="pct">1.4%</div></div>
            <div class="cell"><div class="pct">2.9%</div></div>
            <div class="cell"><div class="pct">3.0%</div></div>
            <div class="cell hi"><div class="pct">5.8%</div></div>

            <div class="row-hdr">Top performer at 4+</div>
            <div class="cell"><div class="pct">0.2%</div></div>
            <div class="cell"><div class="pct">0.3%</div></div>
            <div class="cell"><div class="pct">0.8%</div></div>
            <div class="cell"><div class="pct">1.1%</div></div>
            <div class="cell hi"><div class="pct">1.6%</div></div>
          </div>
          <p style="font-size:13px; color:var(--ink-soft); margin:16px 0 0; line-height:1.6;">Becoming a top performer at 2 or 3 is far more likely than first becoming one at 4 or older, at every price level. Worth keeping in mind: a horse that only becomes a top performer at 4+ has had two or three extra years of training and keep costs before that happened, on top of the purchase price. That cost isn't in this data, but the direction is real.</p>
        </div>
      </section>

      <section class="block">
        <h2 class="section-title">One horse or several: building a bucket</h2>
        <p class="section-lead">Everything above is about one horse at one price. A bucket usually buys several horses. This section answers: for a fixed amount of money, is it better to buy one expensive horse, or split it across two, three, four, or five cheaper ones?</p>
        <div class="ref-panel">
          <p style="font-size:13.5px; line-height:1.6; margin:0 0 18px;">Each horse in a split uses the real odds for its own actual price, not an average across a wide range. A horse bought at ${shMoney(25750, 20000)} is scored with the ${shMoney(19313, 15000)}&ndash;${shMoney(38626, 30000)} odds, never blended with much pricier horses. Every horse's chance is also treated as independent of the others, the way flipping several coins is.</p>
          <div class="bucket-grid">
            <div class="bucket-card">
              <div class="ttl">${shMoney(51500, 40000, "full")} bucket</div>
              <div class="split-row"><div class="lbl">1 horse<span class="spend">around ${shMoney(51500, 40000)}</span></div><div class="val">2.5%</div></div>
              <div class="split-row win"><div class="lbl">2 horses<span class="spend">around ${shMoney(25750, 20000)} each</span></div><div class="val">3.2%</div></div>
              <div class="split-row"><div class="lbl">3 horses<span class="spend">around ${shMoney(17166, 13333)} each</span></div><div class="val">1.6%</div></div>
              <div class="split-row"><div class="lbl">4 horses<span class="spend">around ${shMoney(12875, 10000)} each</span></div><div class="val">2.2%</div></div>
              <div class="split-row"><div class="lbl">5 horses<span class="spend">around ${shMoney(10300, 8000)} each</span></div><div class="val">2.7%</div></div>
            </div>
            <div class="bucket-card">
              <div class="ttl">${shMoney(103000, 80000, "full")} bucket</div>
              <div class="split-row"><div class="lbl">1 horse<span class="spend">around ${shMoney(103000, 80000)}</span></div><div class="val">4.8%</div></div>
              <div class="split-row"><div class="lbl">2 horses<span class="spend">around ${shMoney(51500, 40000)} each</span></div><div class="val">4.9%</div></div>
              <div class="split-row"><div class="lbl">3 horses<span class="spend">around ${shMoney(34334, 26667)} each</span></div><div class="val">4.7%</div></div>
              <div class="split-row"><div class="lbl">4 horses<span class="spend">around ${shMoney(25750, 20000)} each</span></div><div class="val">6.2%</div></div>
              <div class="split-row win"><div class="lbl">5 horses<span class="spend">around ${shMoney(20600, 16000)} each</span></div><div class="val">7.7%</div></div>
            </div>
            <div class="bucket-card">
              <div class="ttl">${shMoney(154500, 120000, "full")} bucket</div>
              <div class="split-row"><div class="lbl">1 horse<span class="spend">around ${shMoney(154500, 120000)}</span></div><div class="val">6.2%</div></div>
              <div class="split-row"><div class="lbl">2 horses<span class="spend">around ${shMoney(77250, 60000)} each</span></div><div class="val">9.0%</div></div>
              <div class="split-row"><div class="lbl">3 horses<span class="spend">around ${shMoney(51500, 40000)} each</span></div><div class="val">7.3%</div></div>
              <div class="split-row win"><div class="lbl">4 horses<span class="spend">around ${shMoney(38625, 30000)} each</span></div><div class="val">9.6%</div></div>
              <div class="split-row"><div class="lbl">5 horses<span class="spend">around ${shMoney(30900, 24000)} each</span></div><div class="val">7.7%</div></div>
            </div>
          </div>
          <p style="font-size:13px; color:var(--ink-soft); margin:18px 0 0; line-height:1.6;">Splitting the money across several horses usually beats spending it all on one, but not always. In the smallest budget here, 3 horses actually did worse than 1 or 2. There is no single "best number of horses" that works for every budget. Which split size wins depends on exactly where the price boundaries fall for that budget.</p>
          <p style="font-size:13px; color:var(--ink-soft); margin:10px 0 0; line-height:1.6;"><b style="color:var(--ink);">What about mixing price ranges instead of buying same-priced horses?</b> Checked for the ${shMoney(103000, 80000)} example: a mix (say, one ${shMoney(64376, 50000)} horse plus one ${shMoney(38626, 30000)} horse, giving 6.96%) never beat the winning split shown above. 5 horses around ${shMoney(20600, 16000)} each did better, at 7.7%. This doesn't mean "always pick the very cheapest band": horses under ${shMoney(19313, 15000)} only score 0.55% each, too low to make up for in numbers, so 5 of those (2.7%) actually does worse than 5 horses one band up. The pattern is this: match the split size to whichever single band gives the best combination of odds-per-horse and how many horses that band lets the budget buy. It's not "cheapest always wins," and it's not "mixing bands helps." See the ${shMoney(51500, 40000)} bucket for a case where even that isn't enough. There, 3-4 cheap horses still did worse than just 2.</p>
        </div>
      </section>

      <section class="block">
        <h2 class="section-title">Does this pattern hold at every sale, or does it differ by venue?</h2>
        <p class="section-lead">Lexington, Harrisburg, and Ohio are three different sales with different buyers and different horses. This checks whether the price pattern above holds true at each one individually, or whether one sale behaves differently.</p>
        <div class="ref-panel">
          <div class="scroll-hint">
            <table>
              <thead><tr><th>Sale</th><th>Under ${shMoney(38626, 30000)}</th><th>${shMoney(38626, 30000)}&ndash;${shMoney(64376, 50000)}</th><th>${shMoney(64376, 50000)}&ndash;${shMoney(96564, 75000)}</th><th>${shMoney(96564, 75000)}&ndash;${shMoney(128752, 100000)}</th><th>${shMoney(128752, 100000, "k", "+")}</th><th>Total horses</th></tr></thead>
              <tbody>
                <tr><td class="venue-name">Lexington Selected</td><td class="win-cell">1.7% <span class="n-note">(49 of 2,864)</span></td><td>3.2% <span class="n-note">(47 of 1,470)</span></td><td>6.3% <span class="n-note">(75 of 1,192)</span></td><td>6.4% <span class="n-note">(39 of 607)</span></td><td class="win-cell">9.3% <span class="n-note">(116 of 1,245)</span></td><td class="venue-total">7,378</td></tr>
                <tr><td class="venue-name">Harrisburg Book 1&amp;2</td><td>0.7% <span class="n-note">(63 of 8,468)</span></td><td>2.0% <span class="n-note">(54 of 2,748)</span></td><td>3.1% <span class="n-note">(49 of 1,582)</span></td><td>3.1% <span class="n-note">(23 of 738)</span></td><td>7.0% <span class="n-note">(81 of 1,165)</span></td><td class="venue-total">14,701</td></tr>
                <tr><td class="venue-name">Ohio Jug</td><td>1.7% <span class="n-note">(34 of 2,006)</span></td><td class="win-cell">3.4% <span class="n-note">(13 of 384)</span></td><td class="low-n-cell">7.2% <span class="n-note">(10 of 139)</span></td><td class="low-n-cell">11.8% <span class="n-note">(4 of 34)</span></td><td>2.9% <span class="n-note">(1 of 34)</span></td><td class="venue-total">2,597</td></tr>
              </tbody>
            </table>
          </div>
          <p style="font-size:12.5px; color:var(--ink-soft); margin:10px 0 0;">Green = the highest rate in that column. Amber = fewer than 150 horses behind that number. That's too small a sample to trust the way the other cells can be trusted. Shown anyway for completeness rather than left blank.</p>
          <p style="font-size:13px; color:var(--ink-soft); margin:8px 0 0; line-height:1.6;">Ohio Jug specifically: it sells very few horses above $75,000 USD (34 horses in each of the top two bands here, versus 600&ndash;1,245 at Lexington and 738&ndash;1,165 at Harrisburg for the same bands). Its 11.8% figure at $75k&ndash;$100k and 2.9% at $100k+ are each a handful of top performers out of just 34 horses. A single horse's outcome swings that rate by roughly 3 percentage points. Treat those two Ohio cells as noise, not as evidence Ohio out- or under-performs at that price point specifically.</p>
          <div class="scroll-hint" style="margin-top:20px;">
            <table>
              <thead><tr><th>Sale</th><th>Colt</th><th>Filly</th><th>Trotter</th><th>Pacer</th><th>Total horses</th></tr></thead>
              <tbody>
                <tr><td class="venue-name">Lexington Selected</td><td class="win-cell">5.1% <span class="n-note">(197 of 3,855)</span></td><td class="win-cell">3.7% <span class="n-note">(129 of 3,517)</span></td><td class="win-cell">4.5% <span class="n-note">(180 of 3,971)</span></td><td class="win-cell">4.4% <span class="n-note">(146 of 3,328)</span></td><td class="venue-total">7,378</td></tr>
                <tr><td class="venue-name">Harrisburg Book 1&amp;2</td><td>2.4% <span class="n-note">(140 of 5,911)</span></td><td>1.6% <span class="n-note">(130 of 7,917)</span></td><td>1.9% <span class="n-note">(131 of 6,766)</span></td><td>2.0% <span class="n-note">(139 of 7,116)</span></td><td class="venue-total">14,701</td></tr>
                <tr><td class="venue-name">Ohio Jug</td><td>2.5% <span class="n-note">(34 of 1,361)</span></td><td>2.3% <span class="n-note">(28 of 1,231)</span></td><td>2.7% <span class="n-note">(33 of 1,238)</span></td><td>2.1% <span class="n-note">(29 of 1,359)</span></td><td class="venue-total">2,597</td></tr>
              </tbody>
            </table>
          </div>
          <p style="font-size:12.5px; color:var(--ink-soft); margin:10px 0 0;">Green = the highest rate in that column (i.e. the best-performing sale for that specific colt/filly/trotter/pacer group). Every cell here has at least 1,200 horses behind it, so unlike the price-band table above, none of these are a small-sample concern.</p>
          <p style="font-size:13px; color:var(--ink-soft); margin:16px 0 0; line-height:1.6;">Lexington has the highest rate in every single column here: colts, fillies, trotters, and pacers alike. Colts beat fillies at every sale, without exception. Trotters beat pacers at Lexington and Ohio, but at Harrisburg it's pacers that edge ahead. Ohio sells about a third as many horses overall as Lexington and about a sixth as many as Harrisburg. That's a smaller but still reliable sample here, unlike its thin high-price bands above.</p>
        </div>
      </section>

      <div class="footer-note">
Covers Lexington Selected, Harrisburg Book 1&amp;2, and Ohio Jug, 2014-2023, using the same rules explained at the top of this page. This is a pattern in past results. It is not a prediction about any specific 2026 yearling. Original sale prices were in USD. Amounts are currently shown in ${shCcyLabel()}, ${saleHistoryFxNote()}.
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
  // Sale History's figures are historical (2014-2023 sale prices) and
  // already carry a correctly pre-computed data-usd (each sale year's
  // real Bank of Canada annual rate applied to the actual USD sale
  // price) — those must never be re-derived from the live, editable
  // Questions Builder rate, which is today's rate and would silently
  // replace a historically-accurate USD figure with a wrong one for
  // every year except whichever one the current rate happens to match.
  // Only elements WITHOUT a pre-computed data-usd (e.g. the Dashboard's
  // live, current-year figures) use the editable rate.
  document.querySelectorAll(".money").forEach((el) => {
    const cad = parseFloat(el.dataset.cad);
    const hasFixedUsd = el.dataset.usd !== undefined && el.dataset.usd !== "";
    const raw = ccy === "usd" ? (hasFixedUsd ? parseFloat(el.dataset.usd) : cad * rate) : cad;
    const suffix = el.textContent.trim().endsWith("+") ? "+" : "";
    const text = el.dataset.style === "full" ? refFmtFull(raw) : refFmtK(raw);
    el.textContent = text + suffix;
  });
  document.querySelectorAll(".money-range").forEach((el) => {
    const hasFixedUsd = el.dataset.usdLo !== undefined && el.dataset.usdLo !== "";
    const lo = ccy === "usd" ? (hasFixedUsd ? parseFloat(el.dataset.usdLo) : parseFloat(el.dataset.cadLo) * rate) : parseFloat(el.dataset.cadLo);
    const hi = ccy === "usd" ? (hasFixedUsd ? parseFloat(el.dataset.usdHi) : parseFloat(el.dataset.cadHi) * rate) : parseFloat(el.dataset.cadHi);
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
  document.querySelectorAll(".ccy-fx-note").forEach((el) => {
    el.textContent = ccy === "usd"
      ? "these are the real original sale prices, not a converted figure"
      : "using each sale year's actual historical annual-average exchange rate (Bank of Canada), not a single fixed rate";
  });
}

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
      distinctPreferenceCount: Math.round(todayMetrics.distinctPreferenceCount * rampUp),
      multiPreferenceOwnerCount: Math.round(todayMetrics.multiPreferenceOwnerCount * rampUp),
    });
  }
  history[history.length - 1] = { date: history[history.length - 1].date, ...todayMetrics };
  return history;
}

function recordMetricsSnapshot(metrics) {
  const stored = getSetting("metrics_history", []);
  const history = Array.isArray(stored) ? stored : [];
  const today = new Date().toISOString().slice(0, 10);
  const withoutToday = history.filter((entry) => entry.date !== today);
  withoutToday.push({ date: today, ...metrics });
  withoutToday.sort((a, b) => a.date.localeCompare(b.date));
  const trimmed = withoutToday.slice(-90);
  setSetting("metrics_history", trimmed).catch((err) => console.error("Failed to save metrics history:", err));
  return trimmed;
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
  return { past, pctLabel: pct == null ? null : `${round1(Math.abs(pct))}%`, direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat", date: baseline.date };
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
  if (points.length < 2) return `<div class="vs-bars-empty">Not enough history yet. Check back after a few more days of responses.</div>`;
  const max = Math.max(...points, 1);
  const bars = points.map((value, i) => {
    const isLast = i === points.length - 1;
    const height = Math.max(4, Math.round((value / max) * 100));
    const label = i === 0 || isLast ? `<span class="vsb-t">${formatFn(value)}</span>` : "";
    return `<div class="vsb${isLast ? " vsb-now" : ""}" style="height:${height}%">${label}</div>`;
  }).join("");
  return `<div class="vs-bars">${bars}</div><div class="vsb-axis"><span>${points.length > 1 ? "Earliest" : ""}</span><span>Now</span></div>`;
}

function renderAdminAccount() {
  app.innerHTML = `
    <div class="refskin">
    <div class="wrap">
      <div class="refskin-topbar">${adminTabs()}<div class="topbar-right">${backToSiteLink()}</div></div>

      ${adminMasthead("Account")}

      <p class="dek">Signed in as ${escapeHtml(adminSession?.user?.email || "")}.</p>

      <div class="ref-panel" style="margin-top: 22px; max-width: 480px;">
        <div class="panel-head">
          <div>
            <div class="tag">Security</div>
            <h2>Change password</h2>
            <p>Each admin can set their own password here. There's no shared login to keep in sync.</p>
          </div>
        </div>
        <div class="panel-body">
          <form id="changePasswordForm">
            <div class="field-stack">
              <input class="input" id="newPassword" type="password" placeholder="New password (at least 6 characters)" autocomplete="new-password">
              <input class="input" id="confirmPassword" type="password" placeholder="Confirm new password" autocomplete="new-password">
            </div>
            <p class="notice hidden" id="changePasswordError"></p>
            <p class="notice hidden" id="changePasswordSuccess"></p>
            <div class="actions single" style="margin-top:12px;">
              <button class="btn primary" type="submit" id="changePasswordButton">Update password</button>
            </div>
          </form>
        </div>
      </div>
    </div>
    </div>`;

  bindAdminTabs();
  document.querySelector("#changePasswordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const newPassword = document.querySelector("#newPassword").value;
    const confirmPassword = document.querySelector("#confirmPassword").value;
    const errorEl = document.querySelector("#changePasswordError");
    const successEl = document.querySelector("#changePasswordSuccess");
    errorEl.classList.add("hidden");
    successEl.classList.add("hidden");

    if (newPassword.length < 6) {
      errorEl.textContent = "Password must be at least 6 characters.";
      errorEl.classList.remove("hidden");
      return;
    }
    if (newPassword !== confirmPassword) {
      errorEl.textContent = "Passwords don't match.";
      errorEl.classList.remove("hidden");
      return;
    }

    const button = document.querySelector("#changePasswordButton");
    button.disabled = true;
    button.textContent = "Updating…";
    const { error } = await supabaseAsAdmin().auth.updateUser({ password: newPassword });
    button.disabled = false;
    button.textContent = "Update password";

    if (error) {
      errorEl.textContent = "Couldn't update your password: " + error.message;
      errorEl.classList.remove("hidden");
    } else {
      document.querySelector("#newPassword").value = "";
      document.querySelector("#confirmPassword").value = "";
      successEl.textContent = "Password updated.";
      successEl.classList.remove("hidden");
    }
  });
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
          <p class="quiet" style="margin-top:8px;">Works with a spreadsheet exported from Excel or Google Sheets. Include a header row with "Name" and "Email" columns if you can. If not, the first two columns are used.</p>
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
        <div class="scroll-hint table-wrap">
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
    // Dedupe WITHIN the newly parsed batch too, not just against what's
    // already saved — a real ~900-row spreadsheet plausibly has the same
    // owner listed twice (e.g. appearing on two different source sheets
    // that got combined). Without this, two identical rows in one upload
    // both passed the "not already in the roster" check and both got
    // added, since neither one was "existing" yet at filter time.
    const newOwnersByEmail = new Map();
    parsed.forEach((owner) => {
      if (!existingEmails.has(owner.email) && !newOwnersByEmail.has(owner.email)) {
        newOwnersByEmail.set(owner.email, owner);
      }
    });
    const merged = [...existing, ...newOwnersByEmail.values()];
    saveOwnerRoster(merged).catch((err) => console.error("Failed to save owner roster:", err));
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
      saveOwnerRoster([]).catch((err) => console.error("Failed to clear owner roster:", err));
      renderOwnerRosterAdmin();
    });
  }
  document.querySelectorAll("[data-remove-owner]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.getAttribute("data-remove-owner"));
      const roster = getOwnerRoster();
      roster.splice(index, 1);
      saveOwnerRoster(roster).catch((err) => console.error("Failed to save owner roster:", err));
      renderOwnerRosterAdmin();
    });
  });
}

// Any question Anthony adds himself in Questions Builder has no place
// in the hand-written fields below — this fills in a plausible fake
// answer for one, by type, so a newly-added question's Dashboard panel
// isn't stuck showing "no answers yet" while still in preview/test
// mode. Deterministic on i (see buildPreviewDataset()'s own note on
// why), and skips roughly 1 in 5 owners entirely so a custom panel's
// "no answers yet" empty state can still be checked for real too.
function fabricateCustomAnswer(block, i) {
  if (i % 5 === 4) return undefined;
  const options = block.options || [];
  switch (block.type) {
    case "single_select":
    case "yes_no":
      return options.length ? options[i % options.length].value : undefined;
    case "multi_select": {
      if (!options.length) return undefined;
      const count = 1 + (i % Math.min(2, options.length));
      return Array.from({ length: count }, (_, k) => options[(i + k) % options.length].value);
    }
    case "number":
      return String(1 + (i % 10));
    case "text":
      return ["Looking forward to this season", "No particular preference", "First time trying this", "Would like an update when ready"][i % 4];
    default:
      return undefined;
  }
}

// Builds a fictional dataset shaped like real intake responses, purely to
// preview a busy dashboard. Deterministic (no Math.random) so the preview
// looks the same every time instead of jittering on every render. Never
// touches localStorage — callers read this instead of getResponses() /
// getOwnerRoster() / bucketPriceFor() while previewMode is on.
function buildPreviewDataset() {
  const firstNames = ["Jane", "Mark", "Susan", "David", "Linda", "Michael", "Karen", "Robert", "Patricia", "James", "Nancy", "Thomas", "Sandra", "Daniel", "Betty", "Paul", "Carol", "Steven", "Ruth", "Kevin"];
  const lastNames = ["Smith", "Doe", "Miller", "Taylor", "Anderson", "Reed", "Clark", "Kessler", "Owens", "Foster", "Bennett", "Hayes", "Coleman", "Pierce", "Sutton", "Marsh", "Doyle", "Grant", "Wells", "Barrett"];
  const salesPool = REAL_SALES().map((s) => s.id);
  const tierPool = [["premium"], ["mid"], ["budget"], ["premium", "mid"], ["budget"], ["mid"]];
  const gaits = ["trotter", "pacer", "both"];
  const sexes = ["colt", "filly", ""];
  const eligibilityPool = ["kentucky", "ohio", "ontario", "pennsylvania", "new_york"];
  const customBlocks = currentQuestionSet().blocks.filter(
    (block) => block.type !== "bucket_config" && !block.archived && !KNOWN_SUMMARY_BLOCK_IDS.has(block.id) && !block.fixedPosition
  );

  const responses = [];
  for (let i = 0; i < 42; i++) {
    const sale = salesPool[i % salesPool.length];
    const gait = gaits[i % gaits.length];
    // Every 4th owner is also interested in after-sale individual shares
    // (participation "both"), so that panel has real preview data too —
    // matches how a real owner can want both a bucket and after-sale shares.
    const alsoAfterSale = i % 4 === 0;
    const tiers = tierPool[i % tierPool.length];
    const priceTierMatrix = tiers.map((tier, idx) => ({ tier, gait: idx % 2 === 0 ? gait : gaits[(i + idx) % gaits.length], sex: sexes[i % sexes.length] }));
    // 1 to 3 horses, each with its own percentage/gait/colt-filly, same
    // free-form shape a real owner fills in on the per-horse screen.
    const horseNum = 1 + (i % 3);
    const customAnswers = {};
    customBlocks.forEach((block) => {
      const value = fabricateCustomAnswer(block, i);
      if (value !== undefined) customAnswers[block.id] = value;
    });
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
          priceTierMatrix,
          specificShareSizesByHorse: alsoAfterSale
            ? Array.from({ length: horseNum }, (_, h) => ({
                percent: String(3 + ((i + h) % 8)),
                gait: gaits[(i + h) % gaits.length] === "both" ? "" : gaits[(i + h) % gaits.length],
                sex: sexes[(i + h) % sexes.length],
              }))
            : [],
          note: "",
          ...customAnswers,
        },
      },
      submittedAt: new Date(Date.now() - i * 3600000).toISOString(),
    });
  }

  const roster = responses.map((r) => ({ name: r.name, email: r.email }));
  for (let i = 0; i < 18; i++) {
    roster.push({ name: `${firstNames[(i + 7) % firstNames.length]} ${lastNames[(i + 11) % lastNames.length]}`, email: `preview_noresponse${i}@example.com` });
  }

  const prices = { budget: 3000, mid: 8000, premium: 15000 };
  const confirmedBuckets = [
    { id: "cb_preview_1", name: "Premium Trotter Colts", price: 15000, gait: "trotter", sex: "colt", note: "" },
    { id: "cb_preview_2", name: "Balanced: Any gait, Fillies", price: 8000, gait: "any", sex: "filly", note: "" },
    { id: "cb_preview_3", name: "Value Buys", price: 3000, gait: "any", sex: "any", note: "" },
  ];

  return { responses, roster, prices, confirmedBuckets };
}

function renderAdmin() {
  if (!isAdminSignedIn()) {
    app.innerHTML = `<article class="card login-card"><div class="card-body"><span class="tag">Admin</span><h2>Administrator Login</h2><form id="loginForm"><div class="field-stack"><input class="input" id="adminEmail" type="email" placeholder="Email" autocomplete="username" autofocus><input class="input" id="adminPassword" type="password" placeholder="Password" autocomplete="current-password"></div><p class="notice hidden" id="loginError">Incorrect email or password.</p><div class="actions single"><button class="btn primary" type="submit" id="loginButton">Login</button></div></form><button class="text-link" type="button" id="forgotPasswordLink" style="margin-top:12px;">Forgot password?</button><p class="notice hidden" id="forgotPasswordStatus"></p></div></article>`;
    document.querySelector("#loginForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = document.querySelector("#adminEmail").value.trim();
      const password = document.querySelector("#adminPassword").value;
      const loginButton = document.querySelector("#loginButton");
      loginButton.disabled = true;
      loginButton.textContent = "Logging in…";
      const result = await adminSignIn(email, password);
      if (result.ok) {
        refreshAdminData();
      } else {
        document.querySelector("#loginError").classList.remove("hidden");
        loginButton.disabled = false;
        loginButton.textContent = "Login";
      }
    });
    document.querySelector("#forgotPasswordLink").addEventListener("click", async () => {
      const email = document.querySelector("#adminEmail").value.trim();
      const status = document.querySelector("#forgotPasswordStatus");
      if (!email) {
        status.textContent = "Enter your email above first, then click \"Forgot password?\" again.";
        status.classList.remove("hidden");
        return;
      }
      status.textContent = "Sending a password reset link…";
      status.classList.remove("hidden");
      const { error } = await supabaseAsAdmin().auth.resetPasswordForEmail(email);
      status.textContent = error
        ? "Something went wrong sending the reset link. Please try again."
        : "If that email has an admin account, a password reset link has been sent.";
    });
    return;
  }
  if (responsesLoading) {
    app.innerHTML = `<article class="card"><div class="card-body"><p>Loading responses…</p></div></article>`;
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
  if (adminTab === "account") {
    renderAdminAccount();
    return;
  }
  if (adminTab === "settings") {
    renderAdminSettings();
    return;
  }

  const preview = previewMode ? buildPreviewDataset() : null;
  const responses = preview ? preview.responses : getResponses();
  const rows = flattenResponses(responses);
  // Round 1 rows carry no percentage (see flattenResponses()'s comment),
  // so "has a bucket preference" is just hasBucket() + an actual price
  // tier chosen, not row.amount.
  const bucketRows = rows.filter((row) => hasBucket(row) && row.priceTier);
  const afterSaleRows = buildAfterSaleRows(responses);
  const ownerCount = new Set(responses.map((item) => item.email)).size;
  const bucketOwnerCount = new Set(bucketRows.map((row) => row.email)).size;
  const afterSaleOwnerCount = new Set(afterSaleRows.map((row) => row.email)).size;
  const saleDemand = groupDemand(bucketRows, (row) => row.saleLabel);
  const bucketDemand = groupDemand(bucketRows, (row) => labelFor("priceTiers", row.bucketTypes[0]));
  const gaitDemand = groupDemand(bucketRows, (row) => gaitLabel(row.gait));
  // sex is optional on the bucket price-tier question ("No preference"
  // saves it as "") — groupDemand() would otherwise fall back to
  // "Unknown" for that, which reads as missing/bad data rather than
  // the real, valid answer it is. Treated as "both" here, same as the
  // odds lookup already does (see priceTierGaitSexOdds()).
  const sexDemand = groupDemand(bucketRows, (row) => sexLabel(row.sex || "both"));
  const eligibilityDemand = groupMultiDemand(bucketRows, (row) => row.eligibility.map((item) => labelFor("eligibility", item)));
  const afterSaleEligibility = groupMultiDemand(afterSaleRows, (row) => row.eligibility.map((item) => labelFor("eligibility", item)));
  const suggestions = buildBucketSuggestions(bucketRows);
  const confirmedBuckets = preview ? preview.confirmedBuckets : getConfirmedBuckets("default");
  // How spread-out demand is: every distinct (sale, price tier, gait, sex)
  // combination anyone picked, and how many bucket-interested owners
  // listed more than one — both surface versplintering (Robert's term)
  // without needing a percentage to measure it by.
  const distinctPreferenceCount = new Set(bucketRows.map((row) => [row.sale, row.priceTier, row.gait, row.sex].join("|"))).size;
  const preferenceCountByOwner = new Map();
  bucketRows.forEach((row) => preferenceCountByOwner.set(row.email, (preferenceCountByOwner.get(row.email) || 0) + 1));
  const multiPreferenceOwnerCount = [...preferenceCountByOwner.values()].filter((count) => count > 1).length;

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

  // Preview mode never writes a snapshot — otherwise fictional demo numbers
  // would pollute the real trend history shown once preview is turned off.
  // It fabricates its own flat 14-day history instead, purely for display.
  const metricsHistory = preview
    ? buildPreviewMetricsHistory({ bucketOwnerCount, afterSaleOwnerCount, distinctPreferenceCount, multiPreferenceOwnerCount })
    : recordMetricsSnapshot({ bucketOwnerCount, afterSaleOwnerCount, distinctPreferenceCount, multiPreferenceOwnerCount });
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

      ${preview ? `<div class="preview-banner">Previewing with fictional demo data. No real responses were touched. <button type="button" id="previewOff">Show my real data</button></div>` : ""}

      ${loadQuestionSetBackup() ? `<div class="test-mode-banner"><div class="test-mode-text"><strong>Test mode is on</strong><span>The questions owners see right now include your test changes. Go to Questions Builder to restore the originals when you're done.</span></div></div>` : ""}

      ${adminMasthead("Response Dashboard", `
          <div class="as-of light">Responses as of <strong>${asOf}</strong></div>
          <button class="export-btn" type="button" id="exportCsv">Export CSV</button>`)}

      <!-- VERDICT -->
      <div class="verdict">
        <div class="verdict-top">
          <div>
            <div class="eyebrow"><span class="dot"></span> Pre-sale bucket interest, all sales</div>
            <div class="verdict-figure">${!bucketRows.length ? "No data" : `${bucketOwnerCount} owner${bucketOwnerCount === 1 ? "" : "s"}`}</div>
            <div class="verdict-label">${bucketRows.length ? `Distinct owners who expressed a pre-sale bucket preference across ${saleDemand.length} sale${saleDemand.length === 1 ? "" : "s"} currently in the intake. This is interest, not a percentage share. TheStable follows up separately once a bucket is finalized to ask each interested owner how much they'd like to invest.` : "No pre-sale bucket responses yet. This figure will fill in as owners submit the intake."}</div>
          </div>
          <div class="response-ring">
            <div class="ring" style="--pct:${responseRatePct ?? 0}">${responseRatePct == null ? `<div class="ring-empty">${ownerCount ? ownerCount : "No data"}</div>` : `<div>${responseRatePct}%</div>`}</div>
            <div class="response-copy">
              <!-- invitedCount is 0 until Anthony imports an owner roster —
                   without it there's no "responded out of how many invited"
                   percentage to show, but the response COUNT itself is
                   always known from real submissions, so it must not be
                   hidden behind "No data"/"No owners responded yet" just
                   because no roster exists. Distinguishing "0 responses so
                   far" from "N owners have responded, denominator unknown"
                   is the whole point of this line. -->
              <div class="n">${
                responseRatePct != null
                  ? `${ownerCount} of ${invitedCount} owners responded`
                  : ownerCount
                    ? `${ownerCount} owner${ownerCount === 1 ? "" : "s"} responded so far`
                    : "No owners have responded yet"
              }</div>
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
            <div class="vs-label">Distinct preferences</div>
            <div class="vs-row"><span class="vs-value">${distinctPreferenceCount}</span></div>
            <div class="vs-bars-empty">Different price tier / gait / sex combinations chosen so far. A high number relative to owner count may mean demand is spread thin.</div>
          </div>
          <div class="vs-item">
            <div class="vs-label">Owners with 2+ preferences</div>
            <div class="vs-row"><span class="vs-value">${multiPreferenceOwnerCount}</span></div>
            <div class="vs-bars-empty">How many bucket-interested owners listed more than one combination.</div>
          </div>
        </div>
      </div>

      <!-- CONFIRMED OFFER -->
      ${SHOW_CONFIRMED_BUCKETS ? `
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
            <div class="cbc-criteria">${[b.gait !== "any" ? gaitLabel(b.gait) : null, b.sex !== "any" ? sexLabel(b.sex) : null].filter(Boolean).join(" &middot; ") || "Open to any gait/sex"}</div>
            ${b.note ? `<div class="cbc-note">${escapeHtml(b.note)}</div>` : ""}
          </div>`).join("")}</div>` : `<p class="quiet" style="padding:6px 4px;">No buckets confirmed yet. Review demand below, then set the final lineup in Questions Builder &rarr; Confirmed buckets.</p>`}
        </div>
      </div>` : ""}

      <!-- SUGGESTIONS -->
      <div class="ref-panel" style="margin-top: 18px;">
        <div class="panel-head">
          <div style="flex: 1; min-width: 0;">
            <div class="tag">Demand breakdown</div>
            <h2>Where the demand is, by price tier</h2>
            <p style="max-width: none;">Breaks down the requests you've already received by price tier, gait, sex, and jurisdiction fit, grouped by sale in calendar order. Owners pick a price tier per sale rather than an existing bucket name, so this is raw demand for you to shape into an actual bucket, not a proposal to approve. Price tiers are Budget (up to $50,000 USD), Mid-range ($50,000-$100,000), and Premium ($100,000-$150,000, TheStable's realistic top end). Each row shows two historical odds figures side by side, from the Sale History data: the real odds at that specific sale, and the odds across all three sales combined, for a horse with that exact price tier, gait, and sex. Some combinations don't have enough past sales at that one venue to trust a venue-specific number. Those rows show a short note there instead of a number, but the all-sales figure is always shown too, so you can see both the most specific signal available and the broader baseline it's being judged against. None of this affects the demand ranking. Use it as context when you set the sale's final offer in the "Confirmed Buckets" panel below.</p>
          </div>
          <span class="ref-info-dot" tabindex="0">i<span class="tip">Ranked within each sale by how many distinct owners want each exact combination. The historical odds column doesn't affect the ranking. It's context to help you judge whether that demand is worth acting on. It can only break down demand within the price tiers owners were asked about. It can't suggest a brand-new bucket idea nobody was asked about. Use the Sale History page for that kind of idea before the intake form ever opens.</span></span>
        </div>
        <div class="panel-body" style="padding-top: 4px;">
          ${suggestions.length ? Object.entries(groupSuggestionsBySale(suggestions)).map(([saleLabel, rows]) => `
          <div class="sugg-sale-group sale-accent-${saleAccentIndex(saleLabel)}">
            <div class="sugg-sale-head"><span class="sale-dot"></span>${escapeHtml(saleLabel)}</div>
            <div class="sugg-col-heads">
              <div></div>
              <div>Owners</div>
              <div>Odds, this sale</div>
              <div>Odds, all sales</div>
            </div>
            ${rows.map((row) => `
            <div class="sugg-row">
              <div>
                <span class="status ${row.status.toLowerCase()}">${suggIcon(row.status)}${row.status}</span>
                <div class="sugg-title">${escapeHtml(labelFor("priceTiers", row.bucketType))} &middot; ${escapeHtml(gaitLabel(row.gait))} &middot; ${escapeHtml(row.sex ? sexLabel(row.sex) : "any sex")}</div>
                <div class="sugg-sub">${row.eligibility.length ? row.eligibility.map((item) => escapeHtml(item.label)).join(", ") : "No jurisdiction preference captured"}</div>
              </div>
              <div class="stat-block"><div class="num">${row.ownerCount}</div><div class="lbl repeat-lbl">owner${row.ownerCount === 1 ? "" : "s"}</div></div>
              ${oddsStatBlocks(row.historicalOdds)}
            </div>`).join("")}
          </div>`).join("") : `<p class="quiet" style="padding:6px 4px;">No demand data yet. This fills in once owners submit pre-sale bucket responses.</p>`}
        </div>
      </div>

      <!-- ROW: sale demand + bucket type mix -->
      <div class="grid-2">
        <div class="ref-panel">
          <div class="panel-head">
            <h2>Interest by sale</h2>
            <span class="ref-info-dot" tabindex="0">i<span class="tip">Number of distinct owners who expressed a pre-sale bucket preference, per sale, based on pre-sale bucket responses collected so far.</span></span>
          </div>
          <div class="panel-body">
            ${refBarList(saleDemand)}
          </div>
        </div>
        <div class="ref-panel">
          <div class="panel-head">
            <h2>Price tier mix</h2>
            <span class="ref-info-dot" tabindex="0">i<span class="tip">Share of owner preferences that fall into each price tier (Budget, Mid-range, Premium). An owner who picked more than one tier counts once per tier they picked.</span></span>
          </div>
          <div class="panel-body">
            ${refDonut(bucketDemand)}
          </div>
        </div>
      </div>

      <!-- ROW: gait / sex -->
      <div class="grid-2">
        <div class="ref-panel">
          <div class="panel-head"><h2>Trotter vs. Pacer</h2></div>
          <div class="panel-body">${refCompareBars(gaitDemand)}</div>
        </div>
        <div class="ref-panel">
          <div class="panel-head"><h2>Colt / Filly</h2></div>
          <div class="panel-body">${refCompareBars(sexDemand)}</div>
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
      </div>

      <!-- AFTER-SALE INDIVIDUAL SHARES: its own section, not squeezed into
           a shared grid-2 tile — it carries 3 separate data points (horse
           count, share size, jurisdiction) same as the pre-sale bucket
           panels above it, so it gets the same refBarList treatment
           instead of the old flat text-only miniChipRow(). -->
      <div class="ref-panel" style="margin-top: 18px;">
        <div class="panel-head">
          <div>
            <div class="tag">After-sale</div>
            <h2>After-sale individual shares</h2>
            <p>Useful after the sales, when remaining shares can be matched to owners who did not join a bucket or want extra horses.</p>
          </div>
        </div>
        <div class="panel-body" style="padding-top: 4px;">
          ${afterSaleRows.length ? `
          <div class="grid-3">
            <div>
              <h3>How many horses</h3>
              ${refBarList(groupDemand(afterSaleRows, (row) => horseCountLabel((row.specificShareSizesByHorse || []).length)))}
            </div>
            <div>
              <h3>Typical share size</h3>
              ${refBarList(groupDemand(afterSaleRows.flatMap((row) => row.specificShareSizesByHorse || []), (share) => shareSizeBandLabel(share.percent)))}
            </div>
            <div>
              <h3>Preferred jurisdictions</h3>
              ${refBarList(afterSaleEligibility)}
            </div>
          </div>` : `<p class="quiet" style="padding:6px 4px;">No after-sale interest captured yet.</p>`}
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

// Round 1 has no percentage to size a bar/slice by, so owner count is the
// measure — see groupDemand()'s comment. dollarByLabel (per-sale capital)
// stays supported for whenever Round 2 brings real prices back.
// Head-to-head comparison for a small, fixed set of categories (Colt vs.
// Filly, Trotter vs. Pacer): thicker, individually-colored bars with a
// real percent-of-total figure, instead of refBarList()'s same-color
// bars that only differ by length. Built for 2-4 items; falls back to
// refBarList() styling concerns don't apply above that, but nothing
// stops a 5th category, it just cycles the 4 color slots.
function refCompareBars(items) {
  if (!items.length) return `<p class="quiet">No bucket data yet.</p>`;
  const total = items.reduce((sum, item) => sum + item.ownerCount, 0) || 1;
  return `<div class="cmp-bars">
    ${items.map((item, i) => {
      const pct = Math.round((item.ownerCount / total) * 100);
      const fillClass = `cmp-fill-${i % 4}`;
      return `<div class="cmp-row">
        <div class="cmp-meta">
          <span class="cmp-name"><span class="cmp-dot ${fillClass}"></span>${escapeHtml(item.label)}</span>
          <span class="cmp-figs"><span class="cmp-pct">${pct}%</span><span class="cmp-count">${item.ownerCount} owner${item.ownerCount === 1 ? "" : "s"}</span></span>
        </div>
        <div class="cmp-track"><span class="${fillClass}" style="width:${Math.max(4, pct)}%"></span></div>
      </div>`;
    }).join("")}
  </div>`;
}

// Interpolates between the page's gold and navy tones by rank position
// (0 = first/highest, 1 = last/lowest), so a bar list of any length reads
// as a ranking: gold at the top, fading toward navy at the bottom.
function rankGradientColor(t) {
  const gold = [201, 161, 63];
  const navy = [15, 36, 68];
  const mix = (a, b) => Math.round(a + (b - a) * t);
  const [r, g, b] = [mix(gold[0], navy[0]), mix(gold[1], navy[1]), mix(gold[2], navy[2])];
  return `rgb(${r},${g},${b})`;
}

function refBarList(items, dollarByLabel = null) {
  const max = Math.max(1, ...items.map((item) => item.ownerCount));
  const total = items.reduce((sum, item) => sum + item.ownerCount, 0) || 1;
  return `<div class="bar-list">
    ${items.length ? items.map((item, i) => {
      const dollar = dollarByLabel?.get(item.label);
      const pct = Math.round((item.ownerCount / total) * 100);
      const t = items.length > 1 ? i / (items.length - 1) : 0;
      const color = rankGradientColor(t);
      return `<div class="bar-row"><div class="meta"><span class="name">${escapeHtml(item.label)}</span><span class="amt">${pct}% &middot; ${item.ownerCount} owner${item.ownerCount === 1 ? "" : "s"}${dollar ? ` &middot; ${money(dollar)}` : ""}</span></div><div class="bar-track"><span style="width:${Math.max(4, (item.ownerCount / max) * 100)}%; background:${color}"></span></div></div>`;
    }).join("") : `<p class="quiet">No bucket data yet.</p>`}
  </div>`;
}

function miniChipRow(items) {
  return `<div class="amt">${items.length ? items.slice(0, 4).map((item) => `${escapeHtml(item.label)} (${item.count})`).join(", ") : "No data"}</div>`;
}

function refDonut(items) {
  const totalOwners = items.reduce((sum, item) => sum + item.ownerCount, 0);
  if (!totalOwners || !items.length) {
    return `<p class="quiet">No bucket data yet.</p>`;
  }
  let startAngle = 0;
  const paths = items.slice(0, 6).map((item, index) => {
    const fraction = item.ownerCount / totalOwners;
    const endAngle = startAngle + fraction * 360;
    const path = donutArcPath(startAngle, endAngle);
    const color = CHART_COLORS[index % CHART_COLORS.length];
    startAngle = endAngle;
    return `<path d="${path}" fill="${color}" stroke="#f8f6f1" stroke-width="1.5"/>`;
  }).join("");
  return `<div class="donut-row">
    <svg class="donut-svg" viewBox="0 0 120 120" width="116" height="116">${paths}</svg>
    <div class="legend">
      ${items.slice(0, 6).map((item, index) => `<div class="leg-row"><span class="sw" style="background:${CHART_COLORS[index % CHART_COLORS.length]}"></span><span class="name">${escapeHtml(item.label)}</span><span class="pct">${percent(Math.round((item.ownerCount / totalOwners) * 1000) / 10)}</span><span class="amt">${item.ownerCount} owner${item.ownerCount === 1 ? "" : "s"}</span></div>`).join("")}
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
        <div class="panel-head"><h2>${escapeHtml(shortTitleFor(block))}</h2><span class="ref-info-dot" tabindex="0">i<span class="tip">Free-text question added in Questions Builder: "${escapeHtml(block.label)}". Showing distinct answers given so far.</span></span></div>
        <div class="panel-body">${distinctAnswers.length ? `<p class="quiet" style="line-height:1.7;">${distinctAnswers.map((a) => escapeHtml(a)).join(" &middot; ")}</p>` : `<p class="quiet">No answers yet.</p>`}</div>
      </div>`;
    }
    const demand = groupDemand(answered, (row) => {
      const value = row._rawResponse[block.id];
      return Array.isArray(value) ? value.map((v) => labelFor(block.id, v) || v).join(", ") : (labelFor(block.id, value) || value);
    });
    // groupDemand()'s sort only orders by count, so two answers tied on
    // owner count (e.g. an even Yes/No split) fall back to Map
    // insertion order — effectively whichever answer the first owner
    // in the data happened to pick, not the order the admin actually
    // defined the options in (Yes before No, etc). Break ties by that
    // original option order instead, which is deterministic and
    // matches what the admin already chose when building the question.
    const optionOrder = new Map((block.options || []).map((opt, i) => [opt.label, i]));
    demand.sort((a, b) => {
      if (b.ownerCount !== a.ownerCount) return b.ownerCount - a.ownerCount;
      const aOrder = optionOrder.has(a.label) ? optionOrder.get(a.label) : Infinity;
      const bOrder = optionOrder.has(b.label) ? optionOrder.get(b.label) : Infinity;
      return aOrder - bOrder;
    });
    return `<div class="ref-panel">
      <div class="panel-head"><h2>${escapeHtml(shortTitleFor(block))}</h2><span class="ref-info-dot" tabindex="0">i<span class="tip">Question added in Questions Builder: "${escapeHtml(block.label)}". Shown here automatically. A purpose-built chart like the bucket suggestions above needs custom design work instead.</span></span></div>
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
    (block) => block.type !== "bucket_config" && !block.archived && !KNOWN_SUMMARY_BLOCK_IDS.has(block.id)
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
    if (ownerTableFilters.type && !row.bucketTypes.some((item) => labelFor("priceTiers", item) === ownerTableFilters.type)) return false;
    if (ownerTableFilters.gait && gaitSummary(row) !== ownerTableFilters.gait) return false;
    if (ownerTableFilters.sex && sexSummary(row) !== ownerTableFilters.sex) return false;
    if (search && !row.name.toLowerCase().includes(search) && !row.email.toLowerCase().includes(search)) return false;
    return true;
  });
  const saleOptions = [...new Map(rows.map((row) => [row.sale, row.saleLabel])).entries()];
  const typeOptions = [...new Set(rows.flatMap((row) => row.bucketTypes.map((item) => labelFor("priceTiers", item))))].filter(Boolean);
  const gaitOptions = [...new Set(rows.map((row) => gaitSummary(row)))].filter(Boolean);
  const sexOptions = [...new Set(rows.map((row) => sexSummary(row)))].filter(Boolean);
  return `<div class="scroll-hint table-wrap"><table><thead><tr>
      <th>Owner<input class="col-filter" id="ownerSearch" type="search" placeholder="Search name or email" value="${escapeHtml(ownerTableFilters.search)}"></th>
      <th>Sale<select class="col-filter" id="ownerSaleFilter"><option value="">All sales</option>${saleOptions.map(([id, label]) => `<option value="${id}" ${ownerTableFilters.sale === id ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></th>
      <th>Price tier<select class="col-filter" id="ownerTypeFilter"><option value="">All tiers</option>${typeOptions.map((t) => `<option value="${escapeHtml(t)}" ${ownerTableFilters.type === t ? "selected" : ""}>${escapeHtml(t)}</option>`).join("")}</select></th>
      <th>Gait<select class="col-filter" id="ownerGaitFilter"><option value="">All gaits</option>${gaitOptions.map((g) => `<option value="${escapeHtml(g)}" ${ownerTableFilters.gait === g ? "selected" : ""}>${escapeHtml(g)}</option>`).join("")}</select></th>
      <th>Colt / Filly<select class="col-filter" id="ownerSexFilter"><option value="">All</option>${sexOptions.map((s) => `<option value="${escapeHtml(s)}" ${ownerTableFilters.sex === s ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}</select></th>
      ${customColumns.map((block) => `<th>${escapeHtml(block.label)}</th>`).join("")}
    </tr></thead><tbody>
      ${filtered.length ? filtered.map((row) => `<tr><td><div class="owner-name">${escapeHtml(row.name)}</div><div class="owner-email">${escapeHtml(row.email)}</div></td><td>${escapeHtml(row.saleLabel)}</td><td>${row.bucketTypes.map((item) => escapeHtml(labelFor("priceTiers", item))).join(", ")}</td><td>${escapeHtml(gaitSummary(row))}</td><td>${escapeHtml(sexSummary(row))}</td>${customColumns.map((block) => `<td>${escapeHtml(customColumnValue(row, block))}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${5 + customColumns.length}">${rows.length ? "No owners match your filters." : "No owner data yet."}</td></tr>`}
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

// Rows coming through flattenResponses() now carry a price-tier id
// (budget/mid/premium) in this same field, not a bucket_config key —
// those are two different vocabularies that happen to share the string
// "premium". There's no admin-configured price per price tier yet (that's
// Confirmed Buckets work, a later step), so a price-tier row has no price
// source to look up — returning null here (rather than falling through to
// bucket_config and risking a coincidental name match) is what keeps it
// excluded from capital estimates instead of silently mispriced.
function bucketPriceFor(bucketType, previewPrices = null) {
  if (previewPrices) return previewPrices[bucketType] ?? null;
  if (PRICE_TIERS.some(([id]) => id === bucketType)) return null;
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

// Groups an owner's per-horse share rows into the same broad buckets the
// old fixed-choice specificHorseCount/specificShareSize questions used
// to offer, so the Dashboard's "how many horses" / "typical share size"
// panels keep reading the same way now that those are free-form instead.
function horseCountLabel(count) {
  if (count <= 0) return "None";
  if (count === 1) return "One horse only";
  if (count === 2) return "Up to 2 horses";
  return "3 or more horses";
}

function shareSizeBandLabel(percent) {
  const n = Number(percent);
  if (!Number.isFinite(n) || n <= 0) return "Not specified";
  if (n <= 1) return "Around 1%";
  if (n <= 5) return "2% to 5%";
  if (n <= 10) return "5% to 10%";
  return "10% or more";
}

// Round 1 rows carry no percentage (see flattenResponses()'s comment), so
// demand is measured by how many distinct owners picked a combination,
// not by summing a share. `total` is kept (defaulting to 0) rather than
// removed, so a future Round 2 that does carry a real percentage can
// reuse these same grouping functions without another rewrite.
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
  if (b.ownerCount !== a.ownerCount) return b.ownerCount - a.ownerCount;
  return b.count - a.count;
}

// Round 1 has no percentage to size a suggestion by (see groupDemand()'s
// comment), so "Offer"/"Shortlist"/"Watch" and the ranking score are
// based on ownerCount — how many distinct owners want this exact
// combination — instead of a summed share.
// Combines two separate signals per suggestion row, shown side by side —
// never blended into one number: how many distinct owners want this exact
// combination (demand, from the intake), and the real historical odds a
// horse at that price tier became a top performer (from Sale History /
// JUVENIQ, via PRICE_TIER_ODDS). Ranking still uses ownerCount only —
// demand is what tells Anthony who to build a bucket FOR; the historical
// odds is context to help him judge whether that demand is worth acting
// on, not a second vote in the ranking itself.
function buildBucketSuggestions(rows) {
  return buildPlanningRows(rows).map((row) => {
    const relatedRows = rows.filter((item) => item.sale === row.sale && item.bucketTypes[0] === row.bucketType && item.gait === row.gait && item.sex === row.sex);
    const eligibility = groupMultiDemand(relatedRows, (item) => item.eligibility.map((id) => labelFor("eligibility", id))).slice(0, 3);
    const status = row.ownerCount >= 5 ? "Offer" : row.ownerCount >= 2 ? "Shortlist" : "Watch";
    const historicalOdds = priceTierGaitSexOdds(row.sale, row.bucketType, row.gait, row.sex);
    return { ...row, eligibility, score: row.ownerCount, status, historicalOdds };
  }).sort((a, b) => b.score - a.score);
}

// Groups suggestion rows under their sale, keeping each sale's rows in
// their existing (score-sorted) order. Sale groups themselves are ordered
// chronologically, in the same calendar order as SALES() (Ohio ->
// Lexington -> London -> Harrisburg), not by demand, so the panel reads
// as "here's the year in order" rather than shuffling every time demand
// shifts. A plain-object return (not a Map) so a template literal can
// Object.entries() it directly.
function groupSuggestionsBySale(suggestions) {
  const bySale = new Map();
  suggestions.forEach((row) => {
    if (!bySale.has(row.saleLabel)) bySale.set(row.saleLabel, []);
    bySale.get(row.saleLabel).push(row);
  });
  const calendarOrder = SALES().map((s) => s.label);
  const sorted = [...bySale.entries()].sort((a, b) => calendarOrder.indexOf(a[0]) - calendarOrder.indexOf(b[0]));
  return Object.fromEntries(sorted);
}

// A fixed color per sale (by calendar position, not demand rank, so a
// given sale keeps the same color across renders) to make it easy to
// spot which section is which while scrolling the Demand breakdown panel.
function saleAccentIndex(saleLabel) {
  const order = SALES().map((s) => s.label);
  const idx = order.indexOf(saleLabel);
  return idx >= 0 ? idx % 4 : 0;
}

const ownerTableFilters = { search: "", sale: "", type: "", gait: "", sex: "" };

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
      specificShareSizesByHorse: saleResponse.specificShareSizesByHorse || [],
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
      owners: new Set(),
      names: [],
    };
    item.owners.add(row.email);
    item.names.push(row.name);
    groups.set(key, item);
  });
  return [...groups.values()].map((item) => ({
    ...item,
    ownerCount: item.owners.size,
  })).sort((a, b) => b.ownerCount - a.ownerCount);
}

// Round 1 asks which price-tier/gait/sex combinations interest an owner,
// not a percentage (see blankPriceTierMatrix()'s comment for why — a
// share only means something once a real bucket, with a real horse
// count, exists). So each flattened row here has no amount; Dashboard
// panels count OWNERS per combination instead of summing a percentage.
function flattenResponses(responses) {
  return responses.flatMap((response) => response.selectedSales.flatMap((saleId) => {
    const saleResponse = response.saleResponses[saleId] || {};
    if (hasBucket(saleResponse) && priceTierMatrixHasAnyEntry(saleResponse.priceTierMatrix)) {
      return selectedPriceTierRows(saleResponse).map((tierRow) => ({
        name: response.name,
        email: response.email,
        sale: saleId,
        saleLabel: saleById(saleId)?.label || saleId,
        eligibility: response.eligibilityPreferences || [],
        priceTier: tierRow.tier,
        bucketTypes: [tierRow.tier],
        gait: tierRow.gait,
        sex: tierRow.sex,
        participation: saleResponse.participation,
        _rawResponse: saleResponse,
      }));
    }

    return { name: response.name, email: response.email, sale: saleId, saleLabel: saleById(saleId)?.label || saleId, eligibility: response.eligibilityPreferences || [], ...saleResponse, _rawResponse: saleResponse };
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
    (block) => block.type !== "bucket_config" && !block.archived && !KNOWN_SUMMARY_BLOCK_IDS.has(block.id)
  );
  const header = ["name", "email", "sale", "participation", "price_tier", "gait", "sex", "eligibility", ...customBlocks.map((b) => b.label)];
  const csv = [header.join(","), ...rows.map((row) => [
    row.name,
    row.email,
    row.saleLabel,
    labelFor("participation", row.participation),
    (row.bucketTypes || []).map((item) => labelFor("priceTiers", item)).join("; "),
    gaitSummary(row),
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
// currentQuestionSet()). Block-backed fields (participation, gait,
// bucketTypes, maxYearlings, ...) resolve their option labels from the
// live question set below instead,
// so a label Anthony edits in the Questions admin tab is reflected here
// and in CSV exports without needing a matching code change.
const FALLBACK_LABELS = {
  eligibility: { ohio: "Ohio eligible", kentucky: "Kentucky eligible", new_jersey: "New Jersey eligible", pennsylvania: "Pennsylvania eligible", ontario: "Ontario eligible", new_york: "New York eligible", indiana: "Indiana eligible", no_preference: "No strong preference" },
  bucketTypes: { premium: "Premium", value: "Value Buy", balanced: "Balanced" },
  priceTiers: Object.fromEntries(PRICE_TIERS.map(([id, label]) => [id, label])),
};

// A custom question's Dashboard card needs a short heading, not its full
// question text (which can be a whole sentence). Anthony can set one
// explicitly in Questions Builder; without one, this falls back to a
// trimmed version of the question text so a new custom question still
// looks reasonable on the Dashboard before anyone edits it.
function shortTitleFor(block) {
  if (block.shortTitle) return block.shortTitle;
  const text = block.label || "";
  if (text.length <= 40) return text;
  return `${text.slice(0, 40).trim()}…`;
}

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

Promise.all([restoreAdminSession(), restoreOwnerSession(), loadAdminSettingsCache()]).then(async () => {
  if (isOwnerSignedIn()) await resumeAfterOwnerSignIn();
  render();
  if (isAdminSignedIn()) refreshAdminData();
});
