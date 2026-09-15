/* 音乐伴侣 - 音乐播放器 (内联版)
 * 从 音乐.html 提取并隔离，避免与 SEA 站点冲突：
 *   $ -> mb$ , load/save -> mbLoad/mbSave , document.querySelector -> mbRoot.querySelector
 *   动画名加 mb- 前缀 ; init() 改为首次打开时由 music-buddy-entry.js 调用
 */
(function(){
'use strict';
var mbRoot=document.getElementById('music-buddy-page');
if(window.__mbAppLoaded)return;
window.__mbAppLoaded=true;

/* ============ 轻量QR码生成器 ============ */
function generateQR(text,canvas,size){
  // 使用Google Charts API生成二维码图片，绘制到canvas
  const ctx=canvas.getContext('2d');
  canvas.width=size; canvas.height=size;
  const img=new Image();
  img.crossOrigin='anonymous';
  img.onload=()=>{ctx.clearRect(0,0,size,size);ctx.drawImage(img,0,0,size,size);};
  img.onerror=()=>{ctx.fillStyle='#666';ctx.fillRect(0,0,size,size);ctx.fillStyle='#fff';ctx.font='14px sans-serif';ctx.textAlign='center';ctx.fillText('二维码加载失败',size/2,size/2);};
  img.src='https://api.qrserver.com/v1/create-qr-code/?size='+size+'x'+size+'&data='+encodeURIComponent(text);
}
/* ============ 工具 ============ */
const mb$ = id => document.getElementById(id);
const mbLoad = (k,def) => { try{const v=localStorage.getItem(k); return v?JSON.parse(v):def;}catch(e){return def;} };
const mbSave = (k,v) => { try{localStorage.setItem(k,JSON.stringify(v));}catch(e){} };
const toast = (msg) => { const t=mb$('mb-toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove('show'),2600); };
const fmt = t => { if(!isFinite(t)||t<0)t=0; return Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0'); };
const uid = () => 'id_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ============ 状态 ============ */
const audio = new Audio();
audio.volume = 0.8;

const MODES = [
  {key:'loop',label:'列表循环',icon:'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z'},
  {key:'order',label:'顺序播放',icon:'M4 6h12v2H4zm0 5h12v2H4zm0 5h8v2H4zm14 .5v-5l4 2.5z'},
  {key:'shuffle',label:'随机播放',icon:'M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4z'}
];

let state = mbLoad('mb_state', {
  user: { avatar:null, nick:'我的音乐', signature:'点击编辑签名', background:null,
    playlists:[{id:uid(),name:'默认歌单',cover:null,songs:[]}], history:[],
    recInterval: 60, recIntervalUnit: 60,
    partnerCommentMin: 30, partnerCommentMinUnit: 60,
    partnerCommentMax: 120, partnerCommentMaxUnit: 60,
    partnerChatMin: 30, partnerChatMinUnit: 60,
    partnerChatMax: 120, partnerChatMaxUnit: 60,
    replyMin: 3, replyMinUnit: 60, replyMax: 10, replyMaxUnit: 60 },
  partners: [],
  favorites: [],
  comments: {},
  mode: 'loop', volume: 0.8, currentSongId: null, currentPlId: null,
  companion: null,
  apiUrl: '', // 自定义API地址
  savedStickers: [], // 用户保存的搜狗表情包（URL数组）
  partnerStickers: [], // 对方保存的表情包（URL数组）
  partnerSearchHistory: [] // 对方搜索记录（{keyword, time}数组）
});
let proxyOnline = false;
let lyricData = null, lyricEls = [], showLyrics = true;
let chatOpen = false;
let editingPartnerId = null;
let pendingPartnerAvatar = null;
let pendingPlCover = null;
let allSongs = [];
let currentAddSongPl = null; // 当前添加歌曲的目标歌单
let currentPartnerId = null; // 当前查看的伴侣ID

function saveAll(){ mbSave('mb_state', state); }

/* 从网站总字卡库随机抽取一条文本 */
function getCardFromSite(){
  try {
    var replies = (typeof customReplies !== 'undefined' && customReplies) ? customReplies : (window._customReplies || []);
    if(replies && replies.length > 0){
      return replies[Math.floor(Math.random()*replies.length)];
    }
  } catch(e) {}
  return null;
}
function getCardOrDefault(defaultText){
  var card = getCardFromSite();
  return card || defaultText;
}

/* 从网站表情库获取表情列表 */
function getSiteStickers(){
  try {
    var lib = null;
    if(typeof window !== 'undefined' && window._stickerLibrary && Array.isArray(window._stickerLibrary)){
      lib = window._stickerLibrary;
    } else if(typeof stickerLibrary !== 'undefined' && Array.isArray(stickerLibrary)){
      lib = stickerLibrary;
    }
    if(lib){
      var filtered = lib.filter(Boolean);
      if(filtered.length > 0) return filtered;
    }
  } catch(e) {}
  return null;
}
function getStickerOrDefault(defaultArr){
  var stickers = getSiteStickers();
  return stickers || defaultArr;
}

/* ============ 表情包搜索 ============ */
// 本地表情包缓存（避免频繁请求API）
var _stickerCache = {};

// 表情包图片URL处理：静态站点无后端代理，外网图片URL直接加载
// 说明：<img> 标签加载跨域图片不受 CORS 限制，浏览器可直接渲染。
function stickerImg(url){
  if(!url) return url;
  // 本地缓存URL、代理URL、data URL直接返回
  if(url.indexOf('/sticker-cache/') === 0 || url.indexOf('/api/sticker-img') === 0 || url.indexOf('data:') === 0) return url;
  // 静态站点无后端代理，外网图片URL（https://开头等）直接返回
  return url;
}
// 全局暴露，供消息渲染等外部调用
window.stickerImg = stickerImg;

// 表情包图片加载失败处理
if (!window._stickerImgError) {
  window._stickerImgError = function(img) {
    img.onerror = null;
    img.style.opacity = '0.15';
    img.style.filter = 'grayscale(1)';
  };
}

// 本地关键词→表情图URL映射（API不可用时的兜底，覆盖200+关键词）
var LOCAL_EMOJI_MAP = {
  // === 情绪·开心 ===
  '开心':'1f60a,1f604,1f601,1f60d,1f602,1f600','高兴':'1f60a,1f604,1f601,1f60d','快乐':'1f60a,1f604,1f601','笑':'1f602,1f60a,1f604,1f605,1f606',
  '哈哈':'1f602,1f606,1f923,1f605','嘻嘻':'1f60a,1f601,1f604','嘿嘿':'1f60f,1f60a','呵呵':'1f642,1f60f',
  '大笑':'1f602,1f606,1f923','微笑':'1f642,1f60a','偷笑':'1f60a,1f60f','爆笑':'1f602,1f923,1f606',
  '乐':'1f602,1f60a,1f604','欢乐':'1f602,1f604,1f60a','乐死':'1f602,1f923,1f606',
  '乐开花':'1f602,1f606,1f605','乐呵呵':'1f60a,1f604,1f601',
  // === 情绪·难过 ===
  '难过':'1f622,1f625,1f61e,1f614','伤心':'1f622,1f625,1f61e','哭':'1f62d,1f622,1f625','悲伤':'1f622,1f625,1f61e',
  '呜呜':'1f62d,1f622','嘤嘤':'1f622,1f62d','泪':'1f622,1f625','流泪':'1f622,1f625',
  '委屈':'1f622,1f97a,1f623','心痛':'1f622,1f494,1f625','哭哭':'1f62d,1f622','眼泪':'1f622,1f625',
  '不开心':'1f61e,1f622,1f614','郁闷':'1f61e,1f614,1f611','失落':'1f61e,1f625,1f614',
  // === 情绪·生气 ===
  '生气':'1f621,1f620,1f92c','愤怒':'1f621,1f620','怒':'1f621,1f620,1f92c',
  '抓狂':'1f92c,1f621,1f620','烦':'1f611,1f620,1f92c','烦躁':'1f620,1f92c,1f611',
  '哼':'1f621,1f44e,1f620','气死了':'1f621,1f92c,1f620','不爽':'1f620,1f621,1f44e',
  // === 情绪·惊讶 ===
  '惊喜':'1f92f,1f632,2764','惊讶':'1f632,1f627,1f92f','害怕':'1f628,1f630,1f631',
  '吓':'1f628,1f631,1f92f','震惊':'1f92f,1f632,1f627','天哪':'1f92f,1f632,1f627',
  '哇':'1f632,1f92f,2764','不会吧':'1f92f,1f632,1f627','吓死':'1f628,1f631,1f630',
  // === 情绪·其他 ===
  '无聊':'1f611,1f636,1f972','尴尬':'1f642,1f644,1f976','害羞':'1f60a,1f97a,1f633',
  '无语':'1f644,1f611,1f636','懵':'1f635,1f92f,1f644','晕':'1f635,1f627,1f92f',
  '困':'1f634,1f62a,1f4a4','累':'1f614,1f62e,1f4a4','想':'1f914,1f4ad,1f60a',
  '思考':'1f914,1f4ad,1f9e0','发呆':'1f4ad,1f636,1f611','懵圈':'1f635,1f92f,1f644',
  '叹气':'1f62e,1f61f,1f614','无奈':'1f642,1f644,1f611','心累':'1f614,1f62e,1f4a4',
  '醉了':'1f635,1f634,1f92f','呵呵呵':'1f642,1f60f,1f611',
  // === 爱与情感 ===
  '爱':'2764,1f495,1f496,1f497,1f498,1f499','爱你':'2764,1f495,1f618,1f60d','喜欢':'1f60d,2764,1f495,1f4af',
  '心':'2764,1f495,1f496,1f497,1f498','爱心':'2764,1f495,1f496','心动':'1f493,1f60d,1f4af',
  '想你':'1f4ab,1f60a,2764','思念':'1f4ab,1f60a,2764','想念':'1f4ab,1f60a,2764',
  '想你啦':'1f4ab,1f60a,2764','等你':'23f3,1f4ab,2764','宝贝':'1f4af,2764,1f495',
  '在一起':'2764,1f491,1f46b','永远':'2764,1f495,267e','抱':'1f917,1f617','拥抱':'1f917,1f617',
  '亲':'1f618,1f48b','吻':'1f618,1f48b','亲亲':'1f618,1f48b,1f60d',
  '心动了':'1f493,1f60d,1f4af','喜欢你':'1f60d,2764,1f495','么么哒':'1f618,1f48b,2764',
  '比心':'1f918,2764,1f495','爱你哟':'2764,1f618,1f60d','想你了':'1f4ab,1f60a,2764',
  '心动的感觉':'1f493,1f60d,1f4af','甜':'1f36c,2764,1f60d','甜蜜':'1f36c,2764,1f495',
  '初恋':'2764,1f493,1f60d','暗恋':'1f494,1f4ab,1f60a','表白':'2764,1f498,1f618',
  // === 睡眠 ===
  '睡':'1f634,1f62a,1f4a4','睡觉':'1f634,1f62a,1f4a4','晚安':'1f319,1f634,2728',
  '早安':'2600,1f31e,2615','早':'2600,1f31e,2615','晚安宝贝':'1f319,1f634,2764',
  '好梦':'1f634,1f4ab,2728','困了':'1f634,1f62a,1f4a4','睡醒了':'1f62a,1f634,2600',
  '午安':'2600,1f31e,1f375','起床':'2600,1f31e,2615',
  // === 音乐 ===
  '音乐':'1f3b5,1f3b6,1f3a7','歌':'1f3b5,1f3b6,1f3a7,1f3b4','听':'1f3a7,1f442',
  '听歌':'1f3a7,1f3b5,1f3b6','唱歌':'1f3a4,1f3b5,1f3b6','耳机':'1f3a7',
  '旋律':'1f3b5,1f3b6,1f3b4','单曲循环':'1f501,1f3a7,1f3b5','钢琴':'1f3b9,1f3b5',
  '吉他':'1f3b8','鼓':'1f941,1f3b5','演唱会':'1f3a4,1f3a7,1f3b5',
  // === 表情动作 ===
  '赞':'1f44d,1f44f','加油':'1f44d,1f4aa,1f525','好':'1f44d,270c,1f60a',
  '加油呀':'1f44d,1f4aa,1f525','棒':'1f44d,1f44f,2b50','厉害':'1f44d,1f4aa,1f525',
  '酷':'1f60e,1f451','帅':'1f60e,1f451,1f44d','美':'1f60d,1f48b,2728',
  '鼓掌':'1f44f,1f44d','点头':'1f44d,1f642','摇头':'1f644,1f611',
  'OK':'1f44c,270c','耶':'270c,1f60a','打call':'1f64f,1f44d,1f525',
  '冲':'1f4aa,1f525,1f680','加油加油':'1f4aa,1f525,1f44d','真棒':'1f44d,1f44f,2b50',
  '点赞':'1f44d,1f44f','踩':'1f44e,1f611','拳头':'1f44a,1f4aa',
  // === 日常 ===
  '故事':'1f4d6,1f4ad,1f4dc','回忆':'1f4ad,1f4f8,1f9ed','梦':'1f4ad,1f634,2728',
  '天气':'2600,26c5,1f327,1f329','雨':'1f327,2614,1f326','晴':'2600,1f31e',
  '雪':'2744,2603,1f328','风':'1f32c,1f343','彩虹':'1f308',
  '月亮':'1f319,1f31d','太阳':'2600,1f31e','星星':'2b50,2728,1f31f',
  '云':'2601,1f326,1f327','闪电':'26a1,1f329','雾':'1f32b',
  // === 食物 ===
  '咖啡':'2615,1f375','茶':'1f375','蛋糕':'1f382,1f370','食物':'1f37d,1f354,1f35f',
  '面包':'1f35e,1f950','米饭':'1f35a,1f359','面条':'1f35c','水果':'1f34e,1f34f,1f350',
  '苹果':'1f34e','香蕉':'1f34c','葡萄':'1f347','草莓':'1f353',
  '巧克力':'1f36b','冰淇淋':'1f368,1f367','啤酒':'1f37a','酒':'1f37a,1f377',
  '汉堡':'1f354','披萨':'1f355','寿司':'1f363','甜甜圈':'1f369',
  '奶茶':'1f9cb,1f37c','火锅':'1f372','烧烤':'1f356,1f357','糖':'1f36c,1f36d',
  // === 动物 ===
  '猫':'1f408,1f431','狗':'1f415,1f436','鱼':'1f41f,1f420','鸟':'1f426,1f424',
  '兔':'1f430,1f407','熊':'1f43b,1f428','猪':'1f437,1f43d','猴':'1f435,1f412',
  '蝴蝶':'1f98b,1f40b','花':'1f339,1f33a,1f33b,1f33c','玫瑰':'1f339',
  '鸡':'1f414,1f413','鸭':'1f986,1f426','蛙':'1f438,1f439','龙':'1f409,1f432',
  '老虎':'1f42f,1f405','狮子':'1f981,1f435','大象':'1f418,1f9a3','熊猫':'1f43c,1f4a3',
  // === 礼物与庆祝 ===
  '礼物':'1f381,1f389','生日':'1f382,1f389','庆祝':'1f389,1f38a',
  '派对':'1f389,1f973','烟花':'1f386,1f385','气球':'1f388',
  '恭喜':'1f389,1f44f,2b50','红包':'1f9e7,1f381','蛋糕':'1f382,1f370',
  // === 社交 ===
  '你好':'1f44b,1f60a','再见':'1f44b,1f60a','拜拜':'1f44b,1f60a',
  '谢谢':'1f64f,1f60a,2764','抱歉':'1f647,1f625','对不起':'1f647,1f625',
  '没关系':'1f60a,270c,1f44d','好的':'1f44d,270c,1f60a',
  '好的呀':'1f60a,1f44d,2728','收到':'1f44d,270c,1f4e7','明白':'1f44d,1f642,270c',
  // === 状态 ===
  '在线':'1f7e2,270c','离线':'1f7e3,1f634','忙碌':'1f7e1,1f4a4','勿扰':'1f534,1f6ab',
  '冷':'1f976,2744,1f630','热':'1f975,2600,1f525','饿':'1f354,1f37d,1f60b',
  '渴':'1f37a,1f379,1f375','饱':'1f60b,1f370,1f37d',
  '可爱':'1f4af,1f60d,1f495','萌':'1f4af,1f60a,1f495','漂亮':'1f60d,2728,1f48b',
  '温柔':'1f60a,2764,1f495','帅气':'1f60e,1f451,1f44d',
  // === 活动 ===
  '拍照':'1f4f7,1f4f8','自拍':'1f4f9,1f60a','视频':'1f4f9,1f3a5',
  '游戏':'1f3ae,1f47e,1f3b0','运动':'26bd,1f3c0,1f3c4','读书':'1f4da,1f4d6,1f4f0',
  '工作':'1f4bc,1f4bb,1f4a4','旅行':'2708,1f6f6,1f3d4','放假':'1f389,1f3e0,1f60a',
  '逛街':'1f6cd,1f370,1f60a','跑步':'1f3c3,1f3cb','游泳':'1f3ca,1f30a',
  '电影':'1f3a5,1f37f','购物':'1f6cd,1f381','做饭':'1f373,1f461',
  // === 节日 ===
  '新年':'1f389,1f38e,1f39b','春节':'1f389,1f9fb,1f380','圣诞':'1f384,1f385,2744',
  '情人节':'2764,1f498,1f48b','中秋':'1f319,1f391,1f36e','元旦':'1f389,1f39b,1f39e',
  // === 特殊/动漫角色 ===
  '八条':'1f4af,2764,1f495,1f60d,2b50,1f493','五条':'1f4af,2764,1f60d,1f451,2b50',
  '角色':'1f3ad,1f47c,1f464','动漫':'1f3ad,1f4af,2728,1f47c',
  '英雄':'1f451,1f4af,1f6e0','战斗':'2694,1f4a5,1f6e1','魔法':'2728,1f4ab,1f52e',
  '能量':'26a1,1f525,1f4a5','热血':'1f525,1f4aa,2694',
  // === 网络/流行语 ===
  '666':'1f44d,1f44f,2b50','牛':'1f42e,1f44d,1f44f','哇塞':'1f632,2764,2b50',
  '扎心':'1f494,1f622,1f627','社死':'1f635,1f976,1f633','躺平':'1f634,1f636,1f4a4',
  '打工人':'1f4bc,1f4aa,1f4a4','干饭':'1f35a,1f370,1f60b','集美':'1f491,1f46b,2764',
  '绝绝子':'1f44d,1f44f,2b50,2728','yyds':'1f451,2b50,1f44d','emo':'1f622,1f614,1f61e',
  '贴贴':'1f917,2764,1f495','好家伙':'1f92f,1f632,1f627','破防':'1f622,1f494,1f627',
  '拿捏':'1f4af,1f44c,1f60e','上头':'1f493,1f60d,1f4af','磕到了':'2764,1f495,1f491',
  // === 符号/手势 ===
  '手指心':'1f918,2764,1f495','比耶':'270c,1f60a','握手':'1f91d,1f44d',
  '祈祷':'1f64f,2764,1f495','拳头':'1f44a,1f4aa,1f91e','比心心':'1f918,2764,1f495',
  // === 自然/风景 ===
  '海':'1f30a,1f4a6,1f3d4','山':'26f0,1f3d4,1f303','树':'1f332,1f333,1f334',
  '草':'1f33f,1f33e','沙漠':'1f3dc,2600,1f3d4','星空':'2b50,2728,1f30c',
  '日落':'1f307,1f31e,2600','日出':'1f305,1f31e,2600','银河':'1f30c,2b50,2728',
  // === 时间 ===
  '今天':'1f4c5,1f31e,2600','明天':'1f4c5,1f319,2b50','周末':'1f389,1f31e,1f319',
  '放假啦':'1f389,1f3e0,1f60a','新年好':'1f389,1f38e,1f39b',
};
// Emoji代码转Twemoji图片URL
function emojiCodeToUrl(code){
  return 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/' + code + '.png';
}
// 从本地映射搜索表情（精确匹配 + 模糊匹配 + 拼音首字母匹配）
function searchLocalStickers(keyword){
  if(!keyword) return [];
  var kw = keyword.trim().toLowerCase();
  var results = [];
  // 精确匹配
  if(LOCAL_EMOJI_MAP[kw]){
    LOCAL_EMOJI_MAP[kw].split(',').forEach(function(code){
      results.push(emojiCodeToUrl(code));
    });
  }
  // 模糊匹配（包含关系）
  for(var key in LOCAL_EMOJI_MAP){
    if(key !== kw && (key.indexOf(kw) !== -1 || kw.indexOf(key) !== -1)){
      LOCAL_EMOJI_MAP[key].split(',').forEach(function(code){
        var url = emojiCodeToUrl(code);
        if(results.indexOf(url) === -1) results.push(url);
      });
    }
  }
  // 如果没有匹配，返回一些通用表情（确保总有结果）
  if(results.length === 0){
    var generic = ['1f60a,1f604,1f642,2764,1f44d,2b50,1f4af'];
    generic.forEach(function(codes){
      codes.split(',').forEach(function(code){
        results.push(emojiCodeToUrl(code));
      });
    });
  }
  return results;
}

// 搜索表情包（前端多源 + 本地兜底，不依赖后端代理）
async function searchSogouStickers(keyword){
  if(!keyword || !keyword.trim()) return [];
  var kw = keyword.trim().slice(0,20);
  // 检查缓存
  if(_stickerCache[kw] !== undefined) return _stickerCache[kw];
  // 先准备本地兜底结果
  var localResults = searchLocalStickers(kw);
  // 多源在线搜索（并行执行，任一失败不影响其他）
  var results = [];
  var sources = [
    trySearchWithProxy(kw),
    tryGiphySearch(kw)
  ];
  try {
    var settled = await Promise.allSettled(sources);
    for(var i = 0; i < settled.length; i++){
      if(settled[i].status === 'fulfilled' && settled[i].value && settled[i].value.length > 0){
        results = results.concat(settled[i].value);
      }
    }
  } catch(e){}
  // 合并本地结果（本地结果作为补充）
  localResults.forEach(function(url){
    if(results.indexOf(url) === -1) results.push(url);
  });
  // 去重
  var unique = [];
  var seen = {};
  for(var i = 0; i < results.length; i++){
    if(!seen[results[i]]){
      seen[results[i]] = true;
      unique.push(results[i]);
    }
  }
  if(unique.length > 0){
    _stickerCache[kw] = unique;
    return unique;
  }
  // 最终兜底：返回本地结果
  _stickerCache[kw] = localResults;
  return localResults;
}

// 使用 CORS 代理搜索搜狗表情
async function trySearchWithProxy(kw){
  // 搜狗表情搜索 API
  var apiUrl = 'https://pic.sogou.com/pics/json.jsp?q=' + encodeURIComponent(kw) + '&queryType=face&start=0&xmlLen=20&reqFrom=wap';
  // 尝试多个 CORS 代理
  var proxies = [
    function(url){ return 'https://corsproxy.io/?url=' + encodeURIComponent(url); },
    function(url){ return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url); },
    function(url){ return 'https://cors-anywhere.herokuapp.com/' + url; }
  ];
  for(var i = 0; i < proxies.length; i++){
    try {
      var proxyUrl = proxies[i](apiUrl);
      var resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(6000) });
      if(!resp.ok) continue;
      var text = await resp.text();
      // 搜狗返回的不是标准 JSON，可能是 JSONP 或其他格式
      try {
        var data = JSON.parse(text);
        if(data.items && Array.isArray(data.items)){
          return data.items.map(function(item){
            return item.picUrl || item.oriUrl || item.imgUrl;
          }).filter(function(url){ return url && url.indexOf('http') === 0; });
        }
        if(data.data && Array.isArray(data.data)){
          return data.data.map(function(item){
            return item.url || item.picUrl || item.oriUrl;
          }).filter(function(url){ return url && url.indexOf('http') === 0; });
        }
      } catch(e){
        // 尝试从文本中提取图片 URL
        var urls = text.match(/https?:\/\/[^"'\s]+\.(?:jpg|png|gif|webp)/gi);
        if(urls && urls.length > 0){
          return urls.slice(0, 20);
        }
      }
    } catch(e){}
  }
  return [];
}

// 使用 Giphy API 搜索 GIF 表情
async function tryGiphySearch(kw){
  // Giphy 公开 API（公开 beta key）
  var apiKey = 'dc6zaTOxFJmzC';
  var apiUrl = 'https://api.giphy.com/v1/gifs/search?q=' + encodeURIComponent(kw) + '&api_key=' + apiKey + '&limit=20&rating=r';
  try {
    var resp = await fetch(apiUrl, { signal: AbortSignal.timeout(6000) });
    if(!resp.ok) return [];
    var data = await resp.json();
    if(data.data && Array.isArray(data.data)){
      return data.data.map(function(gif){
        return gif.images && gif.images.fixed_height && gif.images.fixed_height.url;
      }).filter(function(url){ return url; });
    }
  } catch(e){}
  return [];
}

// 保存表情包到本地
function saveSticker(url){
  if(!url) return;
  if(!state.savedStickers) state.savedStickers = [];
  if(state.savedStickers.indexOf(url) !== -1) return; // 已存在
  state.savedStickers.push(url);
  if(state.savedStickers.length > 100) state.savedStickers = state.savedStickers.slice(-100);
  saveAll();
}

// 删除已保存的表情包
function removeSavedSticker(url){
  if(!state.savedStickers) return;
  var idx = state.savedStickers.indexOf(url);
  if(idx !== -1){
    state.savedStickers.splice(idx,1);
    saveAll();
  }
}

// 检查表情包是否已保存
function isStickerSaved(url){
  return state.savedStickers && state.savedStickers.indexOf(url) !== -1;
}

// 从字卡文本提取搜索关键词（取前2-4个字）
function extractKeywordsFromCard(cardText){
  if(!cardText) return '';
  var text = cardText.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g,'');
  if(text.length <= 4) return text;
  return text.slice(0,4);
}

// 渲染"我的表情"标签页内容（已保存的表情包 + 网站表情库）
function renderMyStickers(){
  var container = mb$('stickerMineContent');
  if(!container) return;
  var html = '';
  // 已保存的搜狗表情包
  var saved = state.savedStickers || [];
  if(saved.length > 0){
    html += '<div class="sticker-saved-section">';
    html += '<div class="sticker-saved-label">已保存 ('+saved.length+')</div>';
    html += '<div class="sticker-grid">';
    saved.forEach(function(url){
      html += '<div class="sticker-grid-item" data-sticker-url="'+esc(url)+'" data-type="img">';
      html += '<img src="'+esc(stickerImg(url))+'" loading="lazy" onerror="window._stickerImgError&&window._stickerImgError(this)">';
      html += '<span class="sticker-save saved" title="点击删除">×</span>';
      html += '</div>';
    });
    html += '</div></div>';
  }
  // 网站表情库
  var stickers = getSiteStickers();
  if(stickers && stickers.length > 0){
    html += '<div class="sticker-saved-section">';
    html += '<div class="sticker-saved-label">网站表情库</div>';
    html += '<div class="sticker-grid">';
    stickers.forEach(function(s){
      if(typeof s === 'string'){
        html += '<span class="emoji-item" data-emoji="'+esc(s)+'">'+s+'</span>';
      } else if(s.url){
        html += '<div class="sticker-grid-item" data-sticker-url="'+esc(s.url)+'" data-type="img"><img src="'+esc(stickerImg(s.url))+'" loading="lazy" onerror="window._stickerImgError&&window._stickerImgError(this)"></div>';
      } else if(s.src){
        html += '<div class="sticker-grid-item" data-sticker-url="'+esc(s.src)+'" data-type="img"><img src="'+esc(stickerImg(s.src))+'" loading="lazy" onerror="window._stickerImgError&&window._stickerImgError(this)"></div>';
      }
    });
    html += '</div></div>';
  }
  // 默认emoji
  html += '<div class="sticker-saved-section">';
  html += '<div class="sticker-saved-label">Emoji</div>';
  var defaults=['😊','😂','🥰','😴','🎵','💕','🌙','☕','🔥','✨','🎧','🌧️','🤔','👀','💅'];
  html += defaults.map(function(e){ return '<span class="emoji-item" data-emoji="'+e+'">'+e+'</span>'; }).join('');
  html += '</div>';
  container.innerHTML = html;
}

// 渲染搜索结果
function renderStickerSearchResults(urls){
  var container = mb$('stickerSearchContent');
  if(!container) return;
  _lastSearchResults = urls || [];
  if(!urls || urls.length === 0){
    container.innerHTML = '<div class="sticker-search-error">未找到相关表情包<br>换个关键词试试吧</div>';
    return;
  }
  var html = '<div class="sticker-grid">';
  urls.forEach(function(url){
    var saved = isStickerSaved(url);
    html += '<div class="sticker-grid-item" data-sticker-url="'+esc(url)+'" data-type="img">';
    html += '<img src="'+esc(stickerImg(url))+'" loading="lazy" onerror="window._stickerImgError&&window._stickerImgError(this)">';
    html += '<span class="sticker-save'+(saved?' saved':'')+'" title="'+(saved?'已保存':'点击保存')+'">'+(saved?'✓':'+')+'</span>';
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

// 当前表情栏标签页
var _stickerTab = 'emoji';
// 搜索面板当前查看的对象（mine/partner）
var _searchOwner = 'mine';
// 当前搜索结果缓存（用于"保存全部"）
var _lastSearchResults = [];

// 切换标签页（表情/表情包/拍一拍/搜狗搜索）
function switchStickerTab(tab){
  _stickerTab = tab;
  document.querySelectorAll('.sticker-tab').forEach(function(t){
    t.classList.toggle('active', t.dataset.stab === tab);
  });
  // 隐藏所有面板
  var panels = ['stickerEmojiPanel','stickerPackPanel','stickerPatPanel','stickerSearchPanel'];
  panels.forEach(function(id){ var el = mb$(id); if(el) el.style.display = 'none'; });
  if(tab === 'emoji'){
    var p = mb$('stickerEmojiPanel'); if(p) p.style.display = '';
    renderMyStickers();
  } else if(tab === 'pack'){
    var p = mb$('stickerPackPanel'); if(p) p.style.display = '';
    renderStickerPackView();
  } else if(tab === 'pat'){
    var p = mb$('stickerPatPanel'); if(p) p.style.display = '';
    renderPatOptions();
  } else if(tab === 'search'){
    var p = mb$('stickerSearchPanel'); if(p) p.style.display = '';
    // 根据当前owner渲染对应内容
    if(_searchOwner === 'partner'){
      renderPartnerSearchView();
    } else {
      // 如果有上次搜索结果，保持显示；否则显示提示
      var sc = mb$('stickerSearchContent');
      if(sc && !sc.innerHTML.trim()){
        sc.innerHTML = '<div class="sticker-search-hint">输入关键词搜索搜狗表情包</div>';
      }
    }
    setTimeout(function(){ mb$('stickerSearchInput') && mb$('stickerSearchInput').focus(); },100);
  }
}

// 切换搜索面板的"我的/他的"
function switchSearchOwner(owner){
  _searchOwner = owner;
  document.querySelectorAll('.owner-tab').forEach(function(t){
    t.classList.toggle('active', t.dataset.owner === owner);
  });
  if(owner === 'partner'){
    renderPartnerSearchView();
  } else {
    // 恢复"我的"搜索结果
    var sc = mb$('stickerSearchContent');
    if(_lastSearchResults.length > 0){
      renderStickerSearchResults(_lastSearchResults);
    } else {
      sc.innerHTML = '<div class="sticker-search-hint">输入关键词搜索搜狗表情包</div>';
    }
  }
}

// 渲染拍一拍选项
function renderPatOptions(){
  var container = mb$('stickerPatContent');
  if(!container) return;
  var pats = [
    '拍了拍你','拍了拍你的头','拍了拍你的脸','拍了拍你的肩',
    '拍了拍你的背','揉了揉你的脸','戳了戳你','抱了抱你',
    '捏了捏你的脸','蹭了蹭你','摸了摸你的头','牵起你的手'
  ];
  var html = '<div class="sticker-saved-label">点击发送拍一拍</div>';
  html += '<div class="pat-grid">';
  pats.forEach(function(p){
    html += '<span class="pat-item" data-pat="'+esc(p)+'">'+esc(p)+'</span>';
  });
  html += '</div>';
  container.innerHTML = html;
}

// === 网络表情包标签页 ===
var _mbPackCache = {}; // packId -> items[]
var _mbPackTarget = 'mine'; // mine / partner

function renderStickerPackView(){
  var container = mb$('stickerPackContent');
  if(!container) return;
  var html = '';
  // 添加目标选择行
  html += '<div style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid var(--border-color);margin-bottom:8px;">';
  html += '<span style="font-size:11px;color:var(--text-secondary);">添加到：</span>';
  html += '<span class="mb-pack-target'+(_mbPackTarget==='mine'?' active':'')+'" data-target="mine" style="padding:3px 10px;font-size:11px;cursor:pointer;border-radius:12px;border:1px solid '+(_mbPackTarget==='mine'?'var(--accent-color)':'var(--border-color)')+';background:'+(_mbPackTarget==='mine'?'var(--accent-color)':'var(--secondary-bg)')+';color:'+(_mbPackTarget==='mine'?'#fff':'var(--text-secondary)')+';">我的</span>';
  html += '<span class="mb-pack-target'+(_mbPackTarget==='partner'?' active':'')+'" data-target="partner" style="padding:3px 10px;font-size:11px;cursor:pointer;border-radius:12px;border:1px solid '+(_mbPackTarget==='partner'?'var(--accent-color)':'var(--border-color)')+';background:'+(_mbPackTarget==='partner'?'var(--accent-color)':'var(--secondary-bg)')+';color:'+(_mbPackTarget==='partner'?'#fff':'var(--text-secondary)')+';">对方</span>';
  html += '</div>';
  // 表情包列表容器
  html += '<div id="mb-pack-list" style="min-height:100px;"></div>';
  // 表情包详情容器
  html += '<div id="mb-pack-detail" style="display:none;"></div>';
  container.innerHTML = html;

  // 绑定目标切换
  container.querySelectorAll('.mb-pack-target').forEach(function(btn){
    btn.onclick = function(e){
      e.stopPropagation();
      _mbPackTarget = btn.dataset.target;
      renderStickerPackView(); // 重新渲染
    };
  });

  // 加载表情包列表
  var listEl = mb$('mb-pack-list');
  if(listEl){
    listEl.innerHTML = '<div style="text-align:center;padding:20px;font-size:12px;color:var(--text-secondary);">加载中…</div>';
    fetch('/api/sticker-packs').then(function(r){return r.json();}).then(function(data){
      if(data.code !== 200 || !data.packs){
        listEl.innerHTML = '<div style="text-align:center;padding:20px;font-size:12px;color:var(--text-secondary);">加载失败</div>';
        return;
      }
      var gridHtml = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">';
      data.packs.forEach(function(pack){
        gridHtml += '<div class="mb-pack-item" data-pack-id="'+esc(pack.id)+'" data-pack-name="'+esc(pack.name)+'" data-pack-icon="'+esc(pack.icon)+'" style="display:flex;flex-direction:column;align-items:center;padding:12px 4px;border-radius:10px;cursor:pointer;background:var(--secondary-bg);transition:all 0.2s;border:1px solid transparent;">';
        gridHtml += '<div style="font-size:28px;margin-bottom:4px;">'+pack.icon+'</div>';
        gridHtml += '<div style="font-size:11px;color:var(--text-primary);text-align:center;">'+esc(pack.name)+'</div>';
        gridHtml += '</div>';
      });
      gridHtml += '</div>';
      listEl.innerHTML = gridHtml;

      // 绑定点击
      listEl.querySelectorAll('.mb-pack-item').forEach(function(item){
        item.onmouseover = function(){ item.style.borderColor='var(--accent-color)'; item.style.transform='scale(1.05)'; };
        item.onmouseout = function(){ item.style.borderColor='transparent'; item.style.transform='scale(1)'; };
        item.onclick = function(e){
          e.stopPropagation();
          openMbPackDetail(item.dataset.packId, item.dataset.packName, item.dataset.packIcon);
        };
      });
    }).catch(function(){
      listEl.innerHTML = '<div style="text-align:center;padding:20px;font-size:12px;color:var(--text-secondary);">网络错误</div>';
    });
  }
}

function openMbPackDetail(packId, packName, packIcon){
  var listEl = mb$('mb-pack-list');
  var detailEl = mb$('mb-pack-detail');
  if(!listEl || !detailEl) return;
  listEl.style.display = 'none';
  detailEl.style.display = 'block';
  detailEl.innerHTML = '';

  // 头部
  var headerHtml = '<div style="display:flex;align-items:center;gap:8px;padding:0 0 8px;border-bottom:1px solid var(--border-color);margin-bottom:8px;">';
  headerHtml += '<button id="mb-pack-back" style="background:none;border:none;cursor:pointer;color:var(--accent-color);font-size:14px;padding:4px;">← 返回</button>';
  headerHtml += '<span style="font-size:14px;">'+packIcon+' '+esc(packName)+'</span>';
  headerHtml += '<button id="mb-pack-addall" style="margin-left:auto;background:var(--accent-color);color:#fff;border:none;border-radius:12px;padding:4px 12px;font-size:11px;cursor:pointer;">全部添加</button>';
  headerHtml += '</div>';
  detailEl.innerHTML = headerHtml;

  var loadingHtml = '<div id="mb-pack-loading" style="text-align:center;padding:20px;font-size:12px;color:var(--text-secondary);">加载表情包内容…</div>';
  detailEl.innerHTML += loadingHtml;

  mb$('mb-pack-back').onclick = function(e){
    e.stopPropagation();
    detailEl.style.display = 'none';
    listEl.style.display = 'block';
  };

  // 检查缓存
  if(_mbPackCache[packId]){
    renderMbPackItems(detailEl, _mbPackCache[packId]);
    return;
  }

  fetch('/api/sticker-pack-items', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({id: packId})
  }).then(function(r){return r.json();}).then(function(data){
    var items = (data.code === 200 && data.res) ? data.res : [];
    _mbPackCache[packId] = items;
    renderMbPackItems(detailEl, items);
  }).catch(function(){
    var ld = mb$('mb-pack-loading');
    if(ld) ld.innerHTML = '加载失败，请返回重试';
  });
}

function renderMbPackItems(detailEl, items){
  var loadingEl = mb$('mb-pack-loading');
  if(loadingEl) loadingEl.remove();
  if(items.length === 0){
    detailEl.innerHTML += '<div style="text-align:center;padding:20px;font-size:12px;color:var(--text-secondary);">该表情包暂无内容</div>';
    return;
  }
  var html = '<div class="sticker-grid">';
  items.forEach(function(url){
    var saved = _mbPackTarget === 'mine' ? (state.savedStickers && state.savedStickers.indexOf(url) !== -1) : (state.partnerStickers && state.partnerStickers.indexOf(url) !== -1);
    html += '<div class="sticker-grid-item" data-sticker-url="'+esc(url)+'" data-type="img">';
    html += '<img src="'+esc(stickerImg(url))+'" loading="lazy" onerror="window._stickerImgError&&window._stickerImgError(this)">';
    html += '<span class="sticker-save mb-pack-add'+(saved?' saved':'')+'" title="'+(saved?'已添加':'点击添加')+'">'+(saved?'✓':'+')+'</span>';
    html += '</div>';
  });
  html += '</div>';
  detailEl.innerHTML += html;

  // 绑定图片点击发送
  detailEl.querySelectorAll('.sticker-grid-item img').forEach(function(img){
    img.onclick = function(e){
      e.stopPropagation();
      var url = img.parentNode.dataset.stickerUrl;
      sendStickerFromChat(url);
    };
  });

  // 绑定添加按钮
  detailEl.querySelectorAll('.mb-pack-add').forEach(function(btn){
    btn.onclick = function(e){
      e.stopPropagation();
      var url = btn.parentNode.dataset.stickerUrl;
      mbPackAddToggle(url, btn);
    };
  });

  // 全部添加按钮
  var addAllBtn = mb$('mb-pack-addall');
  if(addAllBtn){
    addAllBtn.onclick = function(e){
      e.stopPropagation();
      var count = 0;
      items.forEach(function(url){
        if(mbPackAddSilent(url)) count++;
      });
      detailEl.querySelectorAll('.mb-pack-add').forEach(function(btn){
        btn.classList.add('saved');
        btn.textContent = '✓';
        btn.title = '已添加';
      });
      toast('已添加 '+count+' 个表情到'+(_mbPackTarget==='mine'?'我的表情库':'对方表情库'));
    };
  }
}

function mbPackAddSilent(url){
  if(_mbPackTarget === 'mine'){
    if(!state.savedStickers) state.savedStickers = [];
    if(state.savedStickers.indexOf(url) !== -1) return false;
    state.savedStickers.push(url);
    if(state.savedStickers.length > 200) state.savedStickers = state.savedStickers.slice(-200);
    saveAll();
    return true;
  } else {
    if(!state.partnerStickers) state.partnerStickers = [];
    if(state.partnerStickers.indexOf(url) !== -1) return false;
    state.partnerStickers.push(url);
    if(state.partnerStickers.length > 200) state.partnerStickers = state.partnerStickers.slice(-200);
    saveAll();
    return true;
  }
}

function mbPackAddToggle(url, btn){
  var added = mbPackAddSilent(url);
  if(added){
    btn.classList.add('saved');
    btn.textContent = '✓';
    btn.title = '已添加';
    toast('已添加到'+(_mbPackTarget==='mine'?'我的表情库':'对方表情库'));
  } else {
    // 已存在则删除
    if(_mbPackTarget === 'mine'){
      removeSavedSticker(url);
    } else {
      if(state.partnerStickers){
        var idx = state.partnerStickers.indexOf(url);
        if(idx !== -1) state.partnerStickers.splice(idx, 1);
        saveAll();
      }
    }
    btn.classList.remove('saved');
    btn.textContent = '+';
    btn.title = '点击添加';
    toast('已移除');
  }
}

// 发送表情包到聊天
function sendStickerFromChat(url){
  if(!url) return;
  var body = mb$('chatBody');
  if(!body) return;
  var myAvatar = getMyChatAvatar();
  var time = new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
  body.innerHTML += '<div class="chat-msg me"><div class="chat-av">'+myAvatar+'</div><div class="bubble" style="padding:4px;"><img src="'+esc(url)+'" style="max-width:120px;max-height:120px;border-radius:8px;cursor:pointer;" onclick="this.style.transform=this.style.transform===\'scale(2)\'?\'scale(1)\':\'scale(2)\'"></div></div>';
  body.scrollTop = body.scrollHeight;
}

// 渲染"他的"搜索视图（搜索记录 + 对方表情库）
function renderPartnerSearchView(){
  var container = mb$('stickerSearchContent');
  if(!container) return;
  var html = '';
  // 对方搜索记录
  var history = state.partnerSearchHistory || [];
  html += '<div class="sticker-saved-section">';
  html += '<div class="sticker-saved-label">搜索记录 ('+history.length+')</div>';
  if(history.length === 0){
    html += '<div class="partner-history-empty">对方还没有搜索记录</div>';
  } else {
    history.slice().reverse().forEach(function(h){
      html += '<div class="partner-history-item" data-history-kw="'+esc(h.keyword)+'">';
      html += '<span class="partner-history-kw">🔍 '+esc(h.keyword)+'</span>';
      html += '<span class="partner-history-time">'+esc(h.timeStr||'')+'</span>';
      html += '</div>';
    });
  }
  html += '</div>';
  // 对方表情库
  var partnerStickers = state.partnerStickers || [];
  html += '<div class="sticker-saved-section">';
  html += '<div class="sticker-saved-label">他的表情库 ('+partnerStickers.length+')</div>';
  if(partnerStickers.length === 0){
    html += '<div class="partner-history-empty">对方还没有保存表情包</div>';
  } else {
    html += '<div class="sticker-grid">';
    partnerStickers.forEach(function(url){
      html += '<div class="sticker-grid-item" data-sticker-url="'+esc(url)+'" data-type="img">';
      html += '<img src="'+esc(stickerImg(url))+'" loading="lazy" onerror="window._stickerImgError&&window._stickerImgError(this)">';
      html += '</div>';
    });
    html += '</div>';
  }
  html += '</div>';
  container.innerHTML = html;
}

// 保存对方表情包
function savePartnerSticker(url){
  if(!url) return;
  if(!state.partnerStickers) state.partnerStickers = [];
  if(state.partnerStickers.indexOf(url) !== -1) return;
  state.partnerStickers.push(url);
  if(state.partnerStickers.length > 100) state.partnerStickers = state.partnerStickers.slice(-100);
  saveAll();
}

// 记录对方搜索历史
function addPartnerSearchHistory(keyword){
  if(!keyword) return;
  if(!state.partnerSearchHistory) state.partnerSearchHistory = [];
  var now = new Date();
  var timeStr = (now.getMonth()+1)+'月'+now.getDate()+'日 '+String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  state.partnerSearchHistory.push({keyword: keyword, timeStr: timeStr, time: now.getTime()});
  if(state.partnerSearchHistory.length > 50) state.partnerSearchHistory = state.partnerSearchHistory.slice(-50);
  saveAll();
}

// 保存全部搜索结果到我的表情
function saveAllSearchResults(){
  if(_lastSearchResults.length === 0){ toast('没有可保存的表情包'); return; }
  var count = 0;
  _lastSearchResults.forEach(function(url){
    if(!state.savedStickers) state.savedStickers = [];
    if(state.savedStickers.indexOf(url) === -1){
      state.savedStickers.push(url);
      count++;
    }
  });
  if(state.savedStickers.length > 100) state.savedStickers = state.savedStickers.slice(-100);
  saveAll();
  // 更新搜索结果中的保存状态
  var sc = mb$('stickerSearchContent');
  if(sc){
    sc.querySelectorAll('.sticker-save').forEach(function(btn){
      btn.classList.add('saved');
      btn.textContent = '✓';
      btn.title = '已保存';
    });
  }
  toast('已保存 '+count+' 个表情包到我的表情');
}

/* ============ API ============ */
function getAPIBase(){
  return state.apiUrl || '';
}
async function checkProxy(){
  const base = getAPIBase();
  try{
    const r=await fetch(base+'/health',{signal:AbortSignal.timeout(3000)});
    const d=await r.json();
    proxyOnline = !!d.ok;
  }catch(e){ proxyOnline=false; }
  updateApiStatus();
}
function updateApiStatus(){
  const el=mb$('apiStatus'); const txt=mb$('apiStatusText');
  if(proxyOnline){ el.classList.add('online'); txt.textContent='已连接'; }
  else { el.classList.remove('online'); txt.textContent='未连接（可手动上传歌曲）'; }
}
async function apiGet(p){ const r=await fetch(getAPIBase()+p,{signal:AbortSignal.timeout(12000)}); if(!r.ok)throw new Error('HTTP '+r.status); return r.json(); }
async function apiPost(p,d){ const r=await fetch(getAPIBase()+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d),signal:AbortSignal.timeout(12000)}); if(!r.ok)throw new Error('HTTP '+r.status); return r.json(); }

/* ============ 页面导航 ============ */
mbRoot.querySelectorAll('.nav-item').forEach(item=>{
  item.addEventListener('click',()=>{
    const page=item.dataset.page;
    mbRoot.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    item.classList.add('active');
    mbRoot.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
    mb$('page'+page.charAt(0).toUpperCase()+page.slice(1)).classList.remove('hidden');
    if(page==='search') mb$('mb-searchInput').focus();
    if(page==='mine') updateMine();
  });
});
mb$('homeSearchInput').addEventListener('click',()=>{
  mbRoot.querySelector('.nav-item[data-page="search"]').click();
});

/* ============ 播放器核心 ============ */
function findSong(id){
  for(const pl of state.user.playlists){
    const i=pl.songs.findIndex(s=>s.id===id);
    if(i>=0) return {pl,song:pl.songs[i],index:i};
  }
  const fi=allSongs.findIndex(s=>s.id===id);
  if(fi>=0) return {pl:null,song:allSongs[fi],index:fi};
  return null;
}
function isFavorited(songId){ return state.favorites.some(f=>f.songId===songId); }

let _playRetryTimer=null;
function playSong(song){
  if(!song.src && song.neteaseId) song.src='https://music.163.com/song/media/outer/url?id='+song.neteaseId+'.mp3';
  audio.src=song.src; audio.load();
  state.currentSongId=song.id;
  const myId=song.id;
  clearTimeout(_playRetryTimer);
  if(!state.user.history.some(h=>h.id===song.id)){
    state.user.history.unshift({id:song.id,name:song.name,artist:song.artist,type:song.type,neteaseId:song.neteaseId,src:song.src,picUrl:song.picUrl,time:Date.now()});
    if(state.user.history.length>50) state.user.history.pop();
  }
  if(!allSongs.some(s=>s.id===song.id)) allSongs.push(song);
  saveAll();
  audio.play().then(()=>{ clearTimeout(_playRetryTimer); updatePlayUI(true); }).catch(()=>{});
  loadSongMeta(song);
  updateMiniPlayer(song);
  updateFullPlayer(song);
  _playRetryTimer=setTimeout(()=>{
    if(state.currentSongId===myId && audio.paused && !audio.duration){
      toast('播放失败，可能版权限制，可尝试搜索其他版本');
    }
  },5000);
  // 伴侣听歌记录
  state.partners.forEach(p=>{
    if(!p.history.some(h=>h.id===song.id)){
      p.history.unshift({id:song.id,name:song.name,artist:song.artist,neteaseId:song.neteaseId,src:song.src,time:Date.now()});
      if(p.history.length>20) p.history.pop();
    }
  });
  saveAll();
}

async function loadSongMeta(song){
  if(song.neteaseId && proxyOnline){
    apiGet('/api/song/url?id='+song.neteaseId).then(d=>{
      if(d.url){ const f=findSong(song.id); if(f){ f.song.src=d.url; saveAll();
        if(state.currentSongId===song.id){ audio.src=d.url; audio.load(); audio.play().then(()=>{ clearTimeout(_playRetryTimer); updatePlayUI(true); }).catch(()=>{ clearTimeout(_playRetryTimer); toast('播放失败，可能版权限制'); }); } } }
    }).catch(()=>{});
    apiGet('/api/song/detail?id='+song.neteaseId).then(d=>{
      if(d.detail){ const f=findSong(song.id); if(f){
        if(!song.customName) f.song.name=d.detail.name;
        f.song.artist=d.detail.artist; f.song.picUrl=d.detail.picUrl; saveAll();
        updateMiniPlayer(f.song); updateFullPlayer(f.song);
      } }
    }).catch(()=>{});
    apiGet('/api/lyric?id='+song.neteaseId).then(d=>{
      if(d.lrc){ const f=findSong(song.id); if(f){ f.song.lyrics=d.lrc; saveAll();
        if(state.currentSongId===song.id) prepareLyrics(f.song); } }
    }).catch(()=>{});
  }
}

function togglePlay(){ if(!audio.src){ toast('请先选择歌曲'); return; }
  if(audio.paused) audio.play().catch(()=>toast('播放失败')); else audio.pause(); }
function updatePlayUI(playing){
  const icon = playing ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
  mb$('mpPlay').innerHTML='<svg viewBox="0 0 24 24">'+icon+'</svg>';
  mb$('fpPlay').innerHTML='<svg viewBox="0 0 24 24">'+icon+'</svg>';
  mb$('fpDisc').classList.toggle('playing',playing);
  mb$('floatPlayer').classList.toggle('playing',playing);
  const tonearm=mb$('fpTonearm'); if(tonearm) tonearm.classList.toggle('playing',playing);
}
function getCurIndex(){ return allSongs.findIndex(s=>s.id===state.currentSongId); }
function nextTrack(){
  const n=allSongs.length; if(!n) return;
  let i=getCurIndex();
  if(state.mode==='shuffle'){ if(n>1){let r;do{r=Math.floor(Math.random()*n)}while(r===i);i=r;} else i=0; }
  else i=(i+1)%n;
  playSong(allSongs[i]);
}
function prevTrack(){
  const n=allSongs.length; if(!n) return;
  let i=getCurIndex();
  if(state.mode==='shuffle') i=Math.floor(Math.random()*n);
  else i=i<=0?n-1:i-1;
  playSong(allSongs[i]);
}
audio.addEventListener('ended',nextTrack);
audio.addEventListener('timeupdate',()=>{
  if(audio.duration){
    mb$('mpProgFill').style.width=(audio.currentTime/audio.duration*100)+'%';
    mb$('fpProgFill').style.width=(audio.currentTime/audio.duration*100)+'%';
    mb$('fpCurTime').textContent=fmt(audio.currentTime);
  }
  updateLyrics();
});
audio.addEventListener('loadedmetadata',()=>{ mb$('fpDurTime').textContent=fmt(audio.duration); });
audio.addEventListener('play',()=>updatePlayUI(true));
audio.addEventListener('pause',()=>updatePlayUI(false));

function setModeIcon(){
  const m=MODES.find(x=>x.key===state.mode)||MODES[0];
  mb$('fpModeBtn').innerHTML='<svg viewBox="0 0 24 24"><path d="'+m.icon+'"/></svg>';
}
mb$('fpModeBtn').addEventListener('click',()=>{
  const i=MODES.findIndex(m=>m.key===state.mode);
  state.mode=MODES[(i+1)%MODES.length].key; setModeIcon(); saveAll();
  toast('播放模式：'+MODES.find(m=>m.key===state.mode).label);
});
mb$('fpProgBar').addEventListener('click',e=>{ if(!audio.duration)return; const r=e.currentTarget.getBoundingClientRect(); audio.currentTime=(e.clientX-r.left)/r.width*audio.duration; });

/* 迷你播放器 */
function updateMiniPlayer(song){
  mb$('miniPlayer').classList.remove('hidden');
  mb$('mpName').textContent=song.name;
  mb$('mpArtist').textContent=song.artist||'';
  if(song.picUrl){ mb$('mpCover').innerHTML='<img src="'+esc(song.picUrl)+'">'; }
  else { mb$('mpCover').innerHTML='<div class="ph">🎵</div>'; }
  updateFloatCover(song);
}
function updateFloatCover(song){
  const fc=mb$('fpCover');
  if(!fc) return;
  if(song.picUrl){ fc.innerHTML='<img src="'+esc(song.picUrl)+'">'; }
  else { fc.innerHTML='<div class="ph">🎵</div>'; }
  // Also update global float
  if(window.MusicBuddyApp && window.MusicBuddyApp.updateGlobalFloat) window.MusicBuddyApp.updateGlobalFloat(song);
}
mb$('mpCover').addEventListener('click',()=>openFullPlayer());
mb$('mpInfo').addEventListener('click',()=>openFullPlayer());
mb$('mpPlay').addEventListener('click',togglePlay);
mb$('mpPrev').addEventListener('click',prevTrack);
mb$('mpNext').addEventListener('click',nextTrack);

/* 全屏播放器 */
function openFullPlayer(){
  var wrap=document.querySelector('#music-buddy-page .mb-app-wrap');
  if(wrap) wrap.classList.add('fp-open');
  mb$('fullPlayer').classList.add('show');
  mb$('floatPlayer').classList.remove('show');
  if(state.currentSongId){
    const f=findSong(state.currentSongId);
    if(f && f.song.lyrics) prepareLyrics(f.song);
  }
}
function closeFullPlayer(){
  mb$('fullPlayer').classList.remove('show');
  chatOpen=false; mb$('chatCard').classList.remove('show');
  // 延迟移除 fp-open，等全屏播放器滑出动画结束后再显示底层内容，防止闪现
  var wrap=document.querySelector('#music-buddy-page .mb-app-wrap');
  if(wrap){
    setTimeout(function(){
      // 确保全屏播放器确实已关闭（未被重新打开）
      if(!mb$('fullPlayer').classList.contains('show')){
        wrap.classList.remove('fp-open');
        if(state.currentSongId && state.companion) mb$('floatPlayer').classList.add('show');
      }
    },380);
  } else {
    if(state.currentSongId && state.companion) mb$('floatPlayer').classList.add('show');
  }
}
mb$('fpBack').addEventListener('click',closeFullPlayer);
mb$('fpPlay').addEventListener('click',togglePlay);
mb$('fpPrev').addEventListener('click',prevTrack);
mb$('fpNext').addEventListener('click',nextTrack);
mb$('fpPlBtn').addEventListener('click',()=>openPlaylistModal());
mb$('fpDisc').addEventListener('click',()=>{ showLyrics=!showLyrics; toggleLyricsView(); });
mb$('fpLyricToggle').addEventListener('click',()=>{ showLyrics=!showLyrics; toggleLyricsView(); });
function toggleLyricsView(){
  const disc=mb$('fpDiscArea');
  const lyrics=mb$('fpLyricsArea');
  if(showLyrics){
    disc.classList.add('lyrics-hidden');
    lyrics.classList.add('lyrics-full');
  } else {
    disc.classList.remove('lyrics-hidden');
    lyrics.classList.remove('lyrics-full');
  }
}

function updateFullPlayer(song){
  mb$('fpName').textContent=song.name||'未播放';
  mb$('fpArtist').textContent=song.artist||'';
  if(song.picUrl){ mb$('fpDiscImg').src=song.picUrl; mb$('fpDiscImg').style.display='block'; }
  else { mb$('fpDiscImg').style.display='none'; }
  updateFloatCover(song);
  const fav=isFavorited(song.id);
  mb$('fpFavBtn').classList.toggle('active',fav);
  mb$('fpFavBtn2').classList.toggle('active',fav);
  prepareLyrics(song);
}

/* 收藏 */
mb$('fpFavBtn').addEventListener('click',toggleFav);
mb$('fpFavBtn2').addEventListener('click',toggleFav);
function toggleFav(){
  if(!state.currentSongId){ toast('请先播放歌曲'); return; }
  const f=findSong(state.currentSongId); if(!f) return;
  const idx=state.favorites.findIndex(x=>x.songId===f.song.id);
  if(idx>=0){ state.favorites.splice(idx,1); toast('已取消收藏'); }
  else { state.favorites.push({songId:f.song.id,song:f.song}); toast('已收藏'); }
  saveAll();
  const fav=isFavorited(f.song.id);
  mb$('fpFavBtn').classList.toggle('active',fav);
  mb$('fpFavBtn2').classList.toggle('active',fav);
  updateMineStats();
}

/* 评论 */
mb$('fpCommentBtn').addEventListener('click',()=>openCommentModal());
function getCommentAvatar(c){
  if(c.isMe){
    if(c.avatar) return '<img src="'+c.avatar+'">';
    if(state.user.avatar) return '<img src="'+state.user.avatar+'">';
    return '<div class="ph" style="background:var(--sage);color:var(--cream);font-size:12px;display:flex;align-items:center;justify-content:center;width:100%;height:100%;">我</div>';
  } else {
    if(c.avatar) return '<img src="'+c.avatar+'">';
    const partner=state.partners.find(p=>p.nick===c.nick);
    if(partner&&partner.avatar) return '<img src="'+partner.avatar+'">';
    const p=state.partners[0];
    if(p&&p.avatar) return '<img src="'+p.avatar+'">';
    return '<div class="ph" style="background:var(--terra);color:var(--cream);font-size:12px;display:flex;align-items:center;justify-content:center;width:100%;height:100%;">TA</div>';
  }
}
function openCommentModal(){
  if(!state.currentSongId){ toast('请先播放歌曲'); return; }
  const f=findSong(state.currentSongId); if(!f) return;
  const songId=f.song.id;
  const list=state.comments[songId]||[];
  mb$('commentList').innerHTML = list.length ? list.map(c=>`
    <div class="cmt-item">
      <div class="av">${getCommentAvatar(c)}</div>
      <div class="body"><div class="nick">${esc(c.nick)}</div><div class="text">${esc(c.text)}</div><div class="time">${new Date(c.time).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div></div>
    </div>`).join('') : '<div class="empty-hint">还没有评论，来说点什么吧</div>';
  mb$('commentModal').classList.add('show');
  mb$('mb-commentInput').focus();
}
/* 追加单条评论到列表（不重新渲染整个弹窗，避免闪现） */
function appendCommentToList(c){
  var list=mb$('commentList');
  // 如果当前显示的是空提示，先清空
  var empty=list.querySelector('.empty-hint');
  if(empty) list.innerHTML='';
  var div=document.createElement('div');
  div.className='cmt-item';
  div.innerHTML='<div class="av">'+getCommentAvatar(c)+'</div>'+
    '<div class="body"><div class="nick">'+esc(c.nick)+'</div><div class="text">'+esc(c.text)+'</div>'+
    '<div class="time">'+new Date(c.time).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})+'</div></div>';
  div.style.opacity='0';
  div.style.transform='translateY(8px)';
  div.style.transition='opacity .3s, transform .3s';
  list.appendChild(div);
  // 触发渐入动画
  requestAnimationFrame(function(){
    div.style.opacity='1';
    div.style.transform='translateY(0)';
  });
  // 滚动到底部
  list.scrollTop=list.scrollHeight;
}
mb$('commentSend').addEventListener('click',async()=>{
  const text=mb$('mb-commentInput').value.trim(); if(!text){ toast('请输入评论'); return; }
  const f=findSong(state.currentSongId); if(!f) return;
  if(!state.comments[f.song.id]) state.comments[f.song.id]=[];
  // 立即追加用户评论到界面（无闪现）
  var userCmt={nick:state.user.nick||'我',avatar:state.user.avatar,text:text,time:Date.now(),isMe:true};
  state.comments[f.song.id].push(userCmt);
  saveAll();
  appendCommentToList(userCmt);
  mb$('mb-commentInput').value='';
  toast('评论已发送');
  // 延迟追加对方回复（逐条追加，不重新渲染整个弹窗）
  state.partners.forEach(function(partner,idx){
    setTimeout(function(){
      var reply=getCardOrDefault('这首歌让我想起你笑的样子。');
      var partnerCmt={nick:partner.nick,avatar:partner.avatar,text:reply,time:Date.now(),isMe:false};
      state.comments[f.song.id].push(partnerCmt);
      saveAll();
      // 只在弹窗仍然打开时追加
      if(mb$('commentModal').classList.contains('show')){
        appendCommentToList(partnerCmt);
      }
    },500+idx*400);
  });
});
mb$('mb-commentInput').addEventListener('keypress',e=>{ if(e.key==='Enter') mb$('commentSend').click(); });

/* 聊天卡片 */
mb$('fpChatBtn').addEventListener('click',()=>{
  chatOpen=!chatOpen;
  mb$('chatCard').classList.toggle('show',chatOpen);
  if(chatOpen && state.partners.length>0){
    const p=state.partners[0];
    mb$('chatPartnerName').textContent=p.nick;
    if(p.avatar){ mb$('chatPartnerAvatar').innerHTML='<img src="'+p.avatar+'">'; }
    else { mb$('chatPartnerAvatar').innerHTML='<div class="ph">👤</div>'; }
  }
});
mb$('chatClose').addEventListener('click',()=>{ chatOpen=false; mb$('chatCard').classList.remove('show'); });

// 表情栏切换 — 3个标签页：表情/拍一拍/搜狗搜索
mb$('chatEmojiBtn').addEventListener('click',()=>{
  var bar=mb$('chatEmojiBar');
  if(bar.style.display==='flex'){ bar.style.display='none'; return; }
  bar.style.display = 'flex';
  _stickerTab = 'emoji';
  _searchOwner = 'mine';
  switchStickerTab('emoji');
});
// 标签页切换 — 用document查找，因为chatCard在music-buddy-page外面
document.querySelectorAll('.sticker-tab').forEach(function(tab){
  tab.addEventListener('click',function(){
    switchStickerTab(tab.dataset.stab);
  });
});
// 搜索面板"我的/他的"切换
document.querySelectorAll('.owner-tab').forEach(function(tab){
  tab.addEventListener('click',function(){
    switchSearchOwner(tab.dataset.owner);
  });
});
// 保存全部按钮
mb$('stickerSaveAllBtn').addEventListener('click',function(){
  saveAllSearchResults();
});
// 搜索按钮
mb$('stickerSearchBtn').addEventListener('click',function(){
  doStickerSearch();
});
mb$('stickerSearchInput').addEventListener('keypress',function(e){
  if(e.key==='Enter') doStickerSearch();
});
async function doStickerSearch(){
  if(_searchOwner === 'partner'){ toast('切换到"我的"才能搜索'); return; }
  var kw = mb$('stickerSearchInput').value.trim();
  if(!kw){ toast('请输入关键词'); return; }
  mb$('stickerSearchContent').innerHTML='<div class="sticker-search-loading">搜索中…</div>';
  var results = await searchSogouStickers(kw);
  renderStickerSearchResults(results);
}
// 表情/表情包/拍一拍点击发送 + 保存按钮
mb$('chatEmojiBar').addEventListener('click',function(e){
  // 保存按钮点击
  var saveBtn = e.target.closest('.sticker-save');
  if(saveBtn){
    e.stopPropagation();
    var gridItem = saveBtn.closest('.sticker-grid-item');
    if(gridItem){
      var url = gridItem.dataset.stickerUrl;
      if(saveBtn.classList.contains('saved')){
        // 已保存 → 删除
        removeSavedSticker(url);
        saveBtn.classList.remove('saved');
        saveBtn.textContent = '+';
        saveBtn.title = '点击保存';
        toast('已删除');
        // 如果在表情标签页，移除元素
        if(_stickerTab === 'emoji'){
          gridItem.style.opacity = '0';
          setTimeout(function(){ gridItem.remove(); },300);
        }
      } else {
        // 未保存 → 保存
        saveSticker(url);
        saveBtn.classList.add('saved');
        saveBtn.textContent = '✓';
        saveBtn.title = '已保存';
        toast('已保存到我的表情');
      }
    }
    return;
  }
  // 拍一拍点击发送
  var patItem = e.target.closest('.pat-item');
  if(patItem){
    var patText = patItem.dataset.pat;
    var body=mb$('chatBody');
    var myAvatar=getMyChatAvatar();
    body.innerHTML+='<div class="chat-msg me"><div class="chat-av">'+myAvatar+'</div><div class="bubble" style="font-style:italic;color:var(--ink2);">~ '+esc(patText)+' ~</div></div>';
    body.scrollTop=body.scrollHeight;
    // 对方回应拍一拍
    if(state.partners.length>0){
      var partner=state.partners[0];
      var partnerAvatar=getPartnerChatAvatar(partner);
      var replies=['嘿嘿','干嘛拍我~','再拍一下！','喜欢你拍我','别闹啦~','再拍我就生气了！','嘻嘻','你好温柔呀'];
      var reply=replies[Math.floor(Math.random()*replies.length)];
      setTimeout(function(){
        body.innerHTML+='<div class="chat-msg them"><div class="chat-av">'+partnerAvatar+'</div><div class="bubble" style="font-style:italic;color:var(--ink2);">~ '+esc(reply)+' ~</div></div>';
        body.scrollTop=body.scrollHeight;
      },800+Math.random()*1000);
    }
    return;
  }
  // 搜索记录点击 → 重新搜索该关键词
  var historyItem = e.target.closest('.partner-history-item');
  if(historyItem){
    var kw = historyItem.dataset.historyKw;
    if(kw){
      // 切换到"我的"并搜索
      switchSearchOwner('mine');
      mb$('stickerSearchInput').value = kw;
      doStickerSearch();
    }
    return;
  }
  // emoji 点击发送
  var emojiItem = e.target.closest('.emoji-item');
  if(emojiItem){
    var emoji = emojiItem.dataset.emoji;
    var body=mb$('chatBody');
    var myAvatar=getMyChatAvatar();
    body.innerHTML+='<div class="chat-msg me"><div class="chat-av">'+myAvatar+'</div><div class="bubble emoji-bubble">'+emoji+'</div></div>';
    body.scrollTop=body.scrollHeight;
    return;
  }
  // 表情包图片点击发送
  var gridItem = e.target.closest('.sticker-grid-item');
  if(gridItem){
    var url = gridItem.dataset.stickerUrl;
    var body=mb$('chatBody');
    var myAvatar=getMyChatAvatar();
    body.innerHTML+='<div class="chat-msg me"><div class="chat-av">'+myAvatar+'</div><div class="bubble img-bubble"><img src="'+url+'" style="max-width:80px;max-height:80px;border-radius:8px;"></div></div>';
    body.scrollTop=body.scrollHeight;
  }
});
// 发送图片
mb$('chatImgBtn').addEventListener('click',()=>{ mb$('chatImgFile').click(); });
mb$('chatImgFile').addEventListener('change',function(e){
  var f=e.target.files[0]; if(!f) return; if(f.size>5*1024*1024){ toast('图片需小于5MB'); return; }
  var r=new FileReader(); r.onload=function(){
    var body=mb$('chatBody');
    var myAvatar=getMyChatAvatar();
    body.innerHTML+='<div class="chat-msg me"><div class="chat-av">'+myAvatar+'</div><div class="bubble img-bubble"><img src="'+r.result+'"></div></div>';
    body.scrollTop=body.scrollHeight;
    // 对方回复
    var partner=state.partners[0];
    if(partner){
      var partnerAvatar=getPartnerChatAvatar(partner);
      var delay=800+Math.random()*1200;
      setTimeout(function(){
        var reply=getCardOrDefault('好好看！');
        body.innerHTML+='<div class="chat-msg them"><div class="chat-av">'+partnerAvatar+'</div><div class="bubble">'+esc(reply)+'</div></div>';
        body.scrollTop=body.scrollHeight;
      },delay);
    }
  }; r.readAsDataURL(f); e.target.value='';
});
// 让对方发送消息（字卡/表情/搜狗表情包搜索）
mb$('chatPartnerSendBtn').addEventListener('click',function(){
  if(state.partners.length===0){ toast('请先添加对象'); return; }
  var partner=state.partners[0];
  var partnerAvatar=getPartnerChatAvatar(partner);
  var body=mb$('chatBody');
  var r=Math.random();
  if(r<0.5){
    // 50% 发送字卡，有概率附带搜索表情包
    var card=getCardOrDefault('这首歌好像我们的故事。');
    body.innerHTML+='<div class="chat-msg them"><div class="chat-av">'+partnerAvatar+'</div><div class="bubble">'+esc(card)+'</div></div>';
    body.scrollTop=body.scrollHeight;
    // 40%概率搜索相关表情包并追加发送
    if(Math.random()<0.4){
      partnerSendStickerFromCard(card, partner, partnerAvatar, body, 600);
    }
  } else if(r<0.75){
    // 25% 发送已保存的表情包或网站表情库
    partnerSendSavedSticker(partner, partnerAvatar, body);
  } else {
    // 25% 从字卡提取关键词搜索搜狗表情包发送
    var searchCard=getCardOrDefault('开心');
    var kw=extractKeywordsFromCard(searchCard);
    if(kw){
      body.scrollTop=body.scrollHeight;
      // 显示"正在搜索..."提示
      body.innerHTML+='<div class="chat-msg them"><div class="chat-av">'+partnerAvatar+'</div><div class="bubble" style="font-size:11px;color:var(--ink3);font-style:italic;">正在搜索表情包…</div></div>';
      body.scrollTop=body.scrollHeight;
      partnerSendSearchedSticker(kw, partner, partnerAvatar, body, 1000);
    } else {
      partnerSendSavedSticker(partner, partnerAvatar, body);
    }
  }
  body.scrollTop=body.scrollHeight;
});
// 对方发送已保存的表情包
function partnerSendSavedSticker(partner, partnerAvatar, body){
  // 优先使用已保存的搜狗表情包
  var saved = state.savedStickers || [];
  if(saved.length > 0 && Math.random() < 0.6){
    var url = saved[Math.floor(Math.random()*saved.length)];
    body.innerHTML+='<div class="chat-msg them"><div class="chat-av">'+partnerAvatar+'</div><div class="bubble img-bubble"><img src="'+url+'" style="max-width:80px;max-height:80px;border-radius:8px;"></div></div>';
    body.scrollTop=body.scrollHeight;
    return;
  }
  // 其次使用网站表情库
  var stickers=getSiteStickers();
  if(stickers && stickers.length>0){
    var pick=stickers[Math.floor(Math.random()*stickers.length)];
    if(typeof pick==='string'){
      body.innerHTML+='<div class="chat-msg them"><div class="chat-av">'+partnerAvatar+'</div><div class="bubble emoji-bubble">'+pick+'</div></div>';
    } else if(pick.url||pick.src){
      var surl=pick.url||pick.src;
      body.innerHTML+='<div class="chat-msg them"><div class="chat-av">'+partnerAvatar+'</div><div class="bubble img-bubble"><img src="'+surl+'" style="max-width:80px;max-height:80px;border-radius:8px;"></div></div>';
    }
  } else {
    var defaults=['😊','🥰','😴','🎵','💕','🌙','☕','🔥','✨','🎧','🌧️','😂','🤔','👀','💅'];
    var emoji=defaults[Math.floor(Math.random()*defaults.length)];
    body.innerHTML+='<div class="chat-msg them"><div class="chat-av">'+partnerAvatar+'</div><div class="bubble emoji-bubble">'+emoji+'</div></div>';
  }
  body.scrollTop=body.scrollHeight;
}
// 对方从字卡提取关键词搜索搜狗表情包并发送
async function partnerSendStickerFromCard(card, partner, partnerAvatar, body, delay){
  var kw = extractKeywordsFromCard(card);
  if(!kw) return;
  setTimeout(async function(){
    var results = await searchSogouStickers(kw);
    if(results && results.length > 0){
      var url = results[Math.floor(Math.random()*Math.min(results.length,10))];
      body.innerHTML+='<div class="chat-msg them"><div class="chat-av">'+partnerAvatar+'</div><div class="bubble img-bubble"><img src="'+url+'" style="max-width:80px;max-height:80px;border-radius:8px;"></div></div>';
      body.scrollTop=body.scrollHeight;
      // 自动保存到对方表情库 + 记录搜索历史
      savePartnerSticker(url);
      addPartnerSearchHistory(kw);
    }
  }, delay||500);
}
// 对方直接搜索搜狗表情包发送
async function partnerSendSearchedSticker(kw, partner, partnerAvatar, body, delay){
  setTimeout(async function(){
    var results = await searchSogouStickers(kw);
    // 移除"正在搜索..."提示
    var hints = body.querySelectorAll('.chat-msg.them .bubble[style*="italic"]');
    if(hints.length > 0){
      var lastHint = hints[hints.length-1].closest('.chat-msg.them');
      if(lastHint && lastHint.textContent.indexOf('搜索表情包') !== -1){
        lastHint.remove();
      }
    }
    if(results && results.length > 0){
      var url = results[Math.floor(Math.random()*Math.min(results.length,10))];
      body.innerHTML+='<div class="chat-msg them"><div class="chat-av">'+partnerAvatar+'</div><div class="bubble img-bubble"><img src="'+url+'" style="max-width:80px;max-height:80px;border-radius:8px;"></div></div>';
      // 自动保存到对方表情库 + 记录搜索历史
      savePartnerSticker(url);
      addPartnerSearchHistory(kw);
    } else {
      // 搜索失败，发字卡兜底
      var card=getCardOrDefault('这首歌好像我们的故事。');
      body.innerHTML+='<div class="chat-msg them"><div class="chat-av">'+partnerAvatar+'</div><div class="bubble">'+esc(card)+'</div></div>';
    }
    body.scrollTop=body.scrollHeight;
  }, delay||1000);
}
// 聊天发送
mb$('chatSend').addEventListener('click',function(){
  const text=mb$('chatInput').value.trim(); if(!text) return;
  const body=mb$('chatBody');
  const myAvatar=getMyChatAvatar();
  body.innerHTML+='<div class="chat-msg me"><div class="chat-av">'+myAvatar+'</div><div class="bubble">'+esc(text)+'</div></div>';
  mb$('chatInput').value='';
  body.scrollTop=body.scrollHeight;
  const partner=state.partners[0];
  const partnerAvatar=getPartnerChatAvatar(partner);
  const rMinMs = (state.user.replyMin || 3) * (state.user.replyMinUnit || 60) * 1000;
  const rMaxMs = (state.user.replyMax || 10) * (state.user.replyMaxUnit || 60) * 1000;
  const delay = Math.max(800, rMinMs + Math.random() * (rMaxMs - rMinMs));
  const reply=getCardOrDefault('我也在想这首歌。');
  // 对方回复：字卡 + 有概率附带搜索表情包/已保存表情包
  setTimeout(function(){
    var r = Math.random();
    if(r < 0.55){
      // 55% 发送字卡回复，有概率附带搜索表情包
      body.innerHTML+='<div class="chat-msg them"><div class="chat-av">'+partnerAvatar+'</div><div class="bubble">'+esc(reply)+'</div></div>';
      body.scrollTop=body.scrollHeight;
      // 35%概率根据字卡关键词搜索搜狗表情包追加发送
      if(Math.random() < 0.35){
        partnerSendStickerFromCard(reply, partner, partnerAvatar, body, 600);
      }
    } else if(r < 0.8){
      // 25% 发送已保存的表情包或网站表情库
      partnerSendSavedSticker(partner, partnerAvatar, body);
    } else {
      // 20% 根据用户消息提取关键词搜索搜狗表情包发送
      var userKw = extractKeywordsFromCard(text);
      if(userKw){
        body.innerHTML+='<div class="chat-msg them"><div class="chat-av">'+partnerAvatar+'</div><div class="bubble" style="font-size:11px;color:var(--ink3);font-style:italic;">正在搜索表情包…</div></div>';
        body.scrollTop=body.scrollHeight;
        partnerSendSearchedSticker(userKw, partner, partnerAvatar, body, 1000);
      } else {
        // 提取失败，用字卡兜底
        body.innerHTML+='<div class="chat-msg them"><div class="chat-av">'+partnerAvatar+'</div><div class="bubble">'+esc(reply)+'</div></div>';
        body.scrollTop=body.scrollHeight;
      }
    }
  }, delay);
});
mb$('chatInput').addEventListener('keypress',e=>{ if(e.key==='Enter') mb$('chatSend').click(); });

// 辅助函数
function getMyChatAvatar(){
  return state.user.avatar?'<img src="'+state.user.avatar+'">':'<div class="ph" style="background:var(--sage);color:var(--cream);font-size:10px;display:flex;align-items:center;justify-content:center;width:100%;height:100%;">我</div>';
}
function getPartnerChatAvatar(partner){
  return partner&&partner.avatar?'<img src="'+partner.avatar+'">':'<div class="ph" style="background:var(--terra);color:var(--cream);font-size:10px;display:flex;align-items:center;justify-content:center;width:100%;height:100%;">TA</div>';
}

/* 歌词 */
function parseLrc(raw){
  if(!raw) return {synced:false,lines:[]};
  const lines=[]; const re=/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  raw.split(/\r?\n/).forEach(line=>{
    const ms=[...line.matchAll(re)]; const text=line.replace(re,'').trim();
    if(ms.length===0){ if(text) lines.push({time:-1,text}); }
    else ms.forEach(m=>{ const t=parseInt(m[1])*60+parseInt(m[2])+(m[3]?parseInt(m[3])/(m[3].length===3?1000:100):0); if(text) lines.push({time:t,text}); });
  });
  const hasTime=lines.some(l=>l.time>=0);
  return {synced:hasTime,lines:hasTime?lines.filter(l=>l.time>=0).sort((a,b)=>a.time-b.time):lines};
}
function prepareLyrics(song){
  lyricData=parseLrc(song.lyrics||'');
  if(!mb$('fullPlayer').classList.contains('show')) return;
  if(!lyricData||lyricData.lines.length===0){
    mb$('fpLyricsScroll').innerHTML='<div class="fp-lyrics-empty">暂无歌词</div>';
    lyricEls=[]; return;
  }
  mb$('fpLyricsScroll').innerHTML=lyricData.lines.map((l,i)=>'<div class="fp-lyric-line" data-i="'+i+'">'+esc(l.text)+'</div>').join('');
  lyricEls=[...mb$('fpLyricsScroll').querySelectorAll('.fp-lyric-line')];
  lyricEls.forEach((el,i)=>el.addEventListener('click',()=>{ if(lyricData.synced&&lyricData.lines[i].time>=0&&audio.duration) audio.currentTime=lyricData.lines[i].time; }));
  updateLyrics();
}
function updateLyrics(){
  if(!mb$('fullPlayer').classList.contains('show')||!lyricData||!lyricEls.length) return;
  let cur=-1;
  if(lyricData.synced){ for(let i=0;i<lyricData.lines.length;i++){ if(lyricData.lines[i].time<=audio.currentTime) cur=i; else break; } }
  else if(audio.duration){ cur=Math.min(lyricData.lines.length-1,Math.floor(audio.currentTime/audio.duration*lyricData.lines.length)); }
  if(cur<0) return;
  lyricEls.forEach((el,i)=>el.classList.toggle('active',i===cur));
  const el=lyricEls[cur];
  if(el) mb$('fpLyricsScroll').scrollTo({top:el.offsetTop-mb$('fpLyricsScroll').clientHeight/2+el.clientHeight/2,behavior:'smooth'});
}

/* ============ 搜索 ============ */
async function doSearch(kw){
  if(!kw){ toast('请输入关键词'); return; }
  mb$('searchResults').innerHTML='<div class="sr-loading">搜索中…</div>';
  if(proxyOnline){
    try{ const d=await apiPost('/api/search',{keywords:kw,limit:20}); renderSearchResults(d.songs||[]); return; }catch(e){}
  }
  try{ const proxied='https://api.allorigins.win/raw?url='+encodeURIComponent('https://music.163.com/api/search/get?s='+encodeURIComponent(kw)+'&type=1&limit=20&offset=0');
    const res=await fetch(proxied,{signal:AbortSignal.timeout(10000)}); const d=await res.json();
    const list=(d.result&&d.result.songs)||[];
    renderSearchResults(list.map(s=>({id:s.id,name:s.name,artist:(s.artists||[]).map(a=>a.name).join('/'),album:(s.album||{}).name||'',picUrl:(s.album||{}).picUrl||(s.album||{}).picUrl||'',duration:s.duration})));
  }catch(e){ mb$('searchResults').innerHTML='<div class="sr-loading">搜索失败，请设置API地址</div>'; }
}
function renderSearchResults(songs){
  if(!songs.length){ mb$('searchResults').innerHTML='<div class="sr-loading">未找到相关歌曲</div>'; return; }
  mb$('searchResults').innerHTML=songs.map((s,i)=>`
    <div class="sr-item" data-id="${s.id}" data-name="${esc(s.name)}" data-artist="${esc(s.artist||'')}" data-pic-url="${s.picUrl||''}">
      <div class="sr-num">${String(i+1).padStart(2,'0')}</div>
      <div class="sr-info"><div class="sr-name">${esc(s.name)}</div><div class="sr-meta">${esc(s.artist||'')}${s.album?' · '+esc(s.album):''}</div></div>
      <button class="sr-add">＋</button>
    </div>`).join('');
  mb$('searchResults').querySelectorAll('.sr-item').forEach(el=>{
    el.addEventListener('click',()=>{
      const song={id:uid(),name:el.dataset.name,artist:el.dataset.artist,neteaseId:el.dataset.id,type:'netease',src:'https://music.163.com/song/media/outer/url?id='+el.dataset.id+'.mp3',picUrl:el.dataset.picUrl||'',lyrics:''};
      playSong(song);
    });
  });
}
mb$('searchBtn').addEventListener('click',()=>doSearch(mb$('mb-searchInput').value.trim()));
mb$('mb-searchInput').addEventListener('keypress',e=>{ if(e.key==='Enter') doSearch(mb$('mb-searchInput').value.trim()); });
mbRoot.querySelectorAll('.cat-card').forEach(c=>c.addEventListener('click',()=>{ mb$('mb-searchInput').value=c.dataset.kw; doSearch(c.dataset.kw); }));

/* ============ 我的页 ============ */
function updateMine(){
  if(state.user.avatar){ mb$('mineAvatar').innerHTML='<img src="'+state.user.avatar+'">'; }
  else { mb$('mineAvatar').innerHTML='<div class="ph">＋</div>'; }
  mb$('mineNick').textContent=state.user.nick;
  mb$('mineSig').textContent=state.user.signature;
  const settingsIcon='<div class="mine-settings" id="mineSettingsBtn" title="设置"><svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84a.484.484 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.488.488 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.27.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 15.6 12 3.6 3.6 0 0 1 12 15.6z"/></svg></div>';
  const uploadIcon='<div class="mine-bg-upload" id="bgUploadBtn"><svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>';
  if(state.user.background){
    mb$('mineBg').innerHTML='<img src="'+state.user.background+'"><div class="gradient"></div>'+settingsIcon+uploadIcon;
  } else {
    mb$('mineBg').innerHTML=settingsIcon+uploadIcon;
  }
  bindMineAvatar();
  bindBgUpload();
  bindSettingsBtn();
  updateMineStats();
  renderMinePlaylists();
  renderHistory();
  renderFavoritesScroll();
  mb$('apiUrlInput').value = state.apiUrl || '';
}
['statFav','statPl','statHistory'].forEach(id=>{
  mb$(id).addEventListener('click',()=>{
    const tab=mb$(id).dataset.tab;
    mb$('favSection').style.display=tab==='fav'?'block':'none';
  });
});
function updateMineStats(){
  mb$('favCount').textContent=state.favorites.length;
  mb$('plCount').textContent=state.user.playlists.length;
  mb$('historyCount').textContent=state.user.history.length;
}

/* 歌单列表 - 图4横向卡片 */
function renderMinePlaylists(){
  if(!state.user.playlists.length){ mb$('plList').innerHTML='<div class="empty-hint">还没有歌单<br>点击上方按钮创建</div>'; return; }
  mb$('plList').innerHTML=state.user.playlists.map(p=>`
    <div class="pl-card" data-id="${p.id}">
      <div class="pl-cover">${p.cover?'<img src="'+p.cover+'">':'<div class="ph">🎵</div>'}</div>
      <div class="pl-info">
        <div class="pl-name">${esc(p.name)}</div>
        <div class="pl-count">${p.songs.length}首</div>
      </div>
      <span class="pl-del" data-del="${p.id}" style="color:var(--terra);padding:8px;font-size:16px;cursor:pointer;">✕</span>
    </div>`).join('');
  mb$('plList').querySelectorAll('.pl-card').forEach(el=>{
    el.addEventListener('click',e=>{
      if(e.target.dataset.del){ deletePlaylist(e.target.dataset.del); return; }
      state.currentPlId=el.dataset.id; saveAll();
      openPlaylistModal();
    });
  });
}
function deletePlaylist(id){
  const pl=state.user.playlists.find(p=>p.id===id);
  if(!pl) return;
  if(pl.songs.length>0 && !confirm('确定删除歌单「'+pl.name+'」吗？')) return;
  const i=state.user.playlists.findIndex(p=>p.id===id);
  if(i>=0) state.user.playlists.splice(i,1);
  saveAll(); renderMinePlaylists(); updateMineStats();
  toast('歌单已删除');
}

function renderHistory(){
  const el=mb$('historyList');
  const hCount=mb$('historySectionCount'); if(hCount) hCount.textContent=state.user.history.length;
  if(!state.user.history.length){ el.innerHTML='<div class="empty-hint">还没有听歌记录</div>'; return; }
  el.innerHTML=state.user.history.slice(0,30).map((s,i)=>`
    <div class="song-item" data-id="${s.id}">
      <div class="si-num">${String(i+1).padStart(2,'0')}</div>
      <div class="si-info"><div class="si-name ${s.id===state.currentSongId?'playing':''}">${esc(s.name)}</div><div class="si-artist">${esc(s.artist||'')}</div></div>
    </div>`).join('');
  el.querySelectorAll('.song-item').forEach(c=>c.addEventListener('click',()=>playSongById(c.dataset.id)));
}
function renderFavoritesScroll(){
  const el=mb$('favScroll');
  if(!state.favorites.length){ el.innerHTML='<div class="empty-hint">还没有收藏歌曲</div>'; return; }
  el.innerHTML=state.favorites.map(f=>{
    const s=f.song||f;
    return `<div class="daily-card" data-id="${s.id}">
      <div class="cover">${s.picUrl?'<img src="'+s.picUrl+'" style="width:100%;height:100%;object-fit:cover">':'<div class="emoji">♥</div>'}</div>
      <div class="info"><div class="name">${esc(s.name)}</div><div class="artist">${esc(s.artist||'')}</div></div>
    </div>`;
  }).join('');
  el.querySelectorAll('.daily-card').forEach(c=>c.addEventListener('click',()=>{
    const f=state.favorites.find(x=>(x.song||x).id===c.dataset.id);
    if(f) playSong(f.song||f);
  }));
}
function playSongById(id){
  const f=findSong(id); if(f) playSong(f.song);
}

/* 新建歌单 */
mb$('newPlBtn').addEventListener('click',()=>{
  pendingPlCover=null;
  mb$('newPlName').value='';
  mb$('plCoverUpload').querySelector('.preview').innerHTML='<div class="ph">＋</div>';
  mb$('newPlModal').classList.add('show');
  mb$('newPlName').focus();
});
mb$('plCoverUpload').addEventListener('click',()=>mb$('plCoverFile').click());
mb$('plCoverFile').addEventListener('change',e=>{
  const f=e.target.files[0]; if(!f) return; if(f.size>3*1024*1024){ toast('图片需小于3MB'); return; }
  const r=new FileReader(); r.onload=()=>{
    pendingPlCover=r.result;
    mb$('plCoverUpload').querySelector('.preview').innerHTML='<img src="'+r.result+'">';
  }; r.readAsDataURL(f); e.target.value='';
});
mb$('createPlBtn').addEventListener('click',()=>{
  const name=mb$('newPlName').value.trim(); if(!name){ toast('请输入歌单名称'); return; }
  const pl={id:uid(),name:name,cover:pendingPlCover,songs:[]};
  state.user.playlists.push(pl); state.currentPlId=pl.id; saveAll();
  mb$('newPlModal').classList.remove('show');
  renderMinePlaylists(); updateMineStats();
  toast('歌单「'+name+'」已创建');
});

/* 头像/背景上传 — 直接绑定 + 事件委托双保险 */
function bindMineAvatar(){
  var el = mb$('mineAvatar');
  if(el && !el.dataset.mbBound){
    el.dataset.mbBound = '1';
    el.addEventListener('click',function(e){
      e.stopPropagation();
      var af = mb$('avatarFile');
      if(af) af.click();
    });
  }
}
bindMineAvatar();
mb$('avatarFile').addEventListener('change',function(e){
  var f=e.target.files[0]; if(!f) return; if(f.size>3*1024*1024){ toast('图片需小于3MB'); return; }
  var r=new FileReader(); r.onload=function(){ state.user.avatar=r.result; saveAll(); updateMine(); toast('头像已更新'); }; r.readAsDataURL(f); e.target.value='';
});
function bindBgUpload(){
  var btn = mb$('bgUploadBtn');
  if(btn && !btn.dataset.mbBound){
    btn.dataset.mbBound = '1';
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      var bf = mb$('bgFile');
      if(bf) bf.click();
    });
  }
}
mb$('bgFile').addEventListener('change',function(e){
  var f=e.target.files[0]; if(!f) return; if(f.size>5*1024*1024){ toast('图片需小于5MB'); return; }
  var r=new FileReader(); r.onload=function(){ state.user.background=r.result; saveAll(); updateMine(); toast('背景已更新'); }; r.readAsDataURL(f); e.target.value='';
});

