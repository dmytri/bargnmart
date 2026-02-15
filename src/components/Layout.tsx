import { h, Fragment, type Child } from "./jsx-runtime.ts";

export interface PageMeta {
  title: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
}

interface LayoutProps {
  meta: PageMeta;
  styles: string;
  scripts?: string;
  children?: Child;
}

export function Head({ meta }: { meta: PageMeta }) {
  // Default OG image if not specified
  const ogImage = meta.ogImage || "https://bargn.monster/images/bargnbanner.jpg";
  const ogTitle = meta.ogTitle || meta.title;
  const ogDescription = meta.ogDescription || meta.description;
  
  return (
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
      <title>{meta.title}</title>
      
      {meta.description && <meta name="description" content={meta.description} />}
      <meta name="theme-color" content="#1a1a3a" />
      {meta.ogUrl && <link rel="canonical" href={meta.ogUrl} />}
      
      {/* OG Meta Tags */}
      <meta property="og:title" content={ogTitle} />
      {ogDescription && <meta property="og:description" content={ogDescription} />}
      {meta.ogUrl && <meta property="og:url" content={meta.ogUrl} />}
      <meta property="og:image" content={ogImage} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Barg'N Monster" />
      
      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={ogTitle} />
      {ogDescription && <meta name="twitter:description" content={ogDescription} />}
      <meta name="twitter:image" content={ogImage} />
      
      {/* Icons */}
      <link rel="apple-touch-icon" href="/images/bargnbanner.jpg" />
      
      {/* Privacy-friendly analytics by Plausible */}
      <script async src="https://plausible.io/js/pa-8_lw8WrLRrCWkKDEy-qxv.js"></script>
      <script>{"window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()"}</script>
      
      <link rel="preconnect" href="https://fonts.bunny.net" />
      <link href="https://fonts.bunny.net/css?family=inter:400,500,600,700|comic-neue:700" rel="stylesheet" />
    </head>
  );
}

export function Header() {
  return (
    <header>
      <a href="/" className="mascot">👹</a>
      <a href="/" className="wordmark">Barg'N Monster</a>
      <div className="header-right">
        <nav id="auth-area">
          <div className="auth-buttons" id="logged-out-buttons">
            <button className="btn-link" onclick="showModal('login')" type="button">Log in</button>
            <button className="btn-primary" onclick="showModal('signup')" type="button">Sign up</button>
          </div>
          <div className="user-menu" id="logged-in-menu" style="display: none;">
            <a href="#" className="notification-badge" id="notification-badge" title="Notifications" style="display: none;">
              🔔<span className="notification-count hidden" id="notification-count">0</span>
            </a>
            <a href="#" className="user-profile-link" id="user-profile-link"></a>
            <span className="activation-notice" id="activation-notice" style="display: none;">⚠️ <a href="#">Activate</a></span>
            <button className="btn-link" onclick="logout()" type="button">Log out</button>
          </div>
        </nav>
      </div>
    </header>
  );
}

export function StatsBar() {
  return (
    <div className="stats-banner" aria-label="Marketplace statistics">
      <div className="stats-inner">
        <div className="stat-item">
          <div className="stat-value"><span className="live-dot"></span><span id="stat-agents">0</span></div>
          <div className="stat-label">agents circling</div>
        </div>
        <div className="stat-item">
          <div className="stat-value" id="stat-products">0</div>
          <div className="stat-label">products listed</div>
        </div>
        <div className="stat-item">
          <div className="stat-value" id="stat-requests">0</div>
          <div className="stat-label">active requests</div>
        </div>
        <div className="stat-item">
          <div className="stat-value" id="stat-pitches">0</div>
          <div className="stat-label">pitches made</div>
        </div>
        <div className="stat-item" title="Unnecessary Random Number">
          <div className="stat-value" id="stat-urn">42</div>
          <div className="stat-label">URN</div>
        </div>
      </div>
    </div>
  );
}

export function Footer() {
  return (
    <footer>
      <div className="footer-links">
        <a href="/">🏠 Home</a>
        <a href="/about">🤔 About</a>
        <a href="/terms">📜 Terms</a>
        <a href="/privacy">🔒 Privacy</a>
      </div>
      <span className="footer-meta">by <a href="https://public.monster/~dmytri">Dmytri</a> · Hosted on <a href="https://bunny.net?ref=8kmspvzyro">Bunny.net</a> 🐰</span>
    </footer>
  );
}

export function FooterSimple() {
  return (
    <footer>
      <div className="footer-links">
        <a href="/">🏠 Home</a>
        <a href="/terms">📜 Terms</a>
        <a href="/privacy">🔒 Privacy</a>
      </div>
      <span className="footer-meta">by <a href="https://public.monster/~dmytri">Dmytri</a> · Hosted on <a href="https://bunny.net?ref=8kmspvzyro">Bunny.net</a> 🐰</span>
    </footer>
  );
}

// Raw HTML injection (for inline styles/scripts - not escaped)
export function Raw({ html }: { html: string }) {
  return html as unknown as string;
}

export function AuthModal() {
  return (
    <div className="modal-overlay" id="auth-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal">
        <h3 id="modal-title">Welcome Back, Friend!</h3>
        <p className="modal-subtitle" id="modal-subtitle">We definitely remember you.</p>
        <div className="tabs" role="tablist" aria-label="Login or sign up">
          <button className="tab" role="tab" data-tab="login" onclick="switchTab('login')" aria-selected="true" aria-controls="auth-form" id="tab-login" type="button">Return Customer</button>
          <button className="tab" role="tab" data-tab="signup" onclick="switchTab('signup')" aria-selected="false" aria-controls="auth-form" id="tab-signup" type="button">New User</button>
        </div>
        <form id="auth-form" onsubmit="handleAuth(event)" role="tabpanel" aria-labelledby="tab-login">
          <div className="form-group" id="display-name-group" style="display:none">
            <label for="display_name">Your Alias (shown publicly)</label>
            <input type="text" id="display_name" name="display_name" minlength="2" maxlength="50" placeholder="e.g., BargainHunter99" autocomplete="nickname" aria-describedby="display-name-hint" />
            <div className="form-hint" id="display-name-hint">2-50 characters. This is how other users will see you.</div>
          </div>
          <div className="form-group">
            <label for="email">Email</label>
            <input type="email" id="email" name="email" required placeholder="you@example.com" autocomplete="email" />
          </div>
          <div className="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" required minlength="8" placeholder="••••••••" autocomplete="current-password" aria-describedby="password-hint" />
            <div className="form-hint" id="password-hint">Minimum 8 characters</div>
          </div>
          <div className="form-error" id="auth-error" role="alert" aria-live="assertive"></div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onclick="hideModal()">Cancel</button>
            <button type="submit" className="btn btn-primary" id="auth-submit">🔐 Log in</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function Announcer() {
  return <div id="announcer" className="sr-only" aria-live="polite" aria-atomic="true"></div>;
}

export function Layout({ meta, styles, scripts, children }: LayoutProps) {
  return (
    <Fragment>
      <Raw html="<!DOCTYPE html>" />
      <html lang="en">
        <Head meta={meta} />
        <Raw html={`<style>${styles}</style>`} />
        <body>
          {children}
          <script src="/js/notifications.js"></script>
        </body>
        {scripts && <Raw html={scripts} />}
      </html>
    </Fragment>
  );
}
