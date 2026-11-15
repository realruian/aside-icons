'use strict';
// Icon size presets shared by the worker and the settings page.
// "large" uses the packaged PNG untouched (already trimmed to fill the
// favicon square). "xlarge" zooms into the centre; tile-shaped icons get their
// rounded corners re-applied afterwards.
// The packaged PNGs are pre-trimmed to fill the whole favicon square ("large").
const ICON_SIZES=Object.freeze({
  large:{label:'大',zoom:0},
  xlarge:{label:'特大',zoom:1.2}
});
const DEFAULT_ICON_SIZE='large';
function validIconSize(size){return Object.prototype.hasOwnProperty.call(ICON_SIZES,size);}
async function resizeIcon(blob,size){
  const spec=ICON_SIZES[size];
  if(!spec||!spec.zoom||typeof createImageBitmap!=='function'||typeof OffscreenCanvas!=='function')return null;
  const bitmap=await createImageBitmap(blob);
  try{
    const W=bitmap.width,H=bitmap.height;
    const probe=new OffscreenCanvas(W,H).getContext('2d',{willReadFrequently:true});
    probe.drawImage(bitmap,0,0);
    const data=probe.getImageData(0,0,W,H).data;
    let x0=W,y0=H,x1=-1,y1=-1;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(data[(y*W+x)*4+3]>8){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
    if(x1<0)return null;
    const bw=x1-x0+1,bh=y1-y0+1,cx=x0+bw/2,cy=y0+bh/2,side=Math.max(bw,bh)/spec.zoom;
    const alpha=(x,y)=>data[(Math.min(H-1,Math.max(0,Math.round(y)))*W+Math.min(W-1,Math.max(0,Math.round(x))))*4+3];
    // A roughly square, solid tile whose bbox corner is transparent has rounded corners.
    const roundedTile=spec.zoom>1&&bw>bh*0.9&&bh>bw*0.9&&alpha(x0+1,y0+1)<128&&alpha(cx,cy)>200;
    const out=256,canvas=new OffscreenCanvas(out,out),g=canvas.getContext('2d');
    g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
    if(roundedTile){g.beginPath();g.roundRect(0,0,out,out,out*0.22);g.clip();}
    g.drawImage(bitmap,cx-side/2,cy-side/2,side,side,0,0,out,out);
    return await canvas.convertToBlob({type:'image/png'});
  }finally{bitmap.close?.();}
}