/* 设置 */
function openSettings(){
  mb$('settingsModal').classList.add('show');
  mb$('recIntervalVal').value = state.user.recInterval || 60;
  mb$('recIntervalUnit').value = state.user.recIntervalUnit || 60;
  mb$('partnerCommentMinVal').value = state.user.partnerCommentMin || 30;
  mb$('partnerCommentMinUnit').value = state.user.partnerCommentMinUnit || 60;
  mb$('partnerCommentMaxVal').value = state.user.partnerCommentMax || 120;
  mb$('partnerCommentMaxUnit').value = state.user.partnerCommentMaxUnit || 60;
  mb$('partnerChatMinVal').value = state.user.partnerChatMin || 30;
  mb$('partnerChatMinUnit').value = state.user.partnerChatMinUnit || 60;
  mb$('partnerChatMaxVal').value = state.user.partnerChatMax || 120;
  mb$('partnerChatMaxUnit').value = state.user.partnerChatMaxUnit || 60;
  mb$('replyMinVal').value = state.user.replyMin || 3;
  mb$('replyMinUnit').value = state.user.replyMinUnit || 60;
  mb$('replyMaxVal').value = state.user.replyMax || 10;
  mb$('replyMaxUnit').value = state.user.replyMaxUnit || 60;
  mb$('settingsNickInput').value = state.user.nick || '';
}
function closeSettings(){ mb$('settingsModal').classList.remove('show'); }
function saveSettings(){
  let val = parseInt(mb$('recIntervalVal').value, 10) || 60;
  const unit = parseInt(mb$('recIntervalUnit').value, 10) || 60;
  state.user.recInterval = val;
  state.user.recIntervalUnit = unit;
  // 对方主动评论间隔
  state.user.partnerCommentMin = parseInt(mb$('partnerCommentMinVal').value, 10) || 30;
  state.user.partnerCommentMinUnit = parseInt(mb$('partnerCommentMinUnit').value, 10) || 60;
  state.user.partnerCommentMax = parseInt(mb$('partnerCommentMaxVal').value, 10) || 120;
  state.user.partnerCommentMaxUnit = parseInt(mb$('partnerCommentMaxUnit').value, 10) || 60;
  // 对方主动聊天间隔
  state.user.partnerChatMin = parseInt(mb$('partnerChatMinVal').value, 10) || 30;
  state.user.partnerChatMinUnit = parseInt(mb$('partnerChatMinUnit').value, 10) || 60;
  state.user.partnerChatMax = parseInt(mb$('partnerChatMaxVal').value, 10) || 120;
  state.user.partnerChatMaxUnit = parseInt(mb$('partnerChatMaxUnit').value, 10) || 60;
  // 对方回复间隔
  let replyMin = parseInt(mb$('replyMinVal').value, 10) || 3;
  const replyMinUnit = parseInt(mb$('replyMinUnit').value, 10) || 60;
  let replyMax = parseInt(mb$('replyMaxVal').value, 10) || 10;
  const replyMaxUnit = parseInt(mb$('replyMaxUnit').value, 10) || 60;
  if(replyMin * replyMinUnit > replyMax * replyMaxUnit){ replyMin = replyMax; replyMax = replyMin; mb$('replyMinVal').value = replyMin; mb$('replyMaxVal').value = replyMax; }
  state.user.replyMin = replyMin;
  state.user.replyMinUnit = replyMinUnit;
  state.user.replyMax = replyMax;
  state.user.replyMaxUnit = replyMaxUnit;
  state.user.nick = mb$('settingsNickInput').value.trim() || '我的音乐';
  saveAll();
  updateMine();
  restartPartnerTimer();
  closeSettings();
  toast('设置已保存');
}
function bindSettingsBtn(){
  const btn=mb$('mineSettingsBtn'); if(btn) btn.addEventListener('click', openSettings);
}
mb$('settingsClose').addEventListener('click', closeSettings);
mb$('settingsSaveBtn').addEventListener('click', saveSettings);

