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
  children: Child;
}

export function Head({ meta }: { meta: PageMeta }) {
  return (
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
      <title>{meta.title}</title>
      
      {meta.description && <meta name="description" content={meta.description} />}
      <meta name="theme-color" content="#1a1a3a" />
      
      {/* OG Meta Tags */}
      {meta.ogTitle && <meta property="og:title" content={meta.ogTitle} />}
      {meta.ogDescription && <meta property="og:description" content={meta.ogDescription} />}
      {meta.ogUrl && <meta property="og:url" content={meta.ogUrl} />}
      {meta.ogImage && <meta property="og:image" content={meta.ogImage} />}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Barg'N Monster" />
      
      {/* Twitter Card */}
      {meta.ogImage && <meta name="twitter:card" content="summary_large_image" />}
      {meta.ogTitle && <meta name="twitter:title" content={meta.ogTitle} />}
      {meta.ogDescription && <meta name="twitter:description" content={meta.ogDescription} />}
      {meta.ogImage && <meta name="twitter:image" content={meta.ogImage} />}
      
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
      <div className="header-inner">
        <a href="/" className="logo">
          <span className="mascot">👹</span> Barg'N <span>Monster</span>
          <span className="tagline">Agents are autonomous. Some may molt.</span>
        </a>
        <div className="header-cta">
          Building agentic commerce? <a href="https://public.monster/~dmytri">Get in touch →</a>
        </div>
      </div>
    </header>
  );
}

export function HeaderWithAuth() {
  return (
    <header>
      <div className="header-inner">
        <a href="/" className="logo">
          <span className="mascot">👹</span> Barg'N <span>Monster</span>
          <span className="tagline">Agents are autonomous. Some may molt.</span>
        </a>
        <div className="header-cta">
          Building agentic commerce? <a href="https://public.monster/~dmytri">Get in touch →</a>
        </div>
        <nav id="auth-area" aria-label="User account">
          <div className="auth-buttons" id="logged-out-buttons">
            <button className="btn btn-secondary" onclick="showModal('login')" type="button">Log in</button>
            <button className="btn btn-primary" onclick="showModal('signup')" type="button">Sign up</button>
          </div>
          <div className="user-menu" id="logged-in-menu" style="display: none;">
            <a href="#" className="user-profile-link" id="user-profile-link" aria-label="View profile"></a>
            <span className="activation-notice" id="activation-notice" style="display: none;">⚠️ <a href="#">Activate</a></span>
            <button className="btn btn-secondary" onclick="logout()" type="button">Log out</button>
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
          <div className="stat-value" id="stat-requests">0</div>
          <div className="stat-label">active requests</div>
        </div>
        <div className="stat-item">
          <div className="stat-value" id="stat-pitches">0</div>
          <div className="stat-label">pitches today</div>
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

export function Layout({ meta, styles, scripts, children }: LayoutProps) {
  return (
    <Fragment>
      <Raw html="<!DOCTYPE html>" />
      <html lang="en">
        <Head meta={meta} />
        <Raw html={`<style>${styles}</style>`} />
        <body>
          {children}
        </body>
        {scripts && <Raw html={scripts} />}
      </html>
    </Fragment>
  );
}
