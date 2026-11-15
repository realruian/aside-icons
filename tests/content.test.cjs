const {parseHTML}=require('linkedom');
const vm=require('node:vm');const fs=require('node:fs');const assert=require('node:assert/strict');
const script=fs.readFileSync('extension/content.js','utf8');
function setup(html, existingDocument){
 const document=existingDocument||parseHTML('<html><head>'+html+'</head><body></body></html>').document;let listener;
 if(!existingDocument)Object.defineProperty(document,'baseURI',{value:'https://example.test/page'});
 const context={document,location:{href:'https://example.test/page'},URL,setTimeout,clearTimeout,matchMedia:()=>({matches:true}),MutationObserver:class{observe(){}disconnect(){}},chrome:{runtime:{id:'test',onMessage:{addListener:f=>listener=f},sendMessage:async()=>({})}}};
 vm.createContext(context);vm.runInContext(script,context);
 const send=(type,extra={})=>{let res;listener({target:'content',type,...extra},{id:'test'},v=>res=v);return res;};return {document,send,context};
}
const icon='data:image/png;base64,AAAA';
{
 const x=setup('<link rel="icon" href="/brand.svg" type="image/svg+xml" sizes="any">');
 assert.equal(x.send('inspect').icons[0].url,'https://example.test/brand.svg');
 x.send('apply',{url:'https://example.test/page',image:icon});
 assert.equal(x.document.querySelector('link').getAttribute('href'),icon);
 assert.equal(x.send('inspect').icons[0].url,'https://example.test/brand.svg','reprocessing must use original, not decorated image');
 x.send('restore');assert.equal(x.document.querySelector('link').getAttribute('href'),'/brand.svg');assert.equal(x.document.querySelector('link').getAttribute('type'),'image/svg+xml');assert.equal(x.document.querySelector('link').getAttribute('sizes'),'any');
}
{
 const x=setup('<link rel="icon" href="/old.ico">');x.send('apply',{url:'https://example.test/page',image:icon});x.document.querySelector('link').setAttribute('href','/new.ico');
 x.send('restore');assert.equal(x.document.querySelector('link').getAttribute('href'),'/new.ico','restore must not erase a site update');
}
{
 const x=setup('');x.send('apply',{url:'https://example.test/page',image:icon});assert.ok(x.document.querySelector('link[data-aside-pinned-icons]'));x.send('restore',{original:'https://example.test/favicon.ico'});assert.equal(x.document.querySelector('link').getAttribute('href'),'https://example.test/favicon.ico');assert.equal(x.document.querySelector('link[data-aside-pinned-icons]'),null);
}
{
 const x=setup('<link rel="icon" href="/original.ico">');x.send('apply',{url:'https://wrong.test/',image:icon});assert.equal(x.document.querySelector('link').getAttribute('href'),'/original.ico','stale navigation must not mutate page');
}


const marker='data-aside-icon-original-v1';
const iconV5='data:image/png;aside-icons=5;base64,BBBB';
{
 const x=setup('<link rel="icon" href="/brand.svg" type="image/svg+xml" sizes="any">');
 const link=x.document.querySelector('link');
 for(let i=0;i<2;i++)x.send('apply',{url:'https://example.test/page',image:iconV5,original:'https://example.test/brand.svg',previous:i?iconV5:null});
 assert.equal(link.getAttribute('type'),'image/svg+xml','applying must not mutate original type');
 assert.equal(link.getAttribute('sizes'),'any','applying must not mutate original sizes');
 assert.ok(link.hasAttribute(marker));
 const reloaded=setup('',x.document);
 assert.equal(reloaded.send('inspect').icons[0].url,'https://example.test/brand.svg','metadata must survive content-script reload without background cache');
 reloaded.send('apply',{url:'https://example.test/page',image:iconV5});
 reloaded.send('restore',{url:'https://example.test/page'});
 assert.equal(link.getAttribute('href'),'/brand.svg');assert.equal(link.getAttribute('type'),'image/svg+xml');assert.equal(link.getAttribute('sizes'),'any');assert.equal(link.hasAttribute(marker),false);
}
{
 const x=setup('<link rel="icon" href="/brand.svg" type="image/svg+xml" sizes="any">');x.send('apply',{url:'https://example.test/page',image:iconV5});
 const link=x.document.querySelector('link');link.setAttribute('href','/fresh.png');link.setAttribute('type','image/png');link.setAttribute('sizes','32x32');
 const reloaded=setup('',x.document);assert.equal(reloaded.send('inspect').icons[0].url,'https://example.test/fresh.png');assert.equal(link.hasAttribute(marker),false,'stale metadata must be discarded');
 reloaded.send('restore');assert.equal(link.getAttribute('href'),'/fresh.png');assert.equal(link.getAttribute('sizes'),'32x32');
}
{
 const x=setup('<link rel="icon" href="/brand.svg" type="image/svg+xml" sizes="any">');x.send('apply',{url:'https://example.test/page',image:iconV5});
 x.context.location.href='https://example.test/spa-route';
 assert.equal(x.send('restore',{url:'https://example.test/spa-route'}).restored,true);
 assert.equal(x.document.querySelector('link').getAttribute('href'),'/brand.svg','SPA URL change must not lose original within the document');
}
{
 const x=setup('<link rel="icon" href="http://[broken"><link rel="icon" href="/valid.png">');
 assert.equal(x.send('inspect').icons.length,1);assert.equal(x.send('inspect').icons[0].url,'https://example.test/valid.png');
}
{
 const x=setup('');x.send('apply',{url:'https://example.test/page',image:iconV5});
 const reloaded=setup('',x.document);reloaded.send('restore');assert.equal(x.document.querySelector('link'),null,'owned fallback must be removable after reload');
}
{
 const x=setup('');x.send('apply',{url:'https://example.test/page',image:iconV5});
 const link=x.document.querySelector('link');link.setAttribute('href','/new-site-icon.png');
 const reloaded=setup('',x.document);reloaded.send('restore');assert.equal(link.getAttribute('href'),'/new-site-icon.png');assert.equal(link.hasAttribute('data-aside-pinned-icons'),false,'site reuse of fallback link must keep its new icon');
}
{
 const x=setup('<link rel="icon" href="/old.ico" type="image/x-icon" sizes="16x16">');x.send('apply',{url:'https://example.test/page',image:iconV5});
 const link=x.document.querySelector('link');link.setAttribute('sizes','32x32');x.send('restore');assert.equal(link.getAttribute('sizes'),'32x32','restoring should not undo website changes to attributes the extension never changed');
}
{
 const x=setup('<link rel="icon" href="/old.ico">');x.send('apply',{url:'https://example.test/page',image:'data:image/svg+xml;base64,AAAA'});assert.equal(x.document.querySelector('link').getAttribute('href'),'/old.ico','reject other image formats');
}
console.log('PASS: original preservation; legacy/new image formats; repeated processing; reload/cache-independent restoration; SPA restore; website updates; malformed declaration; fallback ownership; stale navigation');
