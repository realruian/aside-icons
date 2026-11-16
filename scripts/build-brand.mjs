// Renders the extension's own icon (toolbar, tab favicon, extensions page) from assets/brand/.
//   node scripts/build-brand.mjs
import fs from 'node:fs';
import {Resvg} from '@resvg/resvg-js';
const out='extension/brand';fs.mkdirSync(out,{recursive:true});
const small=fs.readFileSync('assets/brand/icon-small.svg','utf8'),large=fs.readFileSync('assets/brand/icon.svg','utf8');
for(const [size,svg] of [[16,small],[32,small],[48,large],[128,large]]){
  const png=new Resvg(svg,{fitTo:{mode:'width',value:size}}).render().asPng();
  fs.writeFileSync(`${out}/icon-${size}.png`,png);console.log(`${out}/icon-${size}.png`,png.length,'bytes');
}
