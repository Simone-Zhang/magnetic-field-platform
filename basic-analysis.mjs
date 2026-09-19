import {fieldAt} from './basic-model.mjs';
import {documentXml,parseReport,conditionWarnings,reportOverview} from './basic-docx.mjs';
import {fitSurface} from './basic-fit.mjs';
const $=id=>document.getElementById(id);
let mode='single', report=null, grid=null, compared=[], yaw=-.65,pitch=.46,zoom=1;
const reportCache={};
let fitted={surface:[],used:0,excluded:0};
const palette=[[21,68,174],[12,155,196],[71,208,171],[222,218,88],[255,111,80]];
function color(b,max,alpha=1){let q=Math.max(0,Math.min(1,b/max))*4,i=Math.min(3,Math.floor(q)),f=q-i;return `rgba(${palette[i].map((v,k)=>Math.round(v+(palette[i+1][k]-v)*f)).join(',')},${alpha})`;}
function setup(id){const c=$(id),r=c.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);c.width=Math.max(1,Math.round(r.width*d));c.height=Math.max(1,Math.round(r.height*d));const ctx=c.getContext('2d');ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,r.width,r.height);return {ctx,w:r.width,h:r.height};}
function project(x,y,height,w,h){x-=5;const a=x*Math.cos(yaw)-y*Math.sin(yaw),b=x*Math.sin(yaw)+y*Math.cos(yaw),scale=Math.min(w/68,h/58)*zoom;return [w/2+a*scale,h*.69+(b*Math.sin(pitch)-height*Math.cos(pitch))*scale,b*Math.cos(pitch)+height*Math.sin(pitch)];}
function line(ctx,points,stroke,width=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}
function fieldScale(){return Math.max(.001,grid?.[mode].planeMax||0,...compared.map(p=>p.b));}
function drawVolume(id,measured=false){
 const {ctx,w,h}=setup(id),max=fieldScale(),height=b=>b/max*27;ctx.font='12px system-ui';
 for(let k=-15;k<=25;k+=5)line(ctx,[project(k,-15,0,w,h),project(k,15,0,w,h)],'#244354');
 for(let k=-15;k<=15;k+=5)line(ctx,[project(-15,k,0,w,h),project(25,k,0,w,h)],'#244354');
 if((!measured&&grid)||(measured&&fitted.surface.length)){
   const data=measured?fitted.surface:grid[mode].surface,n=Math.sqrt(data.length),faces=[];
   for(let j=0;j<n-1;j++)for(let i=0;i<n-1;i++){
     const vertices=[data[j*n+i],data[j*n+i+1],data[(j+1)*n+i+1],data[(j+1)*n+i]];
     const projected=vertices.map(p=>project(p.x,p.y,height(p.b),w,h));
     faces.push({projected,b:vertices.reduce((v,p)=>v+p.b,0)/4,depth:projected.reduce((v,p)=>v+p[2],0)/4});
   }
   faces.sort((a,b)=>a.depth-b.depth);
   for(const f of faces){ctx.beginPath();f.projected.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fillStyle=color(f.b,max,.88);ctx.fill();ctx.strokeStyle='#84e2e521';ctx.lineWidth=.5;ctx.stroke();}
 }
 if(measured){
   const dots=compared.filter(p=>Math.abs(p.z)<=.0001).map(p=>({p,s:project(p.x,p.y,height(p.b),w,h)})).sort((a,b)=>a.s[2]-b.s[2]);
   for(const {p,s} of dots){line(ctx,[project(p.x,p.y,0,w,h),s],'#edac6340');ctx.fillStyle='#ffad74';ctx.beginPath();ctx.arc(s[0],s[1],4,0,Math.PI*2);ctx.fill();}
   if(!dots.length){ctx.fillStyle='#8fb2c0';ctx.textAlign='center';ctx.fillText('等待导入 Z=0 平面的实际测量点',w/2,h*.38);ctx.textAlign='left';}
 }
 const origin=project(-15,-15,0,w,h);
 for(const [v,label] of [[[25,-15,0],'X / cm'],[[-15,15,0],'Y / cm'],[[-15,-15,29],'B / mT']]){line(ctx,[origin,project(...v,w,h)],'#91b7c6');const p=project(...v,w,h);ctx.fillStyle='#d3eef7';ctx.fillText(label,Math.min(w-48,Math.max(4,p[0]+4)),Math.max(15,p[1]));}
 for(let i=0;i<=4;i++){const p=project(-15,-15,i*27/4,w,h);ctx.fillStyle='#a7cddc';ctx.fillText((max*i/4).toFixed(2),Math.max(2,p[0]-36),p[1]+4);}
 for(const x of [-15,5,25]){const p=project(x,-15,0,w,h);ctx.fillText(String(x),p[0]-6,p[1]+16);}
 for(const y of [-5,5,15]){const p=project(-15,y,0,w,h);ctx.fillText(String(y),p[0]-18,p[1]+7);}
}
function drawSlices(){if(!grid)return;const g=grid[mode],max=fieldScale(),{ctx,w,h}=setup('xy'),n=Math.sqrt(g.surface.length);for(let j=0;j<n;j++)for(let i=0;i<n;i++){ctx.fillStyle=color(g.surface[j*n+i].b,max);ctx.fillRect(i*w/n,j*h/n,Math.ceil(w/n),Math.ceil(h/n));}$('maxfield').textContent=`${max.toFixed(3)} mT`;}
function curve(){const {ctx,w,h}=setup('curve');ctx.font='12px system-ui';ctx.fillStyle='#88aebb';
 const axis=$('axis').value,data=[...compared].sort((a,b)=>a[axis]-b[axis]);
 const xs=data.map(p=>p[axis]),ys=data.flatMap(p=>[p.b,p.theory]);let min=xs.length?Math.min(...xs):-15,max=xs.length?Math.max(...xs):25;
 if(max-min<.01){min-=1;max+=1;}const top=ys.length?Math.max(.001,...ys)*1.15:1;
 const X=x=>60+(x-min)/(max-min)*(w-90),Y=y=>h-42-y/top*(h-75);
 for(let i=0;i<=5;i++){const y=i*top/5;line(ctx,[[60,Y(y)],[w-30,Y(y)]],'#203c48');ctx.fillText(y.toFixed(3),8,Y(y)+4);const x=min+(max-min)*i/5;ctx.fillText(x.toFixed(1),X(x)-12,h-20);}
 ctx.fillText('B / mT',10,17);ctx.fillText(`${axis.toUpperCase()} / cm`,w-70,h-5);
 if(data.length){for(const key of new Set(data.map(p=>p.groupIndex)))line(ctx,data.filter(p=>p.groupIndex===key).map(p=>[X(p[axis]),Y(p.theory)]),'#58e2e6',2);for(const p of data){ctx.beginPath();ctx.arc(X(p[axis]),Y(p.b),4,0,Math.PI*2);ctx.fillStyle='#ff945f';ctx.fill();}}
 else ctx.fillText('导入报告后，按实际测量位置对比；理论云图已在上方显示。',70,h/2);
}
function render(){drawVolume('theory');drawVolume('measured',true);$('maxfield').textContent=`${fieldScale().toFixed(3)} mT`;curve();}
async function compare(){
 const token=++compare.version,all=$('group').value==='all';
 const selected=report?.groups.map((g,i)=>({...g,points:g.points.map(p=>({...p,spacing:p.spacing??g.spacing,reversed:g.reversed,groupIndex:i}))})).filter((g,i)=>all||i===Number($('group').value))||[];
 const group=selected.length?{points:selected.flatMap(g=>g.points)}:null;compared=[];fitted={surface:[],used:0,excluded:0};$('rows').replaceChildren();
 if(!group){$('condition').textContent='等待导入对应模式的 Word 报告。';$('empty').textContent='尚未导入本模式的报告；不生成虚构实测图。';render();return;}
 const warnings=[...new Set(selected.flatMap(g=>conditionWarnings(g,mode)))];
 $('condition').textContent='正在计算对应测量位置的理论值…';
 const local=[];
 for(let i=0;i<group.points.length;i++){
   const p=group.points[i],b=fieldAt(p.x,p.y,p.z,mode);local.push({...p,theory:Math.abs(b.bx)});
   if(i%32===0){await new Promise(r=>setTimeout(r,0));if(token!==compare.version)return;}
 }
 compared=local;const frag=document.createDocumentFragment();
 for(const [i,p] of compared.entries()){
   const tr=document.createElement('tr');[i+1,...['x','y','z'].map(a=>p[a].toFixed(2)),p.theory.toFixed(4),p.b.toFixed(4)].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td);});frag.append(tr);
 }$('rows').append(frag);
 $('condition').textContent=warnings.length?'条件不同或未确认：'+warnings.join('；')+'。仅并列展示理论与记录值。':'条件匹配：400 mA、50 Hz、默认线圈参数及物理坐标已确认。';
 const total=report.groups.reduce((sum,g)=>sum+g.points.length,0),visible=compared.filter(p=>Math.abs(p.z)<=.0001).length;
 fitted=fitSurface(compared);
 $('empty').textContent=`报告共 ${total} 个测量点；当前选择 ${compared.length} 个记录，显示 ${visible} 个 Z=0 实测点。`+(fitted.surface.length?`曲面使用其中 ${fitted.used} 个同条件点作反距离插值及外推，另 ${fitted.excluded} 点未混入拟合。彩色曲面（包括未测区域）为估算，橙点为实测；远离测点时不确定性较大。`:'当前同条件测点不足或共线，无法可靠拟合二维曲面；请选择全部组或包含 X/Y 扫描的数据。');
 render();
}
compare.version=0;
function setMode(value){compare.version++;mode=value;report=reportCache[mode]||null;for(const v of ['single','double'])$(v).setAttribute('aria-pressed',String(v===mode));$('group').replaceChildren();
 const image=$('report-overview');image.hidden=!report?.overviewUrl;image.style.display=report?.overviewUrl?'block':'none';if(report?.overviewUrl)image.src=report.overviewUrl;else image.removeAttribute('src');
 $('overview-note').textContent=report?.overviewUrl?'导入 Word 中的综合视角原图，不随上方数据组选择改变。':report?(report.overviewWarning||'这份报告没有找到综合视角图片；不会用理论图或其他视角代替。'):'导入报告后显示其中的综合视角原图。';
 if(report){const o=document.createElement('option');o.value='all';o.textContent=`全部 ${report.groups.length} 组 · ${report.groups.reduce((n,g)=>n+g.points.length,0)} 点`;$('group').append(o);}
 (report?.groups||[{name:'尚未导入'}]).forEach((g,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`第 ${i+1} 组${g.points?' · '+g.points.length+' 点':' · 尚未导入'}`;$('group').append(o);});compare();}
