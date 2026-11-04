import { injectable, inject } from '@theia/core/shared/inversify';
import { BaseWidget, Message } from '@theia/core/lib/browser/widgets/widget';
import { MessageService } from '@theia/core/lib/common/message-service';

interface CheckResult {
    id: string;
    label: string;
    found: boolean;
    version: string;
}

/**
 * ROS 2 toolchain panel.
 *
 * NOTE ON RENDERING: markup is assigned via innerHTML (fast, no DOM builder), but
 * every event handler is bound in TypeScript in `onAfterAttach`. A <script> block
 * inserted through innerHTML is never executed by the browser, which is why the
 * previous version of this widget rendered but did nothing when clicked.
 */
@injectable()
export class ToolchainInstallerWidget extends BaseWidget {
    static readonly ID    = 'Rovant:toolchain-installer';
    static readonly LABEL = 'ROS 2 Toolchain Setup';

    @inject(MessageService) protected readonly messageService: MessageService;

    private checksEl!: HTMLElement;
    private logWrap!: HTMLElement;
    private logEl!: HTMLElement;
    private eventSource?: EventSource;
    private bound = false;

    constructor() {
        super();
        this.id = ToolchainInstallerWidget.ID;
        this.title.label     = ToolchainInstallerWidget.LABEL;
        this.title.caption   = 'Verify and install the full ROS 2 toolchain';
        this.title.iconClass = 'codicon codicon-package';
        this.title.closable  = true;
        this.node.style.cssText = 'width:100%;height:100%;overflow:auto;';
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        if (!this.bound) {
            this.renderMarkup();
            this.bindHandlers();
            this.bound = true;
            void this.runChecks();
        }
    }

    protected onBeforeDetach(msg: Message): void {
        this.eventSource?.close();
        this.eventSource = undefined;
        super.onBeforeDetach(msg);
    }

    // ── markup only: no <script>, no inline handlers ──────────────────────────
    private renderMarkup(): void {
        this.node.innerHTML = `
<div style="padding:32px;max-width:700px;font-family:'Space Grotesk',system-ui,sans-serif;color:#d4e4f0;">

  <div style="display:flex;align-items:center;gap:14px;margin-bottom:28px;">
    <div style="background:#07090d;border:1px solid rgba(255,255,255,0.18);border-radius:10px;
                padding:8px 14px;font-size:20px;font-weight:700;color:#F1F5F9;font-family:monospace;">Rovant</div>
    <div>
      <h2 style="font-size:20px;color:#fff;margin:0 0 4px;">ROS 2 Toolchain</h2>
      <p style="font-size:13px;color:#7a94a4;margin:0;">
        Verify what is installed on this machine, then install or repair the rest.
      </p>
    </div>
  </div>

  <div data-role="checks" style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px;"></div>

  <div style="display:flex;gap:10px;margin-bottom:28px;flex-wrap:wrap;">
    <button data-action="check"
      style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.22);
             color:#F1F5F9;padding:8px 18px;border-radius:6px;font-size:13px;cursor:pointer;">
      ↻ Check environment
    </button>
    <button data-action="install"
      style="background:#F1F5F9;border:none;color:#070709;padding:8px 18px;
             border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;">
      ⬇ Install / repair
    </button>
  </div>

  <div data-role="logwrap" style="display:none;background:#07090d;
       border:1px solid rgba(255,255,255,0.07);border-radius:8px;
       padding:14px;font-family:'JetBrains Mono',monospace;font-size:12px;
       max-height:320px;overflow-y:auto;margin-bottom:24px;">
    <div data-role="log"></div>
  </div>

  <div style="border-top:1px solid rgba(255,255,255,0.07);padding-top:20px;">
    <p style="font-size:12px;color:#7a94a4;margin-bottom:12px;">Installed or verified by this panel:</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;">
      ${[
        'ROS 2 Humble (Ubuntu 22.04 / WSL2)',
        'rosbridge WebSocket server',
        'colcon build system',
        'rosdep + vcstool',
        'clangd (C++ language server)',
        'pyright (Python language server)',
        'pymavlink + pyulog',
        'numpy',
      ].map(item => `
        <div style="display:flex;align-items:center;gap:8px;color:#d4e4f0;">
          <span style="color:#10c980;font-size:14px;">✓</span>${item}
        </div>`).join('')}
    </div>
  </div>
</div>`;

        this.checksEl = this.node.querySelector('[data-role="checks"]') as HTMLElement;
        this.logWrap  = this.node.querySelector('[data-role="logwrap"]') as HTMLElement;
        this.logEl    = this.node.querySelector('[data-role="log"]') as HTMLElement;
    }

