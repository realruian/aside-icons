const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const source=fs.readFileSync('extension/gallery.js','utf8');
const resize=fs.readFileSync('extension/resize.js','utf8');
const html=fs.readFileSync('extension/gallery.html','utf8');
const catalog=[{id:'github',label:'GitHub',category:'开发',domains:['github.com'],defaultVariant:'mac',variants:{original:{},iphone:{path:'icons/iphone/github.png'},mac:{path:'icons/mac/github.png'}}},{id:'jimeng',label:'即梦',category:'常用',domains:['jimeng.jianying.com'],defaultVariant:'original',variants:{original:{preview:'icons/original/jimeng.png'},iphone:{path:'icons/iphone/jimeng.png'},optimized:{path:'icons/optimized/jimeng.png'}}},{id:'notion',label:'Notion',category:'办公',domains:['notion.so'],defaultVariant:'mac',variants:{original:{},iphone:{path:'icons/iphone/notion.png'},mac:{path:'icons/mac/notion.png'}}}];
async function tick(){for(let i=0;i<6;i++)await Promise.resolve()}
async function setup(extension=true,stale=false){
 const {document,window}=parseHTML(html);let calls=[],waiting=[];
 const base={enabled:true,iconSize:'large',choices:{},effectiveChoices:{github:'mac',jimeng:'original',notion:'mac'},status:[],pinned:2,ordinary:1};
 const context=vm.createContext({document,window,location:{protocol:extension?'chrome-extension:':'file:'},ICON_LIBRARY:catalog,Map,Set,Object,Promise,setTimeout:()=>0,clearTimeout(){},chrome:extension?{runtime:{id:'test',sendMessage:async msg=>{calls.push(msg);if(msg.type==='getSettings')return stale?{enabled:true,choices:{},effectiveChoices:base.effectiveChoices}:base;return new Promise((resolve,reject)=>waiting.push({msg,resolve,reject}));}}}:undefined});
 vm.runInContext(resize,context);vm.runInContext(source,context);await tick();
 return {document,context,calls,waiting,base,run:code=>vm.runInContext(code,context),button:(id,v)=>document.querySelector(`button[data-id="${id}"][data-variant="${v}"]`),q:s=>document.querySelector(s)};
}
(async()=>{
 const off=await setup(false);assert.equal(off.calls.length,0);assert.ok([...off.document.querySelectorAll('.choice')].every(b=>b.disabled));assert.match(off.q('#connection').textContent,/在 Aside 扩展中打开以保存设置/);assert.equal(off.q('#save').disabled,true);
 assert.ok(!html.includes('popup.html'),'single settings page: no popup link');
 const old=await setup(true,true);assert.match(old.q('#connection').textContent,/旧版本/);assert.equal(old.q('#connection button').textContent,'立即更新');assert.ok([...old.document.querySelectorAll('.choice')].every(b=>b.disabled),'stale worker blocks editing');
 const x=await setup();assert.equal(x.q('.site-row').dataset.id,'jimeng');assert.equal(x.button('jimeng','mac').disabled,true);assert.equal(x.button('jimeng','original').getAttribute('aria-pressed'),'true');assert.equal(x.document.querySelectorAll('.site-row').length,3);
 assert.deepEqual([...x.q('[data-id="jimeng"].site-row').querySelectorAll('.choice')].map(b=>b.dataset.variant),['original','iphone','mac','optimized']);
 assert.deepEqual([...x.q('.column-head').children].map(n=>n.textContent),['网站','原版','iPhone','Mac','优化版']);
 assert.match(x.q('#count').textContent,/1 个优化版/);
 assert.equal(x.q('#save').disabled,true);assert.equal(x.q('#save').textContent,'已保存');assert.equal(x.q('#bar-text').textContent,'所有更改已保存');
 assert.equal(x.q('#size button[aria-checked="true"]').dataset.size,'large','size control shows saved size');
 assert.equal(x.q('#toggle').getAttribute('aria-checked'),'true');assert.match(x.q('#tab-summary').textContent,/固定 2 \/ 普通 1/);
 // Clicking only drafts; nothing is sent until Save.
 const n0=x.calls.length;
 x.run("choose('github','optimized')");x.run("choose('jimeng','mac')");assert.equal(x.calls.length,n0,'unavailable choices are ignored');
 x.run("choose('jimeng','optimized')");x.run("choose('github','iphone')");
 assert.equal(x.calls.length,n0,'choosing does not save');
 assert.equal(x.button('jimeng','optimized').getAttribute('aria-pressed'),'true');assert.match(x.button('jimeng','optimized').querySelector('.choice-label').textContent,/未保存/);
 assert.equal(x.q('#save').disabled,false);assert.equal(x.q('#save').textContent,'保存并应用');assert.match(x.q('#bar-text').textContent,/2 项更改未保存/);assert.equal(x.q('#discard').hidden,false);
 x.run("choose('github','mac')");assert.match(x.q('#bar-text').textContent,/1 项更改未保存/,'reselecting saved value clears the draft');
 x.run("chooseSize('xlarge')");assert.match(x.q('#bar-text').textContent,/2 项更改未保存/);
 // Discard restores saved state.
 x.run('discard()');assert.equal(x.button('jimeng','original').getAttribute('aria-pressed'),'true');assert.equal(x.q('#save').disabled,true);assert.equal(x.q('#size button[aria-checked="true"]').dataset.size,'large');
 // Failed save keeps the draft.
 x.run("choose('jimeng','optimized')");x.run("chooseSize('xlarge')");
 let p=x.run('saveAll()');await tick();assert.equal(x.waiting.length,1);assert.deepEqual(JSON.parse(JSON.stringify(x.waiting[0].msg)),{target:'worker',type:'saveSettings',choices:{jimeng:'optimized'},iconSize:'xlarge'});
 assert.ok([...x.document.querySelectorAll('.choice')].every(b=>b.disabled),'locked while saving');assert.equal(x.q('#save').textContent,'保存中…');
 x.waiting.shift().reject(Error('boom'));await p;assert.equal(x.button('jimeng','optimized').getAttribute('aria-pressed'),'true');assert.match(x.q('#bar-text').textContent,/2 项更改未保存/);assert.match(x.q('#toast').textContent,/保存失败/);
 // Successful save.
 p=x.run('saveAll()');await tick();x.waiting.shift().resolve({...x.base,iconSize:'xlarge',choices:{jimeng:'optimized'},effectiveChoices:{...x.base.effectiveChoices,jimeng:'optimized'}});await p;
 assert.equal(x.q('#save').disabled,true);assert.equal(x.q('#bar-text').textContent,'所有更改已保存');assert.equal(x.button('jimeng','optimized').querySelector('.choice-label').textContent,'优化版 · 当前');assert.equal(x.q('#size button[aria-checked="true"]').dataset.size,'xlarge');assert.match(x.q('#toast').textContent,/已保存并刷新/);
 // Toggle from the same page.
 p=x.run("document.querySelector('#toggle').click()");await tick();assert.equal(x.waiting[0].msg.type,'setEnabled');assert.equal(x.waiting[0].msg.enabled,false);x.waiting.shift().resolve({...x.base,enabled:false});await tick();assert.equal(x.q('#toggle').getAttribute('aria-checked'),'false');
 // Drafts survive search re-render.
 x.run("choose('notion','iphone')");x.q('#search').value='notion.so';x.run('render()');assert.equal(x.document.querySelectorAll('.site-row').length,1);assert.equal(x.button('notion','iphone').getAttribute('aria-pressed'),'true');
 const css=fs.readFileSync('extension/gallery.css','utf8');assert.match(css,/repeat\(4,minmax\(0,1fr\)\)/);assert.match(css,/\.savebar\{position:fixed/);
 console.log('PASS: draft-only clicks; explicit save bar; batch save payload; failed save keeps draft; discard; size control; merged switch and tab status; search keeps drafts');
})().catch(e=>{console.error(e);process.exitCode=1});
