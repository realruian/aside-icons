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

let ready=false,saving=false,toastTimer,category='',selectedId=null;
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
function isMine(id){return myIds().includes(id)}
function assetPath(e,v){
  const p=v==='original'?e.variants?.original?.preview:e.variants?.[v]?.path;
  return typeof p==='string'&&/^icons\/[a-zA-Z0-9_/-]+\.png$/.test(p)&&!p.includes('..')?p:null;
}
function available(e,v){return v==='original'||!!assetPath(e,v)}
function variantsOf(e){return VARIANTS.filter(v=>available(e,v))}

// ---------- images ----------
function globe(){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.5');svg.setAttribute('aria-hidden','true');
  svg.innerHTML='<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 4 6 4 9s-1 6-4 9c-3-3-4-6-4-9s1-6 4-9Z"/>';return svg;
}
const sizedCache=new Map();
function sized(path,size){
  if(size==='large')return Promise.resolve(path);
  const key=path+'|'+size;
  if(!sizedCache.has(key))sizedCache.set(key,(async()=>{try{const out=await resizeIcon(await (await fetch(path)).blob(),size);return out?URL.createObjectURL(out):path}catch{return path}})());
  return sizedCache.get(key);
}
// Fill a box with the icon as it will actually look (size preset applied).
function paint(box,e,v,{applySize=true}={}){
  const path=assetPath(e,v);
  if(!path){box.replaceChildren(globe());return}
  const img=document.createElement('img');img.alt='';img.decoding='async';
  img.addEventListener('error',()=>box.replaceChildren(globe()),{once:true});
  box.replaceChildren(img);
  if(v==='original'||!applySize){img.src=path;return}
  sized(path,currentSize()).then(src=>{if(img.isConnected||!img.src)img.src=src});
}

// ---------- pinned area ----------
function renderPins(){
  const pins=$('#pins'),ids=myIds();
  if(!selectedId||!byId.has(selectedId))selectedId=ids[0]||null;
  const nodes=ids.map(id=>{
    const e=byId.get(id),b=document.createElement('button');
    b.type='button';b.className='pin';b.dataset.id=id;b.title=e.label;b.setAttribute('role','option');
    b.setAttribute('aria-selected',String(id===selectedId));b.setAttribute('aria-label',`${e.label}：${labels[current(e)]}`);
    b.classList.toggle('is-dirty',Object.prototype.hasOwnProperty.call(draft,id));
    paint(b,e,current(e));return b;
  });
  const add=document.createElement('button');add.type='button';add.className='pin add';add.textContent='+';add.title='从下方列表用 ☆ 添加网站';
  add.addEventListener('click',()=>{$('#search').focus();showToast('在下方列表点 ☆ 把网站加入我的固定区。')});
  if(!ids.length){const p=document.createElement('div');p.className='pins-empty';p.textContent='还没有记录到你的固定网站。打开一次固定的网页，或在下方列表点 ☆ 添加。';nodes.push(p)}
  pins.replaceChildren(...nodes,add);
  $('#mine-hint').textContent=ids.length?'点一个图标来更换。这里是实际显示大小。':'';
}
function renderEditor(){
  const box=$('#editor'),e=byId.get(selectedId);
  if(!e){box.innerHTML='<p class="editor-empty">选择一个网站来更换图标。</p>';return}
  const dirty=Object.prototype.hasOwnProperty.call(draft,e.id);
  const head=document.createElement('div');head.className='editor-head';
  const h=document.createElement('h3');h.textContent=e.label;
  const d=document.createElement('span');d.className='domain';d.textContent=e.domains[0];
  const rm=document.createElement('button');rm.type='button';rm.className='link';
  rm.textContent=isMine(e.id)?'从我的固定区移除':'加入我的固定区';
  rm.addEventListener('click',()=>toggleMine(e.id));rm.disabled=!canEdit();
  head.append(h,d,rm);
  const opts=document.createElement('div');opts.className='options';
  for(const v of variantsOf(e)){
    const o=document.createElement('button');o.type='button';o.className='option';o.dataset.id=e.id;o.dataset.variant=v;
    const sel=current(e)===v;o.setAttribute('aria-pressed',String(sel));o.classList.toggle('is-dirty',sel&&dirty);o.disabled=!canEdit();
    const big=document.createElement('span');big.className='big';paint(big,e,v,{applySize:false});
    const real=document.createElement('span');real.className='real';real.title='实际显示大小';paint(real,e,v);
    const name=document.createElement('span');name.className='name';name.textContent=labels[v]+(sel?(dirty?' · 未保存':' · 当前'):'');
    o.append(big,real,name);opts.append(o);
  }
  const note=document.createElement('p');note.className='editor-note';
  note.textContent=dirty?`将从「${labels[saved(e)]}」改为「${labels[current(e)]}」，点底部保存后生效。`:'上面是大图，下面的小格是固定区里的实际效果。';
  box.replaceChildren(head,opts,note);
}

