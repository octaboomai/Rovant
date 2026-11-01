import { injectable, inject } from '@theia/core/shared/inversify';
import { BaseWidget, Message } from '@theia/core/lib/browser/widgets/widget';
import { StatefulWidget } from '@theia/core/lib/browser/shell/shell-layout-restorer';
import { MessageService } from '@theia/core/lib/common/message-service';

/**
 * FEATURE 3: URDF / Xacro 3D preview
 * - .urdf files: parsed directly in the Three.js webview
 * - .xacro files: expanded server-side via /o1/xacro-expand then rendered
 */
@injectable()
export class UrdfViewerWidget extends BaseWidget implements StatefulWidget {
    static readonly ID    = 'Rovant:urdf-viewer';
    static readonly LABEL = 'URDF Preview';

    @inject(MessageService) protected readonly messageService: MessageService;

    protected urdfContent  = '';
    protected currentFile  = '';
    protected iframe: HTMLIFrameElement | undefined;

    constructor() {
        super();
        this.id             = UrdfViewerWidget.ID;
        this.title.label    = UrdfViewerWidget.LABEL;
        this.title.caption  = 'URDF / Xacro 3D Preview';
        this.title.iconClass = 'codicon codicon-circuit-board';
        this.title.closable  = true;
        this.node.style.cssText = 'width:100%;height:100%;overflow:hidden;background:#0d1117;';
    }

    storeState(): object { return { urdfContent: this.urdfContent, currentFile: this.currentFile }; }

    restoreState(state: object): void {
        const s = state as { urdfContent?: string; currentFile?: string };
        this.urdfContent = s.urdfContent || '';
        this.currentFile = s.currentFile || '';
        if (this.isAttached) { this.renderViewer(); if (this.urdfContent) this.sendUrdf(); }
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.renderViewer();
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        if (this.iframe) {
            this.iframe.style.width  = `${this.node.clientWidth}px`;
            this.iframe.style.height = `${this.node.clientHeight}px`;
        }
    }

    /** Called by the editor-change listener for .urdf files — load directly */
    async loadUrdf(content: string, filename: string): Promise<void> {
        this.urdfContent = content;
        this.currentFile = filename;
        this.title.label = `URDF: ${filename}`;
        this.sendUrdf();
    }

    /**
     * Called by the editor-change listener for .xacro files.
     * Sends the file path to the backend, which runs `ros2 run xacro xacro`
     * and returns the expanded URDF. Falls back to raw parse on error.
     */
    async loadXacro(filePath: string, filename: string): Promise<void> {
        this.currentFile = filename;
        this.title.label = `URDF: ${filename} (xacro)`;

        if (this.iframe && this.iframe.contentWindow) {
            this.iframe.contentWindow.postMessage({ type: 'loading', filename }, '*');
        }

        try {
            const url = `/o1/xacro-expand?path=${encodeURIComponent(filePath)}`;
            const res = await fetch(url);

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
                throw new Error((err as { error: string }).error);
            }

            const urdfXml = await res.text();
            this.urdfContent = urdfXml;
            this.sendUrdf();
        } catch (e: any) {
            this.messageService.warn(
                `xacro expansion failed: ${e.message}. ` +
                `Ensure ROS 2 is sourced and the file has no missing dependencies. ` +
                `Attempting raw parse as fallback.`
            );
            // Fallback: try parsing the raw xacro as XML (works for simple files)
            if (this.iframe && this.iframe.contentWindow) {
                this.iframe.contentWindow.postMessage(
                    { type: 'load-urdf', content: this.urdfContent, isXacro: true },
                    '*'
                );
            }
        }
    }

    private sendUrdf(): void {
        if (this.iframe && this.iframe.contentWindow && this.urdfContent) {
            this.iframe.contentWindow.postMessage(
                { type: 'load-urdf', content: this.urdfContent, isXacro: this.currentFile.endsWith('.xacro') },
                '*'
            );
        }
    }

    private renderViewer(): void {
        this.node.innerHTML = '';
        this.iframe = document.createElement('iframe');
        this.iframe.style.cssText = 'width:100%;height:100%;border:none;';
        this.iframe.srcdoc = this.buildViewerHtml();
        this.node.appendChild(this.iframe);

        window.addEventListener('message', (event) => {
            if (event.data?.type === 'urdf-error') {
                this.messageService.error(`URDF parse error: ${event.data.message}`);
            }
        });
    }

    private buildViewerHtml(): string {
        return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d1117;overflow:hidden;font-family:system-ui,sans-serif}