/* 签名编辑 */
mb$('mineSig').addEventListener('click',()=>{ mb$('sigInput').value=state.user.signature; mb$('sigModal').classList.add('show'); mb$('sigInput').focus(); });
mb$('sigSaveBtn').addEventListener('click',()=>{ state.user.signature=mb$('sigInput').value.trim()||'点击编辑签名'; saveAll(); updateMine(); mb$('sigModal').classList.remove('show'); toast('签名已保存'); });
mb$('sigRandomBtn').addEventListener('click',async()=>{
  mb$('sigInput').value=getCardOrDefault('想被阳光晒透，连同心事一起晾干。');
});

/* API设置 */
mb$('apiSaveBtn').addEventListener('click',async()=>{
  const url=mb$('apiUrlInput').value.trim().replace(/\/$/,'');
  state.apiUrl=url; saveAll();
  toast('API地址已保存，正在检测…');
  await checkProxy();
  if(proxyOnline){ loadDaily(); loadRecommendAll(); }
});

/* ============ 扫码登录 ============ */
let qrTimer = null;
function stopQrPolling(){
  if(qrTimer){ clearInterval(qrTimer); qrTimer=null; }
}
function openQrLogin(){
  mb$('qrModal').classList.add('show');
  mb$('qrNickname').style.display='none';
  mb$('qrRefresh').style.display='none';
  mb$('qrHint').textContent='加载中...';
  mb$('qrStatus').textContent='正在获取二维码...';
  mb$('qrCanvas').getContext('2d').clearRect(0,0,200,200);
  loadQrCode();
}
async function loadQrCode(){
  stopQrPolling();
  try {
    const apiUrl = state.apiUrl || location.origin;
    const resp = await fetch(apiUrl+'/api/qr/key');
    const data = await resp.json();
    if(data.error){ mb$('qrStatus').textContent='获取失败: '+data.error; return; }
    const key = data.key;
    const qrUrl = data.qrUrl;
    generateQR(qrUrl, mb$('qrCanvas'), 200);
    mb$('qrHint').textContent='请使用网易云音乐APP扫描二维码';
    mb$('qrStatus').textContent='等待扫码...';
    // 轮询
    qrTimer = setInterval(async ()=>{
      try {
        const r2 = await fetch(apiUrl+'/api/qr/check?key='+encodeURIComponent(key));
        const d2 = await r2.json();
        if(d2.code === 803){
          stopQrPolling();
          mb$('qrStatus').textContent='登录成功！';
          mb$('qrHint').style.display='none';
          mb$('qrNickname').textContent='欢迎，'+(d2.nickname||'');
          mb$('qrNickname').style.display='block';
          mb$('qrRefresh').style.display='block';
          toast('网易云登录成功！VIP歌曲现在可以播放了');
        } else if(d2.code === 800){
          stopQrPolling();
          mb$('qrStatus').textContent='二维码已过期';
          mb$('qrRefresh').style.display='block';
        } else if(d2.code === 802){
          mb$('qrStatus').textContent='已扫码，请在手机上确认';
        }
      } catch(e){}
    }, 3000);
  } catch(e){
    mb$('qrStatus').textContent='网络错误';
  }
}
mb$('qrLoginBtn').addEventListener('click', openQrLogin);
mb$('qrClose').addEventListener('click',()=>{ mb$('qrModal').classList.remove('show'); stopQrPolling(); });
mb$('qrRefresh').addEventListener('click', loadQrCode);