// ---------- all sites ----------
function renderCategories(){
  const cats=['',...new Set(list.map(x=>x.category))];
  $('#categories').replaceChildren(...cats.map(c=>{
    const b=document.createElement('button');b.type='button';b.className='chip';b.dataset.cat=c;b.setAttribute('role','tab');
    b.textContent=c||'全部';b.setAttribute('aria-selected',String(c===category));return b;
  }));
}
function visibleSites(){
  const q=$('#search').value.trim().toLocaleLowerCase();
  return list.filter(x=>(!category||x.category===category)&&(!q||[x.label,x.id,...x.domains].join(' ').toLocaleLowerCase().includes(q)));
}
function renderRow(e){
  const row=document.createElement('div');row.className='row';row.dataset.id=e.id;
  const dirty=Object.prototype.hasOwnProperty.call(draft,e.id);row.classList.toggle('is-dirty',dirty);
  const icon=document.createElement('span');icon.className='row-icon';paint(icon,e,current(e));
  const name=document.createElement('div');name.className='row-name';name.title='在上方编辑';
  const b=document.createElement('b');b.textContent=e.label;const s=document.createElement('span');s.textContent=e.domains.join(' · ');name.append(b,s);
  const choices=document.createElement('div');choices.className='row-choices';
  for(const v of VARIANTS){
    const btn=document.createElement('button');btn.type='button';btn.className='vbtn';btn.dataset.id=e.id;btn.dataset.variant=v;
    if(!available(e,v)){btn.classList.add('placeholder');btn.disabled=true;btn.setAttribute('aria-hidden','true');choices.append(btn);continue}
    const sel=current(e)===v;btn.setAttribute('aria-pressed',String(sel));btn.classList.toggle('is-dirty',sel&&dirty);btn.disabled=!canEdit();
    btn.title=labels[v];btn.setAttribute('aria-label',`${e.label}：${labels[v]}`);
    const art=document.createElement('span');paint(art,e,v,{applySize:false});
    const sm=document.createElement('small');sm.textContent=labels[v];btn.append(art,sm);choices.append(btn);
  }
  const star=document.createElement('button');star.type='button';star.className='star';star.dataset.star=e.id;
  const mine=isMine(e.id);star.textContent=mine?'★':'☆';star.setAttribute('aria-pressed',String(mine));star.disabled=!canEdit();
  star.title=mine?'从我的固定区移除':'加入我的固定区';star.setAttribute('aria-label',star.title+'：'+e.label);
  row.append(icon,name,choices,star);return row;
}
function renderSites(){
  const v=visibleSites();
  $('#sites').replaceChildren(...v.map(renderRow));
  $('#empty').hidden=v.length>0;
}

// ---------- chrome ----------
function canEdit(){return ready&&!saving}
function renderTools(){
  const on=settings.enabled!==false;
  $('#toggle').setAttribute('aria-checked',String(on));
  for(const id of ['#toggle','#refresh','#bulk','#export','#import'])$(id).disabled=!canEdit();
  for(const b of $('#size').querySelectorAll('button')){
    const sel=b.dataset.size===currentSize();b.setAttribute('aria-checked',String(sel));b.classList.toggle('is-dirty',sel&&!!draftSize);b.disabled=!isExtension?false:!canEdit();
  }
  $('#version').textContent=loadedVersion?'v'+loadedVersion:'本地预览';
  const opt=list.filter(x=>x.variants?.optimized?.path).length;
  $('#count').textContent=`${list.length} 个网站 · ${opt} 个有优化版`;
}
function renderBar(){
  const n=changeCount();
  $('#savebar').classList.toggle('is-dirty',n>0);
  $('#bar-text').textContent=!isExtension?'本地预览，无法保存':saving?'正在保存…':n?`有 ${n} 项更改未保存`:'所有更改已保存';
  $('#save').disabled=!ready||saving||!n;$('#save').textContent=saving?'保存中…':n?'保存并应用':'已保存';
  $('#discard').hidden=!n||saving;
}
function render(){renderPins();renderEditor();renderSites();renderTools();renderBar()}
function refreshView(){renderPins();renderEditor();renderSites();renderTools();renderBar()}

