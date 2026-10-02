/**
 * VaultWealth — Authentication & Session Management Module
 * Phase 5: Supabase Auth Implementation
 * 
 * Handles:
 * - User Registration (signUp)
 * - User Login (signInWithPassword)
 * - User Logout (signOut)
 * - Session State Listener & Profile Synchronization
 */

// Initialize event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initAuthForms();
  initSocialAuth();
  initLogoutButtons();
  syncUserProfileHeader();
});

/**
 * 0. Initializes Social OAuth Buttons (from ui/card.txt)
 */
function initSocialAuth() {
  const googleBtn = document.getElementById('googleAuthBtn');
  const githubBtn = document.getElementById('githubAuthBtn');
  const alertBox = document.getElementById('authAlert') || document.getElementById('registerAlert');

  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      const client = getSupabaseClient();
      if (!client) return;
      try {
        const { error } = await client.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin + window.location.pathname.replace(/login\.html|register\.html/, 'dashboard.html') }
        });
        if (error) throw error;
      } catch (err) {
        showAuthAlert(alertBox, 'Google OAuth: Configure Google in Supabase Dashboard → Authentication → Providers to enable one-click sign in.', 'info');
      }
    });
  }

  if (githubBtn) {
    githubBtn.addEventListener('click', async () => {
      const client = getSupabaseClient();
      if (!client) return;
      try {
        const { error } = await client.auth.signInWithOAuth({
          provider: 'github',
          options: { redirectTo: window.location.origin + window.location.pathname.replace(/login\.html|register\.html/, 'dashboard.html') }
        });
        if (error) throw error;
      } catch (err) {
        showAuthAlert(alertBox, 'GitHub OAuth: Configure GitHub in Supabase Dashboard → Authentication → Providers to enable one-click sign in.', 'info');
      }
    });
  }
}

/**
 * 1. Initializes Login and Registration form submissions
 */
function initAuthForms() {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  // --- LOGIN HANDLER ---
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const alertBox = document.getElementById('authAlert');
      const submitBtn = loginForm.querySelector('button[type="submit"]');

      if (!email || !password) {
        showAuthAlert(alertBox, 'Please enter both email and password.', 'error');
        return;
      }

      setButtonLoading(submitBtn, true, 'Signing in...');

      const client = getSupabaseClient();
      if (!client) {
        showAuthAlert(alertBox, 'Supabase is not configured properly. Check config.js.', 'error');
        setButtonLoading(submitBtn, false, 'Sign In to Dashboard');
        return;
      }

      try {
        const { data, error } = await client.auth.signInWithPassword({
          email: email,
          password: password
        });

        if (error) {
          showAuthAlert(alertBox, error.message, 'error');
          setButtonLoading(submitBtn, false, 'Sign In to Dashboard');
          return;
        }

        showAuthAlert(alertBox, 'Login successful! Redirecting...', 'success');
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 800);

      } catch (err) {
        showAuthAlert(alertBox, 'An unexpected error occurred during login.', 'error');
        setButtonLoading(submitBtn, false, 'Sign In to Dashboard');
      }
    });
  }

  // --- REGISTRATION HANDLER ---
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const fullName = document.getElementById('regFullName').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value;
      const confirmPassword = document.getElementById('regConfirmPassword').value;
      const alertBox = document.getElementById('registerAlert');
      const submitBtn = registerForm.querySelector('button[type="submit"]');

      // Client-side validations
      if (!fullName || !email || !password) {
        showAuthAlert(alertBox, 'All fields are required.', 'error');
        return;
      }

      if (password.length < 6) {
        showAuthAlert(alertBox, 'Password must be at least 6 characters long.', 'error');
        return;
      }

      if (password !== confirmPassword) {
        showAuthAlert(alertBox, 'Passwords do not match.', 'error');
        return;
      }

      setButtonLoading(submitBtn, true, 'Creating account...');

      const client = getSupabaseClient();
      if (!client) {
        showAuthAlert(alertBox, 'Supabase is not configured properly. Check config.js.', 'error');
        setButtonLoading(submitBtn, false, 'Register Account');
        return;
      }

      try {
        const { data, error } = await client.auth.signUp({
          email: email,
          password: password,
          options: {
            data: {
              full_name: fullName
            }
          }
        });

        if (error) {
          showAuthAlert(alertBox, error.message, 'error');
          setButtonLoading(submitBtn, false, 'Register Account');
          return;
        }

        // Check if email confirmation is required by Supabase
        if (data.user && data.session === null) {
          showAuthAlert(alertBox, 'Account created! Please check your email to confirm registration, or sign in if confirmation is disabled in Supabase.', 'info');
          setButtonLoading(submitBtn, false, 'Register Account');
        } else {
          showAuthAlert(alertBox, 'Account created successfully! Redirecting to dashboard...', 'success');
          setTimeout(() => {
            window.location.href = 'dashboard.html';
          }, 1000);
        }

      } catch (err) {
        showAuthAlert(alertBox, 'An unexpected error occurred during registration.', 'error');
        setButtonLoading(submitBtn, false, 'Register Account');
      }
    });
  }
}

/**
 * 2. Initializes Logout Button Listeners across all pages
 */
function initLogoutButtons() {
  const logoutButtons = document.querySelectorAll('[data-action="logout"], a[href="login.html"].nav-item');

  logoutButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      localStorage.removeItem('vaultwealth_demo_session');
      const client = getSupabaseClient();
      if (client) {
        try {
          await client.auth.signOut();
        } catch (err) {
          console.error('[VaultWealth] Error signing out:', err);
        }
      }
      window.location.href = 'login.html';
    });
  });
}

/**
 * 3. Synchronizes user full name, email, and avatar in the sidebar & header
 */
async function syncUserProfileHeader() {
  const client = getSupabaseClient();
  if (!client) return;

  const user = await getCurrentUser();
  if (!user) return;

  const userNameEls = document.querySelectorAll('.user-name, #profileNameHeader');
  const userEmailEls = document.querySelectorAll('.user-email, #profileEmailHeader');
  const userAvatarEls = document.querySelectorAll('.user-avatar');

  const fullName = user.user_metadata?.full_name || user.email.split('@')[0];
  const email = user.email;
  const initial = fullName.charAt(0).toUpperCase();

  userNameEls.forEach(el => el.textContent = fullName);
  userEmailEls.forEach(el => el.textContent = email);
  userAvatarEls.forEach(el => el.textContent = initial);

  // Update profile page input fields if present
  const profNameInput = document.getElementById('profName');
  const profEmailInput = document.getElementById('profEmail');
  if (profNameInput) profNameInput.value = fullName;
  if (profEmailInput) profEmailInput.value = email;
}

/**
 * Helper: Displays alert messages inside auth cards
 */
function showAuthAlert(el, message, type = 'error') {
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.textContent = message;
  el.style.display = 'block';
}

/**
 * Helper: Toggles loading state on submit buttons
 */
function setButtonLoading(btn, isLoading, text) {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.style.opacity = isLoading ? '0.7' : '1';
  btn.style.cursor = isLoading ? 'not-allowed' : 'pointer';
  btn.textContent = text;
}
