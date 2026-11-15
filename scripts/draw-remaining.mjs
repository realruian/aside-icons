// Optimized icons for brands with no open-source vector mark.
//  - "draw": hand-drawn SVG (letter/shape marks).
//  - "replate": cut the brand mark out of the packaged app icon (by colour
//    distance from its background) and re-lay it on a standard tile with the
//    same padding as other optimized icons. Keeps the authentic shape.
// Run from repo root: node scripts/draw-remaining.mjs [id ...]
import fs from 'node:fs';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {Resvg}=require('@resvg/resvg-js');
const S=256,R=56;
const tile=(bg,inner)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"><defs><clipPath id="t"><rect width="${S}" height="${S}" rx="${R}"/></clipPath>${bg.defs||''}</defs><g clip-path="url(#t)"><rect width="${S}" height="${S}" fill="${bg.fill||bg}"/>${inner}</g></svg>`;
const font='Helvetica Neue, Helvetica, Arial, sans-serif';

const DRAW={
  photoshop:()=>tile('#001E36',`<text x="128" y="166" text-anchor="middle" font-family="${font}" font-weight="700" font-size="118" fill="#31A8FF" letter-spacing="-4">Ps</text>`),
  firefly:()=>tile('#EB1000',`<text x="122" y="168" text-anchor="middle" font-family="${font}" font-weight="700" font-size="124" fill="#fff" letter-spacing="-2">Fi</text><path fill="#fff" d="M190 58 l6 16 16 6 -16 6 -6 16 -6 -16 -16 -6 16 -6z"/>`),
  booking:()=>tile('#003580',`<text x="112" y="174" text-anchor="middle" font-family="${font}" font-weight="700" font-size="150" fill="#fff">B</text><circle cx="182" cy="162" r="15" fill="#009FE3"/>`),
  canva:()=>tile({fill:'url(#g)',defs:'<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00C4CC"/><stop offset=".55" stop-color="#5A32FA"/><stop offset="1" stop-color="#7D2AE8"/></linearGradient>'},
    `<text x="124" y="178" text-anchor="middle" font-family="Snell Roundhand, Apple Chancery, Brush Script MT, cursive" font-weight="700" font-size="170" fill="#fff">C</text>`),
  typeform:()=>tile('#FFFFFF',`<rect x="58" y="92" width="38" height="72" rx="19" fill="#262627"/><rect x="108" y="92" width="92" height="72" rx="30" fill="#262627"/>`),
};
// [id, source image (relative to extension/), tile background ('auto' = source background), mark size]
const REPLATE=[
  ['feishu','icons/iphone/feishu.png','#FFFFFF',.70],
  ['dingtalk','icons/iphone/dingtalk.png','auto',.62],
  ['tencent-docs','icons/iphone/tencent-docs.png','auto',.62],
  ['kdocs','icons/iphone/kdocs.png','#FFFFFF',.66],
  ['wps','icons/iphone/wps.png','#FFFFFF',.66],
  ['jianying','icons/iphone/jianying.png','auto',.58],
  ['microsoft365','icons/original/microsoft365.png','#FFFFFF',.76],
];

function png(w,h,rgba){
  const crc=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}return b=>{let c=0xffffffff;for(const x of b)c=t[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0}})();
  const chunk=(type,data)=>{const l=Buffer.alloc(4);l.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c])};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;
  const raw=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++){raw[y*(w*4+1)]=0;Buffer.from(rgba.buffer,rgba.byteOffset+y*w*4,w*4).copy(raw,y*(w*4+1)+1)}
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
function pixels(file){
  const b64=fs.readFileSync(file).toString('base64');
  const r=new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><image width="512" height="512" href="data:image/png;base64,${b64}"/></svg>`).render();
  return {w:r.width,h:r.height,p:r.pixels};
}
function replate(src,bgMode,scale){
  const {w,h,p}=pixels('extension/'+src);
  const at=(x,y)=>{const i=(y*w+x)*4;return [p[i],p[i+1],p[i+2],p[i+3]]};
  // Background = average of edge mid-points just inside the rounded corners.
  const samples=[[w>>1,12],[12,h>>1],[w-13,h>>1],[w>>1,h-13],[40,40],[w-41,40]].map(([x,y])=>at(x,y)).filter(c=>c[3]>200);
  const bg=samples.length?[0,1,2].map(i=>Math.round(samples.reduce((s,c)=>s+c[i],0)/samples.length)):null;
  const out=new Uint8ClampedArray(w*h*4);let x0=w,y0=h,x1=-1,y1=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const [r,g,b,a]=at(x,y);let m=a/255;
    // Ignore the source tile's own rim (anti-aliased rounded edge).
    const edge=Math.min(x,y,w-1-x,h-1-y);if(bg&&edge<w*.06)m=0;
    if(bg){const d=Math.hypot(r-bg[0],g-bg[1],b-bg[2]),light=bg[0]+bg[1]+bg[2]>600,t0=light?75:70,t1=light?70:50;m*=Math.min(1,Math.max(0,(d-t0)/t1));}
    const i=(y*w+x)*4;out[i]=r;out[i+1]=g;out[i+2]=b;out[i+3]=Math.round(m*255);
    if(m>.25){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
  }
  // Remove specks: connected components smaller than 0.3% of the image.
  {const lab=new Int32Array(w*h).fill(-1),sizes=[];const stack=[];
   for(let i=0;i<w*h;i++){if(lab[i]>=0||out[i*4+3]<64)continue;const id=sizes.length;let n=0;stack.push(i);lab[i]=id;
     while(stack.length){const j=stack.pop();n++;const x=j%w,y=(j/w)|0;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=w||Y>=h)continue;const k=Y*w+X;if(lab[k]<0&&out[k*4+3]>=64){lab[k]=id;stack.push(k)}}}
     sizes.push(n);}
   const min=w*h*.003;x0=w;y0=h;x1=-1;y1=-1;
   for(let i=0;i<w*h;i++){const keep=lab[i]>=0?sizes[lab[i]]>=min:out[i*4+3]>0&&false;
     if(lab[i]>=0&&!keep)out[i*4+3]=0;
     if(lab[i]<0&&out[i*4+3]>0){/* faint halo pixel: keep only if next to a kept component */}
     if(out[i*4+3]>64&&(lab[i]<0||keep)){const x=i%w,y=(i/w)|0;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}}
  const mark=png(w,h,out).toString('base64');
  const bw=x1-x0+1,bh=y1-y0+1,f=S*scale/Math.max(bw,bh);
  const fill=bgMode==='auto'?(bg?`rgb(${bg.join(',')})`:'#fff'):bgMode;
  return tile(fill,`<svg x="${(S-bw*f)/2}" y="${(S-bh*f)/2}" width="${bw*f}" height="${bh*f}" viewBox="${x0} ${y0} ${bw} ${bh}"><image width="${w}" height="${h}" href="data:image/png;base64,${mark}"/></svg>`);
}

const only=new Set(process.argv.slice(2));
const made=[];
for(const [id,fn] of Object.entries(DRAW))if(!only.size||only.has(id))made.push({id,svg:fn(),source:'手绘矢量（按品牌标志简化）'});
for(const [id,src,bg,scale] of REPLATE)if(!only.size||only.has(id))made.push({id,svg:replate(src,bg,scale),source:'由 '+src.replace('icons/','')+' 抠出标志重新排版'});
const catalog=JSON.parse(fs.readFileSync('assets/catalog.json','utf8'));
const meta=JSON.parse(fs.readFileSync('assets/optimized.json','utf8'));
for(const m of made){
  fs.writeFileSync(`extension/icons/optimized/${m.id}.png`,new Resvg(m.svg,{font:{loadSystemFonts:true}}).render().asPng());
  fs.writeFileSync(`assets/optimized-svg/${m.id}.svg`,m.svg.length<20000?m.svg:'<!-- raster replate; see scripts/draw-remaining.mjs -->');
  const e=catalog.find(x=>x.id===m.id);const v={};for(const k of ['original','iphone','mac'])if(e.variants[k])v[k]=e.variants[k];
  v.optimized={path:'icons/optimized/'+m.id+'.png',source:m.source};e.variants=v;
  const i=meta.findIndex(x=>x.id===m.id);const rec={id:m.id,source:m.source};if(i<0)meta.push(rec);else meta[i]=rec;
}
fs.writeFileSync('assets/catalog.json',JSON.stringify(catalog,null,2)+'\n');
fs.writeFileSync('assets/optimized.json',JSON.stringify(meta,null,2));
console.log('made',made.map(m=>m.id).join(' '));
await import('./build-library.mjs');
