/**
 * VaultWealth — Profile & Settings Controller
 * Handles real user profile synchronization, profile updates, real CSV export, and data purge.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth();
  if (!user) return;

  await loadUserProfile();
  initProfileForm();
  initExportCSV();
  initClearData();
});

/**
 * Loads real profile information from Supabase
 */
async function loadUserProfile() {
  const user = await getCurrentUser();
  if (!user) return;

  const fullName = user.user_metadata?.full_name || user.email.split('@')[0];
  const email = user.email;
  const initial = fullName.charAt(0).toUpperCase();

  // Avatar initial
  const avatarEl = document.getElementById('profileAvatarInitial');
  if (avatarEl) avatarEl.textContent = initial;

  // Name Header & Input
  const nameHeaderEl = document.getElementById('profileDisplayName');
  const nameInputEl = document.getElementById('profName');
  if (nameHeaderEl) nameHeaderEl.textContent = fullName;
  if (nameInputEl) nameInputEl.value = fullName;

  // Email Input
  const emailInputEl = document.getElementById('profEmail');
  if (emailInputEl) emailInputEl.value = email;

  // Member Since Date
  const joinDateEl = document.getElementById('profileJoinDate');
  if (joinDateEl && user.created_at) {
    try {
      const d = new Date(user.created_at);
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      joinDateEl.textContent = `Member since ${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch {
      joinDateEl.textContent = 'Active Member';
    }
  }
}

/**
 * Updates user full name in Supabase
 */
function initProfileForm() {
  const profileForm = document.getElementById('profileForm');
  if (!profileForm) return;

  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const client = getSupabaseClient();
    if (!client) return;

    const newName = document.getElementById('profName').value.trim();
    if (!newName) {
      alert('Please enter a valid name.');
      return;
    }

    const saveBtn = profileForm.querySelector('button[type="submit"]');
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Updating...';

    try {
      // 1. Update Auth metadata
      const { data, error: authError } = await client.auth.updateUser({
        data: { full_name: newName }
      });

      if (authError) throw authError;

      // 2. Update profiles table
      const user = data.user;
      if (user) {
        await client
          .from('profiles')
          .update({ full_name: newName, updated_at: new Date().toISOString() })
          .eq('id', user.id);
      }

      alert('Profile updated successfully!');
      await loadUserProfile();
      syncUserProfileHeader();

    } catch (err) {
      console.error('[VaultWealth] Error updating profile:', err);
      alert('Failed to update profile: ' + (err.message || err));
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  });
}

/**
 * Generates and downloads a real CSV export of all user transactions
 */
function initExportCSV() {
  const exportBtn = document.getElementById('exportCsvBtn');
  if (!exportBtn) return;

  exportBtn.addEventListener('click', async (e) => {
    e.preventDefault();

    const client = getSupabaseClient();
    if (!client) return;

    const user = await getCurrentUser();
    if (!user) return;

    exportBtn.disabled = true;
    exportBtn.textContent = '⏳ Exporting...';

    try {
      const { data: transactions, error } = await client
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('transaction_date', { ascending: false });

      if (error) throw error;

      if (!transactions || transactions.length === 0) {
        alert('You have no transactions to export yet.');
        return;
      }

      // Build CSV
      const headers = ['ID', 'Date', 'Type', 'Category', 'Amount (INR)', 'Description', 'Created At'];
      const rows = transactions.map(t => [
        t.id,
        t.transaction_date,
        t.type,
        `"${(t.category || '').replace(/"/g, '""')}"`,
        t.amount,
        `"${(t.description || '').replace(/"/g, '""')}"`,
        t.created_at
      ]);

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
      
      // Trigger download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `VaultWealth_Transactions_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (err) {
      console.error('[VaultWealth] Error exporting CSV:', err);
      alert('Failed to export transactions: ' + (err.message || err));
    } finally {
      exportBtn.disabled = false;
      exportBtn.innerHTML = '<span>📥</span> Export Transactions (CSV)';
    }
  });
}

/**
 * Permanently deletes all transactions for the authenticated user
 */
function initClearData() {
  const clearBtn = document.getElementById('clearDataBtn');
  if (!clearBtn) return;

  clearBtn.addEventListener('click', async () => {
    const client = getSupabaseClient();
    if (!client) return;

    const user = await getCurrentUser();
    if (!user) return;

    const confirmed = confirm('⚠️ ARE YOU ABSOLUTELY SURE?\n\nThis will permanently delete ALL your recorded transactions in Supabase.\nThis action cannot be undone.');
    if (!confirmed) return;

    const secondConfirm = prompt('Type DELETE in all capitals to permanently purge your data:');
    if (secondConfirm !== 'DELETE') {
      alert('Purge cancelled. Data remains untouched.');
      return;
    }

    try {
      const { error } = await client
        .from('transactions')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;

      alert('All transactions have been permanently cleared.');
      window.location.href = 'dashboard.html';

    } catch (err) {
      console.error('[VaultWealth] Error deleting transactions:', err);
      alert('Failed to clear transactions: ' + (err.message || err));
    }
  });
}
