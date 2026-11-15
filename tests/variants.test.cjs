const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const worker=fs.readFileSync('extension/background.js','utf8');
const content=fs.readFileSync('extension/content.js','utf8');
const clone=x=>JSON.parse(JSON.stringify(x));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject};}
const catalog=[
 {id:'alpha',label:'Alpha',domains:['alpha.test'],variants:{original:{},iphone:{path:'icons/iphone/alpha.png'},mac:{path:'icons/mac/alpha.png'},optimized:{path:'icons/optimized/alpha.png'}},defaultVariant:'mac'},
 {id:'beta',label:'Beta',domains:['beta.test'],variants:{original:{},iphone:{path:'icons/iphone/beta.png'}},defaultVariant:'iphone'},
 {id:'gamma',label:'Gamma',domains:['gamma.test'],variants:{original:{}},defaultVariant:'original'}
];
function setup({stored={},existingDocuments={},useRealCatalog=false}={}){
 let persisted=clone(stored),listener,activeTabs=[],storageHook=null,fetchHook=null;
 const listeners={},tabMap=new Map(),documents=new Map(),contexts=new Map(),messages=[],requests=[],writes=[];
 const event=()=>({addListener(){}});
 const tabs=[
   {id:1,url:'https://alpha.test/one',pinned:true,status:'complete',favIconUrl:'https://alpha.test/original.svg'},
   {id:2,url:'https://alpha.test/two',pinned:false,status:'complete',favIconUrl:'https://alpha.test/original.svg'},
   {id:3,url:'https://beta.test/',pinned:false,status:'complete',favIconUrl:'https://beta.test/original.svg'}
 ];
 for(const t of tabs){
  tabMap.set(t.id,t);
  const document=existingDocuments[t.id]||parseHTML('<html><head><link rel="icon" href="/original.svg" type="image/svg+xml" sizes="any"></head><body></body></html>').document;
  if(!existingDocuments[t.id])Object.defineProperty(document,'baseURI',{value:t.url});
  documents.set(t.id,document);
 }
 function connect(id){
  if(contexts.has(id))return;
  const tab=tabMap.get(id),document=documents.get(id);
  const context=vm.createContext({document,location:{href:tab.url},URL,setTimeout,clearTimeout,matchMedia:()=>({matches:true}),MutationObserver:class{observe(){}disconnect(){}},chrome:{runtime:{id:'test',onMessage:{addListener:f=>listeners[id]=f},sendMessage:async()=>({})}}});
  vm.runInContext(content,context);contexts.set(id,context);
 }
 const sandbox={URL,atob,btoa,setTimeout,clearTimeout,queueMicrotask,Uint8Array,
  chrome:{
   storage:{local:{get:async()=>clone(persisted),set:async d=>{if(storageHook)await storageHook(d);persisted=clone(d);writes.push(clone(d));}}},
   scripting:{executeScript:async({target})=>connect(target.tabId)},
   tabs:{query:async()=>activeTabs.map(t=>({...t})),get:async id=>({...tabMap.get(id)}),onUpdated:event(),onRemoved:event(),sendMessage:async(id,msg)=>{
    messages.push({id,...clone(msg)});let result;listeners[id](msg,{id:'test'},r=>result=r);
    if(msg.type==='apply'&&result?.applied)tabMap.get(id).favIconUrl=msg.image;
    if(msg.type==='restore'&&result?.restored)tabMap.get(id).favIconUrl='https://'+new URL(tabMap.get(id).url).host+'/original.svg';
    return result;
   }},
   runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,getManifest:()=>({version:'0.9.0'}),onStartup:event(),onInstalled:event(),onMessage:{addListener:f=>listener=f}}
  },
  fetch:async url=>{requests.push(url);if(fetchHook)await fetchHook(url);const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.from(url)]);return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}},
  importScripts:()=>{vm.runInContext(fs.readFileSync('extension/resize.js','utf8'),context);return vm.runInContext(useRealCatalog?fs.readFileSync('extension/library.js','utf8'):'const ICON_LIBRARY='+JSON.stringify(catalog)+';function libraryFor(url){try{const host=new URL(url).hostname;return ICON_LIBRARY.find(e=>e.domains.includes(host))||null}catch{return null}}',context)}
 };
 const context=vm.createContext(sandbox);vm.runInContext(worker,context);
 activeTabs=tabs;
 const call=(type,extra={},sender={id:'test',url:'chrome-extension://test/gallery.html'})=>new Promise(resolve=>{
  const pending=listener({target:'worker',type,...extra},sender,resolve);if(pending!==true)resolve(undefined);
 });
 return {call,context,tabs,messages,requests,writes,documents,stored:()=>clone(persisted),setFetchHook:f=>fetchHook=f,setStorageHook:f=>storageHook=f,process:id=>vm.runInContext('process('+id+')',context),settings:()=>call('getSettings'),href:id=>documents.get(id).querySelector('link[rel~="icon"]')?.getAttribute('href')};
}