/* ============ 歌单弹窗 ============ */
function openPlaylistModal(){
  const pl=state.user.playlists.find(p=>p.id===state.currentPlId)||state.user.playlists[0];
  mb$('plModalTitle').innerHTML=esc(pl.name)+' <button class="add-pl" id="addSongBtn" style="margin-left:8px;padding:4px 10px;font-size:11px;">＋ 添加歌曲</button>';
  if(!pl.songs.length){ mb$('plModalBody').innerHTML='<div class="empty-hint">歌单还是空的<br>点击上方按钮添加歌曲</div>'; }
  else {
    mb$('plModalBody').innerHTML=pl.songs.map((s,i)=>`
      <div class="plm-item" data-id="${s.id}">
        <div class="num">${String(i+1).padStart(2,'0')}</div>
        <div class="info"><div class="name ${s.id===state.currentSongId?'playing':''}">${esc(s.name)}</div><div class="meta">${esc(s.artist||'')}</div></div>
        <span class="del" data-del="${s.id}">✕</span>
      </div>`).join('');
    mb$('plModalBody').querySelectorAll('.plm-item').forEach(el=>{
      el.addEventListener('click',e=>{
        if(e.target.dataset.del){ removeSongFromPlaylist(e.target.dataset.del); return; }
        playSongById(el.dataset.id); mb$('playlistModal').classList.remove('show');
      });
    });
  }
  mb$('playlistModal').classList.add('show');
  // 绑定添加歌曲按钮
  const addBtn=mb$('addSongBtn');
  if(addBtn) addBtn.addEventListener('click',()=>{
    currentAddSongPl=pl.id;
    mb$('playlistModal').classList.remove('show');
    openAddSongModal();
  });
}
function removeSongFromPlaylist(id){
  const pl=state.user.playlists.find(p=>p.id===state.currentPlId);
  if(!pl) return;
  const i=pl.songs.findIndex(s=>s.id===id); if(i<0) return;
  pl.songs.splice(i,1); saveAll();
  // 只更新弹窗内列表，不重新渲染整个弹窗，避免闪现
  if(mb$('playlistModal').classList.contains('show')){
    // 如果歌单空了，显示空提示
    if(!pl.songs.length){
      mb$('plModalBody').innerHTML='<div class="empty-hint">歌单还是空的<br>点击上方按钮添加歌曲</div>';
    } else {
      // 重新生成列表（编号需要更新）但保持弹窗打开
      mb$('plModalBody').innerHTML=pl.songs.map((s,idx)=>`
        <div class="plm-item" data-id="${s.id}">
          <div class="num">${String(idx+1).padStart(2,'0')}</div>
          <div class="info"><div class="name ${s.id===state.currentSongId?'playing':''}">${esc(s.name)}</div><div class="meta">${esc(s.artist||'')}</div></div>
          <span class="del" data-del="${s.id}">✕</span>
        </div>`).join('');
      mb$('plModalBody').querySelectorAll('.plm-item').forEach(el=>{
        el.addEventListener('click',e=>{
          if(e.target.dataset.del){ removeSongFromPlaylist(e.target.dataset.del); return; }
          playSongById(el.dataset.id); mb$('playlistModal').classList.remove('show');
        });
      });
    }
  }
  renderMinePlaylists(); updateMineStats();
}
/* 打开对方推荐的歌单 */
function openRecPlaylist(plid){
  const p=state.partners[0]; if(!p) return;
  const pl=(p.recommendedPlaylists||[]).find(x=>x.id===plid);
  if(!pl) return;
  mb$('plModalTitle').innerHTML=esc(pl.name)+' <span style="font-size:12px;color:var(--ink3)">来自 '+esc(p.nick)+'</span>';
  if(!pl.songs.length){ mb$('plModalBody').innerHTML='<div class="empty-hint">歌单还是空的</div>'; }
  else {
    mb$('plModalBody').innerHTML=pl.songs.map((s,i)=>`
      <div class="plm-item" data-index="${i}">
        <div class="num">${String(i+1).padStart(2,'0')}</div>
        <div class="info"><div class="name">${esc(s.name)}</div><div class="meta">${esc(s.artist||'')}</div></div>
      </div>`).join('');
    mb$('plModalBody').querySelectorAll('.plm-item').forEach(el=>{
      el.addEventListener('click',()=>{
        const idx=parseInt(el.dataset.index);
        const s=pl.songs[idx];
        const song={id:uid(),name:s.name,artist:s.artist,neteaseId:s.neteaseId||s.id,picUrl:s.picUrl||'',type:'netease',src:s.src||'https://music.163.com/song/media/outer/url?id='+(s.neteaseId||s.id)+'.mp3',lyrics:''};
        playSong(song);
        mb$('playlistModal').classList.remove('show');
      });
    });
  }
  // 添加播放全部按钮
  if(pl.songs.length){
    const allBtn=document.createElement('button');
    allBtn.className='btn-primary';
    allBtn.style.cssText='width:100%;margin-top:12px;';
    allBtn.textContent='▶ 播放全部';
    allBtn.onclick=()=>{
      if(pl.songs.length){
        const s=pl.songs[0];
        const song={id:uid(),name:s.name,artist:s.artist,neteaseId:s.neteaseId||s.id,picUrl:s.picUrl||'',type:'netease',src:s.src||'https://music.163.com/song/media/outer/url?id='+(s.neteaseId||s.id)+'.mp3',lyrics:''};
        playSong(song);
        // 将剩余歌曲加入队列
        for(let i=1;i<pl.songs.length;i++){
          const ns=pl.songs[i];
          state.queue.push({id:uid(),name:ns.name,artist:ns.artist,neteaseId:ns.neteaseId||ns.id,picUrl:ns.picUrl||'',type:'netease',src:ns.src||'https://music.163.com/song/media/outer/url?id='+(ns.neteaseId||ns.id)+'.mp3',lyrics:''});
        }
        mb$('playlistModal').classList.remove('show');
      }
    };
    mb$('plModalBody').appendChild(allBtn);
  }
  mb$('playlistModal').classList.add('show');
}

