import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar';
import { CommandRegistry } from '@theia/core/lib/common/command';

/**
 * In-app self-update pill.
 *
 * Shows a small dark pill in the title bar when a new version is available,
 * turns into a progress readout while it downloads, and opens a changelog
 * modal before installing. All the actual download/install work happens in
 * the Electron main process — this file only renders state and sends three
 * IPC calls.
 *
 * In a plain browser (no Electron preload) `window.Rovant.onUpdateStatus` does
 * not exist, so the whole contribution no-ops.
 */

interface RovantUpdateState {
    status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error' | 'unsupported';
    currentVersion: string;
    latestVersion?: string;
    releaseNotes?: string[];
    percent?: number;
    error?: string;
}

interface RovantBridge {
    updateGetState(): Promise<RovantUpdateState>;
    updateCheck(): Promise<RovantUpdateState>;
    updateInstall(): Promise<boolean>;
    updateDismiss(): Promise<RovantUpdateState>;
    onUpdateStatus(cb: (state: RovantUpdateState) => void): () => void;
}

declare global {
    interface Window { Rovant?: RovantBridge & Record<string, unknown>; }
}

const CSS = `
#rovant-update-pill{
  display:none;align-items:center;gap:8px;height:26px;padding:0 12px;margin-left:8px;
  border-radius:999px;border:1px solid rgba(255,255,255,.14);
  background:#1F242D;color:#FFFFFF;
  font-family:'Inter',system-ui,sans-serif;font-size:12px;font-weight:500;letter-spacing:.01em;
  cursor:pointer;white-space:nowrap;position:relative;overflow:hidden;
  transition:background .16s ease,border-color .16s ease,transform .16s ease;
}
#rovant-update-pill:hover{background:#262C36;border-color:rgba(255,255,255,.28)}
#rovant-update-pill:active{transform:scale(.98)}
#rovant-update-pill:focus-visible{outline:2px solid #7DF3FF;outline-offset:2px}
#rovant-update-pill[data-state="downloading"]{cursor:default;color:#C9D1DA}
#rovant-update-pill[data-state="downloaded"]{border-color:rgba(125,243,255,.45);color:#EAF6FF}
#rovant-update-pill .rovant-dot{
  width:6px;height:6px;border-radius:50%;background:#10C980;flex:none;
}
#rovant-update-pill[data-state="downloading"] .rovant-dot{background:#7DF3FF;animation:rovant-pulse 1.1s ease-in-out infinite}
#rovant-update-pill .rovant-bar{
  position:absolute;left:0;bottom:0;height:2px;width:0%;background:#7DF3FF;
  transition:width .3s ease;
}
@keyframes rovant-pulse{0%,100%{opacity:1}50%{opacity:.25}}

#rovant-update-scrim{
  position:fixed;inset:0;z-index:99998;display:none;align-items:center;justify-content:center;
  background:rgba(4,5,7,.66);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);
  font-family:'Inter',system-ui,sans-serif;
}
#rovant-update-scrim.is-open{display:flex}
#rovant-update-modal{
  width:min(440px,92vw);border-radius:14px;overflow:hidden;
  background:#12151A;border:1px solid rgba(255,255,255,.10);
  box-shadow:0 1px 0 rgba(255,255,255,.05) inset,0 32px 80px -24px rgba(0,0,0,.95);
  color:#E6E9EE;
}
#rovant-update-modal .rovant-modal-head{padding:20px 22px 0}
#rovant-update-modal h3{margin:0;font-size:16px;font-weight:600;letter-spacing:-.01em;color:#FFFFFF}
#rovant-update-modal .rovant-ver{
  margin-top:6px;font-family:'JetBrains Mono',monospace;font-size:11.5px;color:#7A8494;letter-spacing:.04em;
}
#rovant-update-modal .rovant-notes{padding:16px 22px 4px;max-height:220px;overflow-y:auto}
#rovant-update-modal .rovant-notes ul{margin:0;padding:0;list-style:none;display:grid;gap:9px}
#rovant-update-modal .rovant-notes li{
  position:relative;padding-left:16px;font-size:13.5px;line-height:1.55;color:#B7BFCA;
}
#rovant-update-modal .rovant-notes li::before{
  content:"";position:absolute;left:0;top:8px;width:5px;height:5px;border-radius:50%;background:#10C980;
}
#rovant-update-modal .rovant-actions{
  display:flex;gap:10px;justify-content:flex-end;padding:18px 22px 20px;
}
#rovant-update-modal button{
  font-family:inherit;font-size:13px;font-weight:500;padding:9px 16px;border-radius:8px;cursor:pointer;
  border:1px solid rgba(255,255,255,.12);background:#1F242D;color:#E6E9EE;
  transition:background .15s,border-color .15s;
}
#rovant-update-modal button:hover{background:#262C36;border-color:rgba(255,255,255,.26)}
#rovant-update-modal button.rovant-primary{
  background:#F1F5F9;color:#0B0D10;border-color:#F1F5F9;font-weight:600;
}
#rovant-update-modal button.rovant-primary:hover{background:#FFFFFF;border-color:#FFFFFF}
#rovant-update-modal button:disabled{opacity:.5;cursor:default}
@media (prefers-reduced-motion:reduce){
  #rovant-update-pill,#rovant-update-pill .rovant-bar{transition:none}
  #rovant-update-pill .rovant-dot{animation:none}
}
`;

