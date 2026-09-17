// Keep the shipped React application intact; add a keyboard/touch accessible navigation menu.
const popup=document.createElement('div');popup.className='analysis-dropdown';popup.hidden=true;
for(const [name,url] of [['基础实验','./basic-analysis.html'],['探索实验','./index.html#/analysis']]){
 const a=document.createElement('a');a.textContent=name;a.href=url;popup.append(a);
}
document.body.append(popup);let trigger=null;
function close(){popup.hidden=true;if(trigger)trigger.setAttribute('aria-expanded','false');}
function bind(){document.querySelectorAll('header nav a[href="#/analysis"]').forEach(a=>{a.setAttribute('aria-haspopup','true');if(a!==trigger)a.setAttribute('aria-expanded','false');});}
document.addEventListener('click',e=>{
 const a=e.target.closest('header nav a[href="#/analysis"]');
 if(a){e.preventDefault();e.stopImmediatePropagation();const open=popup.hidden||trigger!==a;close();trigger=a;if(open){const r=a.getBoundingClientRect();popup.style.left=Math.max(8,Math.min(r.left,innerWidth-170))+'px';popup.style.top=r.bottom+8+'px';popup.hidden=false;a.setAttribute('aria-expanded','true');popup.querySelector('a').focus();}return;}
 if(!popup.contains(e.target))close();else close();
},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!popup.hidden){close();trigger?.focus();}});
window.addEventListener('hashchange',close);window.addEventListener('resize',close);window.addEventListener('scroll',close);
new MutationObserver(bind).observe(document.getElementById('root'),{childList:true,subtree:true});bind();
