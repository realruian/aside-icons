'use strict';
// Entry point from the toolbar / extensions menu.
// 1) If Aside is still running an older background worker (it answers the
//    popup and has no iconSize), restart the extension. That also closes any
//    old settings tabs; the new worker reopens a fresh settings page.
// 2) Otherwise open the settings page, reloading an existing tab so it never
//    runs outdated page code.
(async()=>{
  const url=chrome.runtime.getURL('gallery.html');
  try{
    const r=await chrome.runtime.sendMessage({target:'worker',type:'status'});
    if(r&&!r.error&&typeof r.iconSize!=='string'){
      document.body.textContent='正在更新扩展…';
      await chrome.storage.local.set({reopenSettings:Date.now()});
      chrome.runtime.reload();return;
    }
  }catch{}
  try{
    const tabs=await chrome.tabs.query({url});
    const [tab,...extra]=tabs;
    for(const t of extra)chrome.tabs.remove(t.id).catch(()=>{});
    if(tab){await chrome.tabs.update(tab.id,{active:true});await chrome.tabs.reload(tab.id);await chrome.windows?.update(tab.windowId,{focused:true}).catch(()=>{});}
    else await chrome.tabs.create({url});
  }catch{await chrome.tabs.create({url});}
  window.close();
})();
