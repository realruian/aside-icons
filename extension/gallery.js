'use strict';
const $=s=>document.querySelector(s);
const sites=$('#sites'),search=$('#search'),category=$('#category'),connection=$('#connection'),toast=$('#toast');
const labels={original:'原版',iphone:'iPhone',mac:'Mac',optimized:'优化版'};
const commonOrder=['jimeng','gmail','x','youtube','douyin','libtv','instagram','bilibili'];
const list=[...ICON_LIBRARY].sort((a,b)=>{
  const ai=commonOrder.indexOf(a.id),bi=commonOrder.indexOf(b.id);
  if(ai>=0||bi>=0)return (ai<0?100:ai)-(bi<0?100:bi);
  return a.category.localeCompare(b.category,'zh')||a.label.localeCompare(b.label,'zh');
});
const byId=new Map(list.map(x=>[x.id,x]));
const rowNodes=new Map();
const isExtension=location.protocol==='chrome-extension:'&&!!globalThis.chrome?.runtime?.id;
let ready=false,saving=false,toastTimer;
let settings={enabled:true,choices:{},effectiveChoices:{},iconSize:DEFAULT_ICON_SIZE,status:[]};
// Unsaved edits. Nothing is sent to the extension until the user presses Save.
let draft={},draftSize=null;

const iphoneCount=list.filter(x=>x.variants?.iphone?.path).length;
const macCount=list.filter(x=>x.variants?.mac?.path).length;
const optimizedCount=list.filter(x=>x.variants?.optimized?.path).length;
$('#count').textContent=`${list.length} 个网站 · ${iphoneCount} 个 iPhone 图标 · ${macCount} 个 Mac 图标 · ${optimizedCount} 个优化版`;
for(const name of [...new Set(list.map(x=>x.category))]){
  const option=document.createElement('option');option.value=name;option.textContent=name;category.append(option);
}
function saved(entry){return settings.effectiveChoices?.[entry.id]||settings.choices?.[entry.id]||entry.defaultVariant||'original'}
function current(entry){return draft[entry.id]||saved(entry)}
function savedSize(){return validIconSize(settings.iconSize)?settings.iconSize:DEFAULT_ICON_SIZE}
function currentSize(){return draftSize||savedSize()}
function changeCount(){return Object.keys(draft).length+(draftSize?1:0)}
function assetPath(entry,variant){
  const path=variant==='original'?entry.variants?.original?.preview:entry.variants?.[variant]?.path;
  return typeof path==='string'&&/^icons\/[a-zA-Z0-9_/-]+\.png$/.test(path)&&!path.includes('..')?path:null;
}
function available(entry,variant){return variant==='original'||!!assetPath(entry,variant)}
function globe(){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.4');svg.setAttribute('aria-hidden','true');
  const circle=document.createElementNS(svg.namespaceURI,'circle');circle.setAttribute('cx','12');circle.setAttribute('cy','12');circle.setAttribute('r','9');
  const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d','M3 12h18M12 3c3 3 4 6 4 9s-1 6-4 9c-3-3-4-6-4-9s1-6 4-9Z');svg.append(circle,path);return svg;
}