$('file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{
 if(!/\.docx$/i.test(file.name))throw Error('请选择 .docx 报告，不支持 .doc。');
 $('status').textContent='正在读取报告…';const buffer=await file.arrayBuffer(),xml=await documentXml(buffer),parsed=parseReport(xml);
 try{const blob=await reportOverview(buffer,xml);if(blob)parsed.overviewUrl=URL.createObjectURL(blob);}catch(error){parsed.overviewWarning='综合视角图片读取失败：'+error.message;}
 if(reportCache[parsed.mode]?.overviewUrl)URL.revokeObjectURL(reportCache[parsed.mode].overviewUrl);
 reportCache[parsed.mode]=parsed;setMode(parsed.mode);$('status').textContent=`已导入 ${file.name} · ${parsed.groups.length} 组 · 共 ${parsed.groups.reduce((n,g)=>n+g.points.length,0)} 个测量点 · 文件仅在浏览器内读取，未上传。`;
 }catch(err){$('status').textContent='导入失败：'+err.message+' 原有数据未被替换。';}finally{e.target.value='';}});
for(const v of ['single','double'])$(v).onclick=()=>setMode(v);
$('group').onchange=compare;$('axis').onchange=curve;
for(const id of ['theory','measured']){const c=$(id);let start=null;c.onpointerdown=e=>{if(e.button!==0)return;start=[e.clientX,e.clientY];c.setPointerCapture(e.pointerId);};c.onpointermove=e=>{if(!start)return;yaw+=(e.clientX-start[0])*.008;pitch=Math.max(-1.3,Math.min(1.3,pitch+(e.clientY-start[1])*.008));start=[e.clientX,e.clientY];render();};c.onpointerup=c.onpointercancel=c.onlostpointercapture=()=>start=null;c.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.6,Math.min(1.6,zoom-e.deltaY*.001));render();},{passive:false});}
window.addEventListener('resize',render);
fetch('./basic-theory.json').then(r=>{if(!r.ok)throw Error('理论数据加载失败');return r.json();}).then(data=>{grid=data;render();}).catch(e=>$('status').textContent=e.message+'，请通过网站地址打开页面。');
setMode('single');
