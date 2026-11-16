// Share of a PNG's pixels that are opaque (alpha >= 128). Handles 8-bit RGBA, non-interlaced,
// which is what every packaged original preview is; anything else returns null.
import fs from 'node:fs';
import zlib from 'node:zlib';
export function opaqueShare(file){
  const d=fs.readFileSync(file);let i=8,w=0,h=0,ok=false;const idat=[];
  while(i<d.length){
    const len=d.readUInt32BE(i),type=d.toString('latin1',i+4,i+8),c=d.subarray(i+8,i+8+len);
    if(type==='IHDR'){w=c.readUInt32BE(0);h=c.readUInt32BE(4);ok=c[8]===8&&c[9]===6&&c[12]===0}
    else if(type==='IDAT')idat.push(c);
    i+=12+len;
  }
  if(!ok)return null;
  const raw=zlib.inflateSync(Buffer.concat(idat)),s=w*4;let prev=new Uint8Array(s),o=0,opaque=0;
  for(let y=0;y<h;y++){
    const f=raw[o],line=new Uint8Array(raw.subarray(o+1,o+1+s));o+=1+s;
    for(let x=0;x<s;x++){
      const a=x>=4?line[x-4]:0,b=prev[x],c=x>=4?prev[x-4]:0;
      if(f===1)line[x]+=a;else if(f===2)line[x]+=b;else if(f===3)line[x]+=(a+b)>>1;
      else if(f===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);line[x]+=pa<=pb&&pa<=pc?a:pb<=pc?b:c}
    }
    for(let x=3;x<s;x+=4)if(line[x]>=128)opaque++;
    prev=line;
  }
  return opaque/(w*h);
}
