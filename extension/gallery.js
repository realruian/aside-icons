'use strict';
const $=s=>document.querySelector(s);
const VARIANTS=['original','iphone','mac','optimized'];
const labels={original:'原版',iphone:'iPhone',mac:'Mac',optimized:'优化版'};
const STYLES=['recommended',...VARIANTS];
const styleLabels={recommended:'推荐',...labels};
const CATEGORY_ORDER=['常用','AI 工具','办公','社交','影音','设计','开发','生活'];
const catRank=c=>{const i=CATEGORY_ORDER.indexOf(c);return i<0?99:i};
const list=[...ICON_LIBRARY].sort((a,b)=>catRank(a.category)-catRank(b.category)||a.category.localeCompare(b.category,'zh')||a.label.localeCompare(b.label,'zh'));
const byId=new Map(list.map(x=>[x.id,x]));
const isExtension=location.protocol==='chrome-extension:'&&!!globalThis.chrome?.runtime?.id;
const loadedVersion=isExtension?chrome.runtime.getManifest?.().version:null;

let ready=false,saving=false,toastTimer,category='';
let settings={enabled:true,style:'recommended',choices:{},effectiveChoices:{},mySites:[],mine:{starred:[],hidden:[]},openPinned:[]};
// Unsaved edits; nothing reaches the extension until Save.
// draft: per-site override edits, {id: version} or {id: null} = follow the default style again.
let draft={},draftStyle=null,draftEnabled=null,added=new Set(),removed=new Set();

// ---------- model ----------
// Every site follows the default style unless it has its own override. "recommended" is each
// site's own best version; a site without the chosen version also falls back to it.
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function savedStyle(){return STYLES.includes(settings.style)?settings.style:'recommended'}
function currentStyle(){return draftStyle||savedStyle()}
function savedEnabled(){return settings.enabled!==false}
function currentEnabled(){return draftEnabled??savedEnabled()}
function recommended(e){return available(e,e.defaultVariant)?e.defaultVariant:'original'}
function styleChoice(e,style){return style!=='recommended'&&available(e,style)?style:recommended(e)}
function savedOverride(e){const v=settings.choices?.[e.id];return v&&available(e,v)?v:null}
function override(e){return own(draft,e.id)?draft[e.id]:savedOverride(e)}
function isCustom(e){const o=override(e);return o!=null&&o!==styleChoice(e,currentStyle())}
function saved(e){return settings.effectiveChoices?.[e.id]||savedOverride(e)||styleChoice(e,savedStyle())}
function current(e){return isCustom(e)?override(e):styleChoice(e,currentStyle())}
function mineDirty(){return added.size+removed.size>0}
function changeCount(){return Object.keys(draft).length+(draftStyle?1:0)+(draftEnabled!==null?1:0)+(mineDirty()?1:0)}
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
function isDirty(e){return current(e)!==saved(e)}