function banner(text,{error=false,action=null,label=''}={}){
  const b=$('#banner');if(!text){b.hidden=true;return}
  b.hidden=false;b.classList.toggle('error',error);b.replaceChildren(document.createTextNode(text));
  if(action){const btn=document.createElement('button');btn.type='button';btn.className='btn';btn.textContent=label;btn.addEventListener('click',action);b.append(btn)}
}
function showToast(m,error=false){clearTimeout(toastTimer);const t=$('#toast');t.textContent=m;t.classList.toggle('error',error);t.hidden=false;toastTimer=setTimeout(()=>{t.hidden=true},5000)}
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
  selectedId=id;refreshView();
}
function chooseSize(size){
  if(!validIconSize(size)||saving||(isExtension&&!ready))return;
  draftSize=size===savedSize()?null:size;refreshView();
}
function toggleMine(id){
  if(!canEdit()||!byId.has(id))return;
  const base=settings.mySites||[];
  if(isMine(id)){if(added.has(id))added.delete(id);else removed.add(id);if(selectedId===id)selectedId=null}
  else{if(removed.has(id))removed.delete(id);else if(!base.includes(id))added.add(id);selectedId=id}
  refreshView();
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
  $('.more').open=false;
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
for(const [key,spec] of Object.entries(ICON_SIZES)){const b=document.createElement('button');b.type='button';b.dataset.size=key;b.setAttribute('role','radio');b.textContent=spec.label;$('#size').append(b)}
$('#size').addEventListener('click',ev=>{const b=ev.target.closest('button[data-size]');if(b&&!b.disabled)chooseSize(b.dataset.size)});
$('#pins').addEventListener('click',ev=>{const b=ev.target.closest('.pin[data-id]');if(b){selectedId=b.dataset.id;renderPins();renderEditor()}});
$('#editor').addEventListener('click',ev=>{const b=ev.target.closest('.option[data-variant]');if(b&&!b.disabled)choose(b.dataset.id,b.dataset.variant)});
$('#sites').addEventListener('click',ev=>{
  const v=ev.target.closest('.vbtn[data-variant]');if(v&&!v.disabled){choose(v.dataset.id,v.dataset.variant);return}
  const s=ev.target.closest('.star[data-star]');if(s&&!s.disabled){toggleMine(s.dataset.star);return}
  const n=ev.target.closest('.row-name');if(n){selectedId=n.parentElement.dataset.id;renderPins();renderEditor();$('.mine').scrollIntoView({behavior:'smooth',block:'start'})}
});
$('#categories').addEventListener('click',ev=>{const c=ev.target.closest('.chip');if(c){category=c.dataset.cat;renderCategories();renderSites()}});
$('#search').addEventListener('input',renderSites);
$('#bulk').addEventListener('change',ev=>{const v=ev.target.value;ev.target.value='';if(v)bulk(v)});
$('#toggle').addEventListener('click',()=>simple('setEnabled',{enabled:settings.enabled===false},s=>s.enabled?'图标替换已打开。':'已关闭，网页恢复原图。'));
$('#refresh').addEventListener('click',()=>simple('refresh',{},s=>{const r=s.lastRefresh;return r?`已刷新 ${r.open} 个打开的网页。`+(r.asleep?.length?`未加载的：${r.asleep.join('、')}，点开一次就会更新。`:''):'已刷新。'}));
$('#export').addEventListener('click',exportSettings);
$('#import').addEventListener('click',()=>$('#import-file').click());
$('#import-file').addEventListener('change',ev=>{const f=ev.target.files?.[0];ev.target.value='';$('.more').open=false;if(f)importSettings(f)});
$('#save').addEventListener('click',saveAll);
$('#discard').addEventListener('click',discard);
document.addEventListener('keydown',ev=>{if((ev.metaKey||ev.ctrlKey)&&ev.key==='s'){ev.preventDefault();saveAll()}});
globalThis.addEventListener?.('beforeunload',ev=>{if(changeCount()){ev.preventDefault();ev.returnValue=''}});
renderCategories();render();load();
