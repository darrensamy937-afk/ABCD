/**
 * 直播应用 · 主逻辑
 * 功能：录屏直播、聊天互动、礼物系统、点赞、数据分析
 */
(function(){
    'use strict';
    if (window.LiveStreamApp && window.LiveStreamApp.__app) return;

    // ===== SVG 图标库（深蓝线条风格）=====
    var ICON = {
        back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        plus: '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke-linecap="round"/></svg>',
        records: '<svg viewBox="0 0 24 24"><path d="M3 12h4l3 8 4-16 3 8h4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        heart: '<svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        heartFill: '<svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="#ff4757" stroke="none"/></svg>',
        gift: '<svg viewBox="0 0 24 24"><polyline points="20 12 20 22 4 22 4 12" stroke-linecap="round" stroke-linejoin="round"/><rect x="2" y="7" width="20" height="5" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="22" x2="12" y2="7" stroke-linecap="round"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        star: '<svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" stroke-linecap="round"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" stroke-linecap="round"/></svg>',
        send: '<svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13" stroke-linecap="round"/><polygon points="22 2 15 22 11 13 2 9 22 2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        screen: '<svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="8" y1="21" x2="16" y2="21" stroke-linecap="round"/><line x1="12" y1="17" x2="12" y2="21" stroke-linecap="round"/></svg>',
        stop: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        chart: '<svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10" stroke-linecap="round"/><line x1="12" y1="20" x2="12" y2="4" stroke-linecap="round"/><line x1="6" y1="20" x2="6" y2="14" stroke-linecap="round"/></svg>',
        ai: '<svg viewBox="0 0 24 24"><path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1 1 7.87V18a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-4.13A4 4 0 0 1 8 6a4 4 0 0 1 4-4z" stroke-linecap="round" stroke-linejoin="round"/><line x1="9" y1="22" x2="15" y2="22" stroke-linecap="round"/></svg>',
        camera: '<svg viewBox="0 0 24 24"><path d="M23 7l-7 5 7 5V7z" stroke-linecap="round" stroke-linejoin="round"/><rect x="1" y="5" width="15" height="14" rx="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        trash: '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        video: '<svg viewBox="0 0 24 24"><polygon points="23 7 16 12 23 17 23 7" stroke-linecap="round" stroke-linejoin="round"/><rect x="1" y="5" width="15" height="14" rx="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        volumeOn: '<svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        volumeOff: '<svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" stroke-linecap="round" stroke-linejoin="round"/><line x1="23" y1="9" x2="17" y2="15" stroke-linecap="round"/><line x1="17" y1="9" x2="23" y2="15" stroke-linecap="round"/></svg>',
        // 礼物图标
        rose: '<svg viewBox="0 0 24 24"><path d="M12 2C9 2 7 4 7 7c0 1.5.8 2.8 2 3.5C7.5 11 6 12.8 6 15c0 3 2.5 5 6 5s6-2 6-5c0-2.2-1.5-4-3-4.5 1.2-.7 2-2 2-3.5 0-3-2-5-5-5z M12 2c-1 0-2 .5-2 2s1 2 2 2 2-.5 2-2-1-2-2-2z" fill="#e91e63" stroke="#c2185b" stroke-width="1"/><path d="M12 20v2" stroke="#4caf50" stroke-width="2" stroke-linecap="round"/></svg>',
        airplane: '<svg viewBox="0 0 24 24"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill="#42a5f5" stroke="#1976d2" stroke-width="1" stroke-linejoin="round"/></svg>',
        rocket: '<svg viewBox="0 0 24 24"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0 M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" fill="#ff7043" stroke="#d84315" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    };

    // ===== 礼物配置 =====
    var GIFTS = [
        { id: 'rose', name: '玫瑰', icon: ICON.rose, counts: [99, 520, 1314, 71] },
        { id: 'airplane', name: '小飞机', icon: ICON.airplane, counts: [99, 52, 21, 71, 999] },
        { id: 'rocket', name: '火箭', icon: ICON.rocket, counts: [99, 52, 21, 71, 999] },
    ];

    // ===== 状态 =====
    var state = {
        streaming: false,
        startTime: 0,
        timerInterval: null,
        partnerInterval: null,
        screenStream: null,
        cameraStream: null,
        cameraMode: false,
        cameraActive: false,
        cameraSelected: false,
        videoFile: null,
        videoMode: false,
        videoObjectURL: null,
        videoFit: 'contain',
        messages: [],
        likes: 0,
        favorites: false,
        shares: 0,
        gifts: [],
        partnerName: '',
        partnerAvatar: '',
        streamerName: '',
        streamerAvatar: '',
        selectedPartner: null,
        settings: {},
        records: [],
    };

    // ===== 存储工具 =====
    function getPrefix() {
        return (window.APP_PREFIX || 'CHAT_APP_V3_') + (window.SESSION_ID || 'default') + '_ls_';
    }
    function lsGetKey(key) { return getPrefix() + key; }

    async function lsSave(key, val) {
        try {
            if (window.localforage) {
                await localforage.setItem(lsGetKey(key), val);
            } else {
                localStorage.setItem(lsGetKey(key), JSON.stringify(val));
            }
        } catch(e) {}
    }
    async function lsLoad(key, defaultVal) {
        try {
            if (window.localforage) {
                var v = await localforage.getItem(lsGetKey(key));
                return v !== null ? v : defaultVal;
            }
            var s = localStorage.getItem(lsGetKey(key));
            return s ? JSON.parse(s) : defaultVal;
        } catch(e) { return defaultVal; }
    }

    // ===== 字卡获取 =====
    function getCardFromSite() {
        var replies = (typeof customReplies !== 'undefined' && customReplies) ? customReplies : (window._customReplies || []);
        if (replies && replies.length > 0) return replies[Math.floor(Math.random() * replies.length)];
        return null;
    }
    function getDefaultCard() {
        var defaults = [
            '在听你直播呢，好有意思！',
            '你的直播真好看。',
            '加油呀，我一直在看！',
            '这个画面太棒了。',
            '哈哈，你太可爱了。',
            '今天状态不错嘛。',
            '我给你点赞了！',
            '继续继续，别停！',
            '你也太厉害了吧。',
            '看得我都想加入了。',
        ];
        return defaults[Math.floor(Math.random() * defaults.length)];
    }
    function generateMessage() {
        var s = state.settings;
        var cardCount = randInt(s.cardCountMin || 1, s.cardCountMax || 3);
        var combineCount = randInt(s.combineMin || 1, s.combineMax || 2);
        var parts = [];
        for (var i = 0; i < cardCount; i++) {
            var combined = [];
            for (var j = 0; j < combineCount; j++) {
                var card = getCardFromSite() || getDefaultCard();
                combined.push(card);
            }
            parts.push(combined.join('，'));
        }
        return parts.join('。');
    }

    function randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    function randDelay(min, max) {
        return randInt(min, max);
    }

    // ===== UI 工具 =====
    function $(id) { return document.getElementById(id); }
    function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function toast(msg) {
        var page = $('live-stream-page');
        if (!page) return;
        var t = document.createElement('div');
        t.className = 'ls-toast';
        t.textContent = msg;
        page.appendChild(t);
        setTimeout(function() { if (t.parentNode) t.remove(); }, 2000);
    }

    function showView(viewId) {
        var views = ['ls-main-view', 'ls-stream-view', 'ls-records-view', 'ls-settings-view', 'ls-analysis-view'];
        views.forEach(function(v) {
            var el = $(v);
            if (el) el.style.display = 'none';
        });
        var target = $(viewId);
        if (target) target.style.display = 'flex';
    }
    function showModal(id) {
        var m = $(id);
        if (m) m.style.display = 'flex';
    }
    function hideModal(id) {
        var m = $(id);
        if (m) m.style.display = 'none';
    }

    // ===== 初始化 =====
    async function init() {
        // 先同步构建UI框架，避免页面空白闪烁
        buildMainView();
        bindEvents();

        // 再异步加载数据
        var savedSettings = await lsLoad('settings', {});
        state.settings = Object.assign({
            streamAvatar: '',
            streamBackground: '',
            streamName: '',
            partnerSpeakMin: 3000,
            partnerSpeakMax: 8000,
            replyMin: 1000,
            replyMax: 3000,
            cardCountMin: 1,
            cardCountMax: 3,
            combineMin: 1,
            combineMax: 2,
        }, savedSettings);

        state.records = await lsLoad('records', []);

        // 获取当前会话信息
        var s = window.settings || {};
        state.streamerName = state.settings.streamName || s.myName || '我';
        state.streamerAvatar = state.settings.streamAvatar || s.myAvatar || '';
        state.partnerName = s.partnerName || '梦角';
        state.partnerAvatar = s.partnerAvatar || '';

        applyBackground();
    }

    // ===== 应用背景 =====
    function applyBackground() {
        var view = $('ls-main-view');
        if (!view) return;
        var bg = state.settings.streamBackground;
        if (bg) {
            view.style.backgroundImage = 'url(' + bg + ')';
            view.style.backgroundSize = 'cover';
            view.style.backgroundPosition = 'center';
            view.classList.add('ls-has-bg');
        } else {
            view.style.backgroundImage = '';
            view.classList.remove('ls-has-bg');
        }
    }

    // ===== 构建主视图 =====
    function buildMainView() {
        var page = $('live-stream-page');
        if (!page) return;

        page.innerHTML = `
        <!-- 主视图 -->
        <div class="ls-main-view" id="ls-main-view">
            <div class="ls-header">
                <button class="ls-back-btn" id="ls-back-main">${ICON.back}</button>
                <h1 class="ls-title">直播</h1>
            </div>
            <div class="ls-content">
                <div class="ls-hero">
                    <span class="ls-hero-en">Live Stream</span>
                    <p class="ls-hero-desc">分享你的精彩时刻</p>
                </div>
            </div>
            <div class="ls-bottom-bar">
                <button class="ls-bottom-btn" id="ls-records-btn">
                    ${ICON.records}
                    <span>直播记录</span>
                </button>
                <button class="ls-bottom-plus" id="ls-start-btn" title="开始直播">${ICON.plus}</button>
                <button class="ls-bottom-btn" id="ls-settings-btn">
                    ${ICON.settings}
                    <span>设置</span>
                </button>
            </div>
        </div>

        <!-- 直播中视图 -->
        <div class="ls-stream-view" id="ls-stream-view" style="display:none;">
            <div class="ls-stream-canvas" id="ls-stream-canvas">
                <video id="ls-screen-video" autoplay playsinline></video>
                <div class="ls-stream-placeholder" id="ls-stream-placeholder">
                    ${ICON.screen}
                    <p>等待录屏画面</p>
                </div>
            </div>
            <div class="ls-stream-top">
                <div class="ls-streamer-info">
                    <img class="ls-streamer-avatar" id="ls-streamer-avatar" src="">
                    <span class="ls-streamer-name" id="ls-streamer-name"></span>
                </div>
                <div class="ls-stream-timer" id="ls-stream-timer">00:00</div>
                <button class="ls-end-btn" id="ls-end-btn">结束</button>
                <div class="ls-viewers">
                    <img class="ls-viewer-avatar" id="ls-viewer-avatar" src="">
                </div>
            </div>
            <div class="ls-chat-area" id="ls-chat-area"></div>
            <div class="ls-actions">
                <button class="ls-action-btn" id="ls-like-btn" title="点赞">${ICON.heart}
                    <span class="ls-action-badge" id="ls-like-badge" style="display:none;">0</span>
                </button>
                <button class="ls-action-btn" id="ls-gift-btn" title="礼物">${ICON.gift}</button>
                <button class="ls-action-btn" id="ls-favorite-btn" title="收藏">${ICON.star}</button>
                <button class="ls-action-btn" id="ls-share-btn" title="转发">${ICON.share}</button>
                <button class="ls-action-btn" id="ls-volume-btn" title="声音">${ICON.volumeOff}</button>
            </div>
            <div class="ls-input-bar">
                <input type="text" class="ls-input" id="ls-input" placeholder="说点什么...">
                <button class="ls-send-btn" id="ls-send-btn">${ICON.send}</button>
            </div>
            <!-- 礼物面板 -->
            <div class="ls-gift-panel" id="ls-gift-panel" style="display:none;">
                <h3>选择礼物</h3>
                <div class="ls-gift-grid" id="ls-gift-grid"></div>
                <button class="ls-gift-records-btn" id="ls-gift-records-btn">查看本场礼物记录</button>
            </div>
            <!-- 礼物记录弹窗 -->
            <div class="ls-modal-overlay" id="ls-gift-records-modal" style="display:none;">
                <div class="ls-modal">
                    <h2>礼物记录</h2>
                    <div class="ls-modal-en">Gift Records</div>
                    <div class="ls-gift-records-list" id="ls-stream-gift-list"></div>
                    <div class="ls-modal-actions">
                        <button class="ls-btn ls-btn-primary" id="ls-close-gift-records">关闭</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 开始直播弹窗 -->
        <div class="ls-modal-overlay" id="ls-start-modal" style="display:none;">
            <div class="ls-modal">
                <h2>开始直播</h2>
                <div class="ls-modal-en">Start Streaming</div>
                <div class="ls-form-group">
                    <label class="ls-form-label">直播名称</label>
                    <input type="text" class="ls-form-input" id="ls-stream-name-input" placeholder="给你的直播取个名字" maxlength="30">
                </div>
                <div class="ls-form-group">
                    <label class="ls-form-label">邀请对象</label>
                    <div class="ls-partner-list" id="ls-partner-list"></div>
                </div>
                <div class="ls-form-group">
                    <label class="ls-form-label">录屏方式</label>
                    <div id="ls-camera-preview" style="display:none;margin-bottom:12px;">
                        <div style="position:relative;width:100%;padding-top:56.25%;background:#000;border-radius:10px;overflow:hidden;">
                            <video id="ls-camera-video" autoplay muted playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"></video>
                        </div>
                        <p style="font-size:11px;color:#4caf50;margin-top:6px;text-align:center;">摄像机预览中</p>
                    </div>
                    <button class="ls-btn ls-btn-primary" id="ls-capture-btn" style="width:100%;">
                        ${ICON.screen} 选择录屏画面
                    </button>
                    <p style="font-size:12px;color:#999;margin-top:6px;">点击选择要直播的屏幕/窗口，也可跳过使用模拟画面</p>
                    <div style="text-align:center;margin:8px 0;color:rgba(255,255,255,0.3);font-size:12px;">— 或 —</div>
                    <input type="file" id="ls-video-import" accept="video/*" style="display:none;">
                    <button class="ls-btn ls-btn-secondary" id="ls-video-btn" style="width:100%;">
                        ${ICON.video} 导入视频文件
                    </button>
                    <p style="font-size:12px;color:#999;margin-top:6px;">导入视频文件模拟录屏画面，循环播放</p>
                    <div id="ls-video-fit-group" style="display:none;margin-top:10px;">
                        <label class="ls-form-label">视频尺寸</label>
                        <div class="ls-fit-options">
                            <button class="ls-fit-btn selected" data-fit="contain">完整显示</button>
                            <button class="ls-fit-btn" data-fit="cover">填充全屏</button>
                            <button class="ls-fit-btn" data-fit="fill">拉伸填充</button>
                        </div>
                        <p style="font-size:11px;color:#999;margin-top:4px;">完整显示=留黑边看全部画面，填充全屏=裁剪铺满，拉伸填充=变形铺满</p>
                    </div>
                    <div style="text-align:center;margin:8px 0;color:rgba(255,255,255,0.3);font-size:12px;">— 或 —</div>
                    <button class="ls-btn ls-btn-secondary" id="ls-camera-btn" style="width:100%;">
                        ${ICON.camera} 使用摄像机直播
                    </button>
                    <p style="font-size:12px;color:#999;margin-top:6px;">使用设备摄像头实时拍摄画面进行直播</p>
                </div>
                <div class="ls-modal-actions">
                    <button class="ls-btn ls-btn-cancel" id="ls-cancel-start">取消</button>
                    <button class="ls-btn ls-btn-primary" id="ls-confirm-start">开始直播</button>
                </div>
            </div>
        </div>

        <!-- 直播记录视图 -->
        <div class="ls-records-view" id="ls-records-view" style="display:none;">
            <div class="ls-records-header">
                <button class="ls-back-btn" id="ls-back-records">${ICON.back}</button>
                <h2>直播记录</h2>
            </div>
            <div class="ls-records-list" id="ls-records-list"></div>
        </div>

        <!-- 设置视图 -->
        <div class="ls-settings-view" id="ls-settings-view" style="display:none;">
            <div class="ls-records-header">
                <button class="ls-back-btn" id="ls-back-settings">${ICON.back}</button>
                <h2>直播设置</h2>
            </div>
            <div class="ls-settings-content" id="ls-settings-content"></div>
        </div>

        <!-- 数据分析视图 -->
        <div class="ls-analysis-view" id="ls-analysis-view" style="display:none;">
            <div class="ls-records-header">
                <button class="ls-back-btn" id="ls-back-analysis">${ICON.back}</button>
                <h2>直播数据</h2>
            </div>
            <div class="ls-analysis-content" id="ls-analysis-content"></div>
        </div>
        `;
    }

    // ===== 事件绑定 =====
    function bindEvents() {
        // 返回主应用
        on('ls-back-main', 'click', function() {
            if (window.LiveStreamApp && window.LiveStreamApp.close) window.LiveStreamApp.close();
        });

        // 开始直播按钮
        on('ls-start-btn', 'click', function() {
            openStartModal();
        });

        // 记录按钮
        on('ls-records-btn', 'click', function() {
            renderRecords();
            showView('ls-records-view');
        });

        // 设置按钮
        on('ls-settings-btn', 'click', function() {
            renderSettings();
            showView('ls-settings-view');
        });

        // 子视图返回
        on('ls-back-records', 'click', function() { showView('ls-main-view'); });
        on('ls-back-settings', 'click', function() { showView('ls-main-view'); });
        on('ls-back-analysis', 'click', function() { showView('ls-records-view'); });

        // 开始直播弹窗
        on('ls-cancel-start', 'click', function() { hideModal('ls-start-modal'); });
        on('ls-confirm-start', 'click', function() { startStreaming(); });
        on('ls-capture-btn', 'click', function() { captureScreen(); });
        on('ls-video-btn', 'click', function() {
            var input = $('ls-video-import');
            if (input) input.click();
        });
        on('ls-camera-btn', 'click', function() {
            if (state.cameraActive) {
                stopCameraPreview();
            } else {
                startCameraPreview();
            }
        });

        // 直播中事件
        on('ls-end-btn', 'click', function() { endStreaming(); });
        on('ls-send-btn', 'click', function() { sendUserMessage(); });
        on('ls-input', 'keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); sendUserMessage(); }
        });

        // 右侧操作按钮
        on('ls-like-btn', 'click', function() { userLike(); });
        on('ls-gift-btn', 'click', function() { toggleGiftPanel(); });
        on('ls-favorite-btn', 'click', function() { userFavorite(); });
        on('ls-share-btn', 'click', function() { userShare(); });
        on('ls-volume-btn', 'click', function() { toggleVolume(); });

        // 点击直播画面关闭礼物面板
        on('ls-stream-canvas', 'click', function() {
            hideGiftPanel();
        });

        // 礼物记录查看
        on('ls-gift-records-btn', 'click', function() {
            renderStreamGiftRecords();
            showModal('ls-gift-records-modal');
        });
        on('ls-close-gift-records', 'click', function() {
            hideModal('ls-gift-records-modal');
        });
    }

    function on(id, event, handler) {
        var el = $(id);
        if (!el) return;
        // 使用标记位避免重复绑定，不使用 cloneNode 避免破坏 DOM 引用
        var key = '_ls_bound_' + event;
        if (el[key]) {
            el.removeEventListener(event, el[key]);
        }
        el[key] = handler;
        el.addEventListener(event, handler);
    }

    // ===== 开始直播弹窗 =====
    function openStartModal() {
        // 填充直播名称
        var nameInput = $('ls-stream-name-input');
        if (nameInput) nameInput.value = state.streamerName + '的直播';

        // 填充对象列表
        var listEl = $('ls-partner-list');
        if (listEl) {
            var sessions = window.sessionList || [];
            var html = '';
            if (sessions.length === 0) {
                html = '<p style="color:#999;font-size:13px;text-align:center;padding:12px;">暂无会话对象</p>';
            } else {
                sessions.forEach(function(sess) {
                    var name = sess.name || '未命名';
                    var avatar = '';
                    try {
                        var s = window.settings || {};
                        if (s.partnerAvatar) avatar = s.partnerAvatar;
                    } catch(e) {}
                    var selected = sess.id === window.SESSION_ID ? 'selected' : '';
                    html += `<div class="ls-partner-item ${selected}" data-session-id="${esc(sess.id)}">
                        <img src="${esc(avatar || '')}" onerror="this.style.display='none'">
                        <span>${esc(name)}</span>
                        <div class="ls-check"></div>
                    </div>`;
                });
            }
            listEl.innerHTML = html;

            // 绑定选择事件
            listEl.querySelectorAll('.ls-partner-item').forEach(function(item) {
                item.onclick = function() {
                    listEl.querySelectorAll('.ls-partner-item').forEach(function(i) { i.classList.remove('selected'); });
                    item.classList.add('selected');
                    state.selectedPartner = {
                        id: item.dataset.sessionId,
                        name: item.querySelector('span').textContent,
                        avatar: item.querySelector('img').src,
                    };
                };
            });

            // 默认选中当前会话
            if (!state.selectedPartner) {
                state.selectedPartner = {
                    id: window.SESSION_ID,
                    name: state.partnerName,
                    avatar: state.partnerAvatar,
                };
            }
        }

        // 重置视频导入状态
        state.videoFile = null;
        state.videoMode = false;
        state.videoFit = 'contain';
        state.cameraMode = false;
        state.cameraActive = false;
        state.cameraSelected = false;
        // 停止可能存在的摄像机流
        if (state.cameraStream) {
            state.cameraStream.getTracks().forEach(function(t) { t.stop(); });
            state.cameraStream = null;
        }
        var videoBtn = $('ls-video-btn');
        var captureBtn = $('ls-capture-btn');
        var fitGroup = $('ls-video-fit-group');
        var cameraBtn = $('ls-camera-btn');
        var previewBox = $('ls-camera-preview');
        var previewVideo = $('ls-camera-video');
        if (previewBox) previewBox.style.display = 'none';
        if (previewVideo) previewVideo.srcObject = null;
        if (videoBtn) {
            videoBtn.innerHTML = ICON.video + ' 导入视频文件';
            videoBtn.style.display = '';
        }
        if (captureBtn) captureBtn.style.display = '';
        if (fitGroup) fitGroup.style.display = 'none';
        if (cameraBtn) {
            cameraBtn.innerHTML = ICON.camera + ' 使用摄像机直播';
            cameraBtn.style.display = '';
            cameraBtn.style.opacity = '1';
            cameraBtn.style.pointerEvents = '';
        }
        var videoInput = $('ls-video-import');
        if (videoInput) {
            videoInput.value = '';
            videoInput.onchange = function(e) {
                if (e.target.files && e.target.files[0]) {
                    var file = e.target.files[0];
                    if (!file.type.startsWith('video/')) {
                        toast('请选择视频文件');
                        return;
                    }
                    state.videoFile = file;
                    state.videoMode = true;
                    state.cameraMode = false;
                    state.cameraActive = false;
                    state.cameraSelected = false;
                    // 停止可能存在的摄像机流
                    if (state.cameraStream) {
                        state.cameraStream.getTracks().forEach(function(t) { t.stop(); });
                        state.cameraStream = null;
                    }
                    // 隐藏摄像机预览
                    var camPreview = $('ls-camera-preview');
                    if (camPreview) camPreview.style.display = 'none';
                    toast('已选择视频: ' + file.name);
                    if (videoBtn) {
                        videoBtn.innerHTML = ICON.video + ' \u2713 ' + file.name;
                    }
                    if (captureBtn) captureBtn.style.display = 'none';
                    if (cameraBtn) {
                        cameraBtn.innerHTML = ICON.camera + ' 使用摄像机直播';
                        cameraBtn.style.display = '';
                    }
                    if (fitGroup) fitGroup.style.display = 'block';
                }
            };
        }

        // 绑定尺寸选择按钮
        var fitBtns = document.querySelectorAll('.ls-fit-btn');
        fitBtns.forEach(function(btn) {
            btn.onclick = function() {
                fitBtns.forEach(function(b) { b.classList.remove('selected'); });
                btn.classList.add('selected');
                state.videoFit = btn.dataset.fit;
                // 如果正在播放视频，实时更新
                var video = $('ls-screen-video');
                if (video && state.videoMode) {
                    video.style.objectFit = state.videoFit;
                }
            };
        });

        showModal('ls-start-modal');
    }
    function isNativeBridgeAvailable() {
        return typeof window.AndroidScreenCapture !== 'undefined' && window.AndroidScreenCapture.isAvailable && window.AndroidScreenCapture.isAvailable();
    }

    // ===== 屏幕捕获 =====
    async function captureScreen() {
        // 停止可能存在的摄像机
        if (state.cameraStream) {
            state.cameraStream.getTracks().forEach(function(t) { t.stop(); });
            state.cameraStream = null;
        }
        state.cameraMode = false;
        state.cameraActive = false;
        state.cameraSelected = false;
        var camPreview = $('ls-camera-preview');
        if (camPreview) camPreview.style.display = 'none';
        var cameraBtn = $('ls-camera-btn');
        if (cameraBtn) {
            cameraBtn.innerHTML = ICON.camera + ' 使用摄像机直播';
            cameraBtn.style.opacity = '1';
            cameraBtn.style.pointerEvents = '';
        }

        // 策略1：Android 原生 App（通过 JS Bridge + MediaProjection）
        if (isNativeBridgeAvailable()) {
            captureScreenNative();
            return;
        }

        // 策略2：浏览器 getDisplayMedia（桌面 Chrome/Edge）
        if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
            captureScreenWeb();
            return;
        }

        // 策略3：均不支持，使用模拟画面
        toast('当前环境不支持录屏，将使用模拟画面');
    }

    /**
     * 原生录屏：通过 Android MediaProjection
     * JS Bridge 调用流程：
     *   startCapture() → 系统弹出录屏权限 → onCaptureStarted() 回调
     */
    function captureScreenNative() {
        // 设置原生回调（在直播页面注入全局回调函数）
        window.AndroidScreenCapture.onCaptureStarted = function() {
            var video = $('ls-screen-video');
            var placeholder = $('ls-stream-placeholder');
            if (placeholder) placeholder.style.display = 'none';
            // 原生录屏不直接提供 MediaStream 给 video 元素，
            // 而是通过虚拟摄像头或 Surface 投射方式显示画面。
            // 这里显示录屏已就绪的占位画面
            if (video) {
                video.style.background = '#0d3b66';
                video.style.display = 'flex';
                video.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;color:#fff;gap:12px;">' +
                    ICON.screen +
                    '<p style="font-size:13px;letter-spacing:2px;">原生录屏进行中</p>' +
                    '<p style="font-size:11px;color:rgba(255,255,255,0.5);">手机桌面画面正在投射</p>' +
                    '</div>';
            }
            state.nativeCapturing = true;
            toast('原生录屏已开始，手机桌面正在投射');
        };

        window.AndroidScreenCapture.onCaptureError = function(msg) {
            toast(msg || '录屏权限被拒绝');
            state.nativeCapturing = false;
        };

        window.AndroidScreenCapture.onCaptureStopped = function() {
            state.nativeCapturing = false;
            var placeholder = $('ls-stream-placeholder');
            if (placeholder) placeholder.style.display = 'flex';
            var video = $('ls-screen-video');
            if (video) video.innerHTML = '';
            toast('录屏已停止');
        };

        // 发起录屏权限请求
        try {
            window.AndroidScreenCapture.startCapture();
            toast('请在弹出的对话框中允许录屏');
        } catch(e) {
            toast('原生录屏启动失败: ' + e.message);
        }
    }

    /**
     * 浏览器录屏：通过 getDisplayMedia API
     */
    async function captureScreenWeb() {
        try {
            var stream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' },
                audio: false,
            });
            state.screenStream = stream;
            var video = $('ls-screen-video');
            if (video) {
                video.srcObject = stream;
                var placeholder = $('ls-stream-placeholder');
                if (placeholder) placeholder.style.display = 'none';
            }
            stream.getVideoTracks()[0].addEventListener('ended', function() {
                state.screenStream = null;
                var ph = $('ls-stream-placeholder');
                if (ph) ph.style.display = 'flex';
            });
            toast('录屏画面已就绪');
        } catch(e) {
            toast('未选择录屏画面，可使用模拟画面');
        }
    }

    /**
     * 摄像机预览：通过 getUserMedia 获取摄像头画面
     */
    async function startCameraPreview() {
        if (state.cameraActive) return;

        state.cameraSelected = true;
        var cameraBtn = $('ls-camera-btn');
        var previewBox = $('ls-camera-preview');

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            // 显示持久错误提示在预览区域
            if (previewBox) {
                previewBox.style.display = 'block';
                previewBox.innerHTML = '<div style="position:relative;width:100%;padding-top:56.25%;background:#1a1a2e;border-radius:10px;overflow:hidden;">' +
                    '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:20px;text-align:center;">' +
                    '<svg viewBox="0 0 24 24" style="width:40px;height:40px;stroke:rgba(255,255,255,0.3);stroke-width:1.5;fill:none;"><path d="M23 7l-7 5 7 5V7z" stroke-linecap="round" stroke-linejoin="round"/><rect x="1" y="5" width="15" height="14" rx="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
                    '<p style="font-size:13px;color:rgba(255,255,255,0.7);margin:0;line-height:1.6;">当前环境不支持摄像头访问</p>' +
                    '<p style="font-size:11px;color:rgba(255,255,255,0.4);margin:0;line-height:1.5;">摄像头需要 HTTPS 或 localhost 环境<br>请使用 https://你的IP:3001 访问<br>或在同一设备上用 localhost 访问</p>' +
                    '</div></div>';
            }
            toast('当前环境不支持摄像头，需要 HTTPS 或 localhost');
            return;
        }

        // 如果已有摄像头流，先停止
        if (state.cameraStream) {
            state.cameraStream.getTracks().forEach(function(t) { t.stop(); });
            state.cameraStream = null;
        }

        var captureBtn = $('ls-capture-btn');
        var videoBtn = $('ls-video-btn');
        var fitGroup = $('ls-video-fit-group');
        var previewVideo = $('ls-camera-video');

        // 显示加载中状态
        if (cameraBtn) {
            cameraBtn.innerHTML = ICON.camera + ' 正在请求摄像头权限...';
            cameraBtn.style.opacity = '0.6';
            cameraBtn.style.pointerEvents = 'none';
        }
        if (previewBox) {
            previewBox.style.display = 'block';
            // 先显示加载提示
            previewBox.innerHTML = '<div style="position:relative;width:100%;padding-top:56.25%;background:#1a1a2e;border-radius:10px;overflow:hidden;display:flex;align-items:center;justify-content:center;">' +
                '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;">' +
                '<div style="width:32px;height:32px;border:3px solid rgba(255,255,255,0.2);border-top-color:#4caf50;border-radius:50%;animation:ls-spin 0.8s linear infinite;"></div>' +
                '<p style="font-size:12px;color:rgba(255,255,255,0.6);margin:0;">正在连接摄像头...</p>' +
                '</div></div>' +
                '<p style="font-size:11px;color:#4caf50;margin-top:6px;text-align:center;">摄像机预览中</p>';
        }

        try {
            var constraints = {
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false,
            };
            var stream = await navigator.mediaDevices.getUserMedia(constraints);
            state.cameraStream = stream;
            state.cameraMode = true;
            state.cameraActive = true;
            state.videoMode = false;
            state.videoFile = null;

            // 重建预览 video 元素（因为 innerHTML 被重写了）
            if (previewBox) {
                previewBox.innerHTML = '<div style="position:relative;width:100%;padding-top:56.25%;background:#000;border-radius:10px;overflow:hidden;">' +
                    '<video id="ls-camera-video" autoplay muted playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"></video>' +
                    '</div>' +
                    '<p style="font-size:11px;color:#4caf50;margin-top:6px;text-align:center;">摄像机预览中</p>';
            }
            // 重新获取 video 元素
            previewVideo = $('ls-camera-video');

            if (previewVideo) {
                previewVideo.srcObject = stream;
                previewVideo.play().catch(function(e) {
                    console.warn('Camera preview play failed:', e);
                });
            }

            // 更新按钮状态
            if (cameraBtn) {
                cameraBtn.innerHTML = ICON.camera + ' \u2713 摄像机已就绪（点击关闭）';
                cameraBtn.style.opacity = '1';
                cameraBtn.style.pointerEvents = '';
            }
            if (captureBtn) captureBtn.style.display = 'none';
            if (videoBtn) {
                videoBtn.innerHTML = ICON.video + ' 导入视频文件';
                videoBtn.style.display = 'none';
            }
            if (fitGroup) fitGroup.style.display = 'none';

            toast('摄像机已就绪，点击开始直播');
        } catch(e) {
            console.error('Camera access error:', e);
            // 恢复按钮状态
            if (cameraBtn) {
                cameraBtn.innerHTML = ICON.camera + ' 使用摄像机直播';
                cameraBtn.style.opacity = '1';
                cameraBtn.style.pointerEvents = '';
            }
            // 隐藏预览框
            if (previewBox) previewBox.style.display = 'none';
            state.cameraMode = false;
            state.cameraActive = false;

            var errMsg = '无法访问摄像头';
            if (e.name === 'NotAllowedError') {
                errMsg = '摄像头权限被拒绝，请在浏览器设置中允许摄像头访问';
            } else if (e.name === 'NotFoundError') {
                errMsg = '未找到摄像头设备';
            } else if (e.name === 'NotReadableError') {
                errMsg = '摄像头被其他程序占用';
            } else if (e.message) {
                errMsg = '无法访问摄像头: ' + e.message;
            }
            toast(errMsg);
        }
    }

    /**
     * 停止摄像机预览（从开始弹窗中关闭）
     */
    function stopCameraPreview() {
        stopCamera();
        state.cameraActive = false;
        state.cameraSelected = false;

        var cameraBtn = $('ls-camera-btn');
        var captureBtn = $('ls-capture-btn');
        var videoBtn = $('ls-video-btn');
        var fitGroup = $('ls-video-fit-group');
        var previewBox = $('ls-camera-preview');
        var previewVideo = $('ls-camera-video');

        if (cameraBtn) {
            cameraBtn.innerHTML = ICON.camera + ' 使用摄像机直播';
            cameraBtn.style.display = '';
        }
        if (captureBtn) captureBtn.style.display = '';
        if (videoBtn) videoBtn.style.display = '';
        if (fitGroup) fitGroup.style.display = 'none';
        if (previewBox) previewBox.style.display = 'none';
        if (previewVideo) {
            previewVideo.srcObject = null;
        }
        toast('已关闭摄像机');
    }

    /**
     * 停止摄像机
     */
    function stopCamera() {
        if (state.cameraStream) {
            state.cameraStream.getTracks().forEach(function(t) { t.stop(); });
            state.cameraStream = null;
        }
        state.cameraMode = false;
    }

    /**
     * 停止所有录屏（兼容原生、浏览器和摄像机）
     */
    function stopAllCapture() {
        // 停止原生录屏
        if (state.nativeCapturing && isNativeBridgeAvailable()) {
            try { window.AndroidScreenCapture.stopCapture(); } catch(e) {}
            state.nativeCapturing = false;
        }
        // 停止浏览器录屏
        if (state.screenStream) {
            state.screenStream.getTracks().forEach(function(t) { t.stop(); });
            state.screenStream = null;
        }
        // 停止摄像机
        stopCamera();
        // 停止视频播放
        stopVideoPlayback();
    }

    /**
     * 更新声音按钮图标
     */
    function updateVolumeBtn(isMuted) {
        var btn = $('ls-volume-btn');
        if (!btn) return;
        if (isMuted) {
            btn.innerHTML = ICON.volumeOff;
            btn.classList.remove('active');
        } else {
            btn.innerHTML = ICON.volumeOn;
            btn.classList.add('active');
        }
    }

    /**
     * 切换静音/取消静音
     */
    function toggleVolume() {
        var video = $('ls-screen-video');
        if (!video) return;
        video.muted = !video.muted;
        if (!video.muted) {
            video.volume = 1;
            // 取消静音后需要重新触发播放以恢复声音
            video.play().catch(function() {});
        }
        updateVolumeBtn(video.muted);
        toast(video.muted ? '已静音' : '已开启声音');
    }

    /**
     * 视频文件播放：模拟录屏画面
     */
    function playVideoFile() {
        var video = $('ls-screen-video');
        var placeholder = $('ls-stream-placeholder');
        if (!state.videoFile || !video) return;

        if (placeholder) placeholder.style.display = 'none';

        // 释放之前的 URL
        if (state.videoObjectURL) {
            URL.revokeObjectURL(state.videoObjectURL);
        }

        state.videoObjectURL = URL.createObjectURL(state.videoFile);
        video.srcObject = null;
        video.src = state.videoObjectURL;
        video.loop = true;
        video.style.objectFit = state.videoFit || 'contain';
        // 尝试带声音播放
        video.muted = false;
        video.volume = 1;
        video.play().then(function() {
            // 播放成功，更新按钮图标
            updateVolumeBtn(false);
        }).catch(function() {
            // 自动播放策略阻止，静音后重试
            video.muted = true;
            video.play().then(function() {
                updateVolumeBtn(true);
                toast('浏览器限制需静音播放，点击声音按钮可开启声音');
            }).catch(function() {});
        });

        state.videoMode = true;
        toast('视频播放已开始');
    }

    /**
     * 停止视频播放并清理资源
     */
    function stopVideoPlayback() {
        var video = $('ls-screen-video');
        if (video && state.videoMode) {
            video.pause();
            video.src = '';
            video.srcObject = null;
        }
        if (state.videoObjectURL) {
            URL.revokeObjectURL(state.videoObjectURL);
            state.videoObjectURL = null;
        }
        state.videoFile = null;
        state.videoMode = false;
        // 重置音量按钮为静音状态
        updateVolumeBtn(true);
    }

    // ===== 开始直播 =====
    function startStreaming() {
        var nameInput = $('ls-stream-name-input');
        var streamName = nameInput ? nameInput.value.trim() : '';
        if (!streamName) streamName = state.streamerName + '的直播';

        var partner = state.selectedPartner || {
            id: window.SESSION_ID,
            name: state.partnerName,
            avatar: state.partnerAvatar,
        };

        // 重置状态
        state.streaming = true;
        state.startTime = Date.now();
        state.messages = [];
        state.likes = 0;
        state.favorites = false;
        state.shares = 0;
        state.gifts = [];
        state.partnerName = partner.name;
        state.partnerAvatar = partner.avatar;

        hideModal('ls-start-modal');
        showView('ls-stream-view');

        // 根据模式启动画面
        var streamVideo = $('ls-screen-video');
        var streamPlaceholder = $('ls-stream-placeholder');

        if (state.videoMode && state.videoFile) {
            // 视频文件模式
            playVideoFile();
        } else if (state.cameraMode && state.cameraStream) {
            // 摄像机模式：确保流已绑定到 video 元素
            if (streamPlaceholder) streamPlaceholder.style.display = 'none';
            if (streamVideo) {
                streamVideo.srcObject = state.cameraStream;
                streamVideo.muted = true; // 摄像机模式默认静音（避免回声）
                streamVideo.style.objectFit = 'cover';
                streamVideo.play().catch(function() {});
            }
            updateVolumeBtn(true);
            toast('摄像机直播已开始');
        } else if (state.cameraSelected) {
            // 用户选择了摄像机但摄像头未能成功启动
            if (streamPlaceholder) {
                streamPlaceholder.innerHTML = ICON.camera +
                    '<p>摄像头未就绪</p>' +
                    '<p style="font-size:11px;opacity:0.6;">需通过 HTTPS 或 localhost 访问才能使用摄像头</p>';
                streamPlaceholder.style.display = 'flex';
            }
            if (streamVideo) streamVideo.muted = true;
            updateVolumeBtn(true);
            toast('摄像头未就绪，请检查访问环境');
        } else if (state.screenStream) {
            // 已有录屏流
            if (streamPlaceholder) streamPlaceholder.style.display = 'none';
            if (streamVideo) {
                streamVideo.srcObject = state.screenStream;
                streamVideo.muted = true;
                streamVideo.play().catch(function() {});
            }
            updateVolumeBtn(true);
        } else {
            // 录屏模式默认静音，等待用户选择录屏画面
            if (streamVideo) streamVideo.muted = true;
            updateVolumeBtn(true);
        }
        // 设置顶部信息
        var avatarEl = $('ls-streamer-avatar');
        if (avatarEl) {
            avatarEl.src = state.streamerAvatar || '';
            avatarEl.onerror = function() { this.style.visibility = 'hidden'; };
        }
        var nameEl = $('ls-streamer-name');
        if (nameEl) nameEl.textContent = streamName;

        var viewerAvatar = $('ls-viewer-avatar');
        if (viewerAvatar) {
            viewerAvatar.src = state.partnerAvatar || '';
            viewerAvatar.onerror = function() { this.style.visibility = 'hidden'; };
        }

        // 初始化礼物面板
        renderGiftPanel();

        // 开始计时
        startTimer();

        // 开始 AI 对方发言
        startPartnerAI();

        // 欢迎消息
        addChatMessage('system', '直播已开始，等待观众加入...');
        setTimeout(function() {
            addChatMessage('partner', state.partnerName, '来啦来啦，看你直播！');
        }, 1500);
    }

    // ===== 计时器 =====
    function startTimer() {
        if (state.timerInterval) clearInterval(state.timerInterval);
        state.timerInterval = setInterval(function() {
            var elapsed = Math.floor((Date.now() - state.startTime) / 1000);
            var min = Math.floor(elapsed / 60);
            var sec = elapsed % 60;
            var timerEl = $('ls-stream-timer');
            if (timerEl) {
                timerEl.textContent = (min < 10 ? '0' : '') + min + ':' + (sec < 10 ? '0' : '') + sec;
            }
        }, 1000);
    }

    // ===== AI 对方发言 =====
    function startPartnerAI() {
        if (state.partnerInterval) clearTimeout(state.partnerInterval);
        var s = state.settings;

        function scheduleNext() {
            if (!state.streaming) return;
            var delay = randDelay(s.partnerSpeakMin || 3000, s.partnerSpeakMax || 8000);
            state.partnerInterval = setTimeout(function() {
                if (!state.streaming) return;
                // 随机行为：发言(60%)、点赞(25%)、送礼(15%)
                var r = Math.random();
                if (r < 0.6) {
                    var msg = generateMessage();
                    addChatMessage('partner', state.partnerName, msg);
                } else if (r < 0.85) {
                    partnerLike();
                } else {
                    partnerSendGift();
                }
                scheduleNext();
            }, delay);
        }
        scheduleNext();
    }

    // ===== 聊天消息 =====
    function addChatMessage(type, name, text) {
        var ts = Date.now();
        state.messages.push({ type: type, name: name, text: text, timestamp: ts });

        var area = $('ls-chat-area');
        if (!area) return;

        var msgEl = document.createElement('div');
        msgEl.className = 'ls-chat-msg ' + type;

        if (type === 'system') {
            msgEl.innerHTML = '<div class="ls-msg-text">' + esc(text) + '</div>';
        } else {
            // 头像
            var avatarUrl = '';
            var placeholderColor = '';
            var displayName = name || '';
            if (type === 'partner') {
                avatarUrl = state.partnerAvatar || '';
                placeholderColor = '#e91e63';
            } else {
                avatarUrl = state.streamerAvatar || '';
                placeholderColor = '#0d3b66';
            }
            var initial = displayName.charAt(0) || '?';

            var avatarHtml = '';
            if (avatarUrl) {
                avatarHtml = '<img class="ls-msg-avatar" src="' + esc(avatarUrl) + '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
                    '<div class="ls-msg-avatar-placeholder" style="display:none;background:' + placeholderColor + ';">' + esc(initial) + '</div>';
            } else {
                avatarHtml = '<div class="ls-msg-avatar-placeholder" style="background:' + placeholderColor + ';">' + esc(initial) + '</div>';
            }

            msgEl.innerHTML = avatarHtml +
                '<div class="ls-msg-bubble">' +
                '<div class="ls-msg-name">' + esc(displayName) + '</div>' +
                '<div class="ls-msg-text">' + esc(text) + '</div>' +
                '</div>';
        }
        area.appendChild(msgEl);
        area.scrollTop = area.scrollHeight;

        // 限制消息数量
        while (area.children.length > 50) {
            area.removeChild(area.firstChild);
        }
    }

    // ===== 用户发送消息 =====
    function sendUserMessage() {
        var input = $('ls-input');
        if (!input) return;
        var text = input.value.trim();
        if (!text) return;
        addChatMessage('user', state.streamerName, text);
        input.value = '';

        // 对方回复
        var s = state.settings;
        var delay = randDelay(s.replyMin || 1000, s.replyMax || 3000);
        setTimeout(function() {
            if (!state.streaming) return;
            var reply = generateMessage();
            addChatMessage('partner', state.partnerName, reply);
        }, delay);
    }

    // ===== 点赞 =====
    function userLike() {
        state.likes++;
        updateLikeBadge();
        showLikeEffect();
    }

    function partnerLike() {
        state.likes++;
        updateLikeBadge();
        showLikeEffect();
        // 心形晃动特效（不晃动整个页面）
        showHeartWobble();
    }

    function updateLikeBadge() {
        var badge = $('ls-like-badge');
        if (badge) {
            badge.textContent = state.likes > 999 ? '999+' : state.likes;
            badge.style.display = state.likes > 0 ? 'flex' : 'none';
        }
    }

    function showLikeEffect() {
        var view = $('ls-stream-view');
        if (!view) return;
        var likeBtn = $('ls-like-btn');
        if (!likeBtn) return;
        var rect = likeBtn.getBoundingClientRect();
        var viewRect = view.getBoundingClientRect();

        var effect = document.createElement('div');
        effect.className = 'ls-like-effect';
        effect.innerHTML = ICON.heartFill;
        effect.style.left = (rect.left - viewRect.left + rect.width / 2 - 14) + 'px';
        effect.style.top = (rect.top - viewRect.top - 10) + 'px';
        view.appendChild(effect);
        setTimeout(function() { if (effect.parentNode) effect.remove(); }, 1500);
    }

    /**
     * 对方点赞时的心形晃动特效
     * 在屏幕中间偏上位置显示一个大爱心，进行晃动动画
     */
    function showHeartWobble() {
        var view = $('ls-stream-view');
        if (!view) return;
        var viewRect = view.getBoundingClientRect();

        var wobble = document.createElement('div');
        wobble.className = 'ls-heart-wobble';
        wobble.innerHTML = ICON.heartFill;
        // 定位在屏幕中间偏上
        wobble.style.left = (viewRect.width / 2 - 40) + 'px';
        wobble.style.top = (viewRect.height * 0.35) + 'px';
        view.appendChild(wobble);
        setTimeout(function() { if (wobble.parentNode) wobble.remove(); }, 1200);
    }

    // ===== 收藏 =====
    function userFavorite() {
        state.favorites = !state.favorites;
        var btn = $('ls-favorite-btn');
        if (btn) {
            if (state.favorites) {
                btn.classList.add('active');
                toast('已收藏直播');
            } else {
                btn.classList.remove('active');
                toast('已取消收藏');
            }
        }
    }

    // ===== 转发 =====
    function userShare() {
        state.shares++;
        toast('已转发直播');
    }

    // ===== 本场礼物记录 =====
    function renderStreamGiftRecords() {
        var list = $('ls-stream-gift-list');
        if (!list) return;
        if (state.gifts.length === 0) {
            list.innerHTML = '<p style="color:#999;font-size:13px;text-align:center;padding:20px 0;">暂无礼物记录</p>';
            return;
        }
        var html = '';
        state.gifts.forEach(function(g) {
            var giftDef = GIFTS.find(function(gf) { return gf.id === g.type; });
            var icon = giftDef ? giftDef.icon : ICON.gift;
            var fromName = g.from === 'user' ? '我' : state.partnerName;
            var toName = g.from === 'user' ? state.partnerName : '我';
            var time = new Date(g.timestamp);
            var timeStr = String(time.getHours()).padStart(2,'0') + ':' + String(time.getMinutes()).padStart(2,'0');
            html += '<div class="ls-gift-record-item">' +
                '<div style="width:24px;height:24px;flex-shrink:0;">' + icon + '</div>' +
                '<div class="ls-gift-record-info">' +
                '<div class="ls-gift-record-name">' + esc(fromName) + ' -> ' + esc(toName) + '</div>' +
                '<div class="ls-gift-record-count">' + g.name + ' x' + g.count + ' · ' + timeStr + '</div>' +
                '</div></div>';
        });
        list.innerHTML = html;
    }

    // ===== 礼物面板 =====
    function renderGiftPanel() {
        var grid = $('ls-gift-grid');
        if (!grid) return;
        var html = '';
        GIFTS.forEach(function(gift) {
            gift.counts.forEach(function(count) {
                html += `<div class="ls-gift-item" data-gift-id="${gift.id}" data-gift-count="${count}">
                    <div class="ls-gift-icon">${gift.icon}</div>
                    <div class="ls-gift-name">${gift.name}</div>
                    <div class="ls-gift-count">x${count}</div>
                </div>`;
            });
        });
        grid.innerHTML = html;

        grid.querySelectorAll('.ls-gift-item').forEach(function(item) {
            item.onclick = function() {
                var giftId = item.dataset.giftId;
                var count = parseInt(item.dataset.giftCount);
                var gift = GIFTS.find(function(g) { return g.id === giftId; });
                if (gift) {
                    sendGift(gift, count, 'user');
                    hideGiftPanel();
                }
            };
        });
    }

    function toggleGiftPanel() {
        var panel = $('ls-gift-panel');
        if (!panel) return;
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }
    function hideGiftPanel() {
        var panel = $('ls-gift-panel');
        if (panel) panel.style.display = 'none';
    }

    // ===== 发送礼物 =====
    function sendGift(gift, count, from) {
        var giftRecord = {
            type: gift.id,
            name: gift.name,
            count: count,
            from: from,
            timestamp: Date.now(),
        };
        state.gifts.push(giftRecord);

        // 系统提示
        var fromName = from === 'user' ? '你' : state.partnerName;
        var toName = from === 'user' ? state.partnerName : '你';
        var prompt = from === 'user'
            ? '你送出' + count + '朵' + gift.name
            : state.partnerName + '为你送来' + count + '朵' + gift.name;
        addChatMessage('system', '', prompt);

        // 礼物动画
        showGiftAnimation(gift, count);

        toast(prompt);
    }

    function showGiftAnimation(gift, count) {
        var view = $('ls-stream-view');
        if (!view) return;
        var anim = document.createElement('div');
        anim.className = 'ls-gift-animation';
        anim.innerHTML = gift.icon + '<p>' + count + ' ' + gift.name + '</p>';
        view.appendChild(anim);
        setTimeout(function() { if (anim.parentNode) anim.remove(); }, 2000);
    }

    function partnerSendGift() {
        var gift = GIFTS[Math.floor(Math.random() * GIFTS.length)];
        var count = gift.counts[Math.floor(Math.random() * gift.counts.length)];
        sendGift(gift, count, 'partner');
    }

    // ===== 结束直播 =====
    async function endStreaming() {
        if (!state.streaming) return;
        state.streaming = false;

        // 停止计时
        if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
        if (state.partnerInterval) { clearTimeout(state.partnerInterval); state.partnerInterval = null; }

        // 停止录屏
        if (state.screenStream) {
            state.screenStream.getTracks().forEach(function(t) { t.stop(); });
            state.screenStream = null;
        }

        // 停止摄像机
        stopCamera();

        // 停止视频播放
        stopVideoPlayback();

        // 恢复占位画面
        var placeholder = $('ls-stream-placeholder');
        if (placeholder) {
            placeholder.innerHTML = ICON.screen + '<p>等待录屏画面</p>';
            placeholder.style.display = 'flex';
        }
        var videoEl = $('ls-screen-video');
        if (videoEl) { videoEl.src = ''; videoEl.srcObject = null; }

        var duration = Math.floor((Date.now() - state.startTime) / 1000);

        // 保存记录
        var record = {
            id: Date.now().toString(36),
            name: $('ls-streamer-name') ? $('ls-streamer-name').textContent : '未命名直播',
            date: Date.now(),
            duration: duration,
            messages: state.messages,
            likes: state.likes,
            favorites: state.favorites ? 1 : 0,
            shares: state.shares,
            gifts: state.gifts,
            partnerName: state.partnerName,
            partnerAvatar: state.partnerAvatar,
        };

        state.records.unshift(record);
        await lsSave('records', state.records);

        // 重置UI
        hideGiftPanel();
        var likeBadge = $('ls-like-badge');
        if (likeBadge) likeBadge.style.display = 'none';
        var favBtn = $('ls-favorite-btn');
        if (favBtn) favBtn.classList.remove('active');

        toast('直播已结束，数据已保存');

        setTimeout(function() {
            applyBackground();
            showView('ls-main-view');
        }, 800);
    }

    // ===== 直播记录 =====
    function renderRecords() {
        var list = $('ls-records-list');
        if (!list) return;

        if (state.records.length === 0) {
            list.innerHTML = `<div class="ls-record-empty">
                ${ICON.records}
                <p>暂无直播记录</p>
            </div>`;
            return;
        }

        var html = '';
        state.records.forEach(function(r) {
            var date = new Date(r.date);
            var dateStr = (date.getMonth()+1) + '月' + date.getDate() + '日 ' +
                          String(date.getHours()).padStart(2,'0') + ':' + String(date.getMinutes()).padStart(2,'0');
            var min = Math.floor(r.duration / 60);
            var sec = r.duration % 60;
            var durStr = min + '分' + sec + '秒';
            var giftCount = r.gifts ? r.gifts.length : 0;

            html += `<div class="ls-record-card" data-record-id="${r.id}">
                <div class="ls-record-top">
                    <span class="ls-record-name">${esc(r.name)}</span>
                    <span class="ls-record-date">${dateStr}</span>
                </div>
                <div class="ls-record-stats">
                    <span>${ICON.chart} ${durStr}</span>
                    <span>${ICON.heart} ${r.likes}</span>
                    <span>${ICON.gift} ${giftCount}</span>
                    <span>${ICON.share} ${r.shares}</span>
                </div>
            </div>`;
        });
        list.innerHTML = html;

        list.querySelectorAll('.ls-record-card').forEach(function(card) {
            card.onclick = function() {
                var rid = card.dataset.recordId;
                var record = state.records.find(function(r) { return r.id === rid; });
                if (record) {
                    renderAnalysis(record);
                    showView('ls-analysis-view');
                }
            };
        });
    }

    // ===== 数据分析 =====
    function renderAnalysis(record) {
        var content = $('ls-analysis-content');
        if (!content) return;

        var min = Math.floor(record.duration / 60);
        var sec = record.duration % 60;
        var durStr = min + '分' + sec + '秒';
        var msgCount = record.messages ? record.messages.length : 0;
        var userMsgs = record.messages ? record.messages.filter(function(m){return m.type==='user'}).length : 0;
        var partnerMsgs = record.messages ? record.messages.filter(function(m){return m.type==='partner'}).length : 0;
        var giftCount = record.gifts ? record.gifts.length : 0;
        var totalGiftValue = record.gifts ? record.gifts.reduce(function(sum, g){return sum + g.count;}, 0) : 0;

        // 热度评分算法
        var heatScore = Math.round(
            msgCount * 10 +
            record.likes * 2 +
            giftCount * 50 +
            totalGiftValue * 0.1 +
            record.duration / 60 * 5 +
            record.shares * 15
        );
        var heatLevel, heatColor;
        if (heatScore < 100) { heatLevel = '冷场'; heatColor = '#6c757d'; }
        else if (heatScore < 300) { heatLevel = '温和'; heatColor = '#0d3b66'; }
        else if (heatScore < 600) { heatLevel = '热闹'; heatColor = '#ff9800'; }
        else { heatLevel = '火爆'; heatColor = '#ff4757'; }

        // AI 分析总结
        var aiSummary = generateAISummary(record, heatScore, heatLevel, msgCount, userMsgs, partnerMsgs, giftCount, totalGiftValue);

        // 礼物统计
        var giftStats = {};
        if (record.gifts) {
            record.gifts.forEach(function(g) {
                if (!giftStats[g.name]) giftStats[g.name] = { count: 0, name: g.name, icon: '' };
                giftStats[g.name].count += g.count;
                var giftDef = GIFTS.find(function(gf){return gf.id === g.type;});
                if (giftDef) giftStats[g.name].icon = giftDef.icon;
            });
        }
        var giftStatArr = Object.values(giftStats).sort(function(a,b){return b.count - a.count;});

        // 柱状图数据
        var maxStat = Math.max(msgCount, record.likes, giftCount, record.shares, 1);

        var html = `
            <h3 class="ls-analysis-title">${esc(record.name)}</h3>
            <div class="ls-analysis-en">Stream Analytics</div>

            <div class="ls-stat-grid">
                <div class="ls-stat-card">
                    <div class="ls-stat-value">${durStr}</div>
                    <div class="ls-stat-label">直播时长</div>
                </div>
                <div class="ls-stat-card">
                    <div class="ls-stat-value">${msgCount}</div>
                    <div class="ls-stat-label">消息总数</div>
                </div>
                <div class="ls-stat-card">
                    <div class="ls-stat-value">${record.likes}</div>
                    <div class="ls-stat-label">点赞次数</div>
                </div>
                <div class="ls-stat-card">
                    <div class="ls-stat-value">${giftCount}</div>
                    <div class="ls-stat-label">礼物数量</div>
                </div>
            </div>

            <div class="ls-chart-section">
                <div class="ls-chart-title">互动数据</div>
                <div class="ls-chart-container">
                    <div class="ls-bar-chart">
                        <div class="ls-bar-row">
                            <span class="ls-bar-label">消息</span>
                            <div class="ls-bar-track"><div class="ls-bar-fill" style="width:${(msgCount/maxStat*100)}%;background:#0d3b66;">${msgCount}</div></div>
                        </div>
                        <div class="ls-bar-row">
                            <span class="ls-bar-label">点赞</span>
                            <div class="ls-bar-track"><div class="ls-bar-fill" style="width:${(record.likes/maxStat*100)}%;background:#ff4757;">${record.likes}</div></div>
                        </div>
                        <div class="ls-bar-row">
                            <span class="ls-bar-label">礼物</span>
                            <div class="ls-bar-track"><div class="ls-bar-fill" style="width:${(giftCount/maxStat*100)}%;background:#ff9800;">${giftCount}</div></div>
                        </div>
                        <div class="ls-bar-row">
                            <span class="ls-bar-label">转发</span>
                            <div class="ls-bar-track"><div class="ls-bar-fill" style="width:${(record.shares/maxStat*100)}%;background:#42a5f5;">${record.shares}</div></div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="ls-chart-section">
                <div class="ls-chart-title">发言分布</div>
                <div class="ls-chart-container">
                    <div class="ls-bar-chart">
                        <div class="ls-bar-row">
                            <span class="ls-bar-label">我的发言</span>
                            <div class="ls-bar-track"><div class="ls-bar-fill" style="width:${(userMsgs/Math.max(msgCount,1)*100)}%;background:#0d3b66;">${userMsgs}</div></div>
                        </div>
                        <div class="ls-bar-row">
                            <span class="ls-bar-label">${esc(record.partnerName || '对方')}</span>
                            <div class="ls-bar-track"><div class="ls-bar-fill" style="width:${(partnerMsgs/Math.max(msgCount,1)*100)}%;background:#e91e63;">${partnerMsgs}</div></div>
                        </div>
                    </div>
                </div>
            </div>

            ${giftStatArr.length > 0 ? `
            <div class="ls-chart-section">
                <div class="ls-chart-title">礼物统计</div>
                <div class="ls-chart-container">
                    ${giftStatArr.map(function(g) {
                        return '<div class="ls-bar-row" style="margin-bottom:6px;">' +
                            '<span class="ls-bar-label" style="display:flex;align-items:center;gap:4px;">' + g.icon + ' ' + g.name + '</span>' +
                            '<span style="font-size:13px;color:#666;">x' + g.count + '</span>' +
                            '</div>';
                    }).join('')}
                </div>
            </div>` : ''}

            <div class="ls-ai-summary">
                <h4>${ICON.ai} AI 直播分析</h4>
                <p>
                    本场直播持续 <strong>${durStr}</strong>，共产生 <strong>${msgCount}</strong> 条消息，
                    其中你发言 <strong>${userMsgs}</strong> 条，${esc(record.partnerName||'对方')} 发言 <strong>${partnerMsgs}</strong> 条。
                    收到点赞 <strong>${record.likes}</strong> 次，礼物 <strong>${giftCount}</strong> 份（总价值 ${totalGiftValue}）。
                    <br><br>
                    直播火热度：<span class="ls-heat-score" style="background:${heatColor};">${heatLevel} ${heatScore}分</span>
                    <br><br>
                    ${aiSummary}
                </p>
            </div>

            <div class="ls-chart-section">
                <div class="ls-chart-title">聊天记录</div>
                <div class="ls-chart-container" style="max-height:300px;overflow-y:auto;">
                    ${record.messages.map(function(m) {
                        var cls = m.type === 'system' ? 'system' : (m.type === 'user' ? 'user' : 'partner');
                        var time = new Date(m.timestamp);
                        var timeStr = String(time.getHours()).padStart(2,'0') + ':' + String(time.getMinutes()).padStart(2,'0');
                        return '<div style="padding:4px 0;font-size:13px;border-bottom:1px solid #f5f5f5;">' +
                            '<span style="color:#999;font-size:11px;">' + timeStr + '</span> ' +
                            '<strong style="color:' + (cls==='user'?'#0d3b66':cls==='system'?'#999':'#e91e63') + ';">' + esc(m.name||'系统') + ':</strong> ' +
                            '<span style="color:#333;">' + esc(m.text) + '</span>' +
                            '</div>';
                    }).join('')}
                </div>
            </div>
        `;

        content.innerHTML = html;
    }

    function generateAISummary(record, heatScore, heatLevel, msgCount, userMsgs, partnerMsgs, giftCount, totalGiftValue) {
        var parts = [];

        // 互动平衡分析
        if (userMsgs > partnerMsgs * 2) {
            parts.push('本场直播中你发言较为活跃，对方可以多参与互动以提升直播氛围。');
        } else if (partnerMsgs > userMsgs * 2) {
            parts.push('对方互动积极，建议你多回应以保持直播节奏。');
        } else {
            parts.push('双方互动较为均衡，直播节奏自然流畅。');
        }

        // 热度分析
        if (heatLevel === '冷场') {
            parts.push('整体互动较少，建议增加话题引导和互动环节。');
        } else if (heatLevel === '温和') {
            parts.push('直播氛围温和舒适，可以尝试增加互动游戏提升热度。');
        } else if (heatLevel === '热闹') {
            parts.push('直播氛围热闹，互动频繁，保持了良好的节奏。');
        } else {
            parts.push('直播非常火爆！互动数据优异，是一场成功的直播。');
        }

        // 礼物分析
        if (giftCount > 0) {
            parts.push('收到' + giftCount + '份礼物，总价值' + totalGiftValue + '，观众粘性较高。');
        } else {
            parts.push('本场直播未收到礼物，可增加互动引导。');
        }

        // 时长分析
        if (record.duration < 60) {
            parts.push('直播时长较短，建议适当延长以积累更多互动。');
        } else if (record.duration > 1800) {
            parts.push('直播时长充足，内容丰富完整。');
        }

        return parts.join('');
    }

    // ===== 设置视图 =====
    function renderSettings() {
        var content = $('ls-settings-content');
        if (!content) return;
        var s = state.settings;

        // 礼物记录统计
        var totalGifts = 0;
        var giftByType = {};
        state.records.forEach(function(r) {
            if (r.gifts) {
                r.gifts.forEach(function(g) {
                    if (g.from === 'partner') {
                        totalGifts += g.count;
                        if (!giftByType[g.name]) giftByType[g.name] = 0;
                        giftByType[g.name] += g.count;
                    }
                });
            }
        });
        var totalLikes = state.records.reduce(function(sum, r) { return sum + (r.likes || 0); }, 0);

        var giftRecordsHtml = '';
        Object.keys(giftByType).forEach(function(name) {
            var giftDef = GIFTS.find(function(g){return g.name === name;});
            giftRecordsHtml += '<div class="ls-gift-record-item">' +
                (giftDef ? giftDef.icon : ICON.gift) +
                '<div class="ls-gift-record-info"><div class="ls-gift-record-name">' + name + '</div>' +
                '<div class="ls-gift-record-count">共收到 ' + giftByType[name] + '</div></div></div>';
        });
        if (!giftRecordsHtml) giftRecordsHtml = '<p style="color:#999;font-size:13px;padding:8px 0;">暂无礼物记录</p>';

        content.innerHTML = `
            <div class="ls-settings-section">
                <div class="ls-settings-section-title">个人资料</div>
                <div class="ls-avatar-setting">
                    <img class="ls-avatar-preview" id="ls-avatar-preview" src="${esc(s.streamAvatar||'')}" onerror="this.style.visibility='hidden'">
                    <button class="ls-avatar-upload" id="ls-avatar-upload-btn">设置直播头像</button>
                    <input type="file" id="ls-avatar-file" accept="image/*" style="display:none;">
                </div>
                <div class="ls-avatar-setting">
                    <div class="ls-bg-preview" id="ls-bg-preview" style="width:56px;height:56px;border-radius:12px;background:${s.streamBackground ? 'url(' + s.streamBackground + ') center/cover' : '#f0f0f0'};border:2px solid #f0f0f0;"></div>
                    <button class="ls-avatar-upload" id="ls-bg-upload-btn">设置主页背景</button>
                    <input type="file" id="ls-bg-file" accept="image/*" style="display:none;">
                </div>
                <div class="ls-settings-item">
                    <span class="ls-settings-label">直播名称</span>
                    <input type="text" class="ls-settings-input" id="ls-set-name" value="${esc(s.streamName||'')}" placeholder="默认使用昵称" style="width:140px;">
                </div>
            </div>

            <div class="ls-settings-section">
                <div class="ls-settings-section-title">直播数据</div>
                <div class="ls-settings-item">
                    <span class="ls-settings-label">收到礼物总数</span>
                    <span class="ls-settings-value">${totalGifts}</span>
                </div>
                <div class="ls-settings-item">
                    <span class="ls-settings-label">直播总点赞数</span>
                    <span class="ls-settings-value">${totalLikes}</span>
                </div>
                <div class="ls-settings-item">
                    <span class="ls-settings-label">直播场次</span>
                    <span class="ls-settings-value">${state.records.length} 场</span>
                </div>
            </div>

            <div class="ls-settings-section">
                <div class="ls-settings-section-title">礼物记录</div>
                <div class="ls-gift-records">${giftRecordsHtml}</div>
            </div>

            <div class="ls-settings-section">
                <div class="ls-settings-section-title">对方发言设置</div>
                <div class="ls-settings-item">
                    <span class="ls-settings-label">主动发言间隔(秒)</span>
                    <div class="ls-settings-range">
                        <input type="number" class="ls-settings-input" id="ls-set-pSpeakMin" value="${Math.round((s.partnerSpeakMin||3000)/1000)}" min="1" max="60">
                        <span>~</span>
                        <input type="number" class="ls-settings-input" id="ls-set-pSpeakMax" value="${Math.round((s.partnerSpeakMax||8000)/1000)}" min="1" max="120">
                    </div>
                </div>
                <div class="ls-settings-item">
                    <span class="ls-settings-label">回复用户间隔(秒)</span>
                    <div class="ls-settings-range">
                        <input type="number" class="ls-settings-input" id="ls-set-replyMin" value="${Math.round((s.replyMin||1000)/1000)}" min="1" max="30">
                        <span>~</span>
                        <input type="number" class="ls-settings-input" id="ls-set-replyMax" value="${Math.round((s.replyMax||3000)/1000)}" min="1" max="60">
                    </div>
                </div>
                <div class="ls-settings-item">
                    <span class="ls-settings-label">发言字卡条数</span>
                    <div class="ls-settings-range">
                        <input type="number" class="ls-settings-input" id="ls-set-cardMin" value="${s.cardCountMin||1}" min="1" max="5">
                        <span>~</span>
                        <input type="number" class="ls-settings-input" id="ls-set-cardMax" value="${s.cardCountMax||3}" min="1" max="10">
                    </div>
                </div>
                <div class="ls-settings-item">
                    <span class="ls-settings-label">拼字卡条数(逗号隔开)</span>
                    <div class="ls-settings-range">
                        <input type="number" class="ls-settings-input" id="ls-set-combineMin" value="${s.combineMin||1}" min="1" max="3">
                        <span>~</span>
                        <input type="number" class="ls-settings-input" id="ls-set-combineMax" value="${s.combineMax||2}" min="1" max="5">
                    </div>
                </div>
            </div>

            <div class="ls-settings-section">
                <div class="ls-settings-section-title">数据管理</div>
                <div class="ls-settings-item">
                    <span class="ls-settings-label">备份直播记录</span>
                    <button class="ls-avatar-upload" id="ls-backup-btn">导出备份</button>
                </div>
                <div class="ls-settings-item">
                    <span class="ls-settings-label">清空所有记录</span>
                    <button class="ls-avatar-upload" id="ls-clear-btn" style="color:#dc3545;">清空</button>
                </div>
            </div>

            <div style="padding:16px 0;">
                <button class="ls-btn ls-btn-primary" id="ls-save-settings" style="width:100%;">保存设置</button>
            </div>
        `;

        // 头像上传
        var uploadBtn = $('ls-avatar-upload-btn');
        var fileInput = $('ls-avatar-file');
        if (uploadBtn && fileInput) {
            uploadBtn.onclick = function() { fileInput.click(); };
            fileInput.onchange = function() {
                if (fileInput.files && fileInput.files[0]) {
                    var reader = new FileReader();
                    reader.onload = function(e) {
                        state.settings.streamAvatar = e.target.result;
                        var preview = $('ls-avatar-preview');
                        if (preview) { preview.src = e.target.result; preview.style.visibility = 'visible'; }
                    };
                    reader.readAsDataURL(fileInput.files[0]);
                }
            };
        }

        // 背景上传
        var bgUploadBtn = $('ls-bg-upload-btn');
        var bgFileInput = $('ls-bg-file');
        if (bgUploadBtn && bgFileInput) {
            bgUploadBtn.onclick = function() { bgFileInput.click(); };
            bgFileInput.onchange = function() {
                if (bgFileInput.files && bgFileInput.files[0]) {
                    var reader = new FileReader();
                    reader.onload = function(e) {
                        state.settings.streamBackground = e.target.result;
                        var bgPreview = $('ls-bg-preview');
                        if (bgPreview) { bgPreview.style.background = 'url(' + e.target.result + ') center/cover'; }
                    };
                    reader.readAsDataURL(bgFileInput.files[0]);
                }
            };
        }

        // 保存设置
        var saveBtn = $('ls-save-settings');
        if (saveBtn) {
            saveBtn.onclick = async function() {
                s.streamName = $('ls-set-name') ? $('ls-set-name').value.trim() : '';
                s.partnerSpeakMin = (parseInt($('ls-set-pSpeakMin')?.value) || 3) * 1000;
                s.partnerSpeakMax = (parseInt($('ls-set-pSpeakMax')?.value) || 8) * 1000;
                s.replyMin = (parseInt($('ls-set-replyMin')?.value) || 1) * 1000;
                s.replyMax = (parseInt($('ls-set-replyMax')?.value) || 3) * 1000;
                s.cardCountMin = parseInt($('ls-set-cardMin')?.value) || 1;
                s.cardCountMax = parseInt($('ls-set-cardMax')?.value) || 3;
                s.combineMin = parseInt($('ls-set-combineMin')?.value) || 1;
                s.combineMax = parseInt($('ls-set-combineMax')?.value) || 2;
                await lsSave('settings', s);
                applyBackground();
                toast('设置已保存');
            };
        }

        // 备份
        var backupBtn = $('ls-backup-btn');
        if (backupBtn) {
            backupBtn.onclick = function() {
                var data = JSON.stringify(state.records, null, 2);
                var blob = new Blob([data], { type: 'application/json' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = 'live-stream-records-' + Date.now() + '.json';
                a.click();
                URL.revokeObjectURL(url);
                toast('备份已导出');
            };
        }

        // 清空
        var clearBtn = $('ls-clear-btn');
        if (clearBtn) {
            clearBtn.onclick = async function() {
                if (confirm('确定清空所有直播记录？此操作不可恢复。')) {
                    state.records = [];
                    await lsSave('records', state.records);
                    renderSettings();
                    toast('记录已清空');
                }
            };
        }
    }

    // ===== 注册到全局 =====
    window.LiveStreamApp = Object.assign(window.LiveStreamApp || {}, {
        __app: true,
        init: init,
        _reload: function() {
            init().then(function() {
                showView('ls-main-view');
            });
        },
    });

})();