// ---------- style ----------
function renderStyle(){
  const now=currentStyle();
  $('#style').replaceChildren(...STYLES.map(v=>{
    const b=el('button');b.type='button';b.dataset.style=v;b.setAttribute('role','radio');
    const sel=v===now;b.setAttribute('aria-checked',String(sel));b.tabIndex=sel?0:-1;b.classList.toggle('is-dirty',sel&&!!draftStyle);b.disabled=!canEdit();
    b.append(styleLabels[v]);return b;
  }));
  const missing=now==='recommended'?0:list.filter(e=>!available(e,now)).length,custom=list.filter(isCustom).length;
  const parts=[now==='recommended'?'推荐：每个网站用各自最合适的版本':missing?`${missing} 个网站没有${labels[now]}，用推荐版本`:''].filter(Boolean);
  if(custom)parts.push(`${custom} 个网站单独设置 · `);
  const note=$('#style-note');note.replaceChildren(parts.join('；'));
  if(custom){const reset=el('button','link','全部恢复默认');reset.type='button';reset.id='reset-all';reset.disabled=!canEdit();note.append(reset)}
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
  const v=current(e),dirty=isDirty(e),custom=isCustom(e);
  const row=el('div','grid site row');row.dataset.id=e.id;row.dataset.current=v;row.classList.toggle('is-dirty',dirty);
  row.setAttribute('role','radiogroup');row.setAttribute('aria-label',e.label);
  const mark=el('span','mark');mark.classList.toggle('is-dirty',dirty);mark.append(frame(e,v,24));
  const name=el('div','name');name.append(nameWithMatch(e.label,q),el('span','',e.domains.join(' · ')));
  if(custom){
    const tag=el('span','custom','单独设置 · '),reset=el('button','link','恢复默认');
    reset.type='button';reset.dataset.reset=e.id;reset.disabled=!canEdit();reset.setAttribute('aria-label',`${e.label}：恢复默认`);
    tag.append(reset);name.append(tag);
  }
  const who=el('div','who');who.append(mark,name);row.append(who);
  for(const x of VARIANTS){
    if(!available(e,x)){const n=el('span','none');n.title='没有'+labels[x];row.append(n);continue}
    const sel=x===v,b=el('button','option');b.type='button';b.dataset.id=e.id;b.dataset.variant=x;b.setAttribute('role','radio');
    b.setAttribute('aria-checked',String(sel));b.tabIndex=sel?0:-1;b.classList.toggle('is-dirty',sel&&dirty);b.disabled=!canEdit();
    b.setAttribute('aria-label',`${e.label}：${labels[x]}`+(x===saved(e)?'（当前）':''));
    b.append(frame(e,x,40));row.append(b);
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
  const on=currentEnabled();
  $('#toggle').setAttribute('aria-checked',String(on));$('#toggle').classList.toggle('is-dirty',draftEnabled!==null);
  for(const id of ['#toggle','#refresh','#export','#import'])$(id).disabled=!canEdit();
  $('#toggle-state').textContent=!isExtension?'本地预览':on?'':'图标替换已关闭，网页显示原图';
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
    if(typeof settings.style!=='string'||!Array.isArray(settings.mySites)||(disk&&settings.version&&disk!==settings.version)){await staleWorker();return}
    ready=true;render();
  }catch(error){
    ready=false;render();banner('设置暂时无法读取。',{error:true,label:'重试',action:load});
  }
}
// Notice updates installed while this page is open.
if(isExtension)setInterval(async()=>{const v=await diskVersion();if(v&&loadedVersion&&v!==loadedVersion)banner(`扩展已更新到 v${v}。`,{label:'刷新页面',action:()=>location.reload()})},20000);

