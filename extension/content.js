(() => {
  if (globalThis.__asidePinnedIconsV2) return;
  const state = globalThis.__asidePinnedIconsV2 = {output: null, originals: new Map(), timer: null};
  const selector = 'link[rel~="icon"]';
  const ours = 'data-aside-pinned-icons';
  const metadata = 'data-aside-icon-original-v1';
  const processed = value => /^data:image\/png;(?:aside-icons=5;)?base64,/.test(value || '');
  // This fingerprint detects stale DOM metadata; it is not a security boundary.
  function fingerprint(value) {
    let hash=2166136261;
    for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619);
    return value.length+':'+(hash>>>0).toString(16);
  }
  const attributes = node => ({href:node.getAttribute('href'),type:node.getAttribute('type'),sizes:node.getAttribute('sizes')});
  function stored(node) {
    const raw=node.getAttribute(metadata);
    if(!raw)return null;
    try {
      const record=JSON.parse(raw),href=node.getAttribute('href');
      if(record.v===1 && record.original && ['href','type','sizes'].every(k=>record.original[k]===null||typeof record.original[k]==='string') && processed(href) && record.outputHash===fingerprint(href))return record;
    }catch{}
    // The website supplied a new icon. Its new values take precedence.
    node.removeAttribute(metadata);
    return null;
  }
  function remember(node,original,image) {
    node.setAttribute(metadata,JSON.stringify({v:1,original,outputHash:fingerprint(image)}));
  }
  function capture() {
    const items=[];
    for(const node of state.originals.keys())if(!node.isConnected)state.originals.delete(node);
    for (const node of document.querySelectorAll(selector)) {
      const record=stored(node),current=node.getAttribute('href');
      if(node.hasAttribute(ours)) {
        if(record || current===state.output)continue;
        // A website may reuse our fallback link for its own newer icon.
        node.removeAttribute(ours);
      }
      const old=state.originals.get(node);
      if(record)state.originals.set(node,{...record.original});
      else if(!old || current!==state.output)state.originals.set(node,attributes(node));
      const saved=state.originals.get(node);
      if(saved.href) {
        try {
          const media=node.media||'';
          items.push({url:new URL(saved.href,document.baseURI).href,sizes:saved.sizes,media,matches:!media||matchMedia(media).matches});
        }catch{} // One malformed declaration must not hide other valid icons.
      }
    }
    return {url:location.href,icons:items.filter(x=>x.matches),output:state.output};
  }
  function restore(message={}) {
    observer.disconnect();clearTimeout(state.timer);
    capture();
    document.querySelectorAll('link['+ours+']').forEach(n=>n.remove());
    for(const node of document.querySelectorAll(selector)) {
      const record=stored(node),current=node.getAttribute('href');
      const original=record?.original || (current===state.output?state.originals.get(node):null);
      let href=original?.href;
      // Compatibility for pages processed before persistent DOM metadata existed.
      if(!original && message.original && message.previous && current===message.previous)href=message.original;
      if(original || href!==undefined)href===null?node.removeAttribute('href'):node.setAttribute('href',href);
      node.removeAttribute(metadata);
      // type/sizes were never modified, so website changes to them stay intact.
    }
    state.output=null;state.originals.clear();
  }
  const observer=new MutationObserver(records=>{
    const relevant=records.some(r=>r.target.matches?.(selector)||[...r.addedNodes,...r.removedNodes].some(n=>n.matches?.(selector)||n.querySelector?.(selector)));
    if(!relevant)return;
    clearTimeout(state.timer);
    state.timer=setTimeout(()=>{
      try{chrome.runtime.sendMessage({target:'worker',type:'iconChanged'}).catch(()=>observer.disconnect());}
      catch{observer.disconnect();}
    },600);
  });
  const watch=()=>document.head&&observer.observe(document.head,{subtree:true,childList:true,attributes:true,attributeFilter:['href','rel','sizes','media','type']});
  chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
    if(sender.id!==chrome.runtime.id||msg.target!=='content')return;
    if(msg.type==='inspect'){respond(capture());return;}
    if(msg.type==='restore'){
      if(msg.url&&msg.url.split('#')[0]!==location.href.split('#')[0]){respond({restored:false});return;}
      const had=!!state.output||!!document.querySelector('link['+metadata+']');restore(msg);
      if(!document.querySelector(selector)&&msg.original){
        const link=document.createElement('link');link.rel='icon';link.href=msg.original;document.head?.append(link);
      }
      respond({restored:true,had});return;
    }
    if(msg.type==='apply'&&msg.url&&msg.url.split('#')[0]===location.href.split('#')[0]&&processed(msg.image)){
      capture();observer.disconnect();
      if(msg.original)for(const old of state.originals.values())if(old.href===msg.image||old.href===msg.previous)old.href=msg.original;
      state.output=msg.image;
      const nodes=[...document.querySelectorAll(selector)].filter(n=>!n.hasAttribute(ours));
      if(nodes.length){
        for(const node of nodes){remember(node,state.originals.get(node),msg.image);node.setAttribute('href',msg.image);}
      }else{
        let link=document.querySelector('link['+ours+']');
        if(!link){link=document.createElement('link');link.rel='icon';link.setAttribute(ours,'');document.head?.append(link);}
        remember(link,{href:null,type:null,sizes:null},msg.image);link.href=msg.image;
      }
      watch();respond({applied:true});
    }
  });
})();
