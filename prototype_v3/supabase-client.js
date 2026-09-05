// Shared Supabase client + admin auth helpers.
// Loaded as a classic script (like questions.js/app.js) so its top-level
// consts/functions become globals the other files call directly.

const SUPABASE_URL = "https://jnmvnwnsesaxpeinqqvq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_pfXUE-MmDGU4STJjVz_iaQ_V4uxIS1I";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// --- Admin auth --------------------------------------------------------
// Replaces the old client-side ADMIN_PASSCODE_HASH/adminLoggedIn check.
// A real Supabase Auth session is the source of truth; RLS policies (see
// is_admin() in the database) are what actually gate data access — this
// client-side state only controls which screen renders.

let adminSession = null; // the current Supabase Auth session, or null

async function adminSignIn(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: error.message };
  adminSession = data.session;
  return { ok: true };
}

async function adminSignOut() {
  await supabaseClient.auth.signOut();
  adminSession = null;
}

async function restoreAdminSession() {
  const { data } = await supabaseClient.auth.getSession();
  adminSession = data.session;
  return adminSession;
}

function isAdminSignedIn() {
  return !!adminSession;
}

// Keeps adminSession in sync if the token refreshes or expires in the background.
supabaseClient.auth.onAuthStateChange((_event, session) => {
  adminSession = session;
});