// ---- site rows ----
function createRow(entry){
  const row=document.createElement('section');row.className='site-row';row.dataset.id=entry.id;
  const info=document.createElement('div');info.className='site-info';
  const title=document.createElement('h2');title.id='site-'+entry.id;title.textContent=entry.label;
  const domains=document.createElement('div');domains.className='domains';domains.textContent=entry.domains.join(' · ')+(entry.paths?' '+entry.paths.join(' / '):'');
  const status=document.createElement('div');status.className='row-status';status.setAttribute('aria-live','polite');
  info.append(title,domains,status);row.append(info);row.setAttribute('aria-labelledby',title.id);
  for(const variant of ['original','iphone','mac','optimized']){
    const button=document.createElement('button');button.type='button';button.className='choice';button.dataset.id=entry.id;button.dataset.variant=variant;
    const art=document.createElement('span');art.className='art';
    const path=assetPath(entry,variant);
    if(path){
      const img=document.createElement('img');img.src=path;img.alt='';img.width=56;img.height=56;img.loading='lazy';
      img.addEventListener('error',()=>{art.replaceChildren(globe());button.dataset.previewFailed='true';updateRow(entry.id)});art.append(img);
    }else if(variant==='original')art.append(globe());
    else{const empty=document.createElement('span');empty.className='missing';empty.textContent='—';art.append(empty)}
    const name=document.createElement('span');name.className='sr-only';name.textContent=labels[variant];
    const caption=document.createElement('span');caption.className='choice-label';
    const check=document.createElement('span');check.className='check';check.textContent='✓';check.setAttribute('aria-hidden','true');
    button.append(art,name,caption,check);row.append(button);
  }
  rowNodes.set(entry.id,row);updateRow(entry.id);return row;
}
function updateRow(id){
  const entry=byId.get(id),row=rowNodes.get(id);if(!entry||!row)return;
  const choice=current(entry),dirty=Object.prototype.hasOwnProperty.call(draft,id);
  row.classList.toggle('is-dirty',dirty);
  for(const button of row.querySelectorAll('.choice')){
    const variant=button.dataset.variant,has=available(entry,variant),selected=choice===variant;
    button.disabled=!ready||!has||saving;
    button.classList.toggle('is-selected',selected);button.classList.toggle('is-unavailable',!has);button.classList.toggle('is-dirty',selected&&dirty);
    button.setAttribute('aria-pressed',String(selected));
    button.setAttribute('aria-label',`${entry.label}：${labels[variant]}${has?'':variant==='optimized'?'，暂未制作':'，暂无此版本'}${selected?(dirty?'，已选未保存':'，当前使用'):''}`);
    let caption=!has?(variant==='optimized'?'暂未制作':`暂无 ${labels[variant]} 图标`):variant==='original'&&!assetPath(entry,variant)?'使用网站原图':labels[variant];
    if(selected)caption=labels[variant]+' · '+(dirty?'未保存':isExtension&&ready?'当前':'默认');
    if(button.dataset.previewFailed&&!selected)caption='预览暂不可用';
    button.querySelector('.choice-label').textContent=caption;
  }
  row.querySelector('.row-status').textContent=dirty?`将从「${labels[saved(entry)]}」改为「${labels[choice]}」`:'';
}
function render(){
  const q=search.value.trim().toLocaleLowerCase();
  const visible=list.filter(x=>(!category.value||x.category===category.value)&&(!q||[x.label,x.id,...x.domains].join(' ').toLocaleLowerCase().includes(q)));
  rowNodes.clear();sites.replaceChildren(...visible.map(createRow));
  $('#visible-count').textContent=`${visible.length} 个网站`;
  $('#empty').hidden=visible.length>0;
}

// ---- size control and pinned-area preview ----
const sizeGroup=$('#size');
for(const [key,spec] of Object.entries(ICON_SIZES)){
  const b=document.createElement('button');b.type='button';b.dataset.size=key;b.setAttribute('role','radio');b.textContent=spec.label;sizeGroup.append(b);
}
function updateSizeControl(){
  for(const b of sizeGroup.querySelectorAll('button')){
    const on=b.dataset.size===currentSize();
    b.setAttribute('aria-checked',String(on));b.classList.toggle('is-dirty',on&&!!draftSize);b.disabled=saving||(isExtension&&!ready);
  }
}
const renderCache=new Map();let previewToken=0;
function sizedPreview(path,size){
  const key=path+'|'+size;
  if(!renderCache.has(key))renderCache.set(key,(async()=>{
    try{const blob=await (await fetch(path)).blob();const out=await resizeIcon(blob,size);return out?URL.createObjectURL(out):path;}catch{return path;}
  })());
  return renderCache.get(key);
}
async function updatePreview(){
  const token=++previewToken,size=currentSize();
  const entries=commonOrder.map(id=>byId.get(id)).filter(Boolean);
  const urls=await Promise.all(entries.map(entry=>{
    const variant=current(entry),path=assetPath(entry,variant);
    if(!path)return null;
    return variant==='original'||size==='large'?path:sizedPreview(path,size);
  }));
  if(token!==previewToken)return;
  $('#pin-preview').replaceChildren(...entries.map((entry,i)=>{
    const tile=document.createElement('div');tile.className='pin-tile';tile.title=entry.label;
    if(urls[i]){const img=document.createElement('img');img.src=urls[i];img.alt='';tile.append(img);}else tile.append(globe());
    return tile;
  }));
}

