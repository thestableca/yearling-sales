// Shared Supabase clients + auth helpers.
// Loaded as a classic script (like questions.js/app.js) so its top-level
// consts/functions become globals the other files call directly.
//
// Two SEPARATE Supabase Auth clients are used — one for admin, one for
// owners — each with its own storageKey. A single Supabase client can only
// hold one session at a time; without this split, Anthony testing the
// owner intake flow in the same browser tab (or an owner and admin
// sharing a device) would sign each other out. Each client still talks to
// the same project/database — only the auth session storage is separate.

const SUPABASE_URL = "https://jnmvnwnsesaxpeinqqvq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_pfXUE-MmDGU4STJjVz_iaQ_V4uxIS1I";

const supabaseAdminAuth = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey: "thestable-admin-auth", detectSessionInUrl: false },
});

const supabaseOwnerAuth = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey: "thestable-owner-auth", detectSessionInUrl: true },
});

// Each call site says explicitly which identity it needs, rather than
// guessing from whichever session happens to be active — using one fixed
// client for everything was a real bug: admin actions (saving settings,
// fetching all responses) were going through the owner-auth client, which
// has no admin session, so is_admin() evaluated false and every admin
// write was silently rejected by RLS. Being explicit also avoids a subtler
// version of the same bug: Robert (or Anthony) testing both roles in the
// same browser at once would otherwise get whichever session "won."
//
// supabaseAsAdmin() — admin-only reads/writes (is_admin() RLS checks).
// supabaseAsOwner() — owner-scoped reads/writes (auth.jwt()->>'email' RLS checks).
// supabasePublic() — reference data with no auth requirement (sales,
//   sale_years, the publicly-readable question_sets row) — uses the owner
//   client's connection since no session is actually required for these.
function supabaseAsAdmin() {
  return supabaseAdminAuth;
}

function supabaseAsOwner() {
  return supabaseOwnerAuth;
}

function supabasePublic() {
  return supabaseOwnerAuth;
}

// --- Admin auth --------------------------------------------------------
// Replaces the old client-side ADMIN_PASSCODE_HASH/adminLoggedIn check.
// A real Supabase Auth session is the source of truth; RLS policies (see
// is_admin() in the database) are what actually gate data access — this
// client-side state only controls which screen renders.

let adminSession = null; // the current Supabase Auth session, or null

async function adminSignIn(email, password) {
  const { data, error } = await supabaseAdminAuth.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: error.message };
  adminSession = data.session;
  return { ok: true };
}

async function adminSignOut() {
  await supabaseAdminAuth.auth.signOut();
  adminSession = null;
}

async function restoreAdminSession() {
  const { data } = await supabaseAdminAuth.auth.getSession();
  adminSession = data.session;
  return adminSession;
}

function isAdminSignedIn() {
  return !!adminSession;
}

// Keeps adminSession in sync if the token refreshes or expires in the background.
supabaseAdminAuth.auth.onAuthStateChange((_event, session) => {
  adminSession = session;
});

// --- Owner auth (magic link) -------------------------------------------
// Replaces "type any name/email, we believe you" with a real proof of
// inbox access: the owner types their email, gets a one-time link by
// email (sent via the send-owner-magic-link Edge Function, which uses
// Resend for delivery), and clicking it signs them into a real Supabase
// Auth session scoped to that email address.

let ownerSession = null;

const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-owner-magic-link`;

async function requestOwnerMagicLink(email) {
  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) return { ok: false, message: "Something went wrong sending your link. Please try again." };
    return { ok: true };
  } catch {
    return { ok: false, message: "Couldn't reach the server. Check your connection and try again." };
  }
}

// Supabase Auth appends the session tokens to the URL hash after a magic
// link redirect (#access_token=...&refresh_token=...). detectSessionInUrl
// is only enabled on supabaseOwnerAuth (see client setup above) so a
// magic-link redirect can never be mistaken for an admin session — this
// reads back whatever session that produced.
async function restoreOwnerSession() {
  const { data } = await supabaseOwnerAuth.auth.getSession();
  ownerSession = data.session && data.session.user?.email ? data.session : null;
  return ownerSession;
}

function isOwnerSignedIn() {
  return !!ownerSession;
}

function ownerEmail() {
  return ownerSession?.user?.email || null;
}

async function ownerSignOut() {
  await supabaseOwnerAuth.auth.signOut();
  ownerSession = null;
}

supabaseOwnerAuth.auth.onAuthStateChange((_event, session) => {
  ownerSession = session && session.user?.email ? session : null;
});
