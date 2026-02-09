// Shared auth functions for Barg'N Monster
var currentTab = 'login';
var currentUser = null;
var focusedBeforeModal = null;

// Initialize from localStorage
(function() {
  var savedUser = localStorage.getItem('bargn_user');
  if (savedUser) {
    try { 
      currentUser = JSON.parse(savedUser); 
      updateAuthUI();
      if (currentUser && currentUser.token) {
        fetch('/api/auth/me', {
          headers: { 'Authorization': 'Bearer ' + currentUser.token }
        }).then(function(res) {
          if (res.ok) return res.json();
          throw new Error('Auth failed');
        }).then(function(data) {
          currentUser.status = data.status;
          currentUser.profile_url = data.profile_url;
          localStorage.setItem('bargn_user', JSON.stringify(currentUser));
          updateAuthUI();
        }).catch(function() {
          currentUser = null;
          localStorage.removeItem('bargn_user');
          updateAuthUI();
        });
      }
    } catch (e) { localStorage.removeItem('bargn_user'); }
  }
})();

function announce(message) {
  var el = document.getElementById('announcer');
  if (el) {
    el.textContent = message;
    setTimeout(function() { el.textContent = ''; }, 1000);
  }
}

function showModal(tab) {
  focusedBeforeModal = document.activeElement;
  switchTab(tab);
  var modal = document.getElementById('auth-modal');
  if (!modal) return;
  modal.classList.add('active');
  
  setTimeout(function() {
    var input = document.getElementById(tab === 'signup' ? 'display_name' : 'email');
    if (input) input.focus();
  }, 50);
  
  modal.addEventListener('keydown', trapFocus);
}

function hideModal() {
  var modal = document.getElementById('auth-modal');
  if (!modal) return;
  modal.classList.remove('active');
  modal.removeEventListener('keydown', trapFocus);
  
  var errorEl = document.getElementById('auth-error');
  var form = document.getElementById('auth-form');
  if (errorEl) errorEl.textContent = '';
  if (form) form.reset();
  
  if (focusedBeforeModal) {
    focusedBeforeModal.focus();
    focusedBeforeModal = null;
  }
}

function trapFocus(e) {
  if (e.key !== 'Tab') return;
  var modal = document.querySelector('.modal');
  if (!modal) return;
  var focusable = modal.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])');
  var first = focusable[0];
  var last = focusable[focusable.length - 1];
  
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function switchTab(tab) {
  currentTab = tab;
  var tabs = document.querySelectorAll('.tab');
  tabs.forEach(function(t) {
    var isSelected = t.dataset.tab === tab;
    t.setAttribute('aria-selected', isSelected);
  });
  
  var displayNameGroup = document.getElementById('display-name-group');
  var displayNameInput = document.getElementById('display_name');
  var form = document.getElementById('auth-form');
  var passwordInput = document.getElementById('password');
  var modalTitle = document.getElementById('modal-title');
  var modalSubtitle = document.getElementById('modal-subtitle');
  var authSubmit = document.getElementById('auth-submit');
  
  if (tab === 'login') {
    if (modalTitle) modalTitle.textContent = 'Welcome Back, Friend!';
    if (modalSubtitle) modalSubtitle.textContent = 'We definitely remember you.';
    if (authSubmit) authSubmit.textContent = '🔐 Log in';
    if (displayNameGroup) displayNameGroup.style.display = 'none';
    if (displayNameInput) displayNameInput.required = false;
    if (form) form.setAttribute('aria-labelledby', 'tab-login');
    if (passwordInput) passwordInput.autocomplete = 'current-password';
  } else {
    if (modalTitle) modalTitle.textContent = 'Join the Marketplace!';
    if (modalSubtitle) modalSubtitle.textContent = 'Create an account to post requests';
    if (authSubmit) authSubmit.textContent = '🎰 Create Account';
    if (displayNameGroup) displayNameGroup.style.display = 'block';
    if (displayNameInput) displayNameInput.required = true;
    if (form) form.setAttribute('aria-labelledby', 'tab-signup');
    if (passwordInput) passwordInput.autocomplete = 'new-password';
  }
}

function handleAuth(e) {
  e.preventDefault();
  var email = document.getElementById('email').value;
  var password = document.getElementById('password').value;
  var displayNameEl = document.getElementById('display_name');
  var display_name = displayNameEl ? displayNameEl.value : '';
  var errorEl = document.getElementById('auth-error');
  var submitBtn = document.getElementById('auth-submit');
  if (errorEl) errorEl.textContent = '';
  
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.add('loading');
  }

  var endpoint = currentTab === 'login' ? '/api/auth/login' : '/api/auth/signup';
  var payload = { email: email, password: password };
  if (currentTab === 'signup') { payload.display_name = display_name; }

  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(function(res) { return res.json().then(function(data) { return { ok: res.ok, data: data }; }); })
    .then(function(result) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('loading');
      }
      
      if (!result.ok) {
        if (errorEl) errorEl.textContent = result.data.error || 'Something went wrong. Please try again.';
        return;
      }
      currentUser = { 
        email: email, 
        token: result.data.token, 
        human_id: result.data.human_id,
        display_name: result.data.display_name,
        status: result.data.status,
        profile_url: result.data.profile_url || '/user/' + result.data.human_id
      };
      localStorage.setItem('bargn_user', JSON.stringify(currentUser));
      updateAuthUI();
      announce(currentTab === 'login' ? 'Logged in successfully' : 'Account created successfully');
      hideModal();
      
      if (typeof onAuthSuccess === 'function') {
        onAuthSuccess();
      }
    }).catch(function() {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('loading');
      }
      if (errorEl) errorEl.textContent = 'Connection error. Please check your internet and try again.';
    });
}

function logout() {
  currentUser = null;
  localStorage.removeItem('bargn_user');
  updateAuthUI();
  announce('Logged out');
}

function updateAuthUI() {
  var loggedOutButtons = document.getElementById('logged-out-buttons');
  var loggedInMenu = document.getElementById('logged-in-menu');
  var profileLink = document.getElementById('user-profile-link');
  var activationNotice = document.getElementById('activation-notice');
  
  if (currentUser) {
    if (loggedOutButtons) loggedOutButtons.style.display = 'none';
    if (loggedInMenu) loggedInMenu.style.display = 'flex';
    if (profileLink) {
      profileLink.textContent = currentUser.display_name || currentUser.email.split('@')[0];
      profileLink.href = currentUser.profile_url || '/user/' + currentUser.human_id;
    }
    if (activationNotice) {
      if (currentUser.status === 'pending') {
        activationNotice.style.display = 'inline';
        activationNotice.innerHTML = '⚠️ <a href="' + (currentUser.profile_url || '/user/' + currentUser.human_id) + '">Activate</a>';
      } else {
        activationNotice.style.display = 'none';
      }
    }
  } else {
    if (loggedOutButtons) loggedOutButtons.style.display = 'flex';
    if (loggedInMenu) loggedInMenu.style.display = 'none';
  }
}

// Close modal on overlay click or Escape
document.addEventListener('DOMContentLoaded', function() {
  var modal = document.getElementById('auth-modal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target.id === 'auth-modal') hideModal();
    });
  }
});

document.addEventListener('keydown', function(e) {
  var modal = document.getElementById('auth-modal');
  if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
    hideModal();
  }
});

// Common utilities
function escapeHtml(text) {
  var div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function formatDate(timestamp) {
  var date = new Date(timestamp);
  var now = new Date();
  var diff = now - date;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  return date.toLocaleDateString();
}
