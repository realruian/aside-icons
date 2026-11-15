// Bakes "fill the favicon slot" versions: trims transparent margins so the
// artwork fills the whole square, like a website's own favicon does.
import fs from 'node:fs';
import path from 'node:path';
import {Resvg} from '@resvg/resvg-js';
const src='assets/untrimmed',dst='extension/icons';
const report=[];
for(const kind of ['iphone','mac','optimized'])for(const f of fs.readdirSync(path.join(src,kind)).filter(f=>f.endsWith('.png'))){
  const buf=fs.readFileSync(path.join(src,kind,f)),b64=buf.toString('base64');
  const W=buf.readUInt32BE(16),H=buf.readUInt32BE(20);
  const probe=new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><image width="${W}" height="${H}" href="data:image/png;base64,${b64}"/></svg>`).render();
  const px=probe.pixels;let x0=W,y0=H,x1=-1,y1=-1;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(px[(y*W+x)*4+3]>8){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
  if(x1<0){report.push([kind,f,'empty']);continue}
  const bw=x1-x0+1,bh=y1-y0+1,side=Math.max(bw,bh),vx=x0+bw/2-side/2,vy=y0+bh/2-side/2;
  const out=new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="${vx} ${vy} ${side} ${side}"><image width="${W}" height="${H}" href="data:image/png;base64,${b64}"/></svg>`).render().asPng();
  fs.writeFileSync(path.join(dst,kind,f),out);
  report.push([kind,f,Math.round(100*bw*bh/(W*H))]);
}
const fills=report.map(r=>r[2]).filter(Number.isFinite);
console.log('baked',report.length,'files; original fill % min/median/max',Math.min(...fills),fills.sort((a,b)=>a-b)[fills.length>>1],Math.max(...fills));