/* ============ 添加歌曲弹窗 ============ */
function openAddSongModal(){
  mb$('addSongContent').innerHTML = `
    <div id="addSongNetease">
      <div class="form-row" style="margin-bottom:8px">
        <input type="text" id="neteaseIdInput" placeholder="输入网易云歌曲ID（如 186016）">
      </div>
      <div class="form-row" style="margin-bottom:0">
        <div class="upload-box" id="neteaseCoverUpload" style="padding:16px;display:flex;align-items:center;gap:12px;">
          <div class="ph" style="width:40px;height:40px;border-radius:8px;overflow:hidden;background:var(--bg2);flex-shrink:0;font-size:20px;display:flex;align-items:center;justify-content:center">🎵</div>
          <span style="font-size:12px;color:var(--ink3)">上传封面（可选，不传则用网易云封面）</span>
          <input type="file" id="neteaseCoverInput" accept="image/*" style="display:none">
        </div>
      </div>
      <button class="btn-primary" id="addNeteaseBtn" style="margin-top:12px">添加</button>
    </div>`;
  bindAddSongEvents();
  // 绑定网易云封面上传
  const ncu=mb$('neteaseCoverUpload');
  if(ncu){
    ncu.addEventListener('click',()=>mb$('neteaseCoverInput').click());
    mb$('neteaseCoverInput').addEventListener('change',e=>{
      const f=e.target.files[0]; if(!f) return;
      const r=new FileReader(); r.onload=()=>{
        ncu.querySelector('.ph').innerHTML='<img src="'+r.result+'" style="width:100%;height:100%;object-fit:cover">';
      }; r.readAsDataURL(f); e.target.value='';
    });
  }
  mb$('addSongModal').classList.add('show');
  renderAddedList();
}
function bindAddSongEvents(){
  mbRoot.querySelectorAll('.add-song-tab').forEach(t=>{
    t.addEventListener('click',()=>{
      mbRoot.querySelectorAll('.add-song-tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      const tab=t.dataset.tab;
      if(tab==='netease'){
        mb$('addSongContent').innerHTML=`
          <div class="form-row" style="margin-bottom:8px">
            <input type="text" id="neteaseIdInput" placeholder="输入网易云歌曲ID（如 186016）">
          </div>
          <div class="form-row" style="margin-bottom:0">
            <div class="upload-box" id="neteaseCoverUpload" style="padding:16px;display:flex;align-items:center;gap:12px;">
              <div class="ph" style="width:40px;height:40px;border-radius:8px;overflow:hidden;background:var(--bg2);flex-shrink:0;font-size:20px;display:flex;align-items:center;justify-content:center">🎵</div>
              <span style="font-size:12px;color:var(--ink3)">上传封面（可选，不传则用网易云封面）</span>
              <input type="file" id="neteaseCoverInput" accept="image/*" style="display:none">
            </div>
          </div>
          <button class="btn-primary" id="addNeteaseBtn" style="margin-top:12px">添加</button>`;
        mb$('addNeteaseBtn').addEventListener('click',addNeteaseSong);
        mb$('neteaseCoverUpload').addEventListener('click',()=>mb$('neteaseCoverInput').click());
        mb$('neteaseCoverInput').addEventListener('change',e=>{
          const f=e.target.files[0]; if(!f) return;
          const r=new FileReader(); r.onload=()=>{
            mb$('neteaseCoverUpload').querySelector('.ph').innerHTML='<img src="'+r.result+'" style="width:100%;height:100%;object-fit:cover">';
          }; r.readAsDataURL(f); e.target.value='';
        });
      } else if(tab==='url'){
        mb$('addSongContent').innerHTML=`
          <div class="form-row" style="margin-bottom:8px">
            <input type="text" id="urlSongName" placeholder="歌曲名称">
          </div>
          <div class="form-row" style="margin-bottom:8px">
            <input type="text" id="urlSongArtist" placeholder="歌手（可选）">
          </div>
          <div class="form-row" style="margin-bottom:8px">
            <input type="url" id="urlSongSrc" placeholder="音频URL（如 https://...mp3）">
          </div>
          <div class="form-row" style="margin-bottom:0">
            <div class="upload-box" id="urlCoverUpload" style="padding:16px;display:flex;align-items:center;gap:12px;">
              <div class="ph" style="width:40px;height:40px;border-radius:8px;overflow:hidden;background:var(--bg2);flex-shrink:0;font-size:20px;display:flex;align-items:center;justify-content:center">🎵</div>
              <span style="font-size:12px;color:var(--ink3)">上传封面（可选）</span>
              <input type="file" id="urlCoverInput" accept="image/*" style="display:none">
            </div>
          </div>
          <button class="btn-primary" id="addUrlBtn" style="margin-top:12px">添加</button>`;
        mb$('addUrlBtn').addEventListener('click',addUrlSong);
        let pendingUrlCover=null;
        mb$('urlCoverUpload').addEventListener('click',()=>mb$('urlCoverInput').click());
        mb$('urlCoverInput').addEventListener('change',e=>{
          const f=e.target.files[0]; if(!f) return;
          const r=new FileReader(); r.onload=()=>{
            pendingUrlCover=r.result;
            mb$('urlCoverUpload').querySelector('.ph').innerHTML='<img src="'+r.result+'" style="width:100%;height:100%;object-fit:cover">';
          }; r.readAsDataURL(f); e.target.value='';
        });
      } else if(tab==='file'){
        mb$('addSongContent').innerHTML=`
          <div class="upload-box" id="songFileUpload" style="padding:30px">
            <div class="ph" style="font-size:32px">📁</div>
            <span style="font-size:13px;color:var(--ink3)">点击选择音频文件</span>
            <input type="file" id="songFileInput" accept="audio/*" style="display:none" multiple>
          </div>
          <div style="margin-top:8px;font-size:11px;color:var(--ink3)">支持MP3、WAV等格式，可选择多个文件</div>
          <div class="form-row" style="margin-top:12px;margin-bottom:0">
            <div class="upload-box" id="fileCoverUpload" style="padding:16px;display:flex;align-items:center;gap:12px;">
              <div class="ph" style="width:40px;height:40px;border-radius:8px;overflow:hidden;background:var(--bg2);flex-shrink:0;font-size:20px;display:flex;align-items:center;justify-content:center">🎵</div>
              <span style="font-size:12px;color:var(--ink3)">为所有歌曲上传封面（可选）</span>
              <input type="file" id="fileCoverInput" accept="image/*" style="display:none">
            </div>
          </div>`;
        mb$('songFileUpload').addEventListener('click',()=>mb$('songFileInput').click());
        mb$('songFileInput').addEventListener('change',addFileSongs);
        mb$('fileCoverUpload').addEventListener('click',()=>mb$('fileCoverInput').click());
        mb$('fileCoverInput').addEventListener('change',e=>{
          const f=e.target.files[0]; if(!f) return;
          const r=new FileReader(); r.onload=()=>{
            mb$('fileCoverUpload').querySelector('.ph').innerHTML='<img src="'+r.result+'" style="width:100%;height:100%;object-fit:cover">';
          }; r.readAsDataURL(f); e.target.value='';
        });
      }
    });
  });
  // 网易云ID默认绑定
  if(mb$('addNeteaseBtn')) mb$('addNeteaseBtn').addEventListener('click',addNeteaseSong);
}

async function addNeteaseSong(){
  const id=mb$('neteaseIdInput').value.trim();
  if(!id){ toast('请输入歌曲ID'); return; }
  if(!proxyOnline){ toast('请先连接API'); return; }
  toast('正在获取歌曲信息…');
  const coverImg=mbRoot.querySelector('#neteaseCoverUpload img');
  const manualCover=coverImg?coverImg.src:'';
  try{
    const detail=await apiGet('/api/song/detail?id='+id);
    const d=detail.detail;
    const song={id:uid(),name:d.name,artist:d.artist,neteaseId:id,type:'netease',
      src:'https://music.163.com/song/media/outer/url?id='+id+'.mp3',
      picUrl:manualCover||d.picUrl,lyrics:''};
    addSongToPlaylist(song);
    mb$('neteaseIdInput').value='';
    if(mb$('neteaseCoverUpload').querySelector('.ph')) mb$('neteaseCoverUpload').querySelector('.ph').innerHTML='🎵';
  }catch(e){ toast('获取失败，请检查ID'); }
}
function addUrlSong(){
  const name=mb$('urlSongName').value.trim();
  const src=mb$('urlSongSrc').value.trim();
  if(!name||!src){ toast('请输入名称和URL'); return; }
  const artist=mb$('urlSongArtist').value.trim();
  const coverImg=mbRoot.querySelector('#urlCoverUpload img');
  const song={id:uid(),name,artist:artist||'未知',type:'url',src,picUrl:coverImg?coverImg.src:'',lyrics:''};
  addSongToPlaylist(song);
  mb$('urlSongName').value=''; mb$('urlSongArtist').value=''; mb$('urlSongSrc').value='';
  if(mb$('urlCoverUpload').querySelector('.ph')) mb$('urlCoverUpload').querySelector('.ph').innerHTML='🎵';
}
function addFileSongs(e){
  const files=e.target.files;
  const coverImg=mbRoot.querySelector('#fileCoverUpload img');
  const fileCover=coverImg?coverImg.src:'';
  Array.from(files).forEach(f=>{
    if(f.size>20*1024*1024){ toast(f.name+' 超过20MB，已跳过'); return; }
    const r=new FileReader();
    r.onload=()=>{
      const song={id:uid(),name:f.name.replace(/\.[^.]+$/,''),artist:'本地文件',type:'file',src:r.result,picUrl:fileCover,lyrics:''};
      addSongToPlaylist(song);
    };
    r.readAsDataURL(f);
  });
  e.target.value='';
  toast('已添加 '+files.length+' 首歌曲');
}
function addSongToPlaylist(song){
  const pl=state.user.playlists.find(p=>p.id===currentAddSongPl);
  if(!pl){ toast('歌单不存在'); return; }
  if(!pl.songs.some(s=>s.name===song.name && s.src===song.src)){
    pl.songs.push(song); saveAll();
    if(!allSongs.some(s=>s.id===song.id)) allSongs.push(song);
  }
  renderAddedList();
  // 刷新歌单弹窗和我的页统计
  if(mb$('playlistModal').classList.contains('show')) openPlaylistModal();
  renderMinePlaylists(); updateMineStats();
  toast('已添加「'+song.name+'」');
}
function renderAddedList(){
  const pl=state.user.playlists.find(p=>p.id===currentAddSongPl);
  if(!pl) return;
  if(!pl.songs.length){ mb$('songAddedList').innerHTML=''; return; }
  mb$('songAddedList').innerHTML='<div style="font-size:12px;color:var(--ink3);margin-bottom:8px">已添加 '+pl.songs.length+' 首</div>'+pl.songs.map(s=>`
    <div class="song-added-item">
      <div class="name">${esc(s.name)} - ${esc(s.artist||'')}</div>
      <div class="del" data-del="${s.id}">✕</div>
    </div>`).join('');
  mb$('songAddedList').querySelectorAll('.del').forEach(el=>{
    el.addEventListener('click',()=>{
      const id=el.dataset.del;
      const i=pl.songs.findIndex(s=>s.id===id);
      if(i>=0){ pl.songs.splice(i,1); saveAll(); renderAddedList(); }
    });
  });
}

/* ============ 伴侣管理 ============ */
mb$('partnerBtn').addEventListener('click',()=>{
  renderPartnerList();
  mb$('partnerModal').classList.add('show');
});
function renderPartnerList(){
  const badge=mb$('partnerBadge');
  badge.style.display = state.partners.length>0 ? 'none' : 'block';
  if(!state.partners.length){
    mb$('partnerList').innerHTML='<div style="text-align:center;padding:20px;font-family:var(--fd);font-style:italic;color:var(--ink3);font-size:13px">还没有添加对象<br>点击上方按钮添加</div>';
    return;
  }
  mb$('partnerList').innerHTML=state.partners.map(p=>`
    <div class="partner-item ${p.notif?'has-notif':''}" data-id="${p.id}" style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);cursor:pointer;">
      <div style="width:40px;height:40px;border-radius:50%;overflow:hidden;background:var(--bg2);flex-shrink:0;position:relative;">${p.avatar?'<img src="'+p.avatar+'" style="width:100%;height:100%;object-fit:cover;">':'<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--sage);">👤</div>'}</div>
      <div style="flex:1"><div style="font-size:14px;font-weight:500">${esc(p.nick)}</div><div style="font-size:12px;color:var(--ink3);margin-top:2px">${esc(p.signature)}</div></div>
      <div style="color:var(--ink3);font-size:18px">›</div>
    </div>`).join('');
  mb$('partnerList').querySelectorAll('.partner-item').forEach(el=>{
    el.addEventListener('click',()=>{
      mb$('partnerModal').classList.remove('show');
      openPartnerHome(el.dataset.id);
    });
  });
}
mb$('addPartnerBtn').addEventListener('click',()=>{
  editingPartnerId=null; pendingPartnerAvatar=null;
  mb$('addPartnerTitle').textContent='添加对象';
  mb$('partnerNickInput').value='';
  var uploadEl = mb$('partnerAvatarUpload');
  if(uploadEl){
    var previewEl = uploadEl.querySelector('.preview');
    if(previewEl) previewEl.innerHTML='<div class="ph">＋</div>';
  }
  mb$('addPartnerModal').classList.add('show');
  setTimeout(function(){ try{ mb$('partnerNickInput').focus(); }catch(e){} }, 100);
});
// 伴侣头像上传 — 使用事件委托
(function(){
  var uploadEl = mb$('partnerAvatarUpload');
  if(uploadEl){
    uploadEl.addEventListener('click',function(e){
      e.stopPropagation();
      var pf = mb$('partnerAvatarFile');
      if(pf) pf.click();
    });
  }
  var fileEl = mb$('partnerAvatarFile');
  if(fileEl){
    fileEl.addEventListener('change',function(e){
      var f=e.target.files[0]; if(!f) return; if(f.size>3*1024*1024){ toast('图片需小于3MB'); return; }
      var r=new FileReader(); r.onload=function(){
        pendingPartnerAvatar=r.result;
        var ue = mb$('partnerAvatarUpload');
        if(ue){
          var p = ue.querySelector('.preview');
          if(p) p.innerHTML='<img src="'+r.result+'">';
        }
      }; r.readAsDataURL(f); e.target.value='';
    });
  }
})();
mb$('savePartnerBtn').addEventListener('click',function(){
  const nick=mb$('partnerNickInput').value.trim(); if(!nick){ toast('请输入昵称'); return; }
  const sig=getCardOrDefault('总有一首歌，让我想起你。');
  const partner={id:uid(),avatar:pendingPartnerAvatar,nick,signature:sig,background:null,playlists:[],favorites:[],comments:[],history:[]};
  state.partners.push(partner); saveAll();
  mb$('addPartnerModal').classList.remove('show');
  renderPartnerList(); renderHomePartnerRec();
  toast('已添加对象：'+nick);
});

/* 对方主页 - 全页式 */
async function openPartnerHome(pid){
  const p=state.partners.find(x=>x.id===pid); if(!p) return;
  currentPartnerId=pid;
  // 自动生成歌单（从听歌记录）
  if(!p.playlists.find(pl=>pl.name==='TA听过的歌')){
    p.playlists.push({id:uid(),name:'TA听过的歌',cover:null,songs:p.history.slice(0,15).map(h=>({id:h.id,name:h.name,artist:h.artist,neteaseId:h.neteaseId,src:h.src,type:'netease'}))});
    saveAll();
  }
  // 随机更新签名 — 从网站总字卡抽取
  p.signature=getCardOrDefault(p.signature||'总有一首歌，让我想起你。'); saveAll();
  renderPartnerPage(p);
  mb$('partnerPage').classList.add('show');
}

function renderPartnerPage(p){
  mb$('ppContent').innerHTML=`
    <div class="pp-header">
      <div class="pp-header-bg">${p.background?'<img src="'+p.background+'">':''}<div class="gradient"></div></div>
      <div class="pp-upload-btn" id="ppBgUploadBtn"><svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>
      <input type="file" id="ppBgFile" accept="image/*" style="display:none">
      <div class="pp-profile">
        <div class="pp-avatar">${p.avatar?'<img src="'+p.avatar+'">':'<div class="ph">👤</div>'}</div>
        <div class="pp-nick">${esc(p.nick)}</div>
        <div class="pp-sig">${esc(p.signature)} <span class="refresh-sig" id="refreshPartnerSig">✦ 换一句</span></div>
      </div>
    </div>
    <div class="pp-body">
      <div class="pp-tabs">
        <div class="pp-tab active" data-tab="songs">TA的歌单</div>
        <div class="pp-tab" data-tab="fav">收藏</div>
        <div class="pp-tab" data-tab="cmt">评论</div>
      </div>
      <div id="ppTabContent"></div>
    </div>`;
  // 绑定背景上传
  const bgBtn=mb$('ppBgUploadBtn');
  if(bgBtn) bgBtn.addEventListener('click',()=>mb$('ppBgFile').click());
  const bgFile=mb$('ppBgFile');
  if(bgFile) bgFile.addEventListener('change',e=>{
    const f=e.target.files[0]; if(!f) return; if(f.size>5*1024*1024){ toast('图片需小于5MB'); return; }
    const r=new FileReader(); r.onload=()=>{ p.background=r.result; saveAll(); renderPartnerPage(p); toast('背景已更新'); }; r.readAsDataURL(f); e.target.value='';
  });
  // 绑定tab切换
  mb$('ppContent').querySelectorAll('.pp-tab').forEach(t=>{
    t.addEventListener('click',function(){
      var ppContentEl=mb$('ppContent');
      var tabContentEl=mb$('ppTabContent');
      if(!tabContentEl) return;
      // 防止重复点击同一tab
      if(t.classList.contains('active')) return;
      // 淡出当前内容
      tabContentEl.style.opacity='0';
      tabContentEl.style.transition='opacity .12s';
      requestAnimationFrame(function(){
        ppContentEl.querySelectorAll('.pp-tab').forEach(x=>x.classList.remove('active'));
        t.classList.add('active');
        renderPartnerTab(p,t.dataset.tab);
        // 淡入新内容
        requestAnimationFrame(function(){
          tabContentEl.style.opacity='1';
        });
      });
    });
  });
  // 刷新签名
  const rsBtn=mb$('refreshPartnerSig');
  if(rsBtn) rsBtn.addEventListener('click',function(){
    p.signature=getCardOrDefault('总有一首歌，让我想起你。'); saveAll(); renderPartnerPage(p);
  });
  renderPartnerTab(p,'songs');
}

function renderPartnerTab(p,tab){
  const c=mb$('ppTabContent');
  if(tab==='songs'){
    const pl=p.playlists[0];
    if(!pl||!pl.songs.length){ c.innerHTML='<div class="empty-hint">TA还没有听歌记录<br>播放歌曲后会自动生成</div>'; return; }
    c.innerHTML=pl.songs.map((s,i)=>`
      <div class="song-item" data-id="${s.id}">
        <div class="si-cover"><div class="ph">🎵</div></div>
        <div class="si-info"><div class="si-name">${esc(s.name)}</div><div class="si-artist">${esc(s.artist||'')}</div></div>
      </div>`).join('');
    c.querySelectorAll('.song-item').forEach(el=>{
      el.addEventListener('click',()=>{
        const song=pl.songs.find(s=>s.id===el.dataset.id); if(song) playSong(song);
        mb$('partnerPage').classList.remove('show');
      });
    });
  } else if(tab==='fav'){
    const recs=p.recommendedSongs||[];
    if(!recs.length){ c.innerHTML='<div class="empty-hint">TA还没有向你推荐歌曲</div>'; return; }
    c.innerHTML=recs.map(r=>`
      <div class="record-item">
        <div class="icon fav">♥</div>
        <div class="info"><div class="song-name">${esc(r.name)} · ${esc(r.artist||'')}</div><div class="content">对方向你推荐了这首歌</div><div class="time">${r.recommendedAt?new Date(r.recommendedAt).toLocaleDateString('zh-CN'):''}</div></div>
      </div>`).join('');
    c.querySelectorAll('.record-item').forEach((el,i)=>{
      el.addEventListener('click',()=>{
        const r=recs[i];
        const song={id:uid(),name:r.name,artist:r.artist,neteaseId:r.neteaseId,type:'netease',src:r.src||'https://music.163.com/song/media/outer/url?id='+r.neteaseId+'.mp3',lyrics:''};
        playSong(song);
        mb$('partnerPage').classList.remove('show');
      });
    });
  } else if(tab==='cmt'){
    // 从 state.comments 中收集该对方的所有评论
    var partnerCmts=[];
    var allCmtKeys=Object.keys(state.comments||{});
    for(var ck=0; ck<allCmtKeys.length; ck++){
      var songId=allCmtKeys[ck];
      var cmts=state.comments[songId];
      if(!cmts || !cmts.length) continue;
      for(var ci=0; ci<cmts.length; ci++){
        var cmtItem=cmts[ci];
        if(!cmtItem.isMe && cmtItem.nick===p.nick){
          var songObj=null;
          var f=findSong(songId);
          if(f) songObj=f.song;
          if(!songObj && state.user.history){
            for(var hi=0; hi<state.user.history.length; hi++){
              if(state.user.history[hi].id===songId){ songObj=state.user.history[hi]; break; }
            }
          }
          partnerCmts.push({song:songObj||{name:'未知歌曲'}, text:cmtItem.text, time:cmtItem.time});
        }
      }
    }
    partnerCmts.sort(function(a,b){ return (b.time||0)-(a.time||0); });
    if(!partnerCmts.length){ c.innerHTML='<div class="empty-hint">TA还没有评论</div>'; return; }
    c.innerHTML=partnerCmts.map(function(item){
      return '<div class="record-item">'+
        '<div class="icon cmt">💬</div>'+
        '<div class="info"><div class="song-name">'+esc(item.song.name)+'</div>'+
        '<div class="content">'+esc(item.text)+'</div>'+
        '<div class="time">'+(item.time?new Date(item.time).toLocaleDateString('zh-CN'):'')+'</div></div></div>';
    }).join('');
  }
}

/* 对方主页返回 */
mb$('ppBack').addEventListener('click',()=>{
  mb$('partnerPage').classList.remove('show');
});

/* ============ 陪伴模式 ============ */
mb$('companionBtn').addEventListener('click',()=>{
  if(!state.partners.length){ toast('请先添加对象'); mb$('partnerBtn').click(); return; }
  renderCompanionStep1();
  mb$('companionModal').classList.add('show');
});
let compMode='float', compPlSource='mine';
function renderCompanionStep1(){
  mb$('companionBody').innerHTML=`
    <div class="step-indicator"><div class="step-dot active"></div><div class="step-dot"></div><div class="step-dot"></div></div>
    <div class="companion-option ${compMode==='float'?'selected':''}" data-mode="float">
      <div class="icon float">🔊</div><div class="text"><div class="title">悬浮播放器</div><div class="desc">圆形播放器悬浮在页面上，切换界面不中断</div></div><div class="check"></div>
    </div>
    <div class="companion-option ${compMode==='immersive'?'selected':''}" data-mode="immersive">
      <div class="icon immersive">🎧</div><div class="text"><div class="title">沉浸模式</div><div class="desc">进入播放界面，可看歌词、唱片、边听边聊</div></div><div class="check"></div>
    </div>
    <div style="margin-top:16px"><label style="font-size:11px;color:var(--ink3);letter-spacing:2px;text-transform:uppercase">选择歌单</label></div>
    <div class="pl-selector" style="margin-top:8px">
      <div class="pl-sel ${compPlSource==='mine'?'selected':''}" data-src="mine">我的歌单</div>
      ${state.partners.map(p=>`<div class="pl-sel ${compPlSource===p.id?'selected':''}" data-src="${p.id}">${esc(p.nick)}的歌单</div>`).join('')}
    </div>
    <button class="btn-primary" id="compNext1" style="margin-top:20px">发送陪伴申请</button>
  `;
  mb$('companionBody').querySelectorAll('.companion-option').forEach(el=>{
    el.addEventListener('click',()=>{ compMode=el.dataset.mode; mb$('companionBody').querySelectorAll('.companion-option').forEach(x=>x.classList.remove('selected')); el.classList.add('selected'); });
  });
  mb$('companionBody').querySelectorAll('.pl-sel').forEach(el=>{
    el.addEventListener('click',()=>{ compPlSource=el.dataset.src; mb$('companionBody').querySelectorAll('.pl-sel').forEach(x=>x.classList.remove('selected')); el.classList.add('selected'); });
  });
  mb$('compNext1').addEventListener('click',()=>renderCompanionStep2());
}
async function renderCompanionStep2(){
  const partner=state.partners[0];
  mb$('companionBody').innerHTML=`
    <div class="step-indicator"><div class="step-dot"></div><div class="step-dot active"></div><div class="step-dot"></div></div>
    <div class="invite-waiting">
      <div class="spinner"></div>
      <p>正在向 ${esc(partner.nick)} 发送陪伴邀请…</p>
    </div>
  `;
  await new Promise(r=>setTimeout(r,2000+Math.random()*1500));
  const accept=Math.random()>0.3;
  if(accept){
    const reply=getCardOrDefault('好啊，一起听吧！');
    mb$('companionBody').innerHTML=`
      <div class="step-indicator"><div class="step-dot"></div><div class="step-dot"></div><div class="step-dot active"></div></div>
      <div class="invite-result">
        <div class="emoji">🎉</div>
        <h4>${esc(partner.nick)} 接受了邀请</h4>
        <p>"${esc(reply)}"</p>
      </div>
      <button class="btn-primary" id="compStart" style="margin-top:16px">开始陪伴</button>
    `;
    mb$('compStart').addEventListener('click',()=>{
      state.companion={partnerId:partner.id,mode:compMode,plSource:compPlSource,status:'active'};
      saveAll(); mb$('companionModal').classList.remove('show');
      startCompanion();
    });
  } else {
    const reason=getCardOrDefault('现在有点忙，晚点一起听好不好？');
    mb$('companionBody').innerHTML=`
      <div class="step-indicator"><div class="step-dot"></div><div class="step-dot"></div><div class="step-dot active"></div></div>
      <div class="invite-result">
        <div class="emoji">💭</div>
        <h4>${esc(partner.nick)} 暂时拒绝了</h4>
        <p>"${esc(reason)}"</p>
      </div>
      <div class="btn-row">
        <button class="btn-secondary" id="compCancel">关闭</button>
        <button class="btn-secondary" id="compRetry" style="background:var(--sage);color:var(--cream);border-color:var(--sage)">再次邀请</button>
      </div>
    `;
    mb$('compCancel').addEventListener('click',()=>mb$('companionModal').classList.remove('show'));
    mb$('compRetry').addEventListener('click',()=>renderCompanionStep2());
  }
}
function startCompanion(){
  if(!state.companion) return;
  if(compMode==='float'){
    mb$('floatPlayer').classList.add('show');
    if(!audio.paused) mb$('floatPlayer').classList.add('playing');
    toast('陪伴模式已开启 · 悬浮播放器');
  } else {
    openFullPlayer();
    chatOpen=true; mb$('chatCard').classList.add('show');
    const p=state.partners.find(x=>x.id===state.companion.partnerId);
    if(p){ mb$('chatPartnerName').textContent=p.nick; if(p.avatar) mb$('chatPartnerAvatar').innerHTML='<img src="'+p.avatar+'">'; }
    toast('陪伴模式已开启 · 沉浸模式');
  }
}
mb$('floatPlayer').addEventListener('click',()=>{
  if(state.companion&&state.companion.mode==='immersive') { closeFullPlayer(); state.companion.mode='float'; mb$('floatPlayer').classList.add('show'); }
  else { openFullPlayer(); }
});

/* ============ 首页 ============ */
async function loadDaily(){
  if(proxyOnline){
    try{ const d=await apiGet('/api/daily'); renderDaily(d.songs||[]); return; }catch(e){}
  }
  renderDaily([]);
}
function renderDaily(songs){
  if(!songs.length){ mb$('dailyScroll').innerHTML='<div class="daily-card"><div class="cover"><span class="emoji">🎶</span></div><div class="info"><div class="name">暂无日推</div></div></div>'; return; }
  const emojis=['🎵','🍃','🌧️','☕','🌸','🌅'];
  const grads=['linear-gradient(135deg,var(--sage-l),var(--cream))','linear-gradient(135deg,var(--sky-l),var(--cream))','linear-gradient(135deg,var(--pink-l),var(--cream))','linear-gradient(135deg,var(--terra-l),var(--cream))','linear-gradient(135deg,var(--sage-l),var(--sky-l))','linear-gradient(135deg,var(--pink-l),var(--sage-l))'];
  mb$('dailyScroll').innerHTML=songs.map((s,i)=>`
    <div class="daily-card" data-id="${s.id}" data-name="${esc(s.name)}" data-artist="${esc(s.artist||'')}" data-pic="${esc(s.picUrl||'')}">
      <div class="cover">${s.picUrl?'<img src="'+esc(s.picUrl)+'" style="width:100%;height:100%;object-fit:cover">':'<div class="bg-grad" style="background:'+grads[i%grads.length]+'"></div><span class="emoji">'+emojis[i%emojis.length]+'</span>'}<div class="play-icon"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div></div>
      <div class="info"><div class="name">${esc(s.name)}</div><div class="artist">${esc(s.artist||'')}</div></div>
    </div>`).join('');
  mb$('dailyScroll').querySelectorAll('.daily-card').forEach(el=>{
    el.addEventListener('click',()=>{
      const song={id:uid(),name:el.dataset.name,artist:el.dataset.artist,neteaseId:el.dataset.id,picUrl:el.dataset.pic||'',type:'netease',src:'https://music.163.com/song/media/outer/url?id='+el.dataset.id+'.mp3',lyrics:''};
      playSong(song);
    });
  });
}
async function loadRecommendAll(){
  if(proxyOnline){
    try{ const d=await apiGet('/api/recommend'); renderRecAll(d.songs||[]); return; }catch(e){}
  }
  renderRecAll([]);
}
function renderRecAll(songs){
  if(!songs.length){ mb$('recAllList').innerHTML='<div class="empty-hint">启动API获取推荐<br>或在设置中输入API地址</div>'; return; }
  mb$('recAllList').innerHTML=songs.map(s=>`
    <div class="song-item" data-id="${s.id}" data-name="${esc(s.name)}" data-artist="${esc(s.artist||'')}">
      <div class="si-num">${esc((s.name||'').charAt(0))}</div>
      <div class="si-info"><div class="si-name">${esc(s.name)}</div><div class="si-artist">${esc(s.artist||'')}</div></div>
    </div>`).join('');
  mb$('recAllList').querySelectorAll('.song-item').forEach(el=>{
    el.addEventListener('click',()=>{
      const song={id:uid(),name:el.dataset.name,artist:el.dataset.artist,neteaseId:el.dataset.id,type:'netease',src:'https://music.163.com/song/media/outer/url?id='+el.dataset.id+'.mp3',lyrics:''};
      playSong(song);
    });
  });
}
function renderHomePartnerRec(){
  if(!state.partners.length){ mb$('partnerRecSection').style.display='none'; return; }
  mb$('partnerRecSection').style.display='block';
  const p=state.partners[0];
  if(p.avatar) mb$('recPartnerAvatar').innerHTML='<img src="'+p.avatar+'">';
  else mb$('recPartnerAvatar').innerHTML='<div class="ph">?</div>';
  mb$('recPartnerAvatar').className='partner-avatar'+(p.notif?' has-notif':'');
  mb$('recPartnerName').textContent=p.nick;
  const hasRecPl=(p.recommendedPlaylists||[]).length>0;
  const hasRecSongs=(p.recommendedSongs||[]).length>0;
  mb$('recPartnerSub').textContent=hasRecPl?'TA为你推荐了歌单':'TA为你点的歌';
  // 渲染推荐歌单
  const plScroll=mb$('recPlScroll');
  if(hasRecPl){
    plScroll.style.display='flex';
    plScroll.innerHTML=p.recommendedPlaylists.map(pl=>`
      <div class="daily-card" data-plid="${pl.id}" style="flex:0 0 150px">
        <div class="cover">${pl.cover?'<img src="'+esc(pl.cover)+'" style="width:100%;height:100%;object-fit:cover">':'<div class="emoji">🎵</div>'}</div>
        <div class="info"><div class="name">${esc(pl.name)}</div><div class="artist">${pl.songs.length}首</div></div>
      </div>`).join('');
    plScroll.querySelectorAll('.daily-card').forEach(el=>{
      el.addEventListener('click',()=>openRecPlaylist(el.dataset.plid));
    });
  } else { plScroll.style.display='none'; plScroll.innerHTML=''; }
  renderRecSongs(p);
  // 点击对方头像/昵称进入对方主页
  mb$('recPartnerAvatar').onclick=()=>openPartnerHome(p.id);
  mb$('recPartnerName').onclick=()=>openPartnerHome(p.id);
  mb$('recPartnerName').style.cursor='pointer';
  mb$('recPartnerAvatar').style.cursor='pointer';
}
function renderRecSongs(p){
  if(!p.recommendedSongs) p.recommendedSongs=[];
  const songs=p.recommendedSongs;
  if(!songs.length){
    mb$('recSongList').innerHTML='<div class="empty-hint">TA还没有为你推荐歌曲<br>稍等片刻，TA会为你挑选的</div>';
    return;
  }
  mb$('recSongList').innerHTML=songs.map(s=>`
    <div class="song-item" data-id="${s.id}" data-name="${esc(s.name)}" data-artist="${esc(s.artist||'')}" data-netease="${s.neteaseId||''}" data-src="${s.src||''}" data-pic-url="${s.picUrl||''}">
      <div class="si-num">♥</div>
      <div class="si-info"><div class="si-name">${esc(s.name)}</div><div class="si-artist">${esc(s.artist||'')}</div></div>
    </div>`).join('');
  mb$('recSongList').querySelectorAll('.song-item').forEach(el=>{
    el.addEventListener('click',()=>{
      const song={id:uid(),name:el.dataset.name,artist:el.dataset.artist,neteaseId:el.dataset.netease,type:'netease',src:el.dataset.src||'https://music.163.com/song/media/outer/url?id='+el.dataset.netease+'.mp3',picUrl:el.dataset.picUrl||'',lyrics:''};
      playSong(song);
    });
  });
}
/* 点歌弹窗 */
function openDianGeModal(){
  mb$('dianGeModal').classList.add('show');
  mb$('dianGeSearchInput').value='';
  mb$('dianGeSearchResults').innerHTML='<div class="empty-hint">搜索歌曲名或歌手</div>';
  renderDianGePlaylist();
  renderDianGeRecPlaylist();
  switchDianGeTab('search');
  mb$('dianGeSearchInput').focus();
}
function switchDianGeTab(tab){
  mbRoot.querySelectorAll('[data-dtab]').forEach(t=>t.classList.toggle('active',t.dataset.dtab===tab));
  mb$('dianGeSearchPanel').style.display=tab==='search'?'block':'none';
  mb$('dianGePlaylistPanel').style.display=tab==='playlist'?'block':'none';
  mb$('dianGeRecPlPanel').style.display=tab==='recplaylist'?'block':'none';
}
function renderDianGePlaylist(){
  const allSongs=[];
  state.user.playlists.forEach(pl=>{ pl.songs.forEach(s=>allSongs.push(s)); });
  const list=mb$('dianGePlaylistList');
  if(!allSongs.length){ list.innerHTML='<div class="empty-hint">歌单中还没有歌曲</div>'; return; }
  list.innerHTML=allSongs.map(s=>`
    <div class="sr-item" data-id="${s.neteaseId||s.id}" data-name="${esc(s.name)}" data-artist="${esc(s.artist||'')}" data-src="${s.src||''}">
      <div class="sr-info"><div class="sr-name">${esc(s.name)}</div><div class="sr-meta">${esc(s.artist||'')}</div></div>
      <button class="sr-add">点</button>
    </div>`).join('');
  list.querySelectorAll('.sr-item').forEach(el=>{
    el.querySelector('.sr-add').addEventListener('click',()=>{
      const p=state.partners[0]; if(!p) return;
      if(!p.recommendedSongs) p.recommendedSongs=[];
      const song={id:uid(),name:el.dataset.name,artist:el.dataset.artist,neteaseId:el.dataset.id,type:'netease',src:el.dataset.src||'https://music.163.com/song/media/outer/url?id='+el.dataset.id+'.mp3',lyrics:'',recommendedAt:Date.now()};
      p.recommendedSongs.unshift(song);
      if(p.recommendedSongs.length>10) p.recommendedSongs=p.recommendedSongs.slice(0,10);
      saveAll();
      mb$('dianGeModal').classList.remove('show');
      renderRecSongs(p);
      toast('已为TA点歌：'+song.name);
    });
  });
}
function renderDianGeRecPlaylist(){
  const list=mb$('dianGeRecPlList');
  if(!state.user.playlists.length){ list.innerHTML='<div class="empty-hint">还没有歌单<br>先去创建几个吧</div>'; return; }
  list.innerHTML=state.user.playlists.map(pl=>`
    <div class="sr-item" data-id="${pl.id}" data-name="${esc(pl.name)}" data-cover="${esc(pl.cover||'')}">
      <div class="sr-info">
        <div class="sr-name">${esc(pl.name)}</div>
        <div class="sr-meta">${pl.songs.length}首歌曲</div>
      </div>
      <button class="sr-add">荐</button>
    </div>`).join('');
  list.querySelectorAll('.sr-item').forEach(el=>{
    el.querySelector('.sr-add').addEventListener('click',()=>{
      const p=state.partners[0]; if(!p) return;
      if(!p.recommendedPlaylists) p.recommendedPlaylists=[];
      const pl=state.user.playlists.find(x=>x.id===el.dataset.id);
      if(!pl) return;
      const rec={id:pl.id,name:pl.name,cover:pl.cover||'',songs:pl.songs.map(s=>({id:s.id,name:s.name,artist:s.artist||'',neteaseId:s.neteaseId||s.id,src:s.src||'',picUrl:s.picUrl||''})),recommendedAt:Date.now()};
      p.recommendedPlaylists.unshift(rec);
      if(p.recommendedPlaylists.length>5) p.recommendedPlaylists=p.recommendedPlaylists.slice(0,5);
      saveAll();
      mb$('dianGeModal').classList.remove('show');
      renderHomePartnerRec();
      toast('已向TA推荐歌单：'+rec.name);
    });
  });
}
mb$('dianGeClose').addEventListener('click',()=>mb$('dianGeModal').classList.remove('show'));
mbRoot.querySelectorAll('[data-dtab]').forEach(t=>t.addEventListener('click',()=>switchDianGeTab(t.dataset.dtab)));
mb$('dianGeSearchBtn').addEventListener('click',()=>doDianGeSearch(mb$('dianGeSearchInput').value.trim()));
mb$('dianGeSearchInput').addEventListener('keypress',e=>{ if(e.key==='Enter') doDianGeSearch(mb$('dianGeSearchInput').value.trim()); });
async function doDianGeSearch(kw){
  if(!kw){ toast('请输入搜索关键词'); return; }
  mb$('dianGeSearchResults').innerHTML='<div class="empty-hint">搜索中…</div>';
  if(proxyOnline){
    try{
      const d=await apiPost('/api/search',{keywords:kw,limit:15});
      const songs=d.songs||[];
      if(!songs.length){ mb$('dianGeSearchResults').innerHTML='<div class="empty-hint">未找到相关歌曲</div>'; return; }
      mb$('dianGeSearchResults').innerHTML=songs.map(s=>`
        <div class="sr-item" data-id="${s.id}" data-name="${esc(s.name)}" data-artist="${esc(s.artist||'')}">
          <div class="sr-info"><div class="sr-name">${esc(s.name)}</div><div class="sr-meta">${esc(s.artist||'')}${s.album?' · '+esc(s.album):''}</div></div>
          <button class="sr-add">点</button>
        </div>`).join('');
      mb$('dianGeSearchResults').querySelectorAll('.sr-item').forEach(el=>{
        el.querySelector('.sr-add').addEventListener('click',()=>{
          const p=state.partners[0]; if(!p) return;
          if(!p.recommendedSongs) p.recommendedSongs=[];
          const song={id:uid(),name:el.dataset.name,artist:el.dataset.artist,neteaseId:el.dataset.id,type:'netease',src:'https://music.163.com/song/media/outer/url?id='+el.dataset.id+'.mp3',lyrics:'',recommendedAt:Date.now()};
          p.recommendedSongs.unshift(song);
          if(p.recommendedSongs.length>10) p.recommendedSongs=p.recommendedSongs.slice(0,10);
          saveAll();
          mb$('dianGeModal').classList.remove('show');
          renderRecSongs(p);
          toast('已为TA点歌：'+song.name);
        });
      });
    }catch(e){ mb$('dianGeSearchResults').innerHTML='<div class="empty-hint">搜索失败，请重试</div>'; }
  } else {
    mb$('dianGeSearchResults').innerHTML='<div class="empty-hint">请先连接API</div>';
  }
}
mb$('recRefreshBtn').addEventListener('click',()=>{
  const p=state.partners[0]; if(!p) return;
  if(p.recommendedSongs&&p.recommendedSongs.length){
    const r=p.recommendedSongs[0];
    const song={id:uid(),name:r.name,artist:r.artist,neteaseId:r.neteaseId,type:'netease',src:r.src||'https://music.163.com/song/media/outer/url?id='+r.neteaseId+'.mp3',lyrics:''};
    playSong(song);
  } else {
    openDianGeModal();
  }
});

/* ============ 弹窗关闭 ============ */
mbRoot.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click',()=>mb$(el.dataset.close).classList.remove('show')));
mbRoot.querySelectorAll('.mb-modal').forEach(m=>m.addEventListener('click',e=>{ if(e.target===m) m.classList.remove('show'); }));

/* ============ 键盘 ============ */
document.addEventListener('keydown',e=>{
  if(!mbRoot||mbRoot.style.display!=='flex')return;
  if(e.code==='Space'&&e.target.tagName!=='INPUT'&&e.target.tagName!=='TEXTAREA'){ e.preventDefault(); togglePlay(); }
  if(e.code==='Escape'){
    // 关闭全屏播放器时也移除 fp-open，否则底层内容会一直被隐藏导致界面崩坏
    var fp=mb$('fullPlayer');
    if(fp.classList.contains('show')){
      closeFullPlayer();
    } else {
      // 没有全屏播放器时，关闭其他弹窗
      mb$('partnerPage').classList.remove('show');
      mbRoot.querySelectorAll('.mb-modal.show').forEach(m=>m.classList.remove('show'));
      // 确保没有残留的 fp-open
      var wrap=document.querySelector('#music-buddy-page .mb-app-wrap');
      if(wrap) wrap.classList.remove('fp-open');
    }
  }
});

/* ============ 对方动态通知系统 ============ */
// 通知队列：多个聊天对象发信息时按列表顺序依次出现
window._notifQueue = [];
window._notifShowing = false;
function showPartnerNotif(partner, action, song, msg, type, targetId){
  // 页面不可见时不弹出通知，避免重新进入时闪现
  var pageEl=document.getElementById('music-buddy-page');
  if(!pageEl || pageEl.style.display==='none'){
    // 仍然标记 notif 状态，等用户进入页面后可看到红点
    if(partner) partner.notif=true;
    return;
  }
  // 将通知加入队列
  window._notifQueue.push({partner:partner, action:action, song:song, msg:msg, type:type, targetId:targetId});
  processNotifQueue();
}
function processNotifQueue(){
  if(window._notifShowing) return;
  if(window._notifQueue.length===0) return;
  var item = window._notifQueue.shift();
  window._notifShowing = true;
  var partner = item.partner;
  var action = item.action;
  var song = item.song;
  var msg = item.msg;
  var type = item.type;
  var targetId = item.targetId;
  var popup=mb$('notifPopup');
  var av=mb$('notifAvatar');
  if(partner.avatar) av.innerHTML='<img src="'+partner.avatar+'">';
  else av.innerHTML='<div class="ph">👤</div>';
  mb$('notifNick').textContent=partner.nick;
  mb$('notifAction').textContent=action;
  if(song){ mb$('notifSong').textContent=song.name||''; mb$('notifArtist').textContent=song.artist||''; mb$('notifSong').style.display='block'; mb$('notifArtist').style.display='block'; }
  else { mb$('notifSong').style.display='none'; mb$('notifArtist').style.display='none'; }
  mb$('notifMsg').textContent=msg||'';
  popup.dataset.type=type||'song';
  popup.dataset.target=targetId||'';
  popup.classList.add('show');
  partner.notif=true; saveAll(); renderPartnerList(); renderHomePartnerRec();
  // 5秒后自动关闭，然后处理队列中的下一个
  clearTimeout(window._notifTimer);
  window._notifTimer=setTimeout(function(){ closeNotif(); },5000);
}
function closeNotif(){
  // 清除自动关闭定时器，防止手动关闭后定时器再次触发 closeNotif
  if(window._notifTimer){ clearTimeout(window._notifTimer); window._notifTimer=null; }
  // 防止重复调用
  if(!window._notifShowing) return;
  mb$('notifPopup').classList.remove('show');
  // 延迟一下再处理下一个，确保关闭动画完成
  setTimeout(function(){
    window._notifShowing = false;
    processNotifQueue();
  }, 400);
}
mb$('notifClose').addEventListener('click',function(){ closeNotif(); });
mb$('notifDismiss').addEventListener('click',function(){ closeNotif(); });
mb$('notifListen').addEventListener('click',()=>{
  const popup=mb$('notifPopup');
  const type=popup.dataset.type;
  const targetId=popup.dataset.target;
  closeNotif();
  const p=state.partners.find(x=>x.notif);
  if(p){ p.notif=false; saveAll(); renderPartnerList(); renderHomePartnerRec(); }
  if(type==='song' && targetId){
    // 播放推荐的歌曲 — 不关闭全屏播放器，直接更新内容，避免闪现
    const partner=state.partners.find(function(pp){ return pp.recommendedSongs && pp.recommendedSongs.some(function(s){return s.id===targetId;}); });
    if(partner){
      const rec=partner.recommendedSongs.find(function(s){return s.id===targetId;});
      if(rec) playSong(rec);
    }
    toast('正在播放推荐歌曲');
  } else if(type==='comment' && targetId){
    // 对方评论了歌曲 — 打开评论弹窗（不关闭全屏播放器，评论弹窗 z-index 更高）
    // 如果歌曲不是当前播放的，先切换
    if(state.currentSongId!==targetId){
      var f=findSong(targetId);
      if(f) playSong(f.song);
    }
    // 延迟打开评论弹窗，等通知关闭动画完成
    setTimeout(function(){ openCommentModal(); },450);
  } else if(type==='playlist' && targetId){
    // 打开推荐歌单弹窗 — 先打开弹窗再关闭全屏播放器，避免底层内容闪现
    openRecPlaylist(targetId);
    // 延迟关闭全屏播放器，等弹窗动画完成
    setTimeout(function(){
      mb$('fullPlayer').classList.remove('show');
      var wrap=document.querySelector('#music-buddy-page .mb-app-wrap');
      if(wrap){
        setTimeout(function(){
          if(!mb$('fullPlayer').classList.contains('show')) wrap.classList.remove('fp-open');
        },380);
      }
      chatOpen=false; mb$('chatCard').classList.remove('show');
    },50);
  } else if(type==='companion' && targetId){
    // 对方主动申请一起听歌 — 打开陪伴弹窗（弹窗 z-index 高于全屏播放器，不会闪现）
    chatOpen=false; mb$('chatCard').classList.remove('show');
    if(!mbRoot.querySelector('#companionModal.show')){
      mb$('companionModal').classList.add('show');
      if(typeof renderCompanionStep1==='function') renderCompanionStep1();
    }
    // 延迟关闭全屏播放器
    setTimeout(function(){
      mb$('fullPlayer').classList.remove('show');
      var wrap2=document.querySelector('#music-buddy-page .mb-app-wrap');
      if(wrap2){
        setTimeout(function(){
          if(!mb$('fullPlayer').classList.contains('show')) wrap2.classList.remove('fp-open');
        },380);
      }
    },50);
  } else {
    toast('已查看');
  }
});
// 模拟歌曲池（用于对方随机推荐）
const SIM_SONGS=[
  {id:186016,name:'晴天',artist:'周杰伦',neteaseId:'186016',picUrl:'https://p2.music.126.net/KVVW0SSeBJXuqE3qWSnHBw==/109951167024880762.jpg'},
  {id:1293886117,name:'慢慢喜欢你',artist:'莫文蔚',neteaseId:'1293886117',picUrl:'https://p2.music.126.net/8KTm534J5Bcoyagn1vQxiA==/109951167893314360.jpg'},
  {id:1293886117,name:'起风了',artist:'买辣椒也用券',neteaseId:'1330348068',picUrl:'https://p2.music.126.net/diGAyEmpymX8G7JcnElncQ==/109951163699673355.jpg'},
  {id:447925558,name:'某种老朋友',artist:'林家谦',neteaseId:'447925558',picUrl:'https://p2.music.126.net/8KTm534J5Bcoyagn1vQxiA==/109951167893314360.jpg'},
  {id:1293886117,name:'遇见',artist:'孙燕姿',neteaseId:'287035',picUrl:'https://p2.music.126.net/tt8xwK-ASC2iqXNUXYKoDQ==/109951163606377163.jpg'},
  {id:1293886117,name:'小幸运',artist:'田馥甄',neteaseId:'409650778',picUrl:'https://p2.music.126.net/tt8xwK-ASC2iqXNUXYKoDQ==/109951163606377163.jpg'},
  {id:1293886117,name:'后来',artist:'刘若英',neteaseId:'5271858',picUrl:'https://p2.music.126.net/tt8xwK-ASC2iqXNUXYKoDQ==/109951163606377163.jpg'},
  {id:1293886117,name:'那些年',artist:'胡夏',neteaseId:'17706927',picUrl:'https://p2.music.126.net/tt8xwK-ASC2iqXNUXYKoDQ==/109951163606377163.jpg'},
  {id:1293886117,name:'平凡之路',artist:'朴树',neteaseId:'29004400',picUrl:'https://p2.music.126.net/tt8xwK-ASC2iqXNUXYKoDQ==/109951163606377163.jpg'},
  {id:1293886117,name:'红豆',artist:'王菲',neteaseId:'29947420',picUrl:'https://p2.music.126.net/tt8xwK-ASC2iqXNUXYKoDQ==/109951163606377163.jpg'},
];
// 模拟对方动态（推荐歌曲/推荐歌单/点赞收藏/主动申请一起听）
function simulatePartnerActivity(){
  if(!state.partners.length) return;
  const partner=state.partners[Math.floor(Math.random()*state.partners.length)];
  const msg=getCardOrDefault('这首歌好像我们的故事。');
  // 随机选择行为：0=推荐歌曲, 1=推荐歌单, 2=普通动态, 3=主动申请一起听
  const behavior=Math.floor(Math.random()*4);
  if(behavior===0){
    // 推荐歌曲 — 优先从用户歌单中选取，其次从随机歌曲池
    let songData=null;
    // 收集用户所有歌单中的歌曲
    var userSongs=[];
    state.user.playlists.forEach(function(pl){ pl.songs.forEach(function(s){ userSongs.push(s); }); });
    // 也从听歌记录中选取
    state.user.history.forEach(function(h){ userSongs.push(h); });
    if(userSongs.length>0 && Math.random()>0.4){
      // 60%概率从用户歌单/历史中推荐
      var pick=userSongs[Math.floor(Math.random()*userSongs.length)];
      songData={name:pick.name,artist:pick.artist||'',neteaseId:pick.neteaseId||'',picUrl:pick.picUrl||'',src:pick.src||''};
    } else {
      // 40%概率从随机歌曲池推荐
      var sim=SIM_SONGS[Math.floor(Math.random()*SIM_SONGS.length)];
      songData=sim;
    }
    if(!partner.recommendedSongs) partner.recommendedSongs=[];
    var song={id:uid(),name:songData.name,artist:songData.artist,neteaseId:songData.neteaseId,picUrl:songData.picUrl,type:'netease',src:songData.src||('https://music.163.com/song/media/outer/url?id='+songData.neteaseId+'.mp3'),lyrics:'',recommendedAt:Date.now()};
    partner.recommendedSongs.unshift(song);
    if(partner.recommendedSongs.length>10) partner.recommendedSongs=partner.recommendedSongs.slice(0,10);
    saveAll(); renderHomePartnerRec();
    showPartnerNotif(partner,'为你推荐了一首歌',song,msg,'song',song.id);
  } else if(behavior===1 && state.user.playlists.length>0){
    // 推荐歌单 — 从用户歌单中选取
    const pl=state.user.playlists[Math.floor(Math.random()*state.user.playlists.length)];
    if(!partner.recommendedPlaylists) partner.recommendedPlaylists=[];
    const rec={id:pl.id,name:pl.name,cover:pl.cover||'',songs:pl.songs.map(s=>({id:s.id,name:s.name,artist:s.artist||'',neteaseId:s.neteaseId||s.id,src:s.src||'',picUrl:s.picUrl||''})),recommendedAt:Date.now()};
    partner.recommendedPlaylists.unshift(rec);
    if(partner.recommendedPlaylists.length>5) partner.recommendedPlaylists=partner.recommendedPlaylists.slice(0,5);
    saveAll(); renderHomePartnerRec();
    showPartnerNotif(partner,'为你推荐了一个歌单',{name:pl.name,artist:pl.songs.length+'首歌曲'},msg,'playlist',pl.id);
  } else if(behavior===3 && !state.companion){
    // 主动申请一起听歌
    showPartnerNotif(partner,'想和你一起听歌',null,getCardOrDefault('现在方便一起听歌吗？'),'companion',partner.id);
  } else {
    // 普通动态
    const actions=['点赞了一首歌','收藏了一首歌'];
    const action=actions[Math.floor(Math.random()*actions.length)];
    var sim2=SIM_SONGS[Math.floor(Math.random()*SIM_SONGS.length)];
    showPartnerNotif(partner,action,{name:sim2.name,artist:sim2.artist},msg);
  }
}
let partnerTimer = null;
let partnerCommentTimer = null;
let partnerChatTimer = null;
function partnerIntervalMs(min, minUnit, max, maxUnit){
  const lo = (min||1) * (minUnit||60) * 1000;
  const hi = (max||1) * (maxUnit||60) * 1000;
  const loC = Math.max(5000, Math.min(lo, 24*3600*1000));
  const hiC = Math.max(loC, Math.min(hi, 24*3600*1000));
  return loC + Math.random() * Math.max(0, hiC - loC);
}
// 对方主动为你的歌曲发表评论
function simulatePartnerComment(){
  if(!state.partners.length) return;
  const partner=state.partners[Math.floor(Math.random()*state.partners.length)];
  let song=null;
  if(state.currentSongId){ const f=findSong(state.currentSongId); if(f) song=f.song; }
  if(!song && state.user.history && state.user.history.length){ song=state.user.history[Math.floor(Math.random()*state.user.history.length)]; }
  if(!song) return;
  if(!state.comments[song.id]) state.comments[song.id]=[];
  const reply=getCardOrDefault('这首歌让我想起你笑的样子。');
  state.comments[song.id].push({nick:partner.nick,avatar:partner.avatar,text:reply,time:Date.now(),isMe:false});
  saveAll();
  showPartnerNotif(partner,'评论了你的歌曲',song,reply,'comment',song.id);
}
function schedulePartnerComment(){
  const delay=partnerIntervalMs(state.user.partnerCommentMin,state.user.partnerCommentMinUnit,state.user.partnerCommentMax,state.user.partnerCommentMaxUnit);
  partnerCommentTimer=setTimeout(()=>{ simulatePartnerComment(); schedulePartnerComment(); },delay);
}
// 对方主动发起聊天
function simulatePartnerChat(){
  if(!state.partners.length) return;
  const partner=state.partners[0];
  const partnerAvatar=getPartnerChatAvatar(partner);
  const body=mb$('chatBody');
  if(!body) return;
  var r=Math.random();
  if(r<0.5){
    // 50% 发送字卡，有概率附带搜索表情包
    var card=getCardOrDefault('这首歌好像我们的故事。');
    body.innerHTML+='<div class="chat-msg them"><div class="chat-av">'+partnerAvatar+'</div><div class="bubble">'+esc(card)+'</div></div>';
    body.scrollTop=body.scrollHeight;
    // 30%概率搜索相关表情包并追加发送
    if(Math.random()<0.3){
      partnerSendStickerFromCard(card, partner, partnerAvatar, body, 800);
    }
  } else if(r<0.8){
    // 30% 发送已保存的表情包或网站表情库
    partnerSendSavedSticker(partner, partnerAvatar, body);
  } else {
    // 20% 从字卡提取关键词搜索搜狗表情包发送
    var searchCard=getCardOrDefault('开心');
    var kw=extractKeywordsFromCard(searchCard);
    if(kw){
      body.innerHTML+='<div class="chat-msg them"><div class="chat-av">'+partnerAvatar+'</div><div class="bubble" style="font-size:11px;color:var(--ink3);font-style:italic;">正在搜索表情包…</div></div>';
      body.scrollTop=body.scrollHeight;
      partnerSendSearchedSticker(kw, partner, partnerAvatar, body, 1200);
    } else {
      partnerSendSavedSticker(partner, partnerAvatar, body);
    }
  }
  body.scrollTop=body.scrollHeight;
}
function schedulePartnerChat(){
  const delay=partnerIntervalMs(state.user.partnerChatMin,state.user.partnerChatMinUnit,state.user.partnerChatMax,state.user.partnerChatMaxUnit);
  partnerChatTimer=setTimeout(()=>{ simulatePartnerChat(); schedulePartnerChat(); },delay);
}
function restartPartnerTimer(){
  if(partnerTimer) clearInterval(partnerTimer);
  if(partnerCommentTimer) clearTimeout(partnerCommentTimer);
  if(partnerChatTimer) clearTimeout(partnerChatTimer);
  // 推荐间隔 — 推荐歌曲/歌单/动态
  const val = state.user.recInterval || 60;
  const unit = state.user.recIntervalUnit || 60;
  const ms = val * unit * 1000;
  const clampedMs = Math.max(10000, Math.min(ms, 24 * 3600 * 1000));
  partnerTimer = setInterval(simulatePartnerActivity, clampedMs);
  // 对方主动评论间隔
  schedulePartnerComment();
  // 对方主动聊天间隔
  schedulePartnerChat();
}
/* ============ 折叠切换（模块级绑定，避免 init 重复调用时重复绑定） ============ */
var _toggleBound = false;
function bindToggles(){
  if(_toggleBound) return;
  _toggleBound = true;
  function setupToggle(btnId, contentId){
    const btn=mb$(btnId); if(!btn) return;
    const content=mb$(contentId); if(!content) return;
    btn.addEventListener('click',()=>{
      if(content.style.display==='none'){
        content.style.display='';
        btn.classList.remove('collapsed');
        btn.title='收起';
        btn.textContent='▲';
      } else {
        content.style.display='none';
        btn.classList.add('collapsed');
        btn.title='展开';
        btn.textContent='▼';
      }
    });
  }
  setupToggle('toggleRec','recContent');
  setupToggle('toggleHistory','historyList');
}

/* ============ 初始化 ============ */
var _initDone = false;
async function init(){
  // 防止重复初始化导致事件监听器重复绑定（reload 时通过 reloadApp 重置标志）
  if(_initDone) return;
  _initDone = true;
  await checkProxy();
  setModeIcon();
  audio.volume=state.volume;
  if(!state.currentPlId) state.currentPlId=state.user.playlists[0].id;
  updateMine();
  renderHomePartnerRec();
  loadDaily();
  loadRecommendAll();
  if(state.currentSongId){
    const f=findSong(state.currentSongId);
    if(f){ updateMiniPlayer(f.song); updateFullPlayer(f.song); }
  }
  bindToggles();
  restartPartnerTimer();
}
/* 完整重载：清除定时器并重置初始化标志，供 reload 使用 */
function reloadApp(){
  if(partnerTimer){ clearInterval(partnerTimer); partnerTimer=null; }
  if(partnerCommentTimer){ clearTimeout(partnerCommentTimer); partnerCommentTimer=null; }
  if(partnerChatTimer){ clearTimeout(partnerChatTimer); partnerChatTimer=null; }
  if(window._notifTimer){ clearTimeout(window._notifTimer); window._notifTimer=null; }
  stopQrPolling();
  _initDone = false;
  // 关闭所有弹窗，防止重载后残留
  mbRoot.querySelectorAll('.mb-modal.show').forEach(function(m){ m.classList.remove('show'); });
  mb$('fullPlayer').classList.remove('show');
  mb$('partnerPage').classList.remove('show');
  mb$('notifPopup').classList.remove('show');
  mb$('chatEmojiBar').style.display='none';
  chatOpen=false;
  _stickerTab='emoji';
  _searchOwner='mine';
  _lastSearchResults=[];
  var wrap=document.querySelector('#music-buddy-page .mb-app-wrap');
  if(wrap) wrap.classList.remove('fp-open');
  window._notifQueue=[]; window._notifShowing=false;
  return init();
}

/* ============ 全局悬浮播放器 ============ */
var gFloat = document.getElementById('mbGlobalFloat');
var gFloatCover = document.getElementById('mbFloatCover');
var gFloatDragging = false;
var gFloatOffX = 0, gFloatOffY = 0;

function updateGlobalFloat(song){
  if(!gFloatCover) return;
  if(song && song.picUrl){
    gFloatCover.innerHTML = '<img src="'+esc(song.picUrl)+'" style="width:100%;height:100%;object-fit:cover;">';
  } else {
    gFloatCover.innerHTML = '🎵';
  }
}

function showGlobalFloat(){
  if(gFloat && state.currentSongId && state.companion) gFloat.style.display = 'block';
}
function hideGlobalFloat(){
  if(gFloat) gFloat.style.display = 'none';
}

// 当离开一起听页面时显示全局悬浮
window.MusicBuddyApp = window.MusicBuddyApp || {};
window.MusicBuddyApp.showGlobalFloat = showGlobalFloat;
window.MusicBuddyApp.hideGlobalFloat = hideGlobalFloat;
window.MusicBuddyApp.updateGlobalFloat = updateGlobalFloat;

if(gFloat){
  // 点击打开一起听
  gFloat.addEventListener('click', function(e){
    if(gFloatDragging) return;
    if(window.MusicBuddyApp && typeof window.MusicBuddyApp.open === 'function'){
      window.MusicBuddyApp.open();
    }
  });
  
  // 拖动支持
  var startX=0, startY=0, startLeft=0, startTop=0;
  function onStart(e){
    var touch = e.touches ? e.touches[0] : e;
    gFloatDragging = false;
    startX = touch.clientX;
    startY = touch.clientY;
    var rect = gFloat.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, {passive:false});
    document.addEventListener('touchend', onEnd);
  }
  function onMove(e){
    var touch = e.touches ? e.touches[0] : e;
    var dx = touch.clientX - startX;
    var dy = touch.clientY - startY;
    if(Math.abs(dx) > 4 || Math.abs(dy) > 4) gFloatDragging = true;
    if(gFloatDragging){
      e.preventDefault();
      var nx = startLeft + dx;
      var ny = startTop + dy;
      // clamp to viewport
      nx = Math.max(0, Math.min(nx, window.innerWidth - 52));
      ny = Math.max(0, Math.min(ny, window.innerHeight - 52));
      gFloat.style.left = nx + 'px';
      gFloat.style.top = ny + 'px';
      gFloat.style.right = 'auto';
      gFloat.style.bottom = 'auto';
    }
  }
  function onEnd(){
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
    setTimeout(function(){ gFloatDragging = false; }, 100);
  }
  gFloat.addEventListener('mousedown', onStart);
  gFloat.addEventListener('touchstart', onStart, {passive:true});
}

// Hook into music buddy entry close to show global float
var _origMbClose = window.MusicBuddyApp ? window.MusicBuddyApp.close : null;

/* 暴露初始化接口给 music-buddy-entry.js：首次打开页面时调用 */
window.MusicBuddyApp=(window.MusicBuddyApp||{});
window.MusicBuddyApp.init=(typeof init==='function'?init:function(){});
window.MusicBuddyApp.reloadApp=(typeof reloadApp==='function'?reloadApp:function(){});
window.MusicBuddyApp._initialized=false;
/* 暴露搜狗表情搜索函数给主聊天界面使用 */
window.searchSogouStickers = (typeof searchSogouStickers === 'function') ? searchSogouStickers : function(kw){
  return Promise.resolve([]);
};
})();