// ---- global switch, tab status, save bar ----
function updateGeneral(){
  const toggle=$('#toggle'),on=settings.enabled!==false;
  toggle.setAttribute('aria-checked',String(on));toggle.disabled=!ready||saving;$('#scan').disabled=!ready||saving;
  $('#enabled-text').textContent=!isExtension?'本地预览，无法更改。':!ready?'正在读取…':on?'已开启：网页图标会换成下面选择的版本。':'已暂停：所有网页显示原图，你的选择仍然保留。';
  const s=settings.status||[];
  $('#tab-summary').textContent=`已打开的网页 · 固定 ${settings.pinned??0} / 普通 ${settings.ordinary??0}`+(settings.pendingRestore?` · ${settings.pendingRestore} 个等待下次打开时恢复`:'');
  $('#status').replaceChildren(...(s.length?s:[{host:'',state:'暂无记录'}]).map(x=>{const li=document.createElement('li');li.textContent=(x.host?x.host+'：':'')+x.state;return li;}));
}
function updateBar(){
  const n=changeCount(),save=$('#save');
  $('#savebar').classList.toggle('is-dirty',n>0);
  $('#bar-text').textContent=!isExtension?'本地预览，无法保存':saving?'正在保存…':n?`有 ${n} 项更改未保存`:'所有更改已保存';
  save.disabled=!ready||saving||!n;save.textContent=saving?'保存中…':n?'保存并应用':'已保存';
  $('#discard').hidden=!n||saving;
}
function refresh(){for(const id of rowNodes.keys())updateRow(id);updateSizeControl();updateGeneral();updateBar();updatePreview();}

