'use strict';
const $=s=>document.querySelector(s);
const VARIANTS=['original','iphone','mac','optimized'];
const labels={original:'原版',iphone:'iPhone',mac:'Mac',optimized:'优化版'};
const PREVIEW_MINE=['jimeng','gmail','x','youtube','douyin','libtv','instagram','bilibili'];
const CATEGORY_ORDER=['常用','AI 工具','办公','社交','影音','设计','开发','生活'];
const catRank=c=>{const i=CATEGORY_ORDER.indexOf(c);return i<0?99:i};
const list=[...ICON_LIBRARY].sort((a,b)=>catRank(a.category)-catRank(b.category)||a.category.localeCompare(b.category,'zh')||a.label.localeCompare(b.label,'zh'));
const byId=new Map(list.map(x=>[x.id,x]));
const isExtension=location.protocol==='chrome-extension:'&&!!globalThis.chrome?.runtime?.id;
const loadedVersion=isExtension?chrome.runtime.getManifest?.().version:null;

let ready=false,saving=false,toastTimer,category='';
let settings={enabled:true,choices:{},effectiveChoices:{},iconSize:DEFAULT_ICON_SIZE,mySites:[],mine:{starred:[],hidden:[]},openPinned:[]};
// Unsaved edits; nothing reaches the extension until Save.
let draft={},draftSize=null,added=new Set(),removed=new Set();

// ---------- model ----------
function saved(e){return settings.effectiveChoices?.[e.id]||settings.choices?.[e.id]||e.defaultVariant||'original'}
function current(e){return draft[e.id]||saved(e)}
function savedSize(){return validIconSize(settings.iconSize)?settings.iconSize:DEFAULT_ICON_SIZE}
function currentSize(){return draftSize||savedSize()}
function mineDirty(){return added.size+removed.size>0}
function changeCount(){return Object.keys(draft).length+(draftSize?1:0)+(mineDirty()?1:0)}
function myIds(){
  const base=isExtension?settings.mySites||[]:PREVIEW_MINE;
  return [...base.filter(id=>!removed.has(id)),...[...added].filter(id=>!base.includes(id))].filter(id=>byId.has(id));
}
function assetPath(e,v){
  const p=v==='original'?e.variants?.original?.preview:e.variants?.[v]?.path;
  return typeof p==='string'&&/^icons\/[a-zA-Z0-9_/-]+\.png$/.test(p)&&!p.includes('..')?p:null;
}
function available(e,v){return v==='original'||!!assetPath(e,v)}
function variantsOf(e){return VARIANTS.filter(v=>available(e,v))}

// ---------- images ----------
// Every icon on the page goes through one frame: a rounded square at 24 or 40 px.
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n}
function svgIcon(viewBox,attrs,inner){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',viewBox);svg.setAttribute('aria-hidden','true');
  for(const [k,v] of Object.entries(attrs))svg.setAttribute(k,v);svg.innerHTML=inner;return svg;
}
function globe(){return svgIcon('0 0 24 24',{fill:'none',stroke:'currentColor','stroke-width':'1.5'},'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 4 6 4 9s-1 6-4 9c-3-3-4-6-4-9s1-6 4-9Z"/>')}
function frame(e,v,size){
  const f=el('span',`frame s${size} ${v}`),path=assetPath(e,v);
  if(v==='original'&&e.variants?.original?.fill)f.classList.add('fill');
  if(!path){f.append(globe());return f}
  const img=document.createElement('img');img.alt='';img.decoding='async';img.src=path;
  img.addEventListener('error',()=>img.replaceWith(globe()),{once:true});
  f.append(img);return f;
}
function dot(){return el('span','dot')}
function isDirty(id){return Object.prototype.hasOwnProperty.call(draft,id)}

