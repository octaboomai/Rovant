import { injectable, inject } from '@theia/core/shared/inversify';
import { BaseWidget, Message } from '@theia/core/lib/browser/widgets/widget';
import { StatefulWidget } from '@theia/core/lib/browser/shell/shell-layout-restorer';
import { MessageService } from '@theia/core/lib/common/message-service';

/**
 * FEATURE 7: ROS topic viewer + telemetry panel
 * Connects via rosbridge WebSocket and shows live topic data
 */
@injectable()
export class RosTopicsWidget extends BaseWidget implements StatefulWidget {
    static readonly ID    = 'Rovant:ros-topics';
    static readonly LABEL = 'ROS Topics';

    @inject(MessageService) protected readonly messageService: MessageService;

    protected iframe: HTMLIFrameElement | undefined;
    /** rosbridge listens on 9090 (inside WSL on Windows). There is no proxy on
     *  the Theia origin, so window.location.host was never right. Still editable. */
    protected rosbridgeUrl = 'ws://localhost:9090';

    constructor() {
        super();
        this.id             = RosTopicsWidget.ID;
        this.title.label    = RosTopicsWidget.LABEL;
        this.title.caption  = 'Live ROS topic viewer via rosbridge';
        this.title.iconClass = 'codicon codicon-pulse';
        this.title.closable  = true;
        this.node.style.cssText = 'width:100%;height:100%;overflow:hidden;';
    }

    storeState(): object { return { rosbridgeUrl: this.rosbridgeUrl }; }
    restoreState(state: object): void {
        const s = state as { rosbridgeUrl?: string };
        this.rosbridgeUrl = s.rosbridgeUrl || 'ws://localhost:9090';
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.renderPanel();
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        if (this.iframe) {
            this.iframe.style.width  = `${this.node.clientWidth}px`;
            this.iframe.style.height = `${this.node.clientHeight}px`;
        }
    }

    private renderPanel(): void {
        this.node.innerHTML = '';
        this.iframe = document.createElement('iframe');
        this.iframe.style.cssText = 'width:100%;height:100%;border:none;';
        this.iframe.srcdoc = this.buildPanelHtml();
        this.node.appendChild(this.iframe);
    }