@injectable()
export class RovantUpdaterContribution implements FrontendApplicationContribution {

    @inject(StatusBar)       protected readonly statusBar: StatusBar;
    @inject(CommandRegistry) protected readonly commands: CommandRegistry;

    private bridge?: RovantBridge;
    private pill?: HTMLButtonElement;
    private scrim?: HTMLDivElement;
    private state?: RovantUpdateState;
    private unsubscribe?: () => void;

    onStart(): void {
        const bridge = window.Rovant as RovantBridge | undefined;
        // Not running inside Electron (plain browser) — nothing to update.
        if (!bridge || typeof bridge.onUpdateStatus !== 'function') return;
        this.bridge = bridge;

        this.injectCSS();
        this.mountPill();

        // The pill only appears when there is something to act on. The status bar
        // entry is always present, so there is a visible way to check for updates
        // even when nothing has been found yet — and it works even if the title
        // bar DOM this build ships differs from the one the pill targets.
        this.commands.registerCommand(
            { id: 'rovant.checkForUpdates', label: 'Rovant: Check for Updates' },
            { execute: () => { void this.bridge?.updateCheck(); } },
        );
        this.commands.registerCommand(
            { id: 'rovant.installUpdate', label: 'Rovant: Install Downloaded Update' },
            { execute: () => { void this.install(); } },
        );
        this.renderStatus({ status: 'checking', currentVersion: '' });

        // Replay the current state in case the main process broadcast before we
        // were listening, then subscribe to future changes.
        bridge.updateGetState()
            .then(state => this.apply(state))
            .catch(() => { /* updater unavailable — stay hidden */ });

        this.unsubscribe = bridge.onUpdateStatus(state => this.apply(state));
    }

    onStop(): void {
        this.unsubscribe?.();
        this.pill?.remove();
        this.scrim?.remove();
    }

    // ── rendering ─────────────────────────────────────────────────────────────

    private injectCSS(): void {
        if (document.getElementById('rovant-update-css')) return;
        const style = document.createElement('style');
        style.id = 'rovant-update-css';
        style.textContent = CSS;
        document.head.appendChild(style);
    }

    private mountPill(): void {
        if (this.pill) return;

        const pill = document.createElement('button');
        pill.id = 'rovant-update-pill';
        pill.type = 'button';
        pill.setAttribute('aria-live', 'polite');
        pill.innerHTML = '<span class="rovant-dot"></span><span class="rovant-label"></span><span class="rovant-bar"></span>';
        pill.addEventListener('click', () => this.onPillClick());
        this.pill = pill;

        // Prefer the title bar; fall back to a fixed position if the Theia DOM
        // has not mounted or uses a different structure in this build.
        let attempts = 0;
        const place = (): void => {
            const host =
                document.querySelector('.theia-title-bar-right') ||
                document.querySelector('.theia-title-bar') ||
                document.querySelector('#theia-top-panel .p-TabBar');
            if (host) {
                host.appendChild(pill);
                return;
            }
            if (attempts++ < 40) { setTimeout(place, 250); return; }
            pill.style.position = 'fixed';
            pill.style.top = '6px';
            pill.style.right = '14px';
            pill.style.zIndex = '9999';
            document.body.appendChild(pill);
        };
        place();
    }

    private renderStatus(state: RovantUpdateState): void {
        let text = 'Updates';
        let tooltip = 'Check for updates';
        let command = 'rovant.checkForUpdates';

        switch (state.status) {
            case 'available':
                text = `Update to v${state.latestVersion ?? ''}`;
                tooltip = 'A new version of Rovant is available';
                break;
            case 'downloading':
                text = `Updating… ${state.percent ?? 0}%`;
                tooltip = 'Downloading the update';
                command = '';
                break;
            case 'downloaded':
                text = 'Restart to update';
                tooltip = 'The update is downloaded and ready to install';
                command = 'rovant.installUpdate';
                break;
            case 'checking':
                text = 'Checking for updates…';
                tooltip = 'Contacting GitHub Releases';
                command = '';
                break;
            case 'up-to-date':
                text = 'Up to date';
                tooltip = `Rovant ${state.currentVersion} is the latest version`;
                break;
            case 'error':
                text = 'Update check failed';
                tooltip = state.error ?? 'Could not reach the update server';
                break;
            case 'unsupported':
                text = 'Updates unavailable';
                tooltip = state.error ?? 'This install is updated another way';
                command = '';
                break;
            default:
                break;
        }

        const entry = {
            text,
            tooltip,
            ...(command ? { command } : {}),
            alignment: StatusBarAlignment.RIGHT,
            priority: 100,
        };

        // onStart can run before the status bar has mounted, and setElement on a
        // bar that is not there yet is silently dropped — which is why the update
        // control could be missing entirely. Set it now, then again once the shell
        // is definitely up.
        this.setStatus(entry);
        if (!this.statusRetried) {
            this.statusRetried = true;
            setTimeout(() => this.setStatus(entry), 2500);
            setTimeout(() => this.setStatus(entry), 8000);
        }
    }