(async()=>{
 {
  const x=setup({stored:{choices:{alpha:'iphone',beta:'mac',gamma:'original',unknown:'mac'}}});
  const s=await x.settings();assert.equal(s.effectiveChoices.alpha,'iphone');assert.equal(s.effectiveChoices.beta,'iphone');assert.equal(s.effectiveChoices.gamma,'original');assert.equal(s.choices.beta,undefined);assert.equal(s.choices.unknown,undefined);
  const before=x.stored();assert.match((await x.call('setIconChoice',{id:'beta',variant:'mac'})).error,/没有可用/);assert.match((await x.call('setIconChoice',{id:'beta',variant:'optimized'})).error,/没有可用/);assert.match((await x.call('setIconChoice',{id:'absent',variant:'original'})).error,/没有可用/);assert.match((await x.call('setIconChoice',{id:'alpha',variant:'../../remote'})).error,/没有可用/);assert.deepEqual(x.stored(),before);assert.equal(x.requests.length,0);
  for(const url of ['https://alpha.test/','chrome-extension://test/popup.html.bad','chrome-extension://other/gallery.html','chrome-extension://test/other.html'])assert.equal((await x.call('setIconChoice',{id:'alpha',variant:'original'},{id:'test',url})).error,'无效控制请求',url);
  assert.equal(await x.call('setIconChoice',{id:'alpha',variant:'original'},{id:'foreign',url:'chrome-extension://test/gallery.html'}),undefined);
  assert.equal((await x.call('getSettings',{}, {id:'test',url:'chrome-extension://test/gallery.html?filter=mac#alpha'})).effectiveChoices.alpha,'iphone');
  assert.equal((await x.call('unknown')).error,'未知控制请求');
 }
 {
  const x=setup();
  await x.call('setIconChoice',{id:'alpha',variant:'iphone'});
  const iphone=x.href(1);assert.ok(iphone.startsWith('data:image/png;base64,'));assert.equal(x.href(2),iphone);assert.equal(x.href(3),'/original.svg');assert.equal(x.requests.filter(u=>u.endsWith('/iphone/alpha.png')).length,1,'one cached image shared by fixed and ordinary tabs');
  await x.call('setIconChoice',{id:'alpha',variant:'mac'});const mac=x.href(1);assert.notEqual(mac,iphone);assert.equal(x.href(2),mac);assert.equal(x.requests.filter(u=>u.endsWith('/mac/alpha.png')).length,1);
  await x.call('setIconChoice',{id:'alpha',variant:'iphone'});assert.equal(x.href(1),iphone);assert.equal(x.requests.length,2,'variant-specific cache must not mix images');
  await x.call('setIconChoice',{id:'alpha',variant:'optimized'});const optimized=x.href(1);assert.notEqual(optimized,iphone);assert.notEqual(optimized,mac);assert.equal(x.href(2),optimized);assert.equal(x.requests.filter(u=>u.endsWith('/optimized/alpha.png')).length,1);
  await x.call('setIconChoice',{id:'alpha',variant:'mac'});assert.equal(x.href(1),mac);await x.call('setIconChoice',{id:'alpha',variant:'optimized'});assert.equal(x.href(1),optimized);assert.equal(x.requests.length,3,'optimized cache remains independent and reusable');
  await x.call('setIconChoice',{id:'alpha',variant:'original'});
  for(const id of [1,2]){const link=x.documents.get(id).querySelector('link');assert.equal(link.getAttribute('href'),'/original.svg');assert.equal(link.getAttribute('type'),'image/svg+xml');assert.equal(link.getAttribute('sizes'),'any');assert.equal(link.hasAttribute('data-aside-icon-original-v1'),false);}
  assert.equal(x.stored().choices.alpha,'original');assert.equal(x.stored().pages['https://alpha.test/one'].source,'https://alpha.test/original.svg');assert.equal(x.stored().pages['https://alpha.test/one'].restored,true);assert.equal(x.requests.length,3,'original version does not fetch an image');
 }
 {
  const x=setup();await x.call('setIconChoice',{id:'alpha',variant:'iphone'});
  const restarted=setup({stored:x.stored(),existingDocuments:Object.fromEntries(x.documents)});
  assert.equal((await restarted.settings()).effectiveChoices.alpha,'iphone');
  await restarted.process(1);assert.equal(restarted.href(1),x.href(1));
  await restarted.call('setIconChoice',{id:'alpha',variant:'original'});
  assert.equal(restarted.href(1),'/original.svg','true original survives service-worker and content-script restart');
 }
 {
  const x=setup(),entered=deferred(),release=deferred();
  x.setFetchHook(async url=>{if(url.endsWith('/iphone/alpha.png')){entered.resolve();await release.promise;}});
  const first=x.call('setIconChoice',{id:'alpha',variant:'iphone'});await entered.promise;
  const latest=x.call('setIconChoice',{id:'alpha',variant:'mac'});await tick();release.resolve();await Promise.all([first,latest]);
  const applied=x.messages.filter(m=>m.type==='apply');assert.ok(applied.length>=2);assert.ok(applied.every(m=>atob(m.image.split(',')[1]).includes('/mac/alpha.png')),'slow old image must never apply after a newer choice');assert.equal(x.stored().choices.alpha,'mac');assert.equal((await x.settings()).effectiveChoices.alpha,'mac');
 }
 {
  const x=setup(),entered=deferred(),release=deferred();let held=false;
  x.setStorageHook(async d=>{if(!held&&d.pages['https://alpha.test/one']&&!d.pages['https://alpha.test/one'].restored){held=true;entered.resolve();await release.promise;}});
  const first=x.call('setIconChoice',{id:'alpha',variant:'iphone'});await entered.promise;
  const latest=x.call('setIconChoice',{id:'alpha',variant:'original'});await tick();release.resolve();await Promise.all([first,latest]);
  assert.equal(x.href(1),'/original.svg');assert.equal(x.href(2),'/original.svg');assert.ok(!x.messages.some(m=>m.type==='apply'),'selection changed while persisting: stale apply must be skipped');assert.equal(x.stored().choices.alpha,'original');
 }
 {
  const x=setup();await x.call('setIconChoice',{id:'alpha',variant:'iphone'});await x.call('setEnabled',{enabled:false});assert.equal(x.href(1),'/original.svg');await x.call('setIconChoice',{id:'alpha',variant:'mac'});assert.equal(x.href(1),'/original.svg');assert.equal(x.stored().choices.alpha,'mac');await x.call('setEnabled',{enabled:true});assert.ok(atob(x.href(1).split(',')[1]).includes('/mac/alpha.png'));assert.equal(x.stored().choices.alpha,'mac');
 }
 {
  // Adding a fourth variant must not choose it for existing users or defaults.
  for(const previous of ['original','iphone','mac']){
   const migrated=setup({stored:{choices:{alpha:previous}}});assert.equal((await migrated.settings()).effectiveChoices.alpha,previous);await migrated.process(1);assert.equal((await migrated.settings()).choices.alpha,previous);
  }
  assert.equal((await setup().settings()).effectiveChoices.alpha,'mac');
  const x=setup();await x.call('setIconChoice',{id:'alpha',variant:'optimized'});
  const restarted=setup({stored:x.stored(),existingDocuments:Object.fromEntries(x.documents)});
  assert.equal((await restarted.settings()).effectiveChoices.alpha,'optimized');await restarted.process(1);assert.equal(restarted.href(1),x.href(1));
  await restarted.call('setIconChoice',{id:'alpha',variant:'original'});assert.equal(restarted.href(1),'/original.svg');assert.equal(restarted.href(2),'/original.svg');
 }
 {
  const x=setup(),entered=deferred(),release=deferred();
  x.setFetchHook(async url=>{if(url.endsWith('/optimized/alpha.png')){entered.resolve();await release.promise;}});
  const first=x.call('setIconChoice',{id:'alpha',variant:'optimized'});await entered.promise;
  const latest=x.call('setIconChoice',{id:'alpha',variant:'original'});await tick();release.resolve();await Promise.all([first,latest]);
  assert.equal(x.href(1),'/original.svg');assert.equal(x.href(2),'/original.svg');assert.ok(!x.messages.some(m=>m.type==='apply'),'a delayed optimized image must not overwrite original');assert.equal(x.stored().choices.alpha,'original');
 }
 {
  const x=setup({useRealCatalog:true});const s=await x.settings();assert.equal(Object.keys(s.effectiveChoices).length,155);assert.equal(s.effectiveChoices.jimeng,'original');assert.equal(s.effectiveChoices.youtube,'iphone');assert.equal(s.effectiveChoices.claude,'mac');
  assert.ok(!Object.values(s.effectiveChoices).includes('optimized'),'new option must not change existing defaults');
  const ready=vm.runInContext('ICON_LIBRARY.filter(e=>e.variants?.optimized).map(e=>e.id)',x.context);
  if(ready.length){
   for(const id of ['gmail','x','youtube','douyin','libtv','instagram','bilibili','jimeng','chatgpt','github','notion','wechat'])assert.ok(ready.includes(id),id);assert.ok(ready.length>=84);
   for(const id of ready){
    const asset=vm.runInContext('ICON_LIBRARY.find(e=>e.id==='+JSON.stringify(id)+').variants.optimized.path',x.context);assert.equal(asset,'icons/optimized/'+id+'.png');assert.ok(fs.existsSync('extension/'+asset));
    assert.equal((await x.call('setIconChoice',{id,variant:'optimized'})).effectiveChoices[id],'optimized');
   }
   const denied=await x.call('setIconChoice',{id:'feishu',variant:'optimized'});assert.match(denied.error,/没有可用/);
   const reloaded=setup({stored:x.stored(),useRealCatalog:true});const after=await reloaded.settings();for(const id of ready)assert.equal(after.effectiveChoices[id],'optimized');
   for(const [id,value] of Object.entries(s.effectiveChoices))if(!ready.includes(id))assert.equal(after.effectiveChoices[id],value,'untouched default '+id);
  }
  const result=await x.call('setIconChoice',{id:'youtube',variant:'mac'});assert.ok(result.error,'absent Mac asset cannot be selected through API');
  const saved=await x.call('setIconChoice',{id:'jimeng',variant:'iphone'});assert.equal(saved.choices.jimeng,'iphone');const restarted=setup({stored:x.stored(),useRealCatalog:true});assert.equal((await restarted.settings()).effectiveChoices.jimeng,'iphone','real catalog choice persists across worker restart');
 }
 console.log('PASS: four-way settings; persisted defaults; per-site pinned/ordinary updates; iPhone/Mac/optimized cache separation; original DOM restoration; worker restart; stale image/storage races; pause/resume; sender/path security; real 155-site catalog');

 {
  const x=setup();
  let s=await x.settings();assert.equal(s.iconSize,'large','default size is large');
  const before=x.stored();
  assert.match((await x.call('saveSettings',{choices:{alpha:'iphone',beta:'mac'}})).error,/没有可用/);assert.deepEqual(x.stored(),before,'invalid batch saves nothing');
  assert.match((await x.call('saveSettings',{choices:{},iconSize:'huge'})).error,/无效的图标大小/);assert.deepEqual(x.stored(),before);
  assert.equal((await x.call('saveSettings',{choices:{alpha:'iphone'}},{id:'test',url:'chrome-extension://test/popup.html'})).error,'无效控制请求','popup page no longer exists');
  s=await x.call('saveSettings',{choices:{alpha:'iphone',beta:'original'},iconSize:'xlarge'});
  assert.equal(s.iconSize,'xlarge');assert.equal(s.effectiveChoices.alpha,'iphone');assert.equal(s.effectiveChoices.beta,'original');
  assert.equal(x.stored().iconSize,'xlarge');assert.equal(x.stored().choices.alpha,'iphone');
  assert.ok(x.href(1).startsWith('data:image/png;base64,'),'applied after batch save');assert.equal(x.href(2),x.href(1));
  const y=setup({stored:{iconSize:'xlarge',choices:{alpha:'mac'}}});assert.equal((await y.settings()).iconSize,'xlarge','saved size survives restart');const w=setup({stored:{iconSize:'standard'}});assert.equal((await w.settings()).iconSize,'large','retired standard size migrates to large');
  const z=setup({stored:{iconSize:'bogus'}});assert.equal((await z.settings()).iconSize,'large','unknown stored size falls back');
  {const r=await x.call('refresh');assert.equal(r.lastRefresh.open,3);assert.equal(r.lastRefresh.woken,0);assert.deepEqual([...r.lastRefresh.asleep],[]);const n=x.requests.length;await x.call('refresh');assert.ok(x.requests.length>n,'refresh drops cached images and rereads packaged files');}
  {const m=await x.call('refresh');assert.deepEqual([...m.mySites].slice(0,1),['alpha'],'pinned tab is remembered as my site');
   const sv=await x.call('saveSettings',{choices:{},starred:['gamma','nope'],hidden:['alpha']});assert.ok(sv.mySites.includes('gamma'));assert.ok(!sv.mySites.includes('alpha'));assert.deepEqual([...sv.mine.starred],['gamma']);
   const again=setup({stored:x.stored()});assert.ok((await again.settings()).mySites.includes('gamma'),'my sites persist');
   const tab=x.tabs.find(t=>t.id===1);const before=x.href(1);tab.url+='#inbox/123';
   await x.call('saveSettings',{choices:{alpha:'mac'}});assert.notEqual(x.href(1),before,'hash-only address change (Gmail-style) is still processed');}
  console.log('PASS: batch saveSettings validation, atomicity, icon size persistence, popup sender rejected');
 }
})().catch(e=>{console.error(e);process.exitCode=1});