// ---------- style ----------
// The style is not stored; it is whichever version most sites currently use.
function styleOf(pick){
  const n=Object.fromEntries(VARIANTS.map(v=>[v,0]));
  for(const e of list)n[pick(e)]++;
  return VARIANTS.reduce((a,b)=>n[b]>n[a]?b:a);
}
function renderStyle(){
  const now=styleOf(current),was=styleOf(saved);
  $('#style').replaceChildren(...VARIANTS.map(v=>{
    const b=el('button');b.type='button';b.dataset.style=v;b.setAttribute('role','radio');
    const sel=v===now;b.setAttribute('aria-checked',String(sel));b.tabIndex=sel?0:-1;b.classList.toggle('is-dirty',sel&&now!==was);b.disabled=!canEdit();
    b.append(dot(),labels[v]);return b;
  }));
  const own=list.filter(e=>available(e,now)&&current(e)!==now).length;
  $('#style-note').textContent='没有该版本的网站保持不变'+(own?`；${own} 个网站单独选了别的版本`:'');
}

// ---------- site list ----------
const PAGE=30;let limit=PAGE;
function query(){return $('#search').value.trim().toLocaleLowerCase()}
function header(){
  const h=el('div','grid cols');h.setAttribute('aria-hidden','true');
  h.append(el('span','','网站'),...VARIANTS.map(v=>el('span','',labels[v])));return h;
}
// Site name with the searched text highlighted.
function nameWithMatch(text,q){
  const b=el('b'),i=q?text.toLocaleLowerCase().indexOf(q):-1;
  if(i<0){b.textContent=text;return b}
  b.append(text.slice(0,i),el('mark','',text.slice(i,i+q.length)),text.slice(i+q.length));return b;
}
function siteRow(e,q){
  const v=current(e),dirty=isDirty(e.id);
  const row=el('div','grid site row');row.dataset.id=e.id;row.dataset.current=v;row.classList.toggle('is-dirty',dirty);
  row.setAttribute('role','radiogroup');row.setAttribute('aria-label',e.label);
  const mark=el('span','mark');mark.classList.toggle('is-dirty',dirty);mark.append(frame(e,v,24));
  const name=el('div','name');name.append(nameWithMatch(e.label,q),el('span','',e.domains.join(' · ')));
  const who=el('div','who');who.append(mark,name);row.append(who);
  for(const x of VARIANTS){
    if(!available(e,x)){const n=el('span','none');n.title='没有'+labels[x];row.append(n);continue}
    const sel=x===v,b=el('button','option');b.type='button';b.dataset.id=e.id;b.dataset.variant=x;b.setAttribute('role','radio');
    b.setAttribute('aria-checked',String(sel));b.tabIndex=sel?0:-1;b.classList.toggle('is-dirty',sel&&dirty);b.disabled=!canEdit();
    b.setAttribute('aria-label',`${e.label}：${labels[x]}`+(x===saved(e)?'（当前）':''));
    b.append(dot(),frame(e,x,40));row.append(b);
  }
  return row;
}
function renderCategories(){
  $('#categories').replaceChildren(...['',...new Set(list.map(x=>x.category))].map(c=>{const o=el('option','',c||'全部类别');o.value=c;o.selected=c===category;return o}));
}
function visibleSites(){
  const q=query();
  return list.filter(x=>(!category||x.category===category)&&(!q||[x.label,x.id,...x.domains].join(' ').toLocaleLowerCase().includes(q)));
}
function renderSites(){
  const q=query(),v=visibleSites(),shown=v.slice(0,limit);
  const nodes=[header(),...shown.map(e=>siteRow(e,q))];
  if(v.length>shown.length){const more=el('button','more',`显示更多（还有 ${v.length-shown.length} 个）`);more.type='button';more.id='more';nodes.push(more)}
  $('#sites').replaceChildren(...nodes);
  $('#sites').hidden=!v.length;$('#empty').hidden=v.length>0;
  const opt=list.filter(x=>x.variants?.optimized?.path).length;
  $('#count').textContent=q||category?`找到 ${v.length} 个`:`${list.length} 个网站 · ${opt} 个有优化版`;
}

