// Shared CSS styles for all pages

export const resetStyles = `
* { margin: 0; padding: 0; box-sizing: border-box; }

:focus-visible { outline: 3px solid #4ae8e8; outline-offset: 2px; }
:focus:not(:focus-visible) { outline: none; }
`;

export const headerStyles = `
header { max-width: 1000px; margin: 12px auto; padding: 10px 20px; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; border: 2px solid #444; border-radius: 12px; position: sticky; top: 12px; z-index: 100; background: #1a1a3a; }
.mascot { font-size: 1.8rem; animation: bounce 1s ease-in-out infinite; display: inline-block; text-decoration: none; }
.wordmark { font-family: 'Comic Neue', cursive; font-size: 2.4rem; font-weight: 700; text-decoration: none; text-align: center; background: linear-gradient(90deg, #ff1493, #ff69b4, #ffb6c1, #ff69b4, #ff1493); background-size: 200% 100%; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; transform: rotate(-2deg); filter: drop-shadow(0 0 8px rgba(255, 20, 147, 0.6)) drop-shadow(0 0 20px rgba(255, 105, 180, 0.4)); letter-spacing: -0.5px; }
@keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
.header-right { display: flex; align-items: center; gap: 12px; justify-content: flex-end; }
#auth-area { display: flex; align-items: center; gap: 12px; }
.auth-buttons { display: flex; align-items: center; gap: 12px; }
.btn-link { background: none; border: none; color: #f5f0e1; font-size: 0.9rem; cursor: pointer; padding: 0; }
.btn-link:hover { text-decoration: underline; }
header .btn-primary { background: #7ecf4a; color: #1a1a2e; border: none; border-radius: 6px; padding: 6px 14px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
header .btn-primary:hover { background: #8edf5a; }
.user-menu { display: flex; align-items: center; gap: 12px; }
.user-profile-link { color: #4ae8e8; text-decoration: none; font-weight: 600; }
.user-profile-link:hover { text-decoration: underline; }
.activation-notice { color: #f5d76e; font-size: 0.85rem; }
.activation-notice a { color: #f5d76e; }
`;

export const statsBarStyles = `
.stats-banner { max-width: 1000px; margin: 0 auto; padding: 16px 20px; }
.stats-inner { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
.stat-item { background: rgba(255,255,255,0.05); border: 1px solid #444; border-radius: 8px; padding: 8px 14px; display: flex; align-items: center; gap: 8px; }
.stat-value { font-weight: 700; color: #7ecf4a; font-size: 1.1rem; display: flex; align-items: center; gap: 6px; }
.stat-value .live-dot { width: 6px; height: 6px; background: #7ecf4a; border-radius: 50%; animation: pulse 2s ease-in-out infinite; }
.stat-label { color: #888; font-size: 0.85rem; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
`;

export const footerStyles = `
footer { text-align: center; padding: 28px 18px; color: #7ecf4a; font-size: 1rem; }
footer a { color: #e84a8a; text-decoration: none; font-weight: 700; }
footer a:hover { text-decoration: underline; }
.footer-cta { margin-bottom: 20px; font-size: 1rem; color: #b0b0b0; }
.footer-cta a { color: #1a1a3a; background: #4ae8e8; padding: 4px 12px; border-radius: 6px; text-decoration: none; font-weight: 700; margin-left: 4px; }
.footer-cta a:hover { background: #7ecf4a; }
.footer-links { display: flex; justify-content: center; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
.footer-links a { background: linear-gradient(180deg, #2d2d44 0%, #1a1a2e 100%); border: 3px solid #e84a8a; border-radius: 12px; padding: 10px 18px; font-size: 1.1rem; transition: transform 0.15s, box-shadow 0.15s; }
.footer-links a:hover { transform: scale(1.05) rotate(-1deg); box-shadow: 3px 3px 0 #e84a8a; text-decoration: none; }
.footer-meta { font-size: 0.95rem; color: #666; }
`;

