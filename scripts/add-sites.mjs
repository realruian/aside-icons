// Adds a batch of sites to assets/catalog.json with their original favicon preview and,
// where the same company publishes one, the iPhone / Mac App Store icon.
// Optimized icons are made afterwards by build-optimized.mjs / draw-remaining.mjs.
//   node scripts/add-sites.mjs            (skips sites already in the catalog)
// Downloads are images only; they are re-encoded through resvg before use.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {Resvg} from '@resvg/resvg-js';

// id, label, category, domains, extra entry fields, iPhone [store, term, seller], Mac [store, term, seller], favicon domain
const SITES=[
  ['google','Google 搜索','常用',['google.com','google.com.hk'],{},['us','Google',/^Google LLC$/,/^Google$/]],
  ['baidu','百度','常用',['baidu.com'],{},['cn','百度',/Baidu Netcom/,/^百度-AI/]],
  ['bing','Bing','常用',['bing.com'],{},['us','Microsoft Bing',/^Microsoft Corporation$/,/^Microsoft Bing/]],
  ['outlook','Outlook','办公',['outlook.live.com','outlook.office.com','outlook.office365.com','outlook.cloud.microsoft'],{},['us','Microsoft Outlook',/^Microsoft Corporation$/,/^Microsoft Outlook$/],['us','Microsoft Outlook',/^Microsoft Corporation$/,/^Microsoft Outlook$/]],
  ['qqmail','QQ 邮箱','办公',['mail.qq.com','wx.mail.qq.com'],{},['cn','QQ邮箱',/^Tencent/,/^QQ邮箱$/]],
  ['mail163','网易邮箱','办公',['mail.163.com','mail.126.com','mail.yeah.net'],{}],
  ['icloud','iCloud','办公',['icloud.com','icloud.com.cn'],{}],
  ['baidu-netdisk','百度网盘','办公',['pan.baidu.com','yun.baidu.com'],{},['cn','百度网盘',/Duyou/,/^百度网盘$/],['cn','百度网盘',/Duyou/,/^百度网盘$/]],
  ['aliyundrive','阿里云盘','办公',['alipan.com','aliyundrive.com'],{},['cn','阿里云盘',/Duanqu/,/^阿里云盘$/]],
  ['quark','夸克','办公',['quark.cn'],{},['cn','夸克',/Dongyue/,/^夸克/]],
  ['google-translate','Google 翻译','办公',['translate.google.com','translate.google.cn'],{},['us','Google Translate',/^Google LLC$/,/^Google Translate$/]],
  ['deepl','DeepL','办公',['deepl.com'],{},['us','DeepL',/^DeepL SE$/,/^DeepL/]],
  ['jd','京东','生活',['jd.com','jd.hk'],{},['cn','京东',/Jingdong/,/^京东/]],
  ['tmall','天猫','生活',['tmall.com','tmall.hk'],{},['cn','天猫',/tmall/i,/^天猫/]],
  ['pinduoduo','拼多多','生活',['pinduoduo.com','yangkeduo.com'],{},['cn','拼多多',/Xunmeng/,/^拼多多/]],
  ['xianyu','闲鱼','生活',['goofish.com','2.taobao.com'],{},['cn','闲鱼',/Xianyu/,/^闲鱼/]],
  ['meituan','美团','生活',['meituan.com'],{},['cn','美团',/Sankuai/,/^美团/]],
  ['ctrip','携程旅行','生活',['ctrip.com'],{},['cn','携程旅行',/Ctrip/,/^携程/]],
  ['rail12306','铁路 12306','生活',['12306.cn'],{},['cn','铁路12306',/RAILWAY/i,/^铁路12306$/]],
  ['amap','高德地图','生活',['amap.com','gaode.com'],{},['cn','高德地图',/AutoNavi/,/^高德地图/],['cn','高德地图',/AutoNavi/,/^高德地图/]],
  ['google-maps','Google 地图','生活',['google.com','google.com.hk'],{paths:['/maps']},['us','Google Maps',/^Google LLC$/,/^Google Maps$/],null,'maps.google.com'],
  ['amazon','Amazon','生活',['amazon.com','amazon.co.jp','amazon.co.uk','amazon.de','amazon.cn'],{},['us','Amazon Shopping',/^AMZN Mobile/,/^Amazon Shopping$/]],
  ['tencent-video','腾讯视频','影音',['v.qq.com'],{},['cn','腾讯视频',/^Tencent/,/^腾讯视频/],['cn','腾讯视频',/^Tencent/,/^腾讯视频/]],
  ['iqiyi','爱奇艺','影音',['iqiyi.com','iq.com'],{},['cn','爱奇艺',/IQIYI/,/^爱奇艺/],['cn','爱奇艺',/IQIYI/,/^爱奇艺/]],
  ['youku','优酷','影音',['youku.com'],{},['cn','优酷视频',/Youku/,/^优酷/],['cn','优酷视频',/Youku/,/^优酷/]],
  ['kuaishou','快手','影音',['kuaishou.com'],{},['cn','快手',/Kwai/,/^快手$/]],
  ['netease-music','网易云音乐','影音',['music.163.com'],{},['cn','网易云音乐',/Netease Cloud Music/,/^网易云音乐/],['cn','网易云音乐',/Netease Cloud Music/,/^网易云音乐$/]],
  ['qqmusic','QQ 音乐','影音',['y.qq.com'],{},['cn','QQ音乐',/^Tencent/,/^QQ音乐/],['cn','QQ音乐',/^Tencent/,/^QQ音乐/]],
  ['xiaoyuzhou','小宇宙','影音',['xiaoyuzhoufm.com'],{},['cn','小宇宙',/Zhuiguang/,/^小宇宙/]],
  ['tiktok','TikTok','影音',['tiktok.com'],{},['us','TikTok',/^TIKTOK PTE/,/^TikTok/]],
  ['chatglm','智谱清言','AI 工具',['chatglm.cn'],{},['cn','智谱清言',/Knowledge Atlas/,/^智谱清言/]],
  ['wenxin','文心一言','AI 工具',['yiyan.baidu.com'],{},['cn','文心一言',/Baidu Netcom/,/^文心/]],
  ['coze','扣子','AI 工具',['coze.cn','coze.com'],{},['cn','扣子',/Chuntian Zhiyun/,/^扣子/]],
  ['wechat-mp','微信公众号','社交',['mp.weixin.qq.com'],{}],
  ['sspai','少数派','社交',['sspai.com'],{},['cn','少数派',/Shaomai/,/^少数派$/]],
  ['v2ex','V2EX','社交',['v2ex.com'],{}],
  ['medium','Medium','社交',['medium.com'],{},['us','Medium',/^A Medium Corporation$/,/^Medium/]],
  ['pinterest','Pinterest','社交',['pinterest.com'],{},['us','Pinterest',/^Pinterest, Inc\.$/,/^Pinterest$/]],
  ['threads','Threads','社交',['threads.net','threads.com'],{},['us','Threads',/^Instagram, Inc\.$/,/^Threads$/]],
  ['hackernews','Hacker News','社交',['news.ycombinator.com'],{}],
  ['juejin','稀土掘金','开发',['juejin.cn'],{},['cn','稀土掘金',/Beibi/,/^稀土掘金$/]],
  ['csdn','CSDN','开发',['csdn.net'],{},['cn','CSDN',/^CSDN/,/^CSDN/]],
  ['leetcode','LeetCode','开发',['leetcode.com','leetcode.cn'],{},['us','LeetCode',/^LeetCode LLC$/,/^LeetCode$/]],
  ['jira','Jira','开发',['atlassian.net'],{paths:['/jira','/browse','/secure','/projects','/issues']},['us','Jira Cloud',/^Atlassian/,/^Jira Cloud/],null,null],
  ['confluence','Confluence','开发',['atlassian.net'],{paths:['/wiki']},['us','Confluence',/^Atlassian/,/^Confluence Cloud$/],null,null],
];

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function json(url){for(let t=0;t<4;t++){try{const r=await fetch(url);if(r.ok){const j=await r.json();if(j.results?.length)return j}}catch{}await sleep(1200*(t+1))}return {results:[]}}
async function bytes(url){const r=await fetch(url);if(!r.ok)throw Error(r.status+' '+url);return Buffer.from(await r.arrayBuffer())}
async function findApp([cc,term,seller,name],entity){
  const r=await json(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=${entity}&country=${cc}&limit=10`);
  return r.results.find(x=>seller.test(x.sellerName)&&name.test(x.trackName))||null;
}
// Draw any raster into a square canvas through resvg (PNG/JPEG in, clean PNG out).
function draw(buf,size,inner){
  const b64=buf.toString('base64'),mime=buf[0]===0x89?'image/png':'image/jpeg';
  return new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${inner(`data:${mime};base64,${b64}`)}</svg>`).render().asPng();
}
// iPhone: App Store artwork is a flat square; lay it out like the other untrimmed iPhone icons
// (rounded tile, 10% margin). bake-trim.mjs then trims it to fill the favicon square.
const iphoneTile=buf=>draw(buf,256,href=>`<defs><clipPath id="c"><rect x="25.6" y="25.6" width="204.8" height="204.8" rx="46"/></clipPath></defs><image x="25.6" y="25.6" width="204.8" height="204.8" href="${href}" clip-path="url(#c)"/>`);
const macTile=buf=>draw(buf,256,href=>`<image width="256" height="256" href="${href}"/>`);

