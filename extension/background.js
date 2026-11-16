importScripts('library.js','resize.js');
let dataPromise,saveQueue=Promise.resolve();
const running=new Map(),status=new Map(),retryTimers=new Map();
const assetCache=new Map(),libraryImages=new Set();
const supported=url=>/^https?:\/\//.test(url||'');
const choiceNames={original:'原版',iphone:'iPhone',mac:'Mac',optimized:'优化版'};
function supportsChoice(entry,variant){return variant==='original'||((variant==='iphone'||variant==='mac'||variant==='optimized')&&typeof entry?.variants?.[variant]?.path==='string');}
function choiceFor(d,entry){
  if(!entry)return 'original';
  const saved=d.choices[entry.id];
  if(supportsChoice(entry,saved))return saved;
  // Compatibility for a previous catalog while an unpacked update reloads.
  if(!entry.variants)return 'library';
  return supportsChoice(entry,entry.defaultVariant)?entry.defaultVariant:'original';
}
async function db(){return dataPromise??=(async()=>{
  const d=await chrome.storage.local.get(['enabled','pages','cache','choices','iconSize','mine','updated']);
  // Settings sync: a newer copy from another computer wins.
  try{const s=await chrome.storage.sync?.get(['choices','iconSize','mine','updated']);if(s?.updated&&s.updated>(d.updated||0)){d.choices=s.choices;d.iconSize=s.iconSize;d.mine={...(d.mine||{}),...(s.mine||{})};d.updated=s.updated;}}catch{}
  const choices={};
  for(const entry of ICON_LIBRARY){const value=d.choices?.[entry.id];if(supportsChoice(entry,value))choices[entry.id]=value;}
  const mine={pinned:{},starred:[],hidden:[],...(d.mine||{})};
  return {enabled:d.enabled!==false,pages:d.pages||{},cache:d.cache||{},choices,iconSize:validIconSize(d.iconSize)?d.iconSize:DEFAULT_ICON_SIZE,mine,updated:d.updated||0};
})();}
function pushSync(d){d.updated=Date.now();chrome.storage.sync?.set({choices:d.choices,iconSize:d.iconSize,mine:{starred:d.mine.starred,hidden:d.mine.hidden},updated:d.updated}).catch(()=>{});}
// Single-page apps (Gmail etc.) change only the #fragment; treat that as the same document.
const sameDoc=(a,b)=>!!a&&!!b&&a.split('#')[0]===b.split('#')[0];
function save(d){saveQueue=saveQueue.catch(()=>{}).then(async()=>{
  // Old conversion records are kept only to restore pre-library installations.
  let used=0;
  d.cache=Object.fromEntries(Object.entries(d.cache).sort((a,b)=>b[1].time-a[1].time).filter(([k,v])=>{const size=JSON.stringify([k,v]).length;if(used+size>4000000)return false;used+=size;return true;}).slice(0,128));
  used=0;d.pages=Object.fromEntries(Object.entries(d.pages).sort((a,b)=>b[1].time-a[1].time).filter(([k,v])=>{const size=JSON.stringify([k,v]).length;if(used+size>2000000)return false;used+=size;return true;}).slice(0,512));
  await chrome.storage.local.set(d);
});return saveQueue;}
function generated(url){
  if(/^data:image\/png;aside-icons=/.test(url||''))return true;
  if(!/^data:image\/png;base64,/.test(url||''))return false;
  try{return atob(url.split(',')[1].slice(-128)).includes('AsideIcons\0v6');}catch{return false;}
}
function originalSource(d,image){
  for(const [key,c] of Object.entries(d.cache))if(c.image===image)return c.source||(/^https?:|^data:image/.test(key)?key:null);
  return null;
}
function isOutput(d,url){return !!url&&(generated(url)||libraryImages.has(url)||Object.values(d.cache).some(c=>c.image===url));}
function originalCandidate(d,url){return typeof url==='string'&&/^(?:https?:|data:image\/|blob:)/.test(url)&&!isOutput(d,url)?url:null;}
async function libraryImage(entry,variant,size='large'){
  const path=variant==='library'?'icons/'+entry.id+'.png':entry.variants?.[variant]?.path;
  if(typeof path!=='string'||!/^icons\/[a-z0-9_/-]+\.png$/i.test(path)||path.includes('..'))throw Error('图标库路径无效');
  const key=entry.id+':'+variant+':'+size+':'+path;
  if(assetCache.has(key))return assetCache.get(key);
  const pending=(async()=>{
    // Read the packaged PNG exactly as authored: no canvas, cropping, scaling,
    // background detection or network favicon downloads occur at runtime.
    const response=await fetch(chrome.runtime.getURL(path));
    if(!response.ok)throw Error('图标库文件不可用');
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.length<8||bytes.length>1000000||[137,80,78,71,13,10,26,10].some((v,i)=>bytes[i]!==v))throw Error('图标库文件格式错误');
    let out=bytes;
    // Size presets trim/zoom the packaged artwork locally; any failure keeps the original PNG.
    if(size!=='large'){try{const blob=await resizeIcon(new Blob([bytes],{type:'image/png'}),size);if(blob)out=new Uint8Array(await blob.arrayBuffer());}catch{}}
    const bytesOut=out;let str='';for(let i=0;i<bytesOut.length;i+=8192)str+=String.fromCharCode(...bytesOut.subarray(i,i+8192));
    const image='data:image/png;base64,'+btoa(str);libraryImages.add(image);return image;
  })();
  assetCache.set(key,pending);
  try{return await pending;}catch(e){assetCache.delete(key);throw e;}
}
async function connect(tabId){await chrome.scripting.executeScript({target:{tabId},files:['content.js']});}
async function send(tabId,payload){return chrome.tabs.sendMessage(tabId,{target:'content',...payload});}
async function restore(tab,d){
  await connect(tab.id);const page=d.pages[tab.url.split('#')[0]];
  const original=originalCandidate(d,page?.source)||originalCandidate(d,originalSource(d,tab.favIconUrl));
  const result=await send(tab.id,{type:'restore',url:tab.url,original,previous:isOutput(d,tab.favIconUrl)?tab.favIconUrl:null});
  if(!result?.restored)return result;
  if(page)page.restored=true;
  status.set(tab.id,{host:new URL(tab.url).hostname,state:'已恢复原图'});return result;
}
async function process(id){
  if(running.has(id)){running.get(id).again=true;return running.get(id).promise;}
  const job={again:false};running.set(id,job);
  job.promise=(async()=>{
    do{
      job.again=false;
      let tab;try{tab=await chrome.tabs.get(id);}catch{return;}
      if(!supported(tab.url)||tab.status==='loading'||tab.discarded)return;
      const d=await db(),entry=libraryFor(tab.url),variant=choiceFor(d,entry);
      // Unlisted sites are never touched: no script is injected, unless an
      // older version changed this page's icon and it still needs restoring.
      if(!entry){const page=d.pages[tab.url.split('#')[0]];if(!(page&&!page.restored)&&!isOutput(d,tab.favIconUrl))return;}
      if(entry&&tab.pinned)rememberPinned(d,entry.id,tab.index);
      if(!d.enabled||!entry||variant==='original'){
        const restored=await restore(tab,d);
        if(d.enabled&&restored?.restored)status.set(id,{host:new URL(tab.url).hostname,state:entry?'使用原版图标 · '+entry.label:'未收录，保留原图'});
        await save(d);continue;
      }
      await connect(id);const info=await send(id,{type:'inspect'});
      if(!info||!sameDoc(info.url,tab.url))return;
      let image;
      try{image=await libraryImage(entry,variant,d.iconSize);}catch(e){
        if(!d.enabled||choiceFor(d,entry)!==variant){job.again=true;continue;}
        await restore(tab,d);await save(d);throw e;
      }
      const candidates=info.icons.map(x=>x.url).filter(u=>originalCandidate(d,u));
      const page=d.pages[tab.url.split('#')[0]];
      // A source is optional: a curated asset also works on a page with no
      // favicon. Explicit null prevents our own cached library image from
      // becoming the supposed original on a later visit or worker restart.
      const source=candidates.find(u=>u===tab.favIconUrl)||candidates[0]||originalCandidate(d,page?.source)||originalCandidate(d,originalSource(d,tab.favIconUrl))||(!page?originalCandidate(d,tab.favIconUrl):null);
      const current=await chrome.tabs.get(id);
      if(!sameDoc(current.url,tab.url))return;
      if(!d.enabled||choiceFor(d,entry)!==variant){job.again=true;continue;}
      d.pages[tab.url.split('#')[0]]={source:source||null,restored:false,time:Date.now()};await save(d);
      // The user can choose another version while storage or image decoding is
      // pending. Re-check immediately before sending; per-tab jobs serialize
      // sends so an older image can never arrive after its replacement.
      if(!d.enabled||choiceFor(d,entry)!==variant){job.again=true;continue;}
      const result=await send(id,{type:'apply',url:tab.url,image,original:source||null,previous:isOutput(d,tab.favIconUrl)?tab.favIconUrl:null});
      if(result?.applied)status.set(id,{host:new URL(tab.url).hostname,state:'已应用'+(choiceNames[variant]?' '+choiceNames[variant]:'图标库')+' · '+entry.label});
    }while(job.again);
  })().catch(async e=>{let t;try{t=await chrome.tabs.get(id);}catch{return;}status.set(id,{host:supported(t.url)?new URL(t.url).hostname:'',state:'未应用图标库：'+e.message});}).finally(()=>{running.delete(id);if(job.again)queueMicrotask(()=>process(id));});
  return job.promise;
}
// Aside forgets closed pinned items from chrome.tabs, so remember which
// catalog sites have ever been pinned (and in which order).
function rememberPinned(d,id,index){const old=d.mine.pinned[id];if(old&&old.index===index)return;d.mine.pinned[id]={index,time:Date.now()};}
function mySites(d){
  const hidden=new Set(d.mine.hidden),ids=[];
  const add=id=>{if(!hidden.has(id)&&!ids.includes(id)&&ICON_LIBRARY.some(e=>e.id===id))ids.push(id);};
  Object.entries(d.mine.pinned).sort((a,b)=>a[1].index-b[1].index).forEach(([id])=>add(id));
  d.mine.starred.forEach(add);
  Object.keys(d.choices).forEach(add);
  return ids;
}
async function scan(){const tabs=await chrome.tabs.query({});for(const t of tabs)if(supported(t.url))await process(t.id);}
// One-click refresh: drop cached images and redraw every loaded page.
// Sleeping pinned tabs are NOT force-loaded: waking them made Aside cache the
// site's own favicon before ours could be applied. They update when opened.
let lastRefresh=null;
async function refreshAll(){
  assetCache.clear();
  const tabs=(await chrome.tabs.query({})).filter(t=>supported(t.url));
  const awake=tabs.filter(t=>!t.discarded);
  for(const t of awake)await process(t.id);
  const asleep=tabs.filter(t=>t.discarded).map(t=>libraryFor(t.url)?.label||new URL(t.url).hostname);
  lastRefresh={open:awake.length,woken:0,asleep,time:Date.now()};
  return lastRefresh;
}
async function applyEntry(entryId){
  const tabs=await chrome.tabs.query({});
  await Promise.all(tabs.filter(t=>supported(t.url)&&libraryFor(t.url)?.id===entryId).map(t=>process(t.id)));
}
function controlsAllowed(sender){
  try{
    const u=new URL(sender.url);
    return u.protocol==='chrome-extension:'&&u.hostname===chrome.runtime.id&&u.pathname==='/gallery.html';
  }catch{return false;}
}
async function settingsSnapshot(d){
  const tabs=(await chrome.tabs.query({})).filter(t=>supported(t.url));
  return {enabled:d.enabled,version:chrome.runtime.getManifest().version,pinned:tabs.filter(t=>t.pinned).length,ordinary:tabs.filter(t=>!t.pinned).length,status:[...status.values()],libraryCount:ICON_LIBRARY.length,iconSize:d.iconSize,lastRefresh,mySites:mySites(d),mine:{starred:[...d.mine.starred],hidden:[...d.mine.hidden]},openPinned:[...new Set(tabs.filter(t=>t.pinned).map(t=>libraryFor(t.url)?.id).filter(Boolean))],pendingRestore:d.enabled?0:Object.values(d.pages).filter(p=>!p.restored).length,choices:{...d.choices},effectiveChoices:Object.fromEntries(ICON_LIBRARY.map(entry=>[entry.id,choiceFor(d,entry)]))};
}
chrome.tabs.onUpdated.addListener((id,change)=>{
  if(change.url!==undefined||change.status==='complete'||change.pinned!==undefined||change.favIconUrl){
    clearTimeout(retryTimers.get(id));retryTimers.set(id,setTimeout(()=>{retryTimers.delete(id);process(id);},200));
  }
});
chrome.tabs.onRemoved.addListener(id=>{clearTimeout(retryTimers.get(id));retryTimers.delete(id);status.delete(id);});
chrome.runtime.onStartup.addListener(()=>scan());
// After the settings page asks for a reload, reopen it so the user lands back where they were.
chrome.storage.local.get('reopenSettings').then(async({reopenSettings})=>{
  if(!reopenSettings)return;
  await chrome.storage.local.remove('reopenSettings');
  if(Date.now()-reopenSettings<60000)await chrome.tabs.create({url:chrome.runtime.getURL('gallery.html')});
}).catch(()=>{});
// One page for everything: the toolbar button opens (or focuses) the settings page.
chrome.action?.onClicked.addListener(async()=>{
  const url=chrome.runtime.getURL('gallery.html');
  const [tab]=await chrome.tabs.query({url});
  if(tab){await chrome.tabs.update(tab.id,{active:true});chrome.windows?.update(tab.windowId,{focused:true}).catch(()=>{});}
  else await chrome.tabs.create({url});
});
chrome.runtime.onInstalled.addListener(()=>scan());
chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
  if(sender.id!==chrome.runtime.id||msg.target!=='worker')return;
  (async()=>{
    if(msg.type==='iconChanged'&&sender.tab){await process(sender.tab.id);return {ok:true};}
    if(!controlsAllowed(sender))throw Error('无效控制请求');
    const d=await db();
    if(msg.type==='setEnabled'){d.enabled=!!msg.enabled;await save(d);await Promise.allSettled([...running.values()].map(j=>j.promise));await scan();}
    else if(msg.type==='setIconChoice'){
      const entry=ICON_LIBRARY.find(e=>e.id===msg.id);
      if(!entry||!supportsChoice(entry,msg.variant))throw Error('这个网站没有可用的所选图标版本');
      d.choices[entry.id]=msg.variant;
      await save(d);
      await applyEntry(entry.id);
    }
    else if(msg.type==='saveSettings'){
      // Validate everything first so one bad entry never leaves a half-saved batch.
      const choices=msg.choices&&typeof msg.choices==='object'?msg.choices:{};
      const updates=[];
      for(const [id,variant] of Object.entries(choices)){
        const entry=ICON_LIBRARY.find(e=>e.id===id);
        if(!entry||!supportsChoice(entry,variant))throw Error('这个网站没有可用的所选图标版本');
        updates.push([id,variant]);
      }
      if(msg.iconSize!==undefined&&!validIconSize(msg.iconSize))throw Error('无效的图标大小');
      for(const [id,variant] of updates)d.choices[id]=variant;
      const sizeChanged=msg.iconSize!==undefined&&msg.iconSize!==d.iconSize;
      if(msg.iconSize!==undefined)d.iconSize=msg.iconSize;
      const ids=new Set(ICON_LIBRARY.map(e=>e.id));
      if(Array.isArray(msg.starred))d.mine.starred=msg.starred.filter(id=>ids.has(id));
      if(Array.isArray(msg.hidden))d.mine.hidden=msg.hidden.filter(id=>ids.has(id));
      pushSync(d);
      await save(d);
      // Saving always refreshes everything, so no separate step is needed.
      void sizeChanged;await refreshAll();
    }
    else if(msg.type==='scan'||msg.type==='refresh')await refreshAll();
    else if(msg.type!=='status'&&msg.type!=='getSettings')throw Error('未知控制请求');
    return settingsSnapshot(d);
  })().then(respond).catch(e=>respond({error:e.message}));
  return true;
});
scan();
