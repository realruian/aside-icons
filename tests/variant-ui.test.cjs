const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const source=fs.readFileSync('extension/gallery.js','utf8');
const resize=fs.readFileSync('extension/resize.js','utf8');
const html=fs.readFileSync('extension/gallery.html','utf8');
const catalog=[
 {id:'github',label:'GitHub',category:'开发',domains:['github.com'],defaultVariant:'mac',variants:{original:{},iphone:{path:'icons/iphone/github.png'},mac:{path:'icons/mac/github.png'},optimized:{path:'icons/optimized/github.png'}}},
 {id:'jimeng',label:'即梦',category:'常用',domains:['jimeng.jianying.com'],defaultVariant:'original',variants:{original:{preview:'icons/original/jimeng.png'},iphone:{path:'icons/iphone/jimeng.png'},optimized:{path:'icons/optimized/jimeng.png'}}},
 {id:'notion',label:'Notion',category:'办公',domains:['notion.so'],defaultVariant:'mac',variants:{original:{},iphone:{path:'icons/iphone/notion.png'},mac:{path:'icons/mac/notion.png'}}}
];
async function tick(){for(let i=0;i<30;i++)await Promise.resolve()}
async function setup({extension=true,snapshot}={}){
 const {document,window}=parseHTML(html);const calls=[],waiting=[];
 const base={enabled:true,version:'2.0.0',iconSize:'large',choices:{jimeng:'optimized'},effectiveChoices:{github:'mac',jimeng:'optimized',notion:'mac'},mySites:['jimeng','github'],mine:{starred:[],hidden:[]},status:[]};
 const snap=snapshot||base;
 const context=vm.createContext({document,window,location:{protocol:extension?'chrome-extension:':'http:'},ICON_LIBRARY:catalog,Map,Set,Object,Promise,JSON,Blob,URL,Date,
  setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,fetch:async()=>({json:async()=>({version:'2.0.0'}),blob:async()=>new Blob([])}),
  chrome:extension?{runtime:{id:'test',getManifest:()=>({version:'2.0.0'}),reload(){context.reloaded=true},sendMessage:async msg=>{calls.push(msg);if(msg.type==='getSettings')return snap;return new Promise((resolve,reject)=>waiting.push({msg,resolve,reject}))}},storage:{local:{get:async()=>({}),set:async()=>{}}}}:undefined});
 vm.runInContext(resize,context);vm.runInContext(source,context);await tick();
 const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
 return {document,context,calls,waiting,base,q,qa,run:c=>vm.runInContext(c,context),
  row:id=>q(`.row[data-id="${id}"]`),option:(id,v)=>q(`.row[data-id="${id}"] .option[data-variant="${v}"]`),
  current:id=>q(`.row[data-id="${id}"]`).dataset.current,locked:()=>qa('.option, #style button').every(b=>b.disabled)};
}
(async()=>{
 // Local preview is read-only.
 const off=await setup({extension:false});assert.equal(off.calls.length,0);assert.ok(off.qa('.option').length>0&&off.locked(),'preview shows versions but cannot change them');assert.match(off.q('#banner').textContent,/本地预览/);assert.equal(off.q('#save').disabled,true);
 // Old worker (no mySites) triggers self-update.
 const old=await setup({snapshot:{enabled:true,iconSize:'large',choices:{},effectiveChoices:{}}});assert.equal(old.context.reloaded,true,'stale worker is reloaded automatically');
 const x=await setup();
 // One list of every site, all available versions visible in each row.
 assert.equal(x.q('#pins'),null,'no separate pinned group');assert.equal(x.qa('.star').length,0,'no star column');
 assert.equal(x.qa('.row').length,3);
 assert.deepEqual(x.qa('.row[data-id="jimeng"] .option').map(o=>o.dataset.variant),['original','iphone','optimized'],'only available versions are choices');
 assert.ok(x.q('.row[data-id="jimeng"] .none'),'missing version leaves an aligned gap');
 assert.equal(x.option('jimeng','optimized').getAttribute('aria-checked'),'true');
 // Style radio reflects the version most sites use (github + notion on mac).
 assert.equal(x.q('#style [aria-checked="true"]').dataset.style,'mac');
 assert.match(x.q('#count').textContent,/2 个有优化版/);assert.equal(x.q('#save').disabled,true);assert.equal(x.q('#bar-text').textContent,'所有更改已保存');
 assert.equal(x.q('#size button[aria-checked="true"]').dataset.size,'large');assert.equal(x.q('#toggle').getAttribute('aria-checked'),'true');
 // Choosing only drafts.
 const n0=x.calls.length;x.run("choose('jimeng','mac')");assert.equal(x.calls.length,n0);
 x.run("choose('github','iphone')");x.run("choose('jimeng','iphone')");assert.equal(x.calls.length,n0,'no save on click');
 assert.equal(x.current('github'),'iphone');assert.ok(x.q('.row[data-id="github"] .mark').classList.contains('is-dirty'));
 const gi=x.option('github','iphone');assert.equal(gi.getAttribute('aria-checked'),'true');assert.ok(gi.classList.contains('is-dirty'));
 assert.match(x.q('#bar-text').textContent,/2 项更改未保存/);
 x.run("choose('github','mac')");assert.match(x.q('#bar-text').textContent,/1 项更改未保存/,'reselecting saved clears draft');
 // Click path.
 x.option('jimeng','original').click();assert.equal(x.option('jimeng','original').getAttribute('aria-checked'),'true');
 // Style: one click moves every site that has that version; discard restores.
 x.q('#style [data-style="iphone"]').click();assert.deepEqual(['jimeng','github','notion'].map(x.current),['iphone','iphone','iphone']);
 assert.equal(x.q('#style [aria-checked="true"]').dataset.style,'iphone');assert.ok(x.q('#style [data-style="iphone"]').classList.contains('is-dirty'));
 x.run("chooseSize('xlarge')");
 x.run('discard()');assert.equal(x.q('#save').disabled,true);assert.equal(x.q('#style [aria-checked="true"]').dataset.style,'mac');assert.equal(x.q('#size button[aria-checked="true"]').dataset.size,'large');
 // Failed save keeps drafts.
 x.run("choose('github','optimized')");x.run("chooseSize('xlarge')");
 let p=x.run('saveAll()');await tick();assert.equal(x.waiting.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(x.waiting[0].msg)),{target:'worker',type:'saveSettings',choices:{github:'optimized'},iconSize:'xlarge'});
 assert.ok(x.qa('.option').length>0&&x.locked(),'locked while saving');
 x.waiting.shift().reject(Error('boom'));await p;assert.match(x.q('#bar-text').textContent,/2 项更改未保存/);assert.match(x.q('#toast').textContent,/保存失败/);
 // Successful save.
 p=x.run('saveAll()');await tick();x.waiting.shift().resolve({...x.base,iconSize:'xlarge',choices:{jimeng:'optimized',github:'optimized'},effectiveChoices:{...x.base.effectiveChoices,github:'optimized'},lastRefresh:{open:2,asleep:['X']}});await p;
 assert.equal(x.q('#save').disabled,true);assert.equal(x.q('#bar-text').textContent,'所有更改已保存');assert.match(x.q('#toast').textContent,/已保存并刷新 2 个打开的网页。未加载的：X/);
 // Toggle switch.
 x.q('#toggle').click();await tick();assert.equal(x.waiting[0].msg.type,'setEnabled');assert.equal(x.waiting[0].msg.enabled,false);x.waiting.shift().resolve({...x.base,enabled:false});await tick();await tick();assert.equal(x.q('#toggle').getAttribute('aria-checked'),'false');
 // Search and categories.
 x.q('#search').value='notion.so';x.run('renderSites()');assert.deepEqual(x.qa('.row').map(r=>r.dataset.id),['notion']);assert.equal(x.q('#count').textContent,'找到 1 个');
 x.q('#search').value='hub';x.run('renderSites()');assert.equal(x.q('.row[data-id="github"] mark').textContent,'Hub','match is highlighted');
 x.q('#search').value='';x.run("category='开发';renderSites()");assert.deepEqual(x.qa('.row').map(r=>r.dataset.id),['github']);
 // Import puts values into drafts only.
 x.run("category='';renderSites()");
 await x.run(`importSettings({text:async()=>JSON.stringify({app:'aside-icons',choices:{notion:'iphone',github:'bogus'},iconSize:'large'})})`);
 assert.equal(x.current('notion'),'iphone');assert.match(x.q('#toast').textContent,/已导入 1 项/);
 console.log('PASS: settings page — read-only preview; stale-worker self-update; single searchable list; style radio; match highlight; draft-only clicks; discard; batch save payload; failure keeps drafts; switch; search/categories; import');
})().catch(e=>{console.error(e);process.exitCode=1});