    // ── behaviour: real listeners, real `this` ────────────────────────────────
    private bindHandlers(): void {
        const checkBtn = this.node.querySelector('[data-action="check"]') as HTMLButtonElement | null;
        const installBtn = this.node.querySelector('[data-action="install"]') as HTMLButtonElement | null;

        checkBtn?.addEventListener('click', () => { void this.runChecks(); });
        installBtn?.addEventListener('click', () => { this.startInstall(); });
    }

    private renderCheck(r: CheckResult): void {
        let el = this.checksEl.querySelector(`[data-check="${r.id}"]`) as HTMLElement | null;
        if (!el) {
            el = document.createElement('div');
            el.dataset.check = r.id;
            el.style.cssText = [
                'padding:10px 14px',
                'background:#0d1620',
                'border:1px solid rgba(255,255,255,0.06)',
                'border-radius:6px',
                'font-size:12.5px',
                'display:flex',
                'align-items:center',
                'gap:10px',
            ].join(';');
            this.checksEl.appendChild(el);
        }
        const state = r.found ? 'ok' : (r.version === '...' ? 'checking' : 'missing');
        const colors: Record<string, string> = { ok: '#10c980', missing: '#ff7b44', checking: '#F1F5F9' };
        const icons:  Record<string, string> = { ok: '✓', missing: '✗', checking: '↻' };

        el.innerHTML = `
    <span style="color:${colors[state]};font-size:16px;flex-shrink:0;">${icons[state]}</span>
    <span style="flex:1;font-weight:500;">${r.label}</span>
    <span style="font-family:monospace;font-size:11px;color:#7a94a4;text-align:right;max-width:280px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">
      ${r.version}
    </span>`;
    }

    private appendLog(line: string, type = 'log'): void {
        const colors: Record<string, string> = {
            log: '#d4e4f0', cmd: '#8FD3FF', info: '#10c980',
            warn: '#f59e0b', error: '#ff7b44', done: '#10c980',
        };
        const d = document.createElement('div');
        d.style.color = colors[type] || '#d4e4f0';
        d.textContent = line;
        this.logEl.appendChild(d);
        this.logWrap.scrollTop = this.logWrap.scrollHeight;
    }

    private async runChecks(): Promise<void> {
        this.checksEl.innerHTML = '';
        const tools: CheckResult[] = [
            { id: 'ros2',      label: 'ROS 2 Humble',   found: false, version: '...' },
            { id: 'colcon',    label: 'colcon',         found: false, version: '...' },
            { id: 'rosdep',    label: 'rosdep',         found: false, version: '...' },
            { id: 'docker',    label: 'Docker Engine',  found: false, version: '...' },
            { id: 'clangd',    label: 'clangd',         found: false, version: '...' },
            { id: 'pyright',   label: 'pyright',        found: false, version: '...' },
            { id: 'pymavlink', label: 'pymavlink',      found: false, version: '...' },
            { id: 'rosbridge', label: 'rosbridge-suite', found: false, version: '...' },
        ];
        tools.forEach(t => this.renderCheck(t));

        try {
            const res = await fetch('/rovant/check');
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const results = await res.json() as CheckResult[];
            results.forEach(r => this.renderCheck(r));
        } catch (e: any) {
            this.appendLog('Check failed: ' + (e?.message ?? e) + ' — is the IDE backend running?', 'error');
            this.logWrap.style.display = '';
        }
    }

    private startInstall(): void {
        this.logWrap.style.display = '';
        this.logEl.innerHTML = '';
        this.eventSource?.close();

        const es = new EventSource('/rovant/install-stream');
        this.eventSource = es;

        es.onmessage = (e: MessageEvent) => {
            try {
                const { type, line } = JSON.parse(e.data);
                this.appendLog(line, type);
                if (type === 'done' || type === 'error') {
                    es.close();
                    void this.runChecks();
                }
            } catch {
                this.appendLog(e.data, 'log');
            }
        };
        es.onerror = () => {
            this.appendLog('Connection lost — check the install log on the backend', 'error');
            es.close();
        };
    }
}