// ---------- actions ----------
// Store an override only when it differs from what the default style gives.
function setOverride(e,v){
  if(v!==null&&v===styleChoice(e,currentStyle()))v=null;
  if(v===savedOverride(e))delete draft[e.id];else draft[e.id]=v;
}
function choose(id,v){
  const e=byId.get(id);if(!canEdit()||!e||!available(e,v))return;
  setOverride(e,v);refreshView();
}
function resetSite(id){const e=byId.get(id);if(!canEdit()||!e)return;setOverride(e,null);refreshView()}
function resetAll(){
  if(!canEdit())return;const custom=list.filter(isCustom);
  for(const e of custom)setOverride(e,null);
  refreshView();showToast(`${custom.length} 个网站已恢复默认样式，点保存后生效。`);
}
function chooseStyle(style){
  if(!canEdit()||!STYLES.includes(style))return;
  draftStyle=style===savedStyle()?null:style;
  for(const id of Object.keys(draft))setOverride(byId.get(id),draft[id]);
  refreshView();
}
function toggleEnabled(){
  if(!canEdit())return;const next=!currentEnabled();
  draftEnabled=next===savedEnabled()?null:next;refreshView();
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
    const payload={choices:{...draft}};
    if(draftStyle)payload.style=draftStyle;
    if(draftEnabled!==null)payload.enabled=draftEnabled;
    if(mineDirty())Object.assign(payload,mineLists());
    settings=await request('saveSettings',payload);
    draft={};draftStyle=null;draftEnabled=null;added=new Set();removed=new Set();
    const r=settings.lastRefresh;
    showToast(settings.enabled===false?'已保存。图标替换已关闭，网页显示原图。':'已保存并刷新'+(r?` ${r.open} 个打开的网页。`+(r.asleep?.length?`未加载的：${r.asleep.join('、')}，点开一次就会更新。`:''):'。'));
  }catch(error){
    if(/未知控制请求/.test(error?.message||''))staleWorker();
    showToast('保存失败，更改仍保留在页面上。'+(error?.message||''),true);
  }finally{saving=false;refreshView()}
}
function discard(){draft={};draftStyle=null;draftEnabled=null;added=new Set();removed=new Set();refreshView()}
async function simple(type,extra,ok){
  if(!canEdit())return;saving=true;renderTools();
  try{settings=await request(type,extra);showToast(ok(settings))}catch(error){showToast('操作失败：'+(error?.message||'未知错误'),true)}
  finally{saving=false;refreshView()}
}
function exportSettings(){
  const choices=Object.fromEntries(list.filter(isCustom).map(e=>[e.id,override(e)]));
  const data={app:'aside-icons',version:loadedVersion,exported:new Date().toISOString(),style:currentStyle(),choices,...mineLists()};
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  a.download=`aside-icons-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);
}
async function importSettings(file){
  try{
    const data=JSON.parse(await file.text());
    if(data?.app!=='aside-icons'||typeof data.choices!=='object')throw Error('不是 Aside 图标的设置文件');
    // Newer files carry a default style and list every override; older ones list explicit choices only.
    if(STYLES.includes(data.style)){
      draftStyle=data.style===savedStyle()?null:data.style;
      for(const e of list)if(!own(data.choices,e.id))setOverride(e,null);
    }
    let n=0;
    for(const [id,v] of Object.entries(data.choices)){const e=byId.get(id);if(!e||!available(e,v))continue;setOverride(e,v);n++}
    const base=settings.mySites||[];
    for(const id of data.starred||[])if(byId.has(id)&&!base.includes(id))added.add(id);
    for(const id of data.hidden||[])if(base.includes(id))removed.add(id);
    refreshView();showToast(`已导入 ${n} 项选择，检查后点保存。`);
  }catch(error){showToast('导入失败：'+error.message,true)}
}

// ---------- wiring ----------
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
  const r=ev.target.closest('[data-reset]');if(r){resetSite(r.dataset.reset);return}
  const o=ev.target.closest('.option');if(o){if(!o.disabled)pickVersion(o);return}
  if(ev.target.closest('#more')){limit+=PAGE*2;renderSites()}
});
$('#sites').addEventListener('keydown',ev=>{
  const o=ev.target.closest?.('.option');if(!o)return;
  const items=[...o.parentElement.querySelectorAll('.option:not(:disabled)')],i=items.indexOf(o);if(i<0)return;
  const j=arrowIndex(ev,items.length,i);if(j>=0&&j!==i)pickVersion(items[j]);
});
// The default style is a small radio group.
for(const [box,attr,act] of [[$('#style'),'style',chooseStyle]]){
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
globalThis.addEventListener?.('scroll',()=>$('.top').classList.toggle('scrolled',scrollY>4&&$('.top').getBoundingClientRect().top<=0),{passive:true});
$('#categories').addEventListener('change',ev=>{category=ev.target.value;limit=PAGE;renderSites()});
$('#search').addEventListener('input',()=>{limit=PAGE;renderSites()});
$('#toggle').addEventListener('click',toggleEnabled);
$('#style-note').addEventListener('click',ev=>{if(ev.target.closest('#reset-all'))resetAll()});
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
