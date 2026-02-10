// Notification polling for logged-in users
(function() {
  var POLL_INTERVAL = 60000; // Poll every 60 seconds
  var pollTimer = null;

  function checkNotifications() {
    var savedUser = localStorage.getItem('bargn_user');
    if (!savedUser) return;
    
    var user;
    try {
      user = JSON.parse(savedUser);
    } catch (e) {
      return;
    }
    
    if (!user || !user.token) return;
    
    fetch('/api/notifications', {
      headers: { 'Authorization': 'Bearer ' + user.token }
    })
    .then(function(res) {
      if (!res.ok) return null;
      return res.json();
    })
    .then(function(data) {
      if (!data) return;
      updateNotificationBadge(data.total, data);
    })
    .catch(function() {
      // Silent fail - don't spam console
    });
  }

  function updateNotificationBadge(count, data) {
    var badge = document.getElementById('notification-badge');
    var countEl = document.getElementById('notification-count');
    
    if (!badge || !countEl) return;
    
    if (count > 0) {
      badge.style.display = 'inline-flex';
      countEl.textContent = count > 99 ? '99+' : count;
      countEl.classList.remove('hidden');
      
      // Build tooltip with breakdown
      var parts = [];
      if (data.pitches > 0) parts.push(data.pitches + ' new pitch' + (data.pitches > 1 ? 'es' : ''));
      if (data.messages > 0) parts.push(data.messages + ' new message' + (data.messages > 1 ? 's' : ''));
      badge.title = parts.join(', ') || 'Notifications';
      
      // Link to user's profile (where requests/pitches are shown)
      var savedUser = localStorage.getItem('bargn_user');
      if (savedUser) {
        try {
          var user = JSON.parse(savedUser);
          badge.href = user.profile_url || '/user/' + user.human_id;
        } catch (e) {}
      }
    } else {
      badge.style.display = 'none';
      countEl.classList.add('hidden');
    }
  }

  function markNotificationsSeen() {
    var savedUser = localStorage.getItem('bargn_user');
    if (!savedUser) return;
    
    var user;
    try {
      user = JSON.parse(savedUser);
    } catch (e) {
      return;
    }
    
    if (!user || !user.token) return;
    
    fetch('/api/notifications/seen', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + user.token }
    });
  }

  function startPolling() {
    // Check immediately on page load
    checkNotifications();
    
    // Then poll periodically
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(checkNotifications, POLL_INTERVAL);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // Expose for use by other scripts
  window.bargn = window.bargn || {};
  window.bargn.notifications = {
    check: checkNotifications,
    markSeen: markNotificationsSeen,
    start: startPolling,
    stop: stopPolling
  };

  // Auto-start on page load if user is logged in
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startPolling);
  } else {
    startPolling();
  }

  // Stop polling when page is hidden, restart when visible
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      stopPolling();
    } else {
      startPolling();
    }
  });
})();
