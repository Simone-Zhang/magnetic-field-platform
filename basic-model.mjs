// Fixed reference model, matching VoltageCalculator's default finite winding pack.
export const reference = Object.freeze({currentmA:400, frequencyHz:50, spacingCm:10,
  turns:400, diameterCm:20, calibration:1.29, radialThicknessCm:1,
  axialThicknessCm:1, radialSamples:8, axialSamples:8, segments:96, softening:.5});
const cells=[];
for(let r=0;r<8;r++) for(let a=0;a<8;a++) for(let s=0;s<96;s++) {
  const radius=.1+((r+.5)/8-.5)*.01, phi=(s+.5)*2*Math.PI/96, dp=2*Math.PI/96;
  cells.push([((a+.5)/8-.5)*.01,radius*Math.cos(phi),radius*Math.sin(phi),-radius*Math.sin(phi)*dp,radius*Math.cos(phi)*dp]);
}
export function fieldAt(xCm,yCm,zCm,mode='single') {
  let bx=0,by=0,bz=0;
  const core2=(.5*Math.hypot(.01/8,.01/8))**2, factor=1e-7*.4*(400/64)*1.29*1000;
  for(const center of mode==='double'?[0,10]:[0]) for(const [a,y,z,dy,dz] of cells) {
    const dx=(xCm-center)*.01-a, ry=yCm*.01-y, rz=zCm*.01-z;
    const d2=dx*dx+ry*ry+rz*rz+core2, inv=1/(d2*Math.sqrt(d2));
    bx+=(dy*rz-dz*ry)*inv; by+=dz*dx*inv; bz-=dy*dx*inv;
  }
  return {bx:bx*factor,by:by*factor,bz:bz*factor,b:Math.hypot(bx,by,bz)*factor};
}