export const buttonStyles = `
.btn { padding: 10px 18px; border: 3px solid; border-radius: 12px; font-size: 1rem; font-weight: 700; cursor: pointer; transition: all 0.2s; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
.btn:hover { transform: translateY(-2px) rotate(-1deg); }
.btn-primary { background: #7ecf4a; color: #1a1a2e; border-color: #1a1a2e; }
.btn-primary:hover { box-shadow: 3px 3px 0 #1a1a2e; }
.btn-secondary { background: transparent; color: #f5f0e1; border-color: #f5f0e1; }
.btn-secondary:hover { background: rgba(255,255,255,0.1); }
`;

export const baseBodyStyles = `
body { font-family: 'Comic Neue', 'Inter', system-ui, sans-serif; background: #1a1a3a; min-height: 100vh; color: #1a1a2e; font-size: 18px; line-height: 1.6; }
`;

export const baseStyles = resetStyles + baseBodyStyles + headerStyles + footerStyles + buttonStyles;

export const baseStylesWithStats = baseStyles + statsBarStyles;

// Shared styles for content pages (about, privacy, terms, etc.)
export const contentPageStyles = `
body { font-family: 'Inter', system-ui, sans-serif; color: #f5f0e1; line-height: 1.7; }
main { max-width: 800px; margin: 0 auto; padding: 40px 24px; }
h1 { font-family: 'Comic Neue', cursive; font-size: 2.2rem; color: #e84a8a; margin-bottom: 8px; }
.subtitle { color: #7ecf4a; font-size: 1.1rem; margin-bottom: 32px; font-style: italic; }
.updated { color: #4ae8e8; font-size: 0.9rem; margin-bottom: 24px; }
h2 { font-family: 'Comic Neue', cursive; font-size: 1.4rem; color: #f5d76e; margin-top: 32px; margin-bottom: 12px; }
p, ul { margin-bottom: 16px; }
ul { padding-left: 24px; }
li { margin-bottom: 8px; }
a { color: #4ae8e8; }
.highlight-box { background: #2d2d44; border: 2px solid #7ecf4a; border-radius: 12px; padding: 20px; margin: 24px 0; }
.highlight-box h3 { color: #7ecf4a; margin-bottom: 8px; font-size: 1.1rem; }
.fine-print { font-size: 0.85rem; color: #888; margin-top: 40px; padding-top: 20px; border-top: 1px solid #333; }
.signature { margin-top: 40px; padding-top: 20px; border-top: 1px solid #333; font-style: italic; color: #4ae8e8; }
.signature a { color: #e84a8a; }
.footer-links a.featured { background: linear-gradient(180deg, #e84a8a 0%, #ff6eb4 100%); border-color: #f5d76e; color: #fff; font-size: 1.2rem; padding: 12px 24px; animation: pulse-glow 2s ease-in-out infinite; }
.footer-links a.featured:hover { box-shadow: 4px 4px 0 #f5d76e, 0 0 20px rgba(232,74,138,0.5); }
@keyframes pulse-glow { 0%, 100% { box-shadow: 0 0 5px rgba(232,74,138,0.3); } 50% { box-shadow: 0 0 15px rgba(232,74,138,0.6); } }
`;

export const contentStyles = baseStyles + contentPageStyles;

