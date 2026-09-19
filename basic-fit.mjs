// IDW estimates are not measurements; keep independent experimental conditions separate.
export function fitSurface(points,n=41){
  const groups=new Map();
  for(const p of points){
    if(Math.abs(p.z)>.0001||![p.x,p.y,p.b].every(Number.isFinite))continue;
    const key=JSON.stringify([p.current,p.f,p.angle,p.spacing,p.turns,p.diameter,p.reversed,p.verified]);
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);
  }
  const candidates=[...groups.values()].sort((a,b)=>b.length-a.length);
  const source=candidates.find(s=>s.length>=3&&s.some(p=>Math.abs(p.x-s[0].x)>.001)&&s.some(p=>Math.abs(p.y-s[0].y)>.001));
  if(!source)return {surface:[],used:0,excluded:points.length};
  const a=source[0],b=source.find(p=>Math.hypot(p.x-a.x,p.y-a.y)>.001);
  if(!b||!source.some(p=>Math.abs((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x))>.0001))return {surface:[],used:0,excluded:points.length};
  const unique=new Map();
  for(const p of source){const key=p.x+','+p.y;if(!unique.has(key))unique.set(key,{...p,sum:0,count:0});const q=unique.get(key);q.sum+=p.b;q.count++;}
  const samples=[...unique.values()].map(p=>({...p,b:p.sum/p.count}));
  const surface=[];
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const x=-15+40*i/(n-1),y=-15+30*j/(n-1);let sum=0,weight=0,exact=null;
    for(const p of samples){const d=(x-p.x)**2+(y-p.y)**2;if(d<1e-12){exact=p.b;break;}const w=1/d;sum+=w*p.b;weight+=w;}
    surface.push({x,y,b:exact??sum/weight});
  }
  return {surface,used:source.length,excluded:points.length-source.length};
}
