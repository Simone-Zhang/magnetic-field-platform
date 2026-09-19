// Model-based amplitude fit; unmeasured space is prediction, not measurement.
export function fitSurface(points,referenceSurface,mode='single'){
 const near=(a,b,t=.0001)=>Number.isFinite(a)&&Math.abs(a-b)<=t;
 const source=points.filter(p=>p.verified&&!p.reversed&&[p.x,p.y,p.b,p.theory].every(Number.isFinite)&&p.b>=0&&near(p.z,0)&&near(p.angle,0,.05)&&near(p.current,400,.05)&&near(p.f,50,.05)&&near(p.turns,400)&&near(p.diameter,20,.005)&&(mode!=='double'||near(p.spacing,10,.005)));
 const empty={surface:[],points:source,used:source.length,excluded:points.length-source.length};
 if(!referenceSurface?.length||new Set(source.map(p=>p.groupIndex)).size<3||source.length<3)return empty;
 const a=source[0],b=source.find(p=>Math.hypot(p.x-a.x,p.y-a.y)>.001);
 if(!b||!source.some(p=>Math.abs((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x))>.0001))return empty;
 const unique=new Map();
 for(const p of source){const key=p.x+','+p.y;if(!unique.has(key))unique.set(key,{...p,sum:0,count:0});const q=unique.get(key);q.sum+=p.b;q.count++;}
 let numerator=0,denominator=0;
 for(const p of unique.values()){numerator+=(p.sum/p.count)*p.theory;denominator+=p.theory*p.theory;}
 if(denominator<=1e-12)return empty;
 const amplitude=Math.max(0,numerator/denominator);
 return {...empty,amplitude,surface:referenceSurface.map(p=>({...p,b:p.b*amplitude}))};
}