    private statusRetried = false;

    private setStatus(entry: Parameters<StatusBar['setElement']>[1]): void {
        try {
            this.statusBar.setElement('rovant-update', entry);
        } catch {
            /* bar not ready yet — the retries above will land it */
        }
    }

    private apply(state: RovantUpdateState): void {
        this.state = state;
        this.renderStatus(state);
        const pill = this.pill;
        if (!pill) return;

        const label = pill.querySelector('.rovant-label') as HTMLElement | null;
        const bar   = pill.querySelector('.rovant-bar') as HTMLElement | null;
        if (!label) return;

        const version = state.latestVersion ? `v${state.latestVersion}` : 'a new version';

        switch (state.status) {
            case 'available':
                pill.style.display = 'inline-flex';
                pill.dataset.state = 'available';
                pill.disabled = false;
                label.textContent = `Update to ${version}`;
                pill.title = 'A new version of Rovant is available';
                if (bar) bar.style.width = '0%';
                break;

            case 'downloading':
                pill.style.display = 'inline-flex';
                pill.dataset.state = 'downloading';
                pill.disabled = true;
                label.textContent = `Updating… ${state.percent ?? 0}%`;
                pill.title = 'Downloading the update';
                if (bar) bar.style.width = `${state.percent ?? 0}%`;
                break;

            case 'downloaded':
                pill.style.display = 'inline-flex';
                pill.dataset.state = 'downloaded';
                pill.disabled = false;
                label.textContent = `Restart to update to ${version}`;
                pill.title = 'The update is downloaded and ready to install';
                if (bar) bar.style.width = '100%';
                break;

            case 'error':
                // Quiet failure: hide rather than nag. The menu still has
                // "Check for Updates…" for a manual retry.
                pill.style.display = 'none';
                if (bar) bar.style.width = '0%';
                break;

            default: // idle | checking | up-to-date | unsupported
                pill.style.display = 'none';
                if (bar) bar.style.width = '0%';
                break;
        }
    }

    // ── interaction ───────────────────────────────────────────────────────────

    private onPillClick(): void {
        if (!this.state) return;
        if (this.state.status === 'downloaded') { void this.install(); return; }
        if (this.state.status === 'available')   { this.openModal(); }
    }

    private openModal(): void {
        if (!this.state || !this.bridge) return;
        if (this.scrim) this.scrim.remove();

        const currentVersion = this.state.currentVersion;
        const latest = this.state.latestVersion;
        const version = latest ? `v${latest}` : 'a new version';
        const notes = (this.state.releaseNotes ?? []).filter(Boolean);

        const scrim = document.createElement('div');
        scrim.id = 'rovant-update-scrim';
        scrim.className = 'is-open';
        scrim.setAttribute('role', 'dialog');
        scrim.setAttribute('aria-modal', 'true');
        scrim.setAttribute('aria-label', `Rovant ${version} is available`);

        const list = notes.length
            ? `<ul>${notes.map(n => `<li>${this.escape(n)}</li>`).join('')}</ul>`
            : `<ul><li>Bug fixes and performance improvements.</li></ul>`;

        scrim.innerHTML = `
          <div id="rovant-update-modal">
            <div class="rovant-modal-head">
              <h3>Rovant ${this.escape(version)} is available</h3>
              <div class="rovant-ver">Installed ${this.escape(currentVersion)} &rarr; ${this.escape(version)}</div>
            </div>
            <div class="rovant-notes">${list}</div>
            <div class="rovant-actions">
              <button type="button" class="rovant-later">Later</button>
              <button type="button" class="rovant-primary rovant-install">Restart and update</button>
            </div>
          </div>`;

        scrim.addEventListener('click', e => { if (e.target === scrim) this.closeModal(); });
        document.addEventListener('keydown', this.onKey);

        (scrim.querySelector('.rovant-later') as HTMLButtonElement)
            .addEventListener('click', () => {
                this.closeModal();
                // Hide the pill but keep the downloaded state, so a later restart
                // still applies the update.
                void this.bridge?.updateDismiss();
            });

        (scrim.querySelector('.rovant-install') as HTMLButtonElement)
            .addEventListener('click', () => { void this.install(); });

        document.body.appendChild(scrim);
        this.scrim = scrim;
        (scrim.querySelector('.rovant-install') as HTMLButtonElement).focus();
    }

    private closeModal(): void {
        document.removeEventListener('keydown', this.onKey);
        this.scrim?.remove();
        this.scrim = undefined;
    }

    private readonly onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') this.closeModal();
    };

    private async install(): Promise<void> {
        const btn = this.scrim?.querySelector('.rovant-install') as HTMLButtonElement | null;
        if (btn) { btn.disabled = true; btn.textContent = 'Restarting…'; }
        try {
            await this.bridge?.updateInstall();
        } catch {
            if (btn) { btn.disabled = false; btn.textContent = 'Restart and update'; }
        }
    }

    private escape(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
