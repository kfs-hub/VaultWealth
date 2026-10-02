/**
 * VaultWealth — Supabase Client Wrapper & API Service Layer
 * Phase 4: Database & Auth Infrastructure
 * 
 * Provides centralized helper functions for Supabase interactions:
 * - Client initialization
 * - Session & Auth status checks
 * - CRUD transaction queries
 * - Profile queries
 */

// Global client reference
let supabaseClient = null;

/**
 * Initializes and returns the Supabase client instance.
 * Checks for window.supabase from the official CDN script:
 * <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 */
function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  // Check if Supabase library is loaded
  if (typeof window.supabase === 'undefined') {
    console.warn('[VaultWealth] Supabase SDK script is not loaded in this document.');
    return null;
  }

  // Check if configuration exists
  if (typeof SUPABASE_CONFIG === 'undefined' || 
      SUPABASE_CONFIG.url === 'YOUR_SUPABASE_PROJECT_URL' || 
      !SUPABASE_CONFIG.url) {
    console.warn('[VaultWealth] Supabase configuration is missing or using placeholder values.');
    return null;
  }

  try {
    supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    return supabaseClient;
  } catch (err) {
    console.error('[VaultWealth] Error initializing Supabase client:', err);
    return null;
  }
}

/**
 * Helper to check if a valid user session is active
 */
async function getCurrentUser() {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) return null;
    return session.user;
  } catch (err) {
    console.error('[VaultWealth] Error fetching current user session:', err);
    return null;
  }
}

/**
 * Helper to protect private pages (redirects unauthenticated users to login)
 */
async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    // If Supabase is configured and user is not logged in, redirect
    const client = getSupabaseClient();
    if (client) {
      window.location.href = '/login';
    }
  }
  return user;
}