// ---------- chrome ----------
function canEdit(){return ready&&!saving}
function renderTools(){
  const on=settings.enabled!==false;
  $('#toggle').setAttribute('aria-checked',String(on));
  for(const id of ['#toggle','#refresh','#export','#import'])$(id).disabled=!canEdit();
  $('#toggle-state').textContent=!isExtension?'本地预览':on?'已开启':'已关闭，网页显示原图';
  for(const b of $('#size').querySelectorAll('button')){
    const sel=b.dataset.size===currentSize();b.setAttribute('aria-checked',String(sel));b.tabIndex=sel?0:-1;b.classList.toggle('is-dirty',sel&&!!draftSize);b.disabled=!isExtension?false:!canEdit();
  }
  $('#version').textContent=loadedVersion?'v'+loadedVersion:'本地预览';
}
function renderBar(){
  const n=changeCount();
  $('#savebar').classList.toggle('is-dirty',n>0);
  $('#bar-text').textContent=!isExtension?'本地预览，无法保存':saving?'正在保存…':n?`有 ${n} 项更改未保存`:'所有更改已保存';
  $('#save').disabled=!ready||saving||!n;$('#save').textContent=saving?'保存中…':n?'保存并应用':'已保存';
  $('#discard').hidden=!n||saving;
}
function refreshView(){renderStyle();renderSites();renderTools();renderBar()}
const render=refreshView;

function banner(text,{error=false,action=null,label=''}={}){
  const b=$('#banner');if(!text){b.hidden=true;return}
  b.hidden=false;b.classList.toggle('error',error);b.replaceChildren(document.createTextNode(text));
  if(action){const btn=document.createElement('button');btn.type='button';btn.className='btn';btn.textContent=label;btn.addEventListener('click',action);b.append(btn)}
}
function showToast(m,error=false){clearTimeout(toastTimer);const t=$('#toast');t.classList.add('show');t.classList.toggle('error',error);t.textContent=m;toastTimer=setTimeout(()=>t.classList.remove('show'),5000)}
async function request(type,extra={}){
  const r=await chrome.runtime.sendMessage({target:'worker',type,...extra});
  if(!r||r.error)throw Error(r?.error||'暂时无法连接扩展');return r;
}
async function diskVersion(){try{return (await (await fetch('manifest.json',{cache:'no-store'})).json()).version}catch{return null}}

// The worker Aside keeps in memory can be older than the files on disk.
async function staleWorker(){
  ready=false;render();
  try{
    const {lastAutoReload=0}=await chrome.storage.local.get('lastAutoReload');
    if(Date.now()-lastAutoReload>120000){
      banner('扩展有新版本，正在自动更新，页面会自动重新打开…');
      await chrome.storage.local.set({lastAutoReload:Date.now(),reopenSettings:Date.now()});
      chrome.runtime.reload();return;
    }
  }catch{}
  banner('扩展后台还是旧版本，现在保存不会生效。',{error:true,label:'立即更新',action:async()=>{try{await chrome.storage.local.set({reopenSettings:Date.now()})}catch{}chrome.runtime.reload()}});
}
async function load(){
  if(!isExtension){banner('这是本地预览。在 Aside 扩展里打开才能保存。');render();return}
  banner('');
  try{
    settings=await request('getSettings');
    const disk=await diskVersion();
    if(typeof settings.iconSize!=='string'||!Array.isArray(settings.mySites)||(disk&&settings.version&&disk!==settings.version)){await staleWorker();return}
    ready=true;render();
  }catch(error){
    ready=false;render();banner('设置暂时无法读取。',{error:true,label:'重试',action:load});
  }
}
// Notice updates installed while this page is open.
if(isExtension)setInterval(async()=>{const v=await diskVersion();if(v&&loadedVersion&&v!==loadedVersion)banner(`扩展已更新到 v${v}。`,{label:'刷新页面',action:()=>location.reload()})},20000);