canvas{display:block;width:100vw;height:100vh}
#tb{position:absolute;top:12px;left:12px;display:flex;gap:8px;z-index:10;
    background:rgba(13,22,32,.92);border:1px solid rgba(15,223,255,.18);
    border-radius:8px;padding:8px 14px;align-items:center}
#tb .ti{font-weight:700;font-size:13px;color:#0fdfff}
#tb .sub{font-size:11px;color:#7a94a4}
button{background:rgba(15,223,255,.1);border:1px solid rgba(15,223,255,.28);
       color:#0fdfff;border-radius:5px;padding:4px 10px;font-size:11px;cursor:pointer}
button:hover{background:rgba(15,223,255,.22)}
#st{position:absolute;bottom:12px;left:12px;font-size:11px;font-family:monospace;
    color:rgba(15,223,255,.7);background:rgba(13,22,32,.85);padding:4px 10px;border-radius:4px}
#drop{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
      border:2px dashed rgba(15,223,255,.25);border-radius:14px;
      padding:44px 64px;text-align:center;color:rgba(15,223,255,.55);
      background:rgba(15,223,255,.03);pointer-events:none}
#drop.hidden{display:none}
#drop h3{font-size:17px;margin-bottom:8px}
#drop p{font-size:12px;opacity:.7}
#drop .note{font-size:10px;opacity:.5;margin-top:8px}
#loading{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
         text-align:center;color:#0fdfff;font-family:monospace;font-size:13px}
#loading.hidden{display:none}
</style></head><body>
<canvas id="c"></canvas>
<div id="tb">
  <span class="ti">Rovant</span>
  <span class="sub" id="file-label">URDF Preview</span>
  <button onclick="resetCam()">Reset</button>
  <button onclick="toggleWire()">Wireframe</button>
  <button onclick="axes.visible=!axes.visible">Axes</button>
</div>
<div id="st">No file loaded</div>
<div id="drop">
  <h3>URDF / Xacro Preview</h3>
  <p>Open a .urdf or .xacro file from the editor<br/>or drag &amp; drop here</p>
  <p class="note">.xacro files are expanded server-side via ros2 run xacro xacro</p>
</div>
<div id="loading" class="hidden">Expanding xacro…</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
var c=document.getElementById('c');
var renderer=new THREE.WebGLRenderer({canvas:c,antialias:true});
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(devicePixelRatio);
renderer.shadowMap.enabled=true;

var scene=new THREE.Scene();scene.background=new THREE.Color(0x0d1117);
var camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,0.01,1000);
var phi=Math.PI/4,theta=Math.PI/4,radius=4;
function cam(){camera.position.set(radius*Math.sin(phi)*Math.sin(theta),radius*Math.cos(phi),radius*Math.sin(phi)*Math.cos(theta));camera.lookAt(0,.5,0);}
cam();

scene.add(new THREE.AmbientLight(0x405060,.8));
var dl=new THREE.DirectionalLight(0xffffff,1.2);dl.position.set(5,10,5);dl.castShadow=true;scene.add(dl);
scene.add(new THREE.HemisphereLight(0x0fdfff,0x0d1117,.3));
scene.add(new THREE.GridHelper(10,20,0x1a3040,0x0f2030));
var axes=new THREE.AxesHelper(.5);scene.add(axes);

var isDown=false,lx=0,ly=0,wire=false,root=null;
var COLS=[0x0fdfff,0x3b82f6,0x10c980,0x7c3aed,0xf59e0b];

c.addEventListener('mousedown',e=>{isDown=true;lx=e.clientX;ly=e.clientY;});
c.addEventListener('mouseup',()=>isDown=false);
c.addEventListener('mousemove',e=>{if(!isDown)return;theta-=(e.clientX-lx)*.008;phi=Math.max(.1,Math.min(Math.PI-.1,phi+(e.clientY-ly)*.008));lx=e.clientX;ly=e.clientY;cam();});
c.addEventListener('wheel',e=>{radius=Math.max(.5,Math.min(50,radius+e.deltaY*.01));cam();},{passive:true});
function resetCam(){phi=Math.PI/4;theta=Math.PI/4;radius=4;cam();}
function toggleWire(){wire=!wire;if(root)root.traverse(o=>{if(o.isMesh&&o.material)o.material.wireframe=wire;});}

function parseURDF(xml,isXacro){
  try{
    var doc=new DOMParser().parseFromString(xml,'text/xml');
    var err=doc.querySelector('parsererror');
    if(err){
      var msg=err.textContent.substring(0,200);
      if(isXacro)msg='xacro parse error (macro expansion may have failed): '+msg;
      throw new Error(msg);
    }
    var robot=doc.querySelector('robot');
    if(!robot)throw new Error('No <robot> element found in URDF');
    return{name:robot.getAttribute('name')||'Robot',links:[...doc.querySelectorAll('link')],joints:[...doc.querySelectorAll('joint')]};
  }catch(e){parent.postMessage({type:'urdf-error',message:e.message},'*');return null;}
}