const catalog=JSON.parse(fs.readFileSync('assets/catalog.json','utf8'));
const have=new Set(catalog.map(e=>e.id)),added=[],report=[];
fs.mkdirSync('work/new-sites/favicon',{recursive:true});
for(const [id,label,category,domains,extra,ios,mac,favDomain] of SITES){
  if(have.has(id))continue;
  const e={id,label,category,domains,...extra,variants:{original:{}}};
  // Original: the site's own favicon, for the settings-page preview only.
  const fd=favDomain===undefined?domains[0]:favDomain;
  if(fd){
    const url=`https://www.google.com/s2/favicons?domain=${fd}&sz=128`;
    try{
      const raw=await bytes(url),tmp=`work/new-sites/favicon/${id}.png`;fs.writeFileSync(tmp,raw);
      execFileSync('sips',['-s','format','png','-z','128','128',tmp,'--out',tmp],{stdio:'ignore'});
      fs.writeFileSync(`extension/icons/original/${id}.png`,draw(fs.readFileSync(tmp),128,h=>`<image width="128" height="128" href="${h}"/>`));
      e.variants.original={preview:`icons/original/${id}.png`,sourceUrl:url};
    }catch(err){report.push(id+' favicon: '+err.message)}
  }
  for(const [kind,spec,entity,tile] of [['iphone',ios,'software',iphoneTile],['mac',mac,'macSoftware',macTile]]){
    if(!spec)continue;
    const app=await findApp(spec,entity);await sleep(500);
    if(!app){report.push(`${id} ${kind}: no matching app`);continue}
    const art=await bytes(app.artworkUrl512);
    fs.writeFileSync(`assets/untrimmed/${kind}/${id}.png`,tile(art));
    e.variants[kind]={path:`icons/${kind}/${id}.png`,source:`App Store · ${app.trackName} · ${app.sellerName}`};
  }
  e.defaultVariant=e.variants.iphone?'iphone':'original';
  catalog.push(e);added.push(id);
  console.log(id.padEnd(16),Object.keys(e.variants).join(','));
}
fs.writeFileSync('assets/catalog.json',JSON.stringify(catalog,null,2)+'\n');
console.log('added',added.length,report.length?'\nnotes:\n '+report.join('\n '):'');
if(added.length)execFileSync('node',['scripts/bake-trim.mjs',...added],{stdio:'inherit'});
