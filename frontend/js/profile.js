/**
 * VaultWealth — Profile & Settings Controller
 * Handles real user profile synchronization, profile updates, real CSV export, and data purge.
 */

function onReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

onReady(async () => {
  window.VaultLoader?.start();
  const user = await requireAuth();
  if (!user) {
    window.VaultLoader?.done();
    return;
  }

  try {
    await loadUserProfile();
    initProfileForm();
    initPreferences();
    initExportCSV();
    initClearData();
  } finally {
    window.VaultLoader?.done();
  }
});

function initPreferences() {
  const subReminderCheckbox = document.getElementById('prefSubReminders');
  if (subReminderCheckbox) {
    const savedPref = localStorage.getItem('vaultwealth_sub_reminders');
    if (savedPref !== null) {
      subReminderCheckbox.checked = savedPref === 'true';
    }
    subReminderCheckbox.addEventListener('change', async (e) => {
      localStorage.setItem('vaultwealth_sub_reminders', e.target.checked);
      const client = getSupabaseClient();
      const user = await getCurrentUser();
      if (client && user) {
        try {
          await client
            .from('profiles')
            .update({ subscription_reminders_enabled: e.target.checked, updated_at: new Date().toISOString() })
            .eq('id', user.id);
        } catch (err) {
          console.warn('[VaultWealth] Could not save reminder pref to DB:', err);
        }
      }
    });
  }

  // Device & Desktop Push Notifications
  const deviceNotifCheckbox = document.getElementById('prefDeviceNotifications');
  const notifStatusBadge = document.getElementById('notifStatusBadge');
  const notifBlockedHelp = document.getElementById('notifBlockedHelp');
  const testNotifBtn = document.getElementById('btnTestNotification');

  function updateDeviceNotifUI() {
    if (!window.VaultNotifications || !window.VaultNotifications.isSupported()) {
      if (notifStatusBadge) {
        notifStatusBadge.textContent = 'Not Supported';
        notifStatusBadge.style.background = 'rgba(255,255,255,0.08)';
        notifStatusBadge.style.color = 'var(--text-muted)';
      }
      if (deviceNotifCheckbox) deviceNotifCheckbox.disabled = true;
      if (testNotifBtn) testNotifBtn.disabled = true;
      return;
    }

    const perm = window.VaultNotifications.getPermission();
    const isEnabled = window.VaultNotifications.isEnabled();

    if (perm === 'granted') {
      if (notifStatusBadge) {
        notifStatusBadge.textContent = isEnabled ? 'Active (3 Days Prior)' : 'Muted';
        notifStatusBadge.style.background = isEnabled ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 255, 255, 0.08)';
        notifStatusBadge.style.color = isEnabled ? '#34d399' : 'var(--text-muted)';
      }
      if (deviceNotifCheckbox) {
        deviceNotifCheckbox.disabled = false;
        deviceNotifCheckbox.checked = isEnabled;
      }
      if (notifBlockedHelp) notifBlockedHelp.style.display = 'none';
      if (testNotifBtn) testNotifBtn.disabled = false;
    } else if (perm === 'denied') {
      if (notifStatusBadge) {
        notifStatusBadge.textContent = 'Blocked by Browser';
        notifStatusBadge.style.background = 'rgba(244, 63, 94, 0.15)';
        notifStatusBadge.style.color = '#fb7185';
      }
      if (deviceNotifCheckbox) {
        deviceNotifCheckbox.disabled = true;
        deviceNotifCheckbox.checked = false;
      }
      if (notifBlockedHelp) notifBlockedHelp.style.display = 'block';
      if (testNotifBtn) testNotifBtn.disabled = true;
    } else {
      // 'default'
      if (notifStatusBadge) {
        notifStatusBadge.textContent = 'Permission Needed';
        notifStatusBadge.style.background = 'rgba(251, 191, 36, 0.15)';
        notifStatusBadge.style.color = '#fbbf24';
      }
      if (deviceNotifCheckbox) {
        deviceNotifCheckbox.disabled = false;
        deviceNotifCheckbox.checked = false;
      }
      if (notifBlockedHelp) notifBlockedHelp.style.display = 'none';
      if (testNotifBtn) testNotifBtn.disabled = false;
    }
  }

  updateDeviceNotifUI();

  if (deviceNotifCheckbox) {
    deviceNotifCheckbox.addEventListener('change', async (e) => {
      if (e.target.checked) {
        const perm = window.VaultNotifications.getPermission();
        if (perm === 'default') {
          const res = await window.VaultNotifications.requestPermission();
          if (res !== 'granted') {
            e.target.checked = false;
          }
        } else if (perm === 'granted') {
          localStorage.setItem('vaultwealth_device_notifications', 'true');
          window.VaultNotifications.saveProfilePref(true);
        }
      } else {
        localStorage.setItem('vaultwealth_device_notifications', 'false');
        window.VaultNotifications.saveProfilePref(false);
      }
      updateDeviceNotifUI();
    });
  }

  if (testNotifBtn) {
    testNotifBtn.addEventListener('click', async () => {
      if (window.VaultNotifications) {
        await window.VaultNotifications.sendTestNotification();
        updateDeviceNotifUI();
      }
    });
  }

  window.addEventListener('vaultwealth:notif-permission-changed', () => {
    updateDeviceNotifUI();
  });
}

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
    exportBtn.innerHTML = `<span>${typeof getSvgIcon === 'function' ? getSvgIcon('spinner', 'icon-spin', { width: 16, height: 16 }) : ''}</span> Exporting...`;

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

      // Build CSV with standard financial Debit/Credit separation
      const headers = ['ID', 'Date', 'Type', 'Category', 'Withdrawal (Debit)', 'Deposit (Credit)', 'Amount (INR)', 'Description', 'Created At'];
      const rows = transactions.map(t => {
        const isIncome = (t.type || '').toLowerCase() === 'income';
        const numAmt = (parseFloat(t.amount) || 0).toFixed(2);
        const withdrawal = isIncome ? '' : numAmt;
        const deposit = isIncome ? numAmt : '';
        const displayType = isIncome ? 'Income' : 'Expense';

        return [
          t.id,
          t.transaction_date,
          displayType,
          `"${(t.category || '').replace(/"/g, '""')}"`,
          withdrawal,
          deposit,
          numAmt,
          `"${(t.description || '').replace(/"/g, '""')}"`,
          t.created_at
        ];
      });

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
      exportBtn.innerHTML = `<span>${typeof getSvgIcon === 'function' ? getSvgIcon('inbox') : ''}</span> Export Transactions (CSV)`;
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

    const confirmed = confirm('ARE YOU ABSOLUTELY SURE?\n\nThis will permanently delete ALL your recorded transactions in Supabase.\nThis action cannot be undone.');
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
      window.location.href = '/dashboard';

    } catch (err) {
      console.error('[VaultWealth] Error deleting transactions:', err);
      alert('Failed to clear transactions: ' + (err.message || err));
    }
  });
}