function showToast(message,error=false){clearTimeout(toastTimer);toast.textContent=message;toast.classList.toggle('error',error);toast.hidden=false;toastTimer=setTimeout(()=>{toast.hidden=true},5500)}
async function request(type,extra={}){
  const result=await chrome.runtime.sendMessage({target:'worker',type,...extra});
  if(!result||result.error)throw Error(result?.error||'暂时无法连接图标设置');return result;
}
// Files on disk can be newer than the background worker Aside keeps in memory.
// An old worker rejects batch saves, so detect it and offer a one-click reload.
function staleWorker(){
  ready=false;connection.hidden=false;connection.classList.add('error');
  connection.textContent='扩展后台还是旧版本，现在保存不会生效。点“立即更新”会重启扩展，设置页随后自动重新打开。';
  const b=document.createElement('button');b.type='button';b.textContent='立即更新';
  b.addEventListener('click',async()=>{
    b.disabled=true;b.textContent='正在更新…';
    try{await chrome.storage.local.set({reopenSettings:Date.now()});}catch{}
    chrome.runtime.reload();
  });
  connection.append(b);refresh();
}
async function load(){
  if(!isExtension){connection.textContent='这是本地图标预览。在 Aside 扩展中打开以保存设置。';connection.hidden=false;render();refresh();return}
  connection.hidden=false;connection.classList.remove('error');connection.textContent='正在读取设置…';
  try{
    settings=await request('getSettings');
    // Version on disk vs. the version of the worker running in memory.
    let diskVersion=null;try{diskVersion=(await (await fetch('manifest.json',{cache:'no-store'})).json()).version;}catch{}
    if(typeof settings.iconSize!=='string'||(diskVersion&&settings.version&&diskVersion!==settings.version)){
      render();staleWorker();
      // Update automatically once; the button stays as a fallback if a reload did not help.
      try{
        const {lastAutoReload=0}=await chrome.storage.local.get('lastAutoReload');
        if(Date.now()-lastAutoReload>120000){
          connection.firstChild.textContent='检测到扩展后台是旧版本，正在自动更新，设置页会自动重新打开…';
          await chrome.storage.local.set({lastAutoReload:Date.now(),reopenSettings:Date.now()});
          chrome.runtime.reload();
        }
      }catch{}
      return;
    }
    ready=true;connection.hidden=true;render();refresh();
  }catch(error){
    ready=false;connection.classList.add('error');connection.textContent='设置暂时无法读取，请重新加载此页。';
    const retry=document.createElement('button');retry.type='button';retry.textContent='重试';retry.addEventListener('click',load);connection.append(retry);render();refresh();
  }
}
function choose(id,variant){
  const entry=byId.get(id);if(!ready||saving||!entry||!available(entry,variant))return;
  if(variant===saved(entry))delete draft[id];else draft[id]=variant;
  updateRow(id);updateBar();updatePreview();
}
function chooseSize(size){
  if(!validIconSize(size)||saving||(isExtension&&!ready))return;
  draftSize=size===savedSize()?null:size;
  updateSizeControl();updateBar();updatePreview();
}
async function saveAll(){
  if(!ready||saving||!changeCount())return;
  saving=true;refresh();
  try{
    const payload={choices:{...draft}};if(draftSize)payload.iconSize=draftSize;
    settings=await request('saveSettings',payload);
    draft={};draftSize=null;
    const r=settings.lastRefresh;showToast(settings.enabled===false?'已保存。图标替换目前已暂停，开启后生效。':'已保存并刷新'+(r?` ${r.open} 个打开的网页。`+(r.asleep?.length?`未加载的：${r.asleep.join('、')}，点开一次就会更新。`:''):'。'));
  }catch(error){
    if(/未知控制请求/.test(error?.message||''))staleWorker();
    showToast('保存失败，更改仍保留在页面上。'+(error?.message||''),true);
  }
  finally{saving=false;refresh()}
}
function discard(){draft={};draftSize=null;refresh();}

sites.addEventListener('click',event=>{const button=event.target.closest('button[data-variant]');if(button&&!button.disabled)choose(button.dataset.id,button.dataset.variant)});
sizeGroup.addEventListener('click',event=>{const b=event.target.closest('button[data-size]');if(b&&!b.disabled)chooseSize(b.dataset.size)});
$('#save').addEventListener('click',saveAll);
$('#discard').addEventListener('click',discard);
$('#toggle').addEventListener('click',async()=>{
  if(!ready||saving)return;saving=true;refresh();
  try{settings=await request('setEnabled',{enabled:settings.enabled===false});showToast(settings.enabled?'图标替换已开启。':'已暂停，网页恢复原图。')}
  catch(error){showToast('切换失败：'+(error?.message||''),true)}finally{saving=false;refresh()}
});
$('#scan').addEventListener('click',async()=>{
  if(!ready||saving)return;saving=true;refresh();
  try{settings=await request('refresh');const r=settings.lastRefresh;showToast(r?`已刷新 ${r.open} 个打开的网页。`+(r.asleep?.length?`未加载的：${r.asleep.join('、')}，点开一次就会更新。`:''):'已刷新。')}
  catch(error){showToast('刷新失败：'+(error?.message||'未知错误'),true)}finally{saving=false;refresh()}
});
document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key==='s'){event.preventDefault();saveAll();}});
globalThis.addEventListener?.('beforeunload',event=>{if(changeCount()){event.preventDefault();event.returnValue='';}});
search.addEventListener('input',render);category.addEventListener('change',render);
render();load();