function geom(el){
  var b=el.querySelector('box'),cy=el.querySelector('cylinder'),s=el.querySelector('sphere');
  if(b){var sz=(b.getAttribute('size')||'.1 .1 .1').split(' ').map(Number);return new THREE.BoxGeometry(sz[0]||.1,sz[1]||.1,sz[2]||.1);}
  if(cy){return new THREE.CylinderGeometry(+cy.getAttribute('radius')||.05,+cy.getAttribute('radius')||.05,+cy.getAttribute('length')||.2,16);}
  if(s){return new THREE.SphereGeometry(+s.getAttribute('radius')||.05,16,16);}
  return new THREE.SphereGeometry(.03,8,8);
}

function buildRobot(p,isXacro){
  if(root)scene.remove(root);
  root=new THREE.Group();root.name=p.name;
  var map={};var ci=0;
  p.links.forEach(function(link,i){
    var n=link.getAttribute('name')||'link_'+i;
    var g=new THREE.Group();g.name=n;map[n]=g;
    var vis=link.querySelector('visual'),ge=vis&&vis.querySelector('geometry');
    var geo=ge?geom(ge):new THREE.SphereGeometry(.03,8,8);
    var mat=new THREE.MeshPhongMaterial({color:COLS[ci++%COLS.length],transparent:true,opacity:.88});
    var mesh=new THREE.Mesh(geo,mat);mesh.castShadow=true;mesh.receiveShadow=true;
    if(vis){var o=vis.querySelector('origin');if(o){var xyz=(o.getAttribute('xyz')||'0 0 0').split(' ').map(Number);var rpy=(o.getAttribute('rpy')||'0 0 0').split(' ').map(Number);mesh.position.set(xyz[0]||0,xyz[1]||0,xyz[2]||0);mesh.rotation.set(rpy[0]||0,rpy[1]||0,rpy[2]||0);}}
    g.add(mesh);root.add(g);
  });
  p.joints.forEach(function(j){
    var pn=j.querySelector('parent')&&j.querySelector('parent').getAttribute('link');
    var cn=j.querySelector('child')&&j.querySelector('child').getAttribute('link');
    if(!pn||!cn||!map[cn]||!map[pn])return;
    var o=j.querySelector('origin');
    if(o){var xyz=(o.getAttribute('xyz')||'0 0 0').split(' ').map(Number);var rpy=(o.getAttribute('rpy')||'0 0 0').split(' ').map(Number);map[cn].position.set(xyz[0]||0,xyz[1]||0,xyz[2]||0);map[cn].rotation.set(rpy[0]||0,rpy[1]||0,rpy[2]||0);}
    if(map[cn].parent===root){root.remove(map[cn]);map[pn].add(map[cn]);}
  });
  scene.add(root);
  document.getElementById('drop').classList.add('hidden');
  document.getElementById('loading').classList.add('hidden');
  var label=p.name+(isXacro?' (xacro expanded)':'');
  document.getElementById('st').textContent=label+' — '+p.links.length+' links, '+p.joints.length+' joints';
  document.getElementById('file-label').textContent=label;
}

window.addEventListener('message',function(e){
  if(!e.data)return;
  if(e.data.type==='loading'){
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('drop').classList.add('hidden');
    document.getElementById('st').textContent='Expanding xacro…';
    document.getElementById('file-label').textContent=e.data.filename||'xacro';
    return;
  }
  if(e.data.type==='load-urdf'){
    document.getElementById('loading').classList.add('hidden');
    var p=parseURDF(e.data.content,e.data.isXacro);
    if(p)buildRobot(p,e.data.isXacro);
  }
});

document.body.addEventListener('dragover',function(e){e.preventDefault();});
document.body.addEventListener('drop',function(e){
  e.preventDefault();
  var f=e.dataTransfer.files[0];if(!f)return;
  var r=new FileReader();
  r.onload=function(ev){var p=parseURDF(ev.target.result,f.name.endsWith('.xacro'));if(p)buildRobot(p,f.name.endsWith('.xacro'));};
  r.readAsText(f);
});

window.addEventListener('resize',function(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

function animate(){requestAnimationFrame(animate);if(root)root.rotation.y+=.0015;renderer.render(scene,camera);}
animate();
</script></body></html>`;
    }
}