// Auth modal styles (used on pages with login)
export const authModalStyles = `
.modal-overlay { display: none; position: fixed; inset: 0; background: rgba(26,26,46,0.92); z-index: 100; align-items: center; justify-content: center; padding: 18px; overflow-y: auto; }
.modal-overlay.active { display: flex; }
.modal { background: linear-gradient(180deg, #f5f0e1 0%, #ebe6d7 100%); border: 4px solid #e84a8a; border-radius: 20px; padding: 28px; width: 100%; max-width: 420px; box-shadow: 8px 8px 0 #e84a8a; max-height: 90vh; overflow-y: auto; }
.modal h3 { font-family: 'Comic Neue', cursive; color: #1a1a2e; margin-bottom: 6px; font-size: 1.75rem; }
.modal .modal-subtitle { font-size: 1rem; color: #666; margin-bottom: 18px; font-style: italic; }
.form-group { margin-bottom: 18px; }
.form-group label { display: block; font-size: 1.1rem; font-weight: 700; margin-bottom: 8px; color: #1a1a2e; }
.form-group input { width: 100%; min-height: 48px; padding: 12px 14px; border: 3px solid #1a1a2e; border-radius: 12px; font-size: 1.1rem; font-family: inherit; background: #fff; }
.form-group input:focus { outline: none; border-color: #4ae8e8; box-shadow: 0 0 0 4px rgba(74,232,232,0.3); }
.form-hint { font-size: 1rem; color: #666; margin-top: 6px; }
.form-error { color: #c0392b; font-size: 1rem; margin-top: 10px; font-weight: 700; min-height: 1.25em; }
.modal-footer { display: flex; gap: 10px; justify-content: flex-end; margin-top: 22px; flex-wrap: wrap; }
.tabs { display: flex; border-bottom: 3px solid #1a1a2e; margin-bottom: 18px; }
.tab { padding: 14px 18px; font-size: 1.1rem; font-weight: 700; color: #888; cursor: pointer; border: none; background: none; border-bottom: 4px solid transparent; margin-bottom: -3px; min-height: 48px; transition: color 0.15s; }
.tab:hover { color: #1a1a2e; }
.tab:focus-visible { outline-offset: -2px; }
.tab[aria-selected="true"] { color: #1a1a2e; border-bottom-color: #e84a8a; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.btn { padding: 10px 18px; border: 3px solid; border-radius: 12px; font-size: 1rem; font-weight: 700; cursor: pointer; transition: all 0.2s; }
.btn:hover { transform: translateY(-2px) rotate(-1deg); }
.btn.btn-secondary { background: transparent; color: #1a1a2e; border-color: #1a1a2e; }
.btn.btn-secondary:hover { background: rgba(0,0,0,0.05); }
.btn.loading { opacity: 0.7; cursor: wait; }
`;

// Copy button styles (per Constitution - vanilla JS, zero dependencies)
export const copyButtonStyles = `
/* Copy Button Base Styles */
.copy-button {
  position: absolute;
  top: 8px;
  right: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #1a1a2e;
  background: #7ecf4a;
  border: 2px solid #1a1a2e;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  z-index: 10;
  min-height: 36px;
  min-width: 36px;
}

.copy-button:hover {
  background: #8edf5a;
  transform: translateY(-1px);
  box-shadow: 2px 2px 0 #1a1a2e;
}

.copy-button:focus-visible {
  outline: 3px solid #4ae8e8;
  outline-offset: 2px;
}

.copy-button:active {
  transform: translateY(0);
}

/* Success state */
.copy-button--success {
  background: #4ae8e8;
  border-color: #1a1a2e;
}

.copy-button--success:hover {
  background: #5cf0f0;
}

/* Error state */
.copy-button--error {
  background: #e84a8a;
  border-color: #1a1a2e;
  color: #fff;
}

.copy-button--error:hover {
  background: #ff5c9e;
}

/* Copy icon and text */
.copy-icon {
  font-size: 1rem;
  line-height: 1;
}

.copy-text {
  font-size: inherit;
  font-weight: inherit;
}

/* Mobile: always visible (< 768px) */
@media (max-width: 767px) {
  .copy-button {
    opacity: 1;
    visibility: visible;
    top: 6px;
    right: 6px;
    padding: 8px 14px;
    min-height: 44px;
    min-width: 44px;
    font-size: 0.95rem;
  }
}

/* Desktop: always visible (>= 768px) */
@media (min-width: 768px) {
  .copy-button {
    opacity: 1;
    visibility: visible;
  }
}

/* Touch devices: always visible */
@media (hover: none) and (pointer: coarse) {
  .copy-button {
    opacity: 1;
    visibility: visible;
    top: 6px;
    right: 6px;
    padding: 8px 14px;
    min-height: 44px;
    min-width: 44px;
  }
}

/* Ensure copyable content has room for button */
[data-copy],
.has-copybox {
  position: relative;
  padding-right: 60px;
}

@media (max-width: 767px) {
  [data-copy],
  .has-copybox {
    padding-right: 70px;
  }
}
`;
