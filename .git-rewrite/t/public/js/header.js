// Shared header component - edit here to update all pages
(function() {
  const headerHTML = `
    <div class="header-left"></div>
    <a href="/" class="logo">
      <span class="mascot">👹</span>
      <span class="logo-text">Barg'N Monster</span>
    </a>
    <div class="header-right">
      <nav id="auth-area">
        <div class="auth-buttons" id="logged-out-buttons">
          <button class="btn-link" onclick="showModal('login')" type="button">Log in</button>
          <button class="btn-primary" onclick="showModal('signup')" type="button">Sign up</button>
        </div>
        <div class="user-menu" id="logged-in-menu" style="display: none;">
          <a href="#" class="user-profile-link" id="user-profile-link"></a>
          <span class="activation-notice" id="activation-notice" style="display: none;">⚠️ <a href="#">Activate</a></span>
          <button class="btn-link" onclick="logout()" type="button">Log out</button>
        </div>
      </nav>
    </div>
  `;

  // Insert header content
  document.addEventListener('DOMContentLoaded', function() {
    const header = document.querySelector('header');
    if (header && !header.innerHTML.trim()) {
      header.innerHTML = headerHTML;
    }
  });
})();
