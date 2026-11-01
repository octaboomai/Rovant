import { injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';

/* ────────────────────────── Rovant SVG Logo ──────────────────────────────────── */
const O1_LOGO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  <defs>
    <filter id="glow">
      <feGaussianBlur stdDeviation="1.5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="40" height="40" rx="10" fill="#07090d"/>
  <rect x="1" y="1" width="38" height="38" rx="9" fill="none"
        stroke="#0fdfff" stroke-width="0.6" stroke-opacity="0.35"/>
  <text x="20" y="26" font-family="'SF Mono','JetBrains Mono','Fira Code',monospace"
        font-size="16" font-weight="700" text-anchor="middle"
        fill="#0fdfff" filter="url(#glow)">Rovant</text>
</svg>`.trim();

/* ────────────────────────── Rovant Brand CSS ─────────────────────────────────── */
const O1_CSS = `
/* ═══════════════════ Rovant — Brand Theme ═══════════════════ */

/* ── Color tokens ──────────────────────────────────────────── */
body {
  --o1-bg0:      #07090d;
  --o1-bg1:      #0a0e14;
  --o1-bg2:      #0d1520;
  --o1-cyan:     #0fdfff;
  --o1-cyan-dim: rgba(15,223,255,0.18);
  --o1-fg:       #d4e4f0;
  --o1-fg-dim:   #7a94a4;
  --o1-green:    #10c980;
  --o1-orange:   #ff7b44;
  --o1-amber:    #f59e0b;
}

/* ── Activity bar (left icon strip) ───────────────────────── */
#theia-left-content-panel .p-TabBar,
.theia-app-left .p-TabBar {
  background: var(--o1-bg1) !important;
  border-right: 1px solid rgba(255,255,255,0.05);
}
.p-TabBar-tab.theia-mod-active {
  border-left: 2px solid var(--o1-cyan) !important;
}

/* ── Side panel (file explorer, ROS topics, etc.) ─────────── */
#theia-left-content-panel {
  background: var(--o1-bg2) !important;
}
.theia-TreeNode:hover {
  background: var(--o1-cyan-dim) !important;
}

/* ── Editor area ───────────────────────────────────────────── */
.monaco-editor .margin,
.monaco-editor-background {
  background: var(--o1-bg0) !important;
}

/* ── Tab bar ───────────────────────────────────────────────── */
.p-TabBar-content {
  background: var(--o1-bg1);
}
.p-TabBar-tab.theia-mod-current {
  border-top: 2px solid var(--o1-cyan) !important;
  background: var(--o1-bg0) !important;
}

/* ── Status bar (bottom) ───────────────────────────────────── */
#theia-statusBar {
  background: var(--o1-bg1) !important;
  border-top: 1px solid rgba(15,223,255,0.15);
}
#theia-statusBar .area {
  color: var(--o1-fg-dim) !important;
}

/* ── Title bar ─────────────────────────────────────────────── */
.theia-ApplicationShell .theia-top-panel {
  background: var(--o1-bg1) !important;
}

/* ── Menus ─────────────────────────────────────────────────── */
.p-Menu {
  background: var(--o1-bg2) !important;
  border: 1px solid rgba(15,223,255,0.15) !important;
  border-radius: 6px;
}
.p-Menu-item.p-mod-active {
  background: var(--o1-cyan-dim) !important;
}

/* ── Focus border ──────────────────────────────────────────── */
*:focus-visible {
  outline-color: var(--o1-cyan) !important;
}
input:focus, select:focus, textarea:focus {
  border-color: var(--o1-cyan) !important;
}

/* ── Buttons ───────────────────────────────────────────────── */
.theia-button.main {
  background: var(--o1-cyan) !important;
  color: var(--o1-bg0) !important;
  font-weight: 700;
}
.theia-button {
  border-radius: 5px !important;
}

/* ── Scrollbars ────────────────────────────────────────────── */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(15,223,255,0.2); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(15,223,255,0.4); }

/* ── Rovant logo in activity bar (top slot) ───────────────────── */
#o1-logo-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 48px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(15,223,255,0.08);
  background: var(--o1-bg1);
}
#o1-logo-slot svg {
  width: 26px;
  height: 26px;
}
`;

@injectable()
export class O1BrandingContribution implements FrontendApplicationContribution {

    onStart(): void {
        this.injectCSS();
        this.injectLogo();
        this.setFavicon();
        document.title = 'Rovant';
    }

    private injectCSS(): void {
        if (document.getElementById('o1-brand-css')) return;
        const style = document.createElement('style');
        style.id    = 'o1-brand-css';
        style.textContent = O1_CSS;
        document.head.appendChild(style);
    }

    private injectLogo(): void {
        // Poll briefly for the activity bar to mount, then inject
        let attempts = 0;
        const tryInject = () => {
            const bar =
                document.querySelector('.theia-app-left .p-TabBar') ||
                document.querySelector('#theia-left-content-panel .p-TabBar') ||
                document.querySelector('.p-TabBar.theia-app-left');

            if (bar && !document.getElementById('o1-logo-slot')) {
                const slot = document.createElement('div');
                slot.id = 'o1-logo-slot';
                slot.title = 'Rovant';
                slot.innerHTML = O1_LOGO_SVG;
                bar.parentElement?.prepend(slot);
                return;
            }
            if (attempts++ < 30) setTimeout(tryInject, 300);
        };
        setTimeout(tryInject, 500);
    }

    private setFavicon(): void {
        const encoded = encodeURIComponent(O1_LOGO_SVG);
        let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
        }
        link.type = 'image/svg+xml';
        link.href = `data:image/svg+xml,${encoded}`;
    }
}
