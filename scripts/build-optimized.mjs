// Optimized icons v2: full-bleed rounded tiles (same format as the trimmed
// packaged icons), brand vector mark centred. Run from repo root:
//   node scripts/build-optimized.mjs [id ...]
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {Resvg}=require('@resvg/resvg-js');
const si=require('simple-icons');
const NM='node_modules';
const logos=JSON.parse(fs.readFileSync(NM+'/@iconify-json/logos/icons.json','utf8'));
const S=256,R=56;
const W='#ffffff',K='#000000';
// src: L:<iconify logos key> | lobe:<file> | si:<slug>.  fg recolours mono marks.
export const SPECS=[
  // 办公
  ['google-drive','L:google-drive',W,.70],['google-calendar','L:google-calendar',W,.70],['google-meet','L:google-meet',W,.70],
  ['google-photos','L:google-photos',W,.70],['google-keep','L:google-keep',W,.60],
  ['notion','L:notion-icon',W,.74],['slack','L:slack-icon',W,.66],['zoom','L:zoom-icon',W,.80],
  ['dropbox','L:dropbox',W,.66],['trello','si:trello','#0052CC',.62,W],['linear','si:linear','#5E6AD2',.60,W],
  ['obsidian','L:obsidian-icon','#1E1E1E',.62],['miro','si:miro','#FFD02F',.62,'#050038'],
  ['teams','L:microsoft-teams',W,.70],['onedrive','L:microsoft-onedrive',W,.72],
  // 设计
  ['figma','L:figma',W,.62],['dribbble','si:dribbble','#EA4C89',.64,W],['behance','si:behance','#1769FF',.66,W],
  ['framer','si:framer',K,.52,W],['webflow','si:webflow','#146EF5',.64,W],['unsplash','si:unsplash',K,.50,W],
  // 开发
  ['github','si:github','#181717',.68,W],['gitlab','L:gitlab-icon',W,.66],['vercel','si:vercel',K,.52,W],
  ['docker','L:docker-icon',W,.70],['cloudflare','L:cloudflare-icon',W,.74],['supabase','L:supabase-icon','#1C1C1C',.58],
  ['stackoverflow','L:stackoverflow-icon',W,.60],['npm','si:npm','#CB3837',.70,W],['netlify','L:netlify-icon',W,.70],
  // AI 工具
  ['chatgpt','lobe:openai.svg',K,.64,W],['claude','lobe:claude-color.svg','#F4F3EE',.66],['gemini','lobe:gemini-color.svg',W,.68],
  ['deepseek','lobe:deepseek-color.svg',W,.70],['kimi','lobe:kimi.svg',K,.62,W],['doubao','lobe:doubao-color.svg',W,.72],
  ['qwen','lobe:qwen-color.svg',W,.66],['perplexity','lobe:perplexity.svg','#20808D',.62,W],['cursor','lobe:cursor.svg',K,.62,W],
  ['grok','lobe:grok.svg',K,.62,W],['midjourney','lobe:midjourney.svg',W,.76,K],['huggingface','lobe:huggingface-color.svg',W,.76],
  ['copilot','lobe:copilot-color.svg',W,.70],['mistral','lobe:mistral-color.svg',W,.64],['notebooklm','lobe:notebooklm.svg',K,.64,W],
  ['aistudio','lobe:aistudio.svg',W,.66,'#1A73E8'],['poe','lobe:poe-color.svg',W,.68],['yuanbao','lobe:yuanbao-color.svg',W,.70],
  ['hailuo','lobe:hailuo-color.svg',W,.68],['kling','lobe:kling-color.svg',K,.70],['minimax','lobe:minimax-color.svg',W,.66],
  ['suno','lobe:suno.svg',K,.62,W],['runway','lobe:runway.svg',K,.60,W],['manus','lobe:manus.svg',W,.64,K],
  // 社交
  ['xiaohongshu','si:xiaohongshu','#FF2442',.80,W],['wechat','si:wechat','#07C160',.66,W],['telegram','si:telegram','#26A5E4',.66,W],
  ['discord','si:discord','#5865F2',.66,W],['reddit','si:reddit','#FF4500',.72,W],['linkedin','L:linkedin-icon',W,.70],
  ['facebook','L:facebook',W,.74],['whatsapp','si:whatsapp','#25D366',.66,W],['zhihu','si:zhihu','#0084FF',.62,W],
  ['weibo','si:sinaweibo',W,.74,'#E6162D'],
  // 影音
  ['spotify','L:spotify-icon',K,.70],['netflix','L:netflix-icon',K,.56],['twitch','si:twitch','#9146FF',.60,W],
  ['applemusic','si:applemusic','#FA243C',.60,W],['soundcloud','si:soundcloud','#FF5500',.72,W],['vimeo','si:vimeo','#1AB7EA',.62,W],
  // 生活
  ['taobao','si:taobao','#FF5000',.70,W],['alipay','si:alipay','#1677FF',.66,W],['wikipedia','si:wikipedia',W,.72,K],
  ['steam','si:steam','#171A21',.70,W],['airbnb','si:airbnb','#FF5A5F',.60,W],['paypal','L:paypal',W,.60],
  // 第二批
  ['google-docs','si:googledocs','#4285F4',.58,W],['google-sheets','si:googlesheets','#34A853',.58,W],['google-slides','si:googleslides','#FBBC04',.58,W],
  ['google-fonts','L:google-fonts-icon',W,.70],['googlecloud','lobe:googlecloud-color.svg',W,.74],['firebase','L:firebase-icon',W,.60],
  ['proton-mail','si:protonmail','#6D4AFF',.62,W],['proton-drive','si:protondrive','#EB508D',.60,W],['airtable','L:airtable',W,.66],
  ['evernote','si:evernote','#00A82D',.62,W],['todoist','si:todoist','#E44332',.60,W],['clickup','L:clickup-icon',W,.66],
  ['asana','L:asana-icon',W,.66],['coda','si:coda','#F46A54',.60,W],
  ['squarespace','si:squarespace',W,.66,K],['adobe','L:adobe-icon',W,.62],['wordpress','si:wordpress','#21759B',.70,W],
  ['artstation','si:artstation','#13AFF0',.62,W],['sketch','L:sketch',W,.66],['pexels','si:pexels','#05A081',.60,W],
  ['pixabay','si:pixabay','#2EC66D',.58,W],['freepik','si:freepik','#1273EB',.60,W],['wix','si:wix',W,.74,K],['capcut','lobe:capcut.svg',K,.62,W],
  ['azure','L:azure-icon',W,.66],['aws','L:aws',W,.70],['digitalocean','si:digitalocean','#0080FF',.62,W],
  ['stackexchange','si:stackexchange','#1E5397',.58,W],['codesandbox','si:codesandbox','#151515',.56,W],['bitbucket','L:bitbucket',W,.64],
  ['railway','si:railway','#0B0D0E',.58,W],['render','si:render',K,.56,W],['codepen','L:codepen-icon',W,.62],['replit','lobe:replit-color.svg',W,.64],
  ['elevenlabs','lobe:elevenlabs.svg',K,.50,W],['replicate','lobe:replicate.svg',K,.56,W],['cherrystudio','lobe:cherrystudio-color.svg',W,.70],
  ['stability','lobe:stability-color.svg',W,.66],['windsurf','lobe:windsurf.svg','#0B100F',.62,W],['luma','lobe:luma-color.svg',W,.66],
  ['ideogram','lobe:ideogram.svg',K,.62,W],['vidu','lobe:vidu-color.svg',W,.66],['comfyui','lobe:comfyui-color.svg',K,.62],
  ['civitai','lobe:civitai-color.svg',W,.66],['lmstudio','lobe:lmstudio.svg',K,.62,W],['recraft','lobe:recraft.svg',K,.60,W],
  ['tripo','lobe:tripo-color.svg',W,.66],['pika','lobe:pika.svg',K,.60,W],['udio','lobe:udio-color.svg',W,.66],
  ['meshy','lobe:meshy-color.svg',W,.66],['sora','lobe:sora-color.svg',W,.66],['dify','lobe:dify-color.svg',W,.66],['fal','lobe:fal-color.svg',W,.66],
  ['tripadvisor','si:tripadvisor','#34E0A1',.72,K],['epicgames','si:epicgames','#313131',.60,W],['ebay','si:ebay',W,.80,'#E53238'],
  ['douban','si:douban','#2D963D',.62,W],['quora','si:quora','#B92B27',.60,W],['imdb','si:imdb','#F5C518',.74,K],
  // 第三批：日常网站
  ['google','L:google-icon',W,.62],['baidu','lobe:baidu-color.svg',W,.64],['bing','lobe:bing-color.svg',W,.60],
  ['icloud','si:icloud','#3693F3',.66,W],['google-translate','si:googletranslate',W,.62],['deepl','si:deepl','#0F2B46',.60,W],
  ['meituan','si:meituan','#FFD100',.72,'#111111'],['google-maps','L:google-maps',W,.62],['kuaishou','si:kuaishou','#FF4906',.62,W],
  ['netease-music','si:neteasecloudmusic','#D43C33',.62,W],['tiktok','L:tiktok-icon',K,.60],['chatglm','lobe:chatglm-color.svg',W,.64],
  ['wenxin','lobe:wenxin-color.svg',W,.66],['coze','si:coze',W,.60],['wechat-mp','si:wechat','#07C160',.66,W],
  ['v2ex','si:v2ex','#1F1F1F',.58,W],['medium','si:medium',K,.62,W],['pinterest','L:pinterest',W,.66],['threads','si:threads',K,.58,W],
  ['hackernews','si:ycombinator',W,.70],['juejin','si:juejin','#007FFF',.62,W],['csdn','si:csdn','#FC5531',.58,W],
  ['leetcode','si:leetcode',W,.62],['jira','L:jira',W,.62],['confluence','L:confluence',W,.62],
];
const siBySlug=new Map(Object.values(si).filter(x=>x&&x.slug).map(x=>[x.slug,x]));
function mark(src,fg){
  const [kind,key]=src.split(/:(.+)/);
  if(kind==='L'){const i=logos.icons[key];if(!i)throw Error('missing logos '+key);
    return {vw:i.width||logos.width,vh:i.height||logos.height,body:i.body,source:'SVG Logos · '+key,url:'https://github.com/gilbarbara/logos'};}
  if(kind==='si'){const i=siBySlug.get(key);if(!i)throw Error('missing simple-icons '+key);
    return {vw:24,vh:24,body:`<path fill="${fg||'#'+i.hex}" d="${i.path}"/>`,source:'Simple Icons · '+key,url:'https://github.com/simple-icons/simple-icons'};}
  if(kind==='lobe'){const raw=fs.readFileSync(NM+'/@lobehub/icons-static-svg/icons/'+key,'utf8');
    const vb=raw.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
    let body=raw.replace(/^[\s\S]*?<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'');
    const rootFill=/^<svg[^>]*fill="currentColor"/.test(raw.trim());
    if(fg)body=body.replace(/currentColor/g,fg);
    if(rootFill)body=`<g fill="${fg||'#000'}">${body}</g>`;
    return {vw:vb[2],vh:vb[3],vx:vb[0],vy:vb[1],body,source:'Lobe Icons · '+key,url:'https://github.com/lobehub/lobe-icons'};}
  throw Error('bad src '+src);
}
// Fit the mark's real ink bbox (not its viewBox) into the target box.
function inkBox(svg){
  const r=new Resvg(svg).render(),W=r.width,H=r.height,p=r.pixels;let x0=W,y0=H,x1=-1,y1=-1;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(p[(y*W+x)*4+3]>8){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
  return {x0,y0,x1,y1,W,H};
}
export function build(id,src,bg,scale,fg){
  const m=mark(src,fg),vx=m.vx||0,vy=m.vy||0;
  const probeSize=512;
  const probe=`<svg xmlns="http://www.w3.org/2000/svg" width="${probeSize}" height="${probeSize}" viewBox="${vx} ${vy} ${m.vw} ${m.vh}" preserveAspectRatio="xMidYMid meet">${m.body}</svg>`;
  const b=inkBox(probe);if(b.x1<0)throw Error('empty mark '+id);
  // ink bbox in viewBox units
  const k=Math.min(probeSize/m.vw,probeSize/m.vh),ox=(probeSize-m.vw*k)/2,oy=(probeSize-m.vh*k)/2;
  const ix=vx+(b.x0-ox)/k,iy=vy+(b.y0-oy)/k,iw=(b.x1-b.x0+1)/k,ih=(b.y1-b.y0+1)/k;
  const box=S*scale,f=box/Math.max(iw,ih),w=iw*f,h=ih*f;
  const art=`<svg x="${(S-w)/2}" y="${(S-h)/2}" width="${w}" height="${h}" viewBox="${ix} ${iy} ${iw} ${ih}" overflow="visible">${m.body}</svg>`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"><defs><clipPath id="tile"><rect width="${S}" height="${S}" rx="${R}"/></clipPath></defs><g clip-path="url(#tile)"><rect width="${S}" height="${S}" fill="${bg}"/>${art}</g></svg>`;
  return {svg,png:new Resvg(svg).render().asPng(),source:m.source,url:m.url};
}
if(process.argv[1]&&import.meta.url.endsWith(process.argv[1].split('/').pop())){
  const only=new Set(process.argv.slice(2));
  const out='extension/icons/optimized',svgDir='assets/optimized-svg';
  fs.mkdirSync(out,{recursive:true});fs.mkdirSync(svgDir,{recursive:true});
  const made=[],failed=[];
  for(const [id,src,bg,scale,fg] of SPECS){
    if(only.size&&!only.has(id))continue;
    try{const r=build(id,src,bg,scale,fg);fs.writeFileSync(`${out}/${id}.png`,r.png);fs.writeFileSync(`${svgDir}/${id}.svg`,r.svg);made.push({id,source:r.source,sourceUrl:r.url,bg,scale});}
    catch(e){failed.push(id+': '+e.message);}
  }
  const metaFile='assets/optimized.json';
  const prev=fs.existsSync(metaFile)?JSON.parse(fs.readFileSync(metaFile,'utf8')):[];
  const merged=new Map(prev.map(x=>[x.id,x]));for(const x of made)merged.set(x.id,x);
  fs.writeFileSync(metaFile,JSON.stringify([...merged.values()],null,2));
  // Register the optimized variant in the single catalog.
  const catalog=JSON.parse(fs.readFileSync('assets/catalog.json','utf8'));
  for(const m of made){const e=catalog.find(x=>x.id===m.id);if(!e){failed.push(m.id+': not in catalog');continue;}
    const v={};for(const k of ['original','iphone','mac'])if(e.variants[k])v[k]=e.variants[k];
    v.optimized={path:'icons/optimized/'+m.id+'.png',source:m.source,sourceUrl:m.sourceUrl};e.variants=v;}
  fs.writeFileSync('assets/catalog.json',JSON.stringify(catalog,null,2)+'\n');
  console.log('built',made.length,'failed',failed.length,failed.join(' | '));
  await import('./build-library.mjs');
}
