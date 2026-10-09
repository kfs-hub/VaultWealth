/**
 * VaultWealth — Device & Desktop Notification Service
 * Manages native HTML5 Web Notifications for subscription renewals (3 days prior),
 * permission lifecycle, test notifications, and preference persistence.
 */

(function () {
  'use strict';

  const PREF_DEVICE_NOTIFS = 'vaultwealth_device_notifications';
  const PREF_SUB_REMINDERS = 'vaultwealth_sub_reminders';
  const CACHE_NOTIFIED_RENEWALS = 'vaultwealth_notified_renewals';
  const SESSION_DISMISSED_BANNER = 'vaultwealth_notif_banner_dismissed';

  const VaultNotifications = {
    /**
     * Check if Web Notifications are supported in this browser
     */
    isSupported() {
      return 'Notification' in window;
    },

    /**
     * Current permission state: 'granted' | 'denied' | 'default' | 'unsupported'
     */
    getPermission() {
      if (!this.isSupported()) return 'unsupported';
      return Notification.permission;
    },

    /**
     * True if notifications are supported, permission granted, and user hasn't explicitly disabled them
     */
    isEnabled() {
      if (!this.isSupported()) return false;
      if (Notification.permission !== 'granted') return false;
      const pref = localStorage.getItem(PREF_DEVICE_NOTIFS);
      return pref !== 'false';
    },

    /**
     * Request device notification permission from the browser
     */
    async requestPermission() {
      if (!this.isSupported()) {
        return 'unsupported';
      }

      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          localStorage.setItem(PREF_DEVICE_NOTIFS, 'true');
          sessionStorage.setItem(SESSION_DISMISSED_BANNER, 'true');
          this.saveProfilePref(true);

          // Dispatch confirmation alert on device
          this.sendNotification('VaultWealth — Renewal Alerts Active', {
            body: "You'll now receive notifications on this device 3 days before any subscription renews.",
            tag: 'vw-notif-welcome'
          });
        } else if (permission === 'denied') {
          localStorage.setItem(PREF_DEVICE_NOTIFS, 'false');
          this.saveProfilePref(false);
        }

        window.dispatchEvent(new CustomEvent('vaultwealth:notif-permission-changed', {
          detail: { permission, isEnabled: this.isEnabled() }
        }));

        return permission;
      } catch (err) {
        console.warn('[VaultNotifications] Error requesting permission:', err);
        return this.getPermission();
      }
    },

    /**
     * Send a native device notification
     */
    sendNotification(title, options = {}) {
      if (!this.isSupported() || Notification.permission !== 'granted') {
        return null;
      }

      try {
        const notifOptions = {
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: options.tag || `vw-${Date.now()}`,
          body: options.body || '',
          silent: false,
          requireInteraction: false
        };

        const notification = new Notification(title, notifOptions);

        notification.onclick = (e) => {
          e.preventDefault();
          window.focus();
          if (options.url) {
            window.location.href = options.url;
          } else {
            window.location.href = '/subscriptions';
          }
          notification.close();
        };

        return notification;
      } catch (err) {
        console.warn('[VaultNotifications] Failed to display notification:', err);
        return null;
      }
    },

    /**
     * Send an instant test notification
     */
    async sendTestNotification() {
      if (!this.isSupported()) {
        alert('Your browser does not support native desktop/device notifications.');
        return false;
      }

      if (Notification.permission !== 'granted') {
        const res = await this.requestPermission();
        if (res !== 'granted') {
          alert('Notification permissions are not granted. Please allow notifications in your browser settings.');
          return false;
        }
      }

      return this.sendNotification('VaultWealth — 3-Day Renewal Alert (Test)', {
        body: 'Upcoming: Spotify Family (₹179/mo) is renewing in 3 days. This is how you will be alerted on this device!',
        tag: 'vw-test-reminder',
        url: '/subscriptions'
      });
    },

    /**
     * Iterates through active subscriptions and sends a native device notification
     * for any subscription that is within 3 days of renewal (or on renewal day).
     */
    checkSubscriptionReminders(subscriptions) {
      if (!this.isEnabled()) return;
      if (!Array.isArray(subscriptions) || subscriptions.length === 0) return;

      const userGeneralReminders = localStorage.getItem(PREF_SUB_REMINDERS);
      if (userGeneralReminders === 'false') return;

      let notifiedCache = {};
      try {
        const raw = localStorage.getItem(CACHE_NOTIFIED_RENEWALS);
        if (raw) notifiedCache = JSON.parse(raw);
      } catch {
        notifiedCache = {};
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      subscriptions.forEach(sub => {
        if (sub.status !== 'active') return;
        if (!sub.next_billing_date) return;

        const targetDate = new Date(sub.next_billing_date + 'T00:00:00');
        const diffMs = targetDate.getTime() - today.getTime();
        const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const threshold = sub.reminder_days_before || 3;

        // If subscription renewal is between 0 and 3 days away
        if (days >= 0 && days <= threshold) {
          const cacheKey = `${sub.id}_${sub.next_billing_date}`;
          const lastNotified = notifiedCache[cacheKey];

          // Deduplicate: notify at most once every 20 hours per renewal milestone
          const twentyHoursMs = 20 * 60 * 60 * 1000;
          if (!lastNotified || (Date.now() - lastNotified > twentyHoursMs)) {
            const timeLabel = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days} days`;
            const currencySymbol = sub.currency === 'USD' ? '$' : sub.currency === 'EUR' ? '€' : '₹';
            const amountText = `${currencySymbol}${parseFloat(sub.amount).toFixed(2)}`;

            this.sendNotification(`Renewal ${timeLabel}: ${sub.name}`, {
              body: `${amountText} is due on ${sub.next_billing_date} via ${sub.payment_method || 'Card'}. Click to manage in VaultWealth.`,
              tag: `vw-sub-${sub.id}-${sub.next_billing_date}`,
              url: '/subscriptions'
            });

            notifiedCache[cacheKey] = Date.now();
          }
        }
      });

      try {
        localStorage.setItem(CACHE_NOTIFIED_RENEWALS, JSON.stringify(notifiedCache));
      } catch {}
    },

    /**
     * Persist preference to Supabase profile
     */
    async saveProfilePref(enabled) {
      if (typeof getSupabaseClient !== 'function' || typeof getCurrentUser !== 'function') return;
      try {
        const client = getSupabaseClient();
        const user = await getCurrentUser();
        if (client && user) {
          await client
            .from('profiles')
            .update({
              subscription_reminders_enabled: enabled,
              updated_at: new Date().toISOString()
            })
            .eq('id', user.id);
        }
      } catch (err) {
        console.warn('[VaultNotifications] Could not save preference to profile:', err);
      }
    }
  };

  window.VaultNotifications = VaultNotifications;
})();
