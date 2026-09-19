// Triangulate measured XY positions only. No theory values or extrapolated vertices.
export function fitSurface(points){
 const cohorts=new Map();
 for(const p of points){
  if(![p.x,p.y,p.z,p.b].every(Number.isFinite)||p.b<0||Math.abs(p.z)>.0001||Math.abs(p.angle)>.05)continue;
  const key=JSON.stringify([p.current,p.f,p.spacing,p.turns,p.diameter,p.reversed,p.verified]);
  if(!cohorts.has(key))cohorts.set(key,[]);cohorts.get(key).push(p);
 }
 const source=[...cohorts.values()].sort((a,b)=>b.length-a.length)[0]||[];
 const empty={surface:[],triangles:[],points:source,used:source.length,excluded:points.length-source.length};
 const scans=new Map();
 for(const p of source){if(!scans.has(p.groupIndex))scans.set(p.groupIndex,[]);scans.get(p.groupIndex).push(p);}
 const spatial=[...scans.values()].filter(g=>g.some(p=>Math.hypot(p.x-g[0].x,p.y-g[0].y)>.001));
 if(spatial.length<3)return empty;
 const unique=new Map();
 for(const p of source){const key=p.x.toFixed(6)+','+p.y.toFixed(6);if(!unique.has(key))unique.set(key,{...p,sum:0,count:0});const q=unique.get(key);q.sum+=p.b;q.count++;}
 const vertices=[...unique.values()].map(p=>({...p,b:p.sum/p.count})).sort((a,b)=>a.x-b.x||a.y-b.y);
 if(vertices.length<3)return empty;
 const a=vertices[0],b=vertices[1];
 if(!vertices.some(p=>Math.abs((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x))>1e-8))return empty;
 const triangles=triangulate(vertices);
 return {...empty,surface:vertices,triangles};
}
function triangulate(input){
 const pts=input.map(p=>({x:p.x,y:p.y})),n=pts.length;
 const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const span=Math.max(maxX-minX,maxY-minY,1),cx=(minX+maxX)/2,cy=(minY+maxY)/2;
 pts.push({x:cx-32*span,y:cy-16*span},{x:cx,y:cy+32*span},{x:cx+32*span,y:cy-16*span});
 function triangle(a,b,c){
  const A=pts[a],B=pts[b],C=pts[c],d=2*(A.x*(B.y-C.y)+B.x*(C.y-A.y)+C.x*(A.y-B.y));
  if(Math.abs(d)<1e-12)return null;
  const aa=A.x*A.x+A.y*A.y,bb=B.x*B.x+B.y*B.y,cc=C.x*C.x+C.y*C.y;
  const x=(aa*(B.y-C.y)+bb*(C.y-A.y)+cc*(A.y-B.y))/d,y=(aa*(C.x-B.x)+bb*(A.x-C.x)+cc*(B.x-A.x))/d;
  return {ids:[a,b,c],x,y,r2:(x-A.x)**2+(y-A.y)**2};
 }
 let tris=[triangle(n,n+1,n+2)];
 for(let i=0;i<n;i++){
  const point=pts[i],edges=new Map(),keep=[];
  for(const t of tris){
   if((point.x-t.x)**2+(point.y-t.y)**2<=t.r2+1e-9*span*span){
    for(let j=0;j<3;j++){const a=t.ids[j],b=t.ids[(j+1)%3],key=Math.min(a,b)+','+Math.max(a,b);if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);}
   }else keep.push(t);
  }
  for(const [a,b] of edges.values()){const t=triangle(a,b,i);if(t)keep.push(t);}
  tris=keep;
 }
 return tris.filter(t=>t.ids.every(i=>i<n)).map(t=>t.ids.map(i=>input[i]));
}
