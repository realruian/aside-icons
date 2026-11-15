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
  row:id=>q(`.row[data-id="${id}"]`),pin:id=>q(`.pin[data-id="${id}"]`),option:v=>q(`#pins .option[data-variant="${v}"]`),
  current:id=>q(`.row[data-id="${id}"]`).dataset.current,locked:()=>qa('.option, .star').every(b=>b.disabled)};
}
(async()=>{
 // Local preview is read-only.
 const off=await setup({extension:false});assert.equal(off.calls.length,0);assert.ok(off.qa('.option').length>0&&off.locked(),'preview shows versions but cannot change them');assert.match(off.q('#banner').textContent,/本地预览/);assert.equal(off.q('#save').disabled,true);
 // Old worker (no mySites) triggers self-update.
 const old=await setup({snapshot:{enabled:true,iconSize:'large',choices:{},effectiveChoices:{}}});assert.equal(old.context.reloaded,true,'stale worker is reloaded automatically');
 const x=await setup();
 // Pinned replica shows my sites in order, first one selected in the editor.
 assert.deepEqual(x.qa('.pin[data-id]').map(p=>p.dataset.id),['jimeng','github']);
 assert.equal(x.q('.pin[data-id="jimeng"] .site-btn').getAttribute('aria-expanded'),'true','first pinned site starts expanded');assert.equal(x.q('#pins .picker').id,'picker-pin-jimeng');
 assert.deepEqual(x.qa('.option').map(o=>o.dataset.variant),['original','iphone','optimized'],'picker lists only available versions');
 assert.equal(x.option('optimized').getAttribute('aria-checked'),'true');
 // All-sites list: placeholder keeps columns aligned; unavailable variant is not clickable.
 assert.equal(x.qa('.row').length,3);assert.equal(x.qa('#sites .picker').length,0,'all-sites rows start collapsed');
 x.q('.row[data-id="jimeng"] .site-btn').click();assert.equal(x.q('.row[data-id="jimeng"] .site-btn').getAttribute('aria-expanded'),'true');
 assert.deepEqual(x.qa('#sites .option').map(o=>o.dataset.variant),['original','iphone','optimized'],'no mac version offered for jimeng');
 x.q('.row[data-id="jimeng"] .site-btn').click();assert.equal(x.qa('#sites .picker').length,0,'clicking again collapses');
 x.q('.pin[data-id="github"] .site-btn').click();assert.equal(x.q('#pins .picker').id,'picker-pin-github','one pinned row open at a time');
 x.q('.pin[data-id="jimeng"] .site-btn').click();
 assert.match(x.q('#count').textContent,/2 个有优化版/);assert.equal(x.q('#save').disabled,true);assert.equal(x.q('#bar-text').textContent,'所有更改已保存');
 assert.equal(x.q('#size button[aria-checked="true"]').dataset.size,'large');assert.equal(x.q('#toggle').getAttribute('aria-checked'),'true');
 // Choosing only drafts.
 const n0=x.calls.length;x.run("choose('jimeng','mac')");assert.equal(x.calls.length,n0);
 x.run("choose('github','iphone')");x.run("choose('jimeng','iphone')");assert.equal(x.calls.length,n0,'no save on click');
 assert.equal(x.current('github'),'iphone');assert.ok(x.row('github').classList.contains('is-dirty'));assert.match(x.q('.row[data-id="github"] .value').textContent,/未保存 · iPhone/);
 x.run("openRow='github';renderSites()");const gi=x.q('#sites .option[data-variant="iphone"]');assert.equal(gi.getAttribute('aria-checked'),'true');assert.ok(gi.classList.contains('is-dirty'));
 assert.ok(x.q('.pin[data-id="github"]').classList.contains('is-dirty'));assert.match(x.q('#bar-text').textContent,/2 项更改未保存/);
 x.run("choose('github','mac')");assert.match(x.q('#bar-text').textContent,/1 项更改未保存/,'reselecting saved clears draft');
 // Editor click path.
 x.run("selectedId='jimeng';refreshView()");x.option('original').click();assert.equal(x.option('original').getAttribute('aria-checked'),'true');
 // Bulk on my sites.
 x.q('#bulk-apply').click();assert.equal(x.current('jimeng'),'optimized');assert.equal(x.current('github'),'optimized');assert.equal(x.current('notion'),'mac','not in my sites, untouched');
 // Star / unstar.
 x.run("toggleMine('notion')");assert.deepEqual(x.qa('.pin[data-id]').map(p=>p.dataset.id),['jimeng','github','notion']);
 x.run("toggleMine('github')");assert.deepEqual(x.qa('.pin[data-id]').map(p=>p.dataset.id),['jimeng','notion']);
 x.run("chooseSize('xlarge')");
 x.run('discard()');assert.equal(x.q('#save').disabled,true);assert.deepEqual(x.qa('.pin[data-id]').map(p=>p.dataset.id),['jimeng','github']);assert.equal(x.q('#size button[aria-checked="true"]').dataset.size,'large');
 // Failed save keeps drafts.
 x.run("choose('github','optimized')");x.run("toggleMine('notion')");x.run("chooseSize('xlarge')");
 let p=x.run('saveAll()');await tick();assert.equal(x.waiting.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(x.waiting[0].msg)),{target:'worker',type:'saveSettings',choices:{github:'optimized'},iconSize:'xlarge',starred:['notion'],hidden:[]});
 assert.ok(x.qa('.option').length>0&&x.locked(),'locked while saving');
 x.waiting.shift().reject(Error('boom'));await p;assert.match(x.q('#bar-text').textContent,/3 项更改未保存/);assert.match(x.q('#toast').textContent,/保存失败/);
 // Successful save.
 p=x.run('saveAll()');await tick();x.waiting.shift().resolve({...x.base,iconSize:'xlarge',choices:{jimeng:'optimized',github:'optimized'},effectiveChoices:{...x.base.effectiveChoices,github:'optimized'},mySites:['jimeng','github','notion'],mine:{starred:['notion'],hidden:[]},lastRefresh:{open:2,asleep:['X']}});await p;
 assert.equal(x.q('#save').disabled,true);assert.equal(x.q('#bar-text').textContent,'所有更改已保存');assert.match(x.q('#toast').textContent,/已保存并刷新 2 个打开的网页。未加载的：X/);
 assert.deepEqual(x.qa('.pin[data-id]').map(p=>p.dataset.id),['jimeng','github','notion']);
 // Toggle switch.
 x.q('#toggle').click();await tick();assert.equal(x.waiting[0].msg.type,'setEnabled');assert.equal(x.waiting[0].msg.enabled,false);x.waiting.shift().resolve({...x.base,enabled:false});await tick();await tick();assert.equal(x.q('#toggle').getAttribute('aria-checked'),'false');
 // Search and categories.
 x.q('#search').value='notion.so';x.run('renderSites()');assert.deepEqual(x.qa('.row').map(r=>r.dataset.id),['notion']);
 x.q('#search').value='';x.run("category='开发';renderSites()");assert.deepEqual(x.qa('.row').map(r=>r.dataset.id),['github']);
 // Import puts values into drafts only.
 x.run("category='';renderSites()");
 await x.run(`importSettings({text:async()=>JSON.stringify({app:'aside-icons',choices:{notion:'iphone',github:'bogus'},iconSize:'large'})})`);
 assert.equal(x.current('notion'),'iphone');assert.match(x.q('#toast').textContent,/已导入 1 项/);
 console.log('PASS: settings page — read-only preview; stale-worker self-update; pinned rows + disclosure; picker shows only available versions; draft-only clicks; bulk; add/remove my sites; discard; batch save payload; failure keeps drafts; switch; search/categories; import');
})().catch(e=>{console.error(e);process.exitCode=1});
