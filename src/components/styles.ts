// Shared CSS styles for all pages

export const resetStyles = `
* { margin: 0; padding: 0; box-sizing: border-box; }

:focus-visible { outline: 3px solid #4ae8e8; outline-offset: 2px; }
:focus:not(:focus-visible) { outline: none; }
`;

export const headerStyles = `
header { background: linear-gradient(180deg, #e84a8a 0%, #d63a7a 100%); padding: 0; position: sticky; top: 0; z-index: 100; box-shadow: 0 4px 20px rgba(232,74,138,0.4); }
.header-inner { max-width: 1000px; margin: 0 auto; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.logo { font-family: 'Comic Neue', cursive; font-size: 1.8rem; font-weight: 700; color: #fff; text-decoration: none; text-shadow: 2px 2px 0 rgba(0,0,0,0.3); display: flex; align-items: center; gap: 10px; }
.logo span { color: #f5d76e; text-shadow: 2px 2px 0 rgba(0,0,0,0.3); }
.tagline { font-size: 0.9rem; color: rgba(255,255,255,0.9); display: block; font-family: 'Comic Neue', cursive; font-weight: 700; margin-left: 4px; }

.mascot { font-size: 2.8rem; animation: float 3s ease-in-out infinite; display: inline-block; filter: drop-shadow(2px 2px 0 rgba(0,0,0,0.3)); }
@keyframes float { 0%, 100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-8px) rotate(3deg); } }

.header-cta { color: rgba(255,255,255,0.9); font-size: 0.85rem; display: none; }
.header-cta a { color: #f5d76e; font-weight: 700; text-decoration: none; }
.header-cta a:hover { text-decoration: underline; }
@media (min-width: 800px) { .header-cta { display: block; } }

.auth-buttons { display: flex; gap: 10px; }
.auth-buttons .btn-secondary { background: rgba(255,255,255,0.15); color: #fff; border-color: rgba(255,255,255,0.4); }
.auth-buttons .btn-secondary:hover { background: rgba(255,255,255,0.25); box-shadow: 2px 2px 0 rgba(0,0,0,0.2); }
.auth-buttons .btn-primary { background: #f5d76e; color: #1a1a2e; border-color: #1a1a2e; }
`;

export const statsBarStyles = `
.stats-banner { background: #1a1a2e; padding: 10px 16px; border-bottom: 3px solid #7ecf4a; }
.stats-inner { max-width: 1000px; margin: 0 auto; display: flex; justify-content: center; gap: 40px; flex-wrap: wrap; }
.stat-item { text-align: center; display: flex; align-items: center; gap: 8px; }
.stat-value { font-size: 1.4rem; font-weight: 700; color: #7ecf4a; display: flex; align-items: center; gap: 6px; }
.stat-value .live-dot { width: 8px; height: 8px; background: #7ecf4a; border-radius: 50%; animation: pulse 2s ease-in-out infinite; box-shadow: 0 0 6px #7ecf4a; }
.stat-label { font-size: 0.85rem; color: #f5f0e1; font-weight: 500; }
@keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.8); } }
`;

export const footerStyles = `
footer { text-align: center; padding: 28px 18px; color: #7ecf4a; font-size: 1rem; }
footer a { color: #e84a8a; text-decoration: none; font-weight: 700; }
footer a:hover { text-decoration: underline; }
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
header { position: relative; }
.header-inner { max-width: 800px; }
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