// ---------- actions ----------
function choose(id,v){
  const e=byId.get(id);if(!canEdit()||!e||!available(e,v))return;
  if(v===saved(e))delete draft[id];else draft[id]=v;
  refreshView();
}
function chooseSize(size){
  if(!validIconSize(size)||saving||(isExtension&&!ready))return;
  draftSize=size===savedSize()?null:size;refreshView();
}
function bulk(value){
  const [scope,v]=value.split(':');if(!canEdit()||!labels[v])return;
  const ids=scope==='mine'?myIds():list.map(x=>x.id);let n=0;
  for(const id of ids){const e=byId.get(id);if(!available(e,v))continue;if(v===saved(e))delete draft[id];else draft[id]=v;n++}
  refreshView();showToast(`已把 ${n} 个网站设为${labels[v]}（没有该版本的保持不变），点保存后生效。`);
}
function mineLists(){
  const starred=new Set(settings.mine?.starred||[]),hidden=new Set(settings.mine?.hidden||[]);
  for(const id of added){starred.add(id);hidden.delete(id)}
  for(const id of removed){starred.delete(id);hidden.add(id)}
  return {starred:[...starred],hidden:[...hidden]};
}
async function saveAll(){
  if(!ready||saving||!changeCount())return;
  saving=true;refreshView();
  try{
    const payload={choices:{...draft}};if(draftSize)payload.iconSize=draftSize;
    if(mineDirty())Object.assign(payload,mineLists());
    settings=await request('saveSettings',payload);
    draft={};draftSize=null;added=new Set();removed=new Set();
    const r=settings.lastRefresh;
    showToast(settings.enabled===false?'已保存。图标替换目前关闭，打开后生效。':'已保存并刷新'+(r?` ${r.open} 个打开的网页。`+(r.asleep?.length?`未加载的：${r.asleep.join('、')}，点开一次就会更新。`:''):'。'));
  }catch(error){
    if(/未知控制请求/.test(error?.message||''))staleWorker();
    showToast('保存失败，更改仍保留在页面上。'+(error?.message||''),true);
  }finally{saving=false;refreshView()}
}
function discard(){draft={};draftSize=null;added=new Set();removed=new Set();refreshView()}
async function simple(type,extra,ok){
  if(!canEdit())return;saving=true;renderTools();
  try{settings=await request(type,extra);showToast(ok(settings))}catch(error){showToast('操作失败：'+(error?.message||'未知错误'),true)}
  finally{saving=false;refreshView()}
}
function exportSettings(){
  const data={app:'aside-icons',version:loadedVersion,exported:new Date().toISOString(),choices:{...settings.choices,...draft},iconSize:currentSize(),...mineLists()};
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  a.download=`aside-icons-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);
}
async function importSettings(file){
  try{
    const data=JSON.parse(await file.text());
    if(data?.app!=='aside-icons'||typeof data.choices!=='object')throw Error('不是 Aside 图标的设置文件');
    let n=0;
    for(const [id,v] of Object.entries(data.choices)){const e=byId.get(id);if(!e||!available(e,v))continue;if(v===saved(e))delete draft[id];else{draft[id]=v;n++}}
    if(validIconSize(data.iconSize))draftSize=data.iconSize===savedSize()?null:data.iconSize;
    const base=settings.mySites||[];
    for(const id of data.starred||[])if(byId.has(id)&&!base.includes(id))added.add(id);
    for(const id of data.hidden||[])if(base.includes(id))removed.add(id);
    refreshView();showToast(`已导入 ${n} 项选择，检查后点保存。`);
  }catch(error){showToast('导入失败：'+error.message,true)}
}

// ---------- wiring ----------
for(const [key,spec] of Object.entries(ICON_SIZES)){const b=el('button');b.type='button';b.dataset.size=key;b.setAttribute('role','radio');b.append(dot(),spec.label);$('#size').append(b)}
const esc=s=>globalThis.CSS?.escape?CSS.escape(s):String(s).replace(/["\\]/g,'\\$&');
const focusSel=sel=>$(sel)?.focus();
// Radio-group arrow keys: move the choice within the same row and keep focus on it.
function arrowIndex(ev,n,i){
  const step={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[ev.key];
  const j=ev.key==='Home'?0:ev.key==='End'?n-1:step===undefined?-1:(i+step+n)%n;
  if(j>=0)ev.preventDefault();return j;
}
function pickVersion(o){
  choose(o.dataset.id,o.dataset.variant);
  focusSel(`#sites .option[data-id="${esc(o.dataset.id)}"][data-variant="${esc(o.dataset.variant)}"]`);
}
$('#sites').addEventListener('click',ev=>{
  const o=ev.target.closest('.option');if(o){if(!o.disabled)pickVersion(o);return}
  if(ev.target.closest('#more')){limit+=PAGE*2;renderSites()}
});
$('#sites').addEventListener('keydown',ev=>{
  const o=ev.target.closest?.('.option');if(!o)return;
  const items=[...o.parentElement.querySelectorAll('.option:not(:disabled)')],i=items.indexOf(o);if(i<0)return;
  const j=arrowIndex(ev,items.length,i);if(j>=0&&j!==i)pickVersion(items[j]);
});
// Style and icon size are small radio groups of the same shape.
for(const [box,attr,act] of [[$('#style'),'style',v=>bulk('all:'+v)],[$('#size'),'size',chooseSize]]){
  box.addEventListener('click',ev=>{const b=ev.target.closest(`button[data-${attr}]`);if(b&&!b.disabled){act(b.dataset[attr]);focusSel(`#${box.id} [data-${attr}="${esc(b.dataset[attr])}"]`)}});
  box.addEventListener('keydown',ev=>{
    const items=[...box.querySelectorAll('button')],i=items.indexOf(ev.target);if(i<0)return;
    const j=arrowIndex(ev,items.length,i);if(j<0||items[j].disabled)return;
    act(items[j].dataset[attr]);focusSel(`#${box.id} [data-${attr}="${esc(items[j].dataset[attr])}"]`);
  });
}
// "/" jumps to search from anywhere; the top bar gets a hairline once the list scrolls under it.
document.addEventListener('keydown',ev=>{
  if(ev.key!=='/'||ev.metaKey||ev.ctrlKey||ev.altKey)return;
  if(ev.target?.closest?.('input,select,textarea'))return;
  ev.preventDefault();$('#search').focus();$('#search').select();
});
// Sticky top bar and fixed save bar: publish their real heights so scroll padding, body padding and the toast clear them.
if(globalThis.ResizeObserver){
  const ro=new ResizeObserver(()=>{
    const root=document.documentElement.style;
    root.setProperty('--top-h',Math.ceil($('.top').offsetHeight+8)+'px');
    root.setProperty('--bar-h',Math.ceil($('#savebar').offsetHeight)+'px');
  });
  ro.observe($('.top'));ro.observe($('#savebar'));
}
globalThis.addEventListener?.('scroll',()=>$('.top').classList.toggle('scrolled',scrollY>4),{passive:true});
$('#categories').addEventListener('change',ev=>{category=ev.target.value;limit=PAGE;renderSites()});
$('#search').addEventListener('input',()=>{limit=PAGE;renderSites()});
$('#toggle').addEventListener('click',()=>simple('setEnabled',{enabled:settings.enabled===false},s=>s.enabled?'图标替换已打开。':'已关闭，网页恢复原图。'));
$('#refresh').addEventListener('click',()=>simple('refresh',{},s=>{const r=s.lastRefresh;return r?`已刷新 ${r.open} 个打开的网页。`+(r.asleep?.length?`未加载的：${r.asleep.join('、')}，点开一次就会更新。`:''):'已刷新。'}));
$('#export').addEventListener('click',exportSettings);
$('#import').addEventListener('click',()=>$('#import-file').click());
$('#import-file').addEventListener('change',ev=>{const f=ev.target.files?.[0];ev.target.value='';if(f)importSettings(f)});
$('#save').addEventListener('click',saveAll);
$('#discard').addEventListener('click',discard);
document.addEventListener('keydown',ev=>{if((ev.metaKey||ev.ctrlKey)&&ev.key==='s'){ev.preventDefault();saveAll()}});
globalThis.addEventListener?.('beforeunload',ev=>{if(changeCount()){ev.preventDefault();ev.returnValue=''}});
renderCategories();render();load();
$('#search').focus({preventScroll:true});