    private buildPanelHtml(): string {
        return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#07090d;color:#d4e4f0;font-family:system-ui,sans-serif;font-size:13px;height:100vh;display:flex;flex-direction:column}
.toolbar{padding:10px 14px;background:#0d1620;border-bottom:1px solid rgba(255,255,255,.06);display:flex;gap:8px;align-items:center;flex-shrink:0}
input{flex:1;background:#07090d;border:1px solid rgba(15,223,255,.2);color:#d4e4f0;padding:5px 10px;border-radius:5px;font-size:12px;font-family:monospace}
input:focus{outline:none;border-color:rgba(15,223,255,.5)}
.btn{background:rgba(15,223,255,.1);border:1px solid rgba(15,223,255,.28);color:#0fdfff;padding:5px 12px;border-radius:5px;font-size:12px;cursor:pointer}
.btn:hover{background:rgba(15,223,255,.2)}
.btn.d{background:rgba(255,123,68,.1);border-color:rgba(255,123,68,.3);color:#ff7b44}
.sb{padding:4px 14px;background:#0a1520;font-size:11px;font-family:monospace;display:flex;gap:12px;align-items:center;flex-shrink:0}
.dot{width:8px;height:8px;border-radius:50%;background:#7a94a4;flex-shrink:0}
.dot.ok{background:#10c980}.dot.err{background:#ff7b44}
.body{flex:1;display:grid;grid-template-columns:220px 1fr;overflow:hidden}
.list{background:#0a0f14;border-right:1px solid rgba(255,255,255,.05);overflow-y:auto;display:flex;flex-direction:column}
.lh{padding:8px 12px;font-size:11px;color:#7a94a4;font-family:monospace;border-bottom:1px solid rgba(255,255,255,.05);flex-shrink:0}
.ti{padding:8px 12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.03)}
.ti:hover{background:rgba(15,223,255,.05)}
.ti.active{background:rgba(15,223,255,.08);border-left:2px solid #0fdfff}
.tn{font-family:monospace;font-size:11px;color:#d4e4f0;word-break:break-all}
.tt{font-size:10px;color:#7a94a4;margin-top:2px}
.hz{font-size:10px;color:#10c980;float:right}
.dp{overflow-y:auto}
.dh{padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;gap:8px;align-items:center;background:#0d1620;position:sticky;top:0}
.db{padding:12px 14px;font-family:monospace;font-size:12px;line-height:1.6}
pre{white-space:pre-wrap;word-break:break-all}
.k{color:#0fdfff}.v{color:#10c980}.s{color:#f59e0b}.b{color:#b794f4}
.es{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#7a94a4;gap:8px}
</style>
</head>
<body>
<div class="toolbar">
  <span style="font-weight:700;color:#0fdfff;font-size:13px">rosbridge</span>
  <input id="url" value="' + this.rosbridgeUrl + '"/>
  <button class="btn" id="bc">Connect</button>
  <button class="btn d" id="bd" style="display:none">Disconnect</button>
</div>
<div class="sb"><div class="dot" id="dot"></div><span id="st">Not connected</span><span style="color:#7a94a4;margin-left:auto" id="tc"></span></div>
<div class="body">
  <div class="list"><div class="lh" id="lh">Topics (0)</div><div id="li"></div></div>
  <div class="dp" id="dp"><div class="es"><div style="font-size:32px;opacity:.3">📡</div><div>Connect to rosbridge to see live topics</div><div style="font-size:11px">Default: auto-detected from page host</div></div></div>
</div>
<script>
var ros=null,topics={},active=null,sub=null,cnt={},lt={};
var dot=document.getElementById('dot'),st=document.getElementById('st'),tc=document.getElementById('tc'),lh=document.getElementById('lh'),li=document.getElementById('li'),dp=document.getElementById('dp');

function setS(cls,txt){dot.className='dot '+(cls||'');st.textContent=txt;}

function renderList(){
  var names=Object.keys(topics).sort();
  lh.textContent='Topics ('+names.length+')';tc.textContent=names.length+' topics';li.innerHTML='';
  names.forEach(function(n){
    var d=document.createElement('div');d.className='ti'+(n===active?' active':'');
    var hz=cnt[n]?(cnt[n]/Math.max(1,(Date.now()-lt[n])/1000)).toFixed(1)+' Hz':'';
    d.innerHTML='<div class="tn">'+n+'<span class="hz">'+hz+'</span></div><div class="tt">'+(topics[n]||'unknown')+'</div>';
    d.onclick=function(){subscribe(n);};li.appendChild(d);
  });
}

function colorize(o,i){
  i=i||0;var p='  '.repeat(i);
  if(typeof o==='object'&&o!==null){
    if(Array.isArray(o)){if(!o.length)return'<span class="v">[]</span>';var it=o.slice(0,20).map(function(v){return p+'  '+colorize(v,i+1);});if(o.length>20)it.push(p+'  <span style="color:#7a94a4">...('+o.length+')</span>');return'[\n'+it.join(',\n')+'\n'+p+']';}
    var pairs=Object.entries(o).slice(0,50).map(function(e){return p+'  <span class="k">'+e[0]+'</span>: '+colorize(e[1],i+1);});
    return'{\n'+pairs.join(',\n')+'\n'+p+'}';
  }
  if(typeof o==='string')return'<span class="s">"'+o.replace(/</g,'&lt;').substring(0,200)+'"</span>';
  if(typeof o==='boolean')return'<span class="b">'+o+'</span>';
  return'<span class="v">'+o+'</span>';
}

function renderMsg(n,t,msg){
  cnt[n]=(cnt[n]||0)+1;if(!lt[n])lt[n]=Date.now();
  var now=new Date().toISOString().substring(11,23);
  dp.innerHTML='<div class="dh"><span style="color:#0fdfff;font-family:monospace;font-size:11px">'+n+'</span><span style="color:#7a94a4;font-size:11px">'+t+'</span><span style="color:#7a94a4;font-size:11px;margin-left:auto">'+now+'</span></div><div class="db"><pre>'+colorize(msg)+'</pre></div>';
}

function subscribe(n){
  if(sub){try{sub.unsubscribe();}catch(e){}}
  active=n;renderList();if(!ros)return;
  var t=new ROSLIB.Topic({ros:ros,name:n,messageType:topics[n]||''});
  sub=t;t.subscribe(function(m){renderMsg(n,topics[n],m);});
}

function connect(){
  var url=document.getElementById('url').value.trim()||'ws://localhost:9090';
  setS('','Connecting…');
  if(!window.ROSLIB){
    var s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/roslibjs/1.3.0/roslib.min.js';
    s.onload=function(){doConnect(url);};
    s.onerror=function(){setS('err','Failed to load roslib');};
    document.head.appendChild(s);
  }else{doConnect(url);}
}

function doConnect(url){
  ros=new ROSLIB.Ros({url:url});
  ros.on('connection',function(){
    setS('ok','Connected — '+url);
    document.getElementById('bc').style.display='none';
    document.getElementById('bd').style.display='';
    var svc=new ROSLIB.Service({ros:ros,name:'/rosapi/topics',serviceType:'rosapi/Topics'});
    svc.callService(new ROSLIB.ServiceRequest({}),function(r){
      topics={};r.topics.forEach(function(t,i){topics[t]=r.types[i];});renderList();
    },function(e){setS('err','Topics error: '+e);});
  });
  ros.on('error',function(e){setS('err','Error: '+(e.message||e));});
  ros.on('close',function(){setS('','Disconnected');document.getElementById('bc').style.display='';document.getElementById('bd').style.display='none';topics={};renderList();});
}

document.getElementById('bc').onclick=connect;
document.getElementById('bd').onclick=function(){if(ros)ros.close();};
</script>
</body>
</html>`;
    }
}
