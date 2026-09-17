// Read only word/document.xml. Never execute imported HTML or external relationships.
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export async function documentXml(buffer) {
  if(buffer.byteLength>30*1024*1024) throw Error('报告超过 30 MB，请使用原始导出报告。');
  const v=new DataView(buffer), bytes=new Uint8Array(buffer), decode=new TextDecoder();
  let end=-1;
  for(let p=buffer.byteLength-22;p>=Math.max(0,buffer.byteLength-65557);p--)
    if(v.getUint32(p,true)===0x06054b50){end=p;break;}
  if(end<0)throw Error('不是有效的 .docx 文件；不支持 .doc、PDF 或图片。');
  let pos=v.getUint32(end+16,true); const count=v.getUint16(end+10,true);
  if(count>10000) throw Error('文件目录过大。');
  for(let i=0;i<count;i++){
    if(pos+46>buffer.byteLength||v.getUint32(pos,true)!==0x02014b50)throw Error('Word 文件目录损坏。');
    const flags=v.getUint16(pos+8,true), method=v.getUint16(pos+10,true), packed=v.getUint32(pos+20,true), size=v.getUint32(pos+24,true);
    const n=v.getUint16(pos+28,true), extra=v.getUint16(pos+30,true), comment=v.getUint16(pos+32,true), offset=v.getUint32(pos+42,true);
    const name=decode.decode(bytes.subarray(pos+46,pos+46+n));pos+=46+n+extra+comment;
    if(name!=='word/document.xml')continue;
    if(flags&1)throw Error('不支持加密的 Word 报告。');
    if(size>8*1024*1024||packed>30*1024*1024)throw Error('报告正文过大。');
    if(offset+30>buffer.byteLength||v.getUint32(offset,true)!==0x04034b50)throw Error('正文索引损坏。');
    const begin=offset+30+v.getUint16(offset+26,true)+v.getUint16(offset+28,true);
    if(begin+packed>buffer.byteLength)throw Error('报告不完整。');
    const data=bytes.slice(begin,begin+packed);
    if(method===0){if(data.length!==size||size>8*1024*1024)throw Error('正文长度校验失败。');return decode.decode(data);}
    if(method!==8)throw Error('不支持此压缩格式。');
    let inflater;
    try{inflater=new DecompressionStream('deflate-raw');}catch{throw Error('此浏览器不支持读取 Word，请更新浏览器或使用近期版本 Chrome / Edge / Safari。');}
    const reader=new Blob([data]).stream().pipeThrough(inflater).getReader(), chunks=[];let total=0;
    while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;
      if(total>8*1024*1024){await reader.cancel();throw Error('报告正文解压后过大。');}chunks.push(value);}
    if(total!==size)throw Error('正文长度校验失败。');
    const all=new Uint8Array(total);let at=0;for(const chunk of chunks){all.set(chunk,at);at+=chunk.length;}
    return decode.decode(all);
  }
  throw Error('找不到 Word 正文。');
}
export function parseReport(xml) {
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('报告包含不支持的 XML 声明。');
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  if(doc.querySelector('parsererror'))throw Error('Word 正文损坏。');
  const text=n=>[...n.getElementsByTagNameNS(W,'t')].map(t=>t.textContent).join('');
  const full=text(doc);
  if(/探索实验|探索参数|拓展实验/.test(full))throw Error('这是探索实验报告，请到探索实验页导入 JSON。');
  if(/频率实验/.test(full))throw Error('双线圈频率实验不在本页对比范围。');
  const mode=/双线圈磁场|双线圈正接|双线圈反接/.test(full)?'double':/单线圈/.test(full)?'single':null;
  if(!mode)throw Error('未识别实验类型，请使用程序导出的单线圈或双线圈位置报告。');
  const body=doc.getElementsByTagNameNS(W,'body')[0], groups=[], supplemental=[];
  let heading='', context='';
  for(const child of body.children){
    if(child.localName==='p'){const t=text(child);if(/第\s*\d+\s*组/.test(t))heading=t;context=t||context;continue;}
    if(child.localName!=='tbl')continue;
    const rows=[...child.children].filter(n=>n.localName==='tr').map(row=>[...row.children].filter(n=>n.localName==='tc').map(text));
    if(!rows.length)continue;
    if(rows[0].join('').includes('物理X')){supplemental.push({heading,rows:rows.slice(1)});continue;}
    if(rows[0].length!==8||!/[xX]/.test(rows[0][0])||!/[yY]/.test(rows[0][1])||!/[zZ]/.test(rows[0][2]))continue;
    const points=[];
    for(const row of rows.slice(1)){
      if(row.every(c=>!c.trim()))continue;
      if(row.length!==8)throw Error('数据表列数不完整。');
      const nums=row.map(s=>s.trim()===''?NaN:Number(s.trim().replace(/−/g,'-')));
      if(!nums.every(Number.isFinite))throw Error('数据表含无效数值，请检查报告是否被修改。');
      const [x,y,z,angle,f,current,u,b]=nums;
      if(f<0||current<0||b<0)throw Error('频率、电流或磁场强度含负数。');
      points.push({x,y,z,angle,f,current,u,b,verified:false});
    }
    if(points.length){
      const spacing=heading.match(/(?:间距\s*d\s*=|d\s*=)\s*([\d.]+)/);
      groups.push({name:heading||`第 ${groups.length+1} 组`,points,spacing:spacing?Number(spacing[1]):null,reversed:heading.includes('反接')});
    }
  }
  if(!groups.length)throw Error('未找到有效的八列实验记录表。');
  if(groups.reduce((n,g)=>n+g.points.length,0)>10000)throw Error('记录超过 10000 点，请分批导入。');
  for(const table of supplemental){
    const number=table.heading.match(/第\s*(\d+)\s*组/), group=number&&groups[Number(number[1])-1];
    if(!group||table.rows.length!==group.points.length)throw Error('理论对比坐标与数据表行数不一致。');
    table.rows.forEach((row,i)=>{
      const vals=row.map(Number);if(row.length!==7||vals[0]!==i+1)throw Error('理论对比坐标行号不一致。');
      if(!vals.every(Number.isFinite))return; // old records explicitly marked 未记录
      const [,x,y,z,spacing,turns,diameter]=vals;
      Object.assign(group.points[i],{rulerX:group.points[i].x,rulerY:group.points[i].y,rulerZ:group.points[i].z,x,y,z,spacing,turns,diameter,verified:true});
    });
  }
  return {mode,groups};
}
export function conditionWarnings(group,mode){
  const p=group.points,w=[];
  if(p.some(v=>Math.abs(v.current-400)>.05))w.push('电流不是 400 mA');
  if(p.some(v=>Math.abs(v.f-50)>.05))w.push('频率不是 50 Hz');
  if(p.some(v=>Math.abs(v.angle)>.05))w.push('探头角度不是 0°');
  if(p.some(v=>Math.abs(v.z)>.0001))w.push('报告含非零 Z 坐标，不属于基础实验 Z=0 平面，这些点不进入上方 X–Y–B 图');
  if(p.some(v=>!v.verified))w.push('旧报告缺少物理坐标快照，当前按报告坐标展示，不能确认与理论原点一致');
  if(p.some(v=>v.verified&&(v.turns!==400||Math.abs(v.diameter-20)>.005)))w.push('线圈匝数或直径不同');
  if(mode==='double'){
    if(group.reversed)w.push('报告为反向接线，理论基准为同向');
    if(p.some(v=>Math.abs((v.spacing??group.spacing??NaN)-10)>.005))w.push('间距不是 10.00 cm');
    if(p.some(v=>!Number.isFinite(v.spacing??group.spacing)))w.push('报告未提供间距，无法确认');
  }
  return w;
}
