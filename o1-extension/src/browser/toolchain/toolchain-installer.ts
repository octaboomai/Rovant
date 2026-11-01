import { injectable, inject } from '@theia/core/shared/inversify';
import { BaseWidget, Message } from '@theia/core/lib/browser/widgets/widget';
import { MessageService } from '@theia/core/lib/common/message-service';

interface CheckResult {
    id: string;
    label: string;
    found: boolean;
    version: string;
}

@injectable()
export class ToolchainInstallerWidget extends BaseWidget {
    static readonly ID    = 'Rovant:toolchain-installer';
    static readonly LABEL = 'ROS 2 Toolchain Setup';

    @inject(MessageService) protected readonly messageService: MessageService;

    constructor() {
        super();
        this.id = ToolchainInstallerWidget.ID;
        this.title.label    = ToolchainInstallerWidget.LABEL;
        this.title.caption  = 'Verify and install the full ROS 2 toolchain';
        this.title.iconClass = 'codicon codicon-package';
        this.title.closable  = true;
        this.node.style.cssText = 'width:100%;height:100%;overflow:auto;';
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.render();
    }

    private render(): void {
        this.node.innerHTML = `
<div id="tc-root" style="padding:32px;max-width:700px;font-family:'Space Grotesk',system-ui,sans-serif;color:#d4e4f0;">

  <!-- Header -->
  <div style="display:flex;align-items:center;gap:14px;margin-bottom:28px;">
    <div style="background:#07090d;border:1px solid rgba(15,223,255,0.25);border-radius:10px;
                padding:8px 14px;font-size:20px;font-weight:700;color:#0fdfff;font-family:monospace;">Rovant</div>
    <div>
      <h2 style="font-size:20px;color:#fff;margin:0 0 4px;">ROS 2 Toolchain</h2>
      <p style="font-size:13px;color:#7a94a4;margin:0;">
        All tools are pre-installed inside this container. Run checks to verify.
      </p>
    </div>
  </div>

  <!-- Status grid -->
  <div id="tc-checks" style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px;"></div>

  <!-- Actions -->
  <div style="display:flex;gap:10px;margin-bottom:28px;flex-wrap:wrap;">
    <button id="tc-btn-check"
      style="background:rgba(15,223,255,0.1);border:1px solid rgba(15,223,255,0.3);
             color:#0fdfff;padding:8px 18px;border-radius:6px;font-size:13px;cursor:pointer;">
      ↻ Check environment
    </button>
    <button id="tc-btn-install"
      style="background:#0fdfff;border:none;color:#07090d;padding:8px 18px;
             border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;">
      ⬇ Install / repair
    </button>
  </div>

  <!-- Install log (SSE) -->
  <div id="tc-log-wrap" style="display:none;background:#07090d;
       border:1px solid rgba(255,255,255,0.07);border-radius:8px;
       padding:14px;font-family:'JetBrains Mono',monospace;font-size:12px;
       max-height:320px;overflow-y:auto;margin-bottom:24px;">
    <div id="tc-log"></div>
  </div>

  <!-- What's included -->
  <div style="border-top:1px solid rgba(255,255,255,0.07);padding-top:20px;">
    <p style="font-size:12px;color:#7a94a4;margin-bottom:12px;">Bundled inside this container:</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;">
      ${[
        'ROS 2 Humble (Ubuntu 22.04)',
        'rosbridge WebSocket server',
        'colcon build system',
        'rosdep + vcstool',
        'clangd-15 (C++ LSP)',
        'pyright (Python LSP)',
        'pymavlink + pyulog',
        'numpy (anomaly FFT)',
      ].map(item => `
        <div style="display:flex;align-items:center;gap:8px;color:#d4e4f0;">
          <span style="color:#10c980;font-size:14px;">✓</span>${item}
        </div>`).join('')}
    </div>
  </div>
</div>

<script>
const root  = document.getElementById('tc-root');
const checksEl = document.getElementById('tc-checks');
const logWrap  = document.getElementById('tc-log-wrap');
const logEl    = document.getElementById('tc-log');

/* ── Render one check row ─────────────────────────────────── */
function renderCheck(r) {
  let el = document.getElementById('chk-' + r.id);
  if (!el) {
    el = document.createElement('div');
    el.id = 'chk-' + r.id;
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
    checksEl.appendChild(el);
  }
  const stateColors = { ok:'#10c980', missing:'#ff7b44', checking:'#0fdfff' };
  const stateIcons  = { ok:'✓', missing:'✗', checking:'↻' };
  const state = r.found ? 'ok' : (r.version === '...' ? 'checking' : 'missing');
  el.innerHTML = \`
    <span style="color:\${stateColors[state]};font-size:16px;flex-shrink:0;">\${stateIcons[state]}</span>
    <span style="flex:1;font-weight:500;">\${r.label}</span>
    <span style="font-family:monospace;font-size:11px;color:#7a94a4;text-align:right;max-width:280px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">
      \${r.version}
    </span>\`;
}

/* ── Log line ─────────────────────────────────────────────── */
function appendLog(line, type) {
  const colors = { log:'#d4e4f0', cmd:'#0fdfff', info:'#10c980', warn:'#f59e0b', error:'#ff7b44', done:'#10c980' };
  const d = document.createElement('div');
  d.style.color = colors[type] || '#d4e4f0';
  d.textContent = line;
  logEl.appendChild(d);
  logWrap.scrollTop = logWrap.scrollHeight;
}

/* ── Run checks via real backend ──────────────────────────── */
async function runChecks() {
  checksEl.innerHTML = '';
  // show placeholders first
  const tools = [
    {id:'ros2',label:'ROS 2 Humble'},{id:'colcon',label:'colcon'},
    {id:'rosdep',label:'rosdep'},{id:'docker',label:'Docker Engine'},
    {id:'clangd',label:'clangd'},{id:'pyright',label:'pyright'},
    {id:'pymavlink',label:'pymavlink'},{id:'rosbridge',label:'rosbridge-suite'},
  ];
  tools.forEach(t => renderCheck({...t, found:false, version:'...'}));

  try {
    const res = await fetch('/o1/check');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const results = await res.json();
    results.forEach(r => renderCheck(r));
  } catch (e) {
    appendLog('Check failed: ' + e.message + ' — is the IDE backend running?', 'error');
    logWrap.style.display = '';
  }
}

/* ── Stream install log via SSE ───────────────────────────── */
function startInstall() {
  logWrap.style.display = '';
  logEl.innerHTML = '';
  if (window._o1Es) { window._o1Es.close(); }
  const es = new EventSource('/o1/install-stream');
  window._o1Es = es;
  es.onmessage = e => {
    try {
      const { type, line } = JSON.parse(e.data);
      appendLog(line, type);
      if (type === 'done' || type === 'error') {
        es.close();
        runChecks(); // re-check after install
      }
    } catch { appendLog(e.data, 'log'); }
  };
  es.onerror = () => {
    appendLog('Connection lost — check container logs', 'error');
    es.close();
  };
}

document.getElementById('tc-btn-check').onclick   = runChecks;
document.getElementById('tc-btn-install').onclick = startInstall;

// Auto-check on open
runChecks();
</script>`;
    }
}
