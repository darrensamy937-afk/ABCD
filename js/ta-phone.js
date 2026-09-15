/**
 * TA的手机 - 重构版
 * 锁屏密码、主屏幕多页应用、底栏Dock、手机设置
 */
(function() {
    'use strict';

    const STORAGE_KEY = 'ta_phone_data';
    const CHAT_CHANCE = 0.02;
    const MOMENTS_CHANCE = 0.10;

    // 手机设置
    let phoneSettings = {
        color: 'rose-gold',
        colorName: '玫瑰金',
        wallpaper: 'default',
        password: '1234',
        passwordEnabled: true
    };

    // 收藏数据
    let collections = { chat: [], moments: [] };
    let chatSortMode = 'collected';

    // 当前状态
    let currentPage = 0;
    let currentApp = null;
    let inputPassword = '';
    let isUnlocked = false;

    // 加载数据（兼容旧版 ta_phone_collections）
    function loadData() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const d = JSON.parse(saved);
                if (d.phoneSettings) Object.assign(phoneSettings, d.phoneSettings);
                if (d.collections) collections = d.collections;
                if (d.chatSortMode) chatSortMode = d.chatSortMode;
            }
            // 兼容旧版数据
            const oldData = localStorage.getItem('ta_phone_collections');
            if (oldData && (!saved || !collections.chat.length)) {
                try {
                    const old = JSON.parse(oldData);
                    if (old.chat) collections.chat = old.chat;
                    if (old.moments) collections.moments = old.moments;
                } catch(e) {}
            }
        } catch(e) {}
    }

    function saveData() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                phoneSettings,
                collections,
                chatSortMode
            }));
        } catch(e) {}
    }

    // 更新时间
    function updateTime() {
        var now = new Date();
        var h = String(now.getHours()).padStart(2, '0');
        var m = String(now.getMinutes()).padStart(2, '0');
        var timeStr = h + ':' + m;

        var statusTime = document.getElementById('ta-status-time');
        var lockTime = document.getElementById('ta-lock-time');
        var widgetTime = document.getElementById('ta-widget-time');
        if (statusTime) statusTime.textContent = timeStr;
        if (lockTime) lockTime.textContent = timeStr;
        if (widgetTime) widgetTime.textContent = timeStr;

        // 日期
        var days = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
        var dateStr = (now.getMonth()+1) + '月' + now.getDate() + '日 ' + days[now.getDay()];
        var lockDate = document.getElementById('ta-lock-date');
        var widgetDate = document.getElementById('ta-widget-date');
        if (lockDate) lockDate.textContent = dateStr;
        if (widgetDate) widgetDate.textContent = dateStr;

        // 更新桌面组件天气
        updateWidgetWeather();
    }

    // 更新桌面组件天气（随机模拟）
    function updateWidgetWeather() {
        var weathers = [
            { icon: '☀️', desc: '晴', temp: '26°' },
            { icon: '⛅', desc: '多云', temp: '24°' },
            { icon: '🌧️', desc: '小雨', temp: '20°' },
            { icon: '🌨️', desc: '雪', temp: '-2°' },
            { icon: '🌫️', desc: '雾', temp: '18°' }
        ];
        var saved = localStorage.getItem('ta_phone_weather');
        var w;
        if (saved) {
            try { w = JSON.parse(saved); } catch(e) { w = weathers[0]; }
        } else {
            w = weathers[0];
        }
        var iconEl = document.getElementById('ta-widget-weather-icon');
        var tempEl = document.getElementById('ta-widget-weather-temp');
        var descEl = document.getElementById('ta-widget-weather-desc');
        if (iconEl) iconEl.textContent = w.icon;
        if (tempEl) tempEl.textContent = w.temp;
        if (descEl) descEl.textContent = w.desc;
    }

    // 应用手机颜色
    function applyPhoneColor() {
        const shell = document.getElementById('ta-phone-shell');
        if (!shell) return;
        shell.dataset.color = phoneSettings.color;
    }

    // 应用壁纸
    function applyWallpaper() {
        var home = document.getElementById('ta-home-screen');
        var lock = document.getElementById('ta-lock-screen');
        var widget = document.getElementById('ta-desktop-widget');
        if (!home || !lock) return;

        var bg = '';
        var isLight = false;
        if (phoneSettings.wallpaper === 'default') {
            bg = '#ffffff';
            isLight = true;
        } else if (phoneSettings.wallpaper === 'gradient1') {
            bg = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        } else if (phoneSettings.wallpaper === 'gradient2') {
            bg = 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
        } else if (phoneSettings.wallpaper === 'gradient3') {
            bg = 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)';
        } else if (phoneSettings.wallpaper === 'gradient4') {
            bg = 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)';
        } else if (phoneSettings.wallpaper === 'dark') {
            bg = 'linear-gradient(180deg, #000 0%, #1a1a1a 100%)';
        } else {
            bg = phoneSettings.wallpaper; // 自定义图片 url(...)
        }
        home.style.background = bg;
        home.style.backgroundSize = 'cover';
        home.style.backgroundPosition = 'center';
        lock.style.background = bg;
        lock.style.backgroundSize = 'cover';
        lock.style.backgroundPosition = 'center';

        // 根据壁纸亮度调整文字颜色
        if (widget) {
            widget.style.color = isLight ? '#333' : '#fff';
        }
        // 桌面组件子元素颜色
        var wDate = document.getElementById('ta-widget-date');
        var wWeatherDesc = document.getElementById('ta-widget-weather-desc');
        if (wDate) wDate.style.color = isLight ? '#666' : 'rgba(255,255,255,0.8)';
        if (wWeatherDesc) wWeatherDesc.style.color = isLight ? '#999' : 'rgba(255,255,255,0.7)';
        // 锁屏文字颜色
        var lockTime = document.getElementById('ta-lock-time');
        var lockDate = document.getElementById('ta-lock-date');
        if (lockTime) lockTime.style.color = isLight ? '#333' : '#fff';
        if (lockDate) lockDate.style.color = isLight ? '#666' : 'rgba(255,255,255,0.8)';
        // 调整桌面图标文字颜色
        var spans = document.querySelectorAll('.ta-app-page span, .ta-dock-app span');
        spans.forEach(function(s) {
            s.style.color = isLight ? '#333' : '#fff';
            s.style.textShadow = isLight ? 'none' : '0 1px 2px rgba(0,0,0,0.5)';
        });
    }

    // 上传壁纸
    function uploadWallpaper(input) {
        if (!input.files || !input.files[0]) return;
        var file = input.files[0];
        if (file.size > 5 * 1024 * 1024) {
            if (typeof showToast === 'function') showToast('图片不能超过5MB');
            return;
        }
        var reader = new FileReader();
        reader.onload = function(e) {
            phoneSettings.wallpaper = 'url(' + e.target.result + ')';
            phoneSettings.wallpaperType = 'image';
            saveData();
            applyWallpaper();
            if (typeof showToast === 'function') showToast('壁纸已更新');
        };
        reader.readAsDataURL(file);
        input.value = '';
    }

    // 随机选择壁纸（对方主动选择）
    function randomPartnerWallpaper() {
        var wallpapers = ['default', 'gradient1', 'gradient2', 'gradient3', 'gradient4'];
        var pick = wallpapers[Math.floor(Math.random() * wallpapers.length)];
        phoneSettings.wallpaper = pick;
        saveData();
        applyWallpaper();
        if (typeof showToast === 'function') showToast('对方为你换了壁纸');
    }

    // 密码输入
    function handlePasswordInput(num) {
        if (inputPassword.length >= 4) return;
        inputPassword += num;
        updatePasswordDots();

        if (inputPassword.length === 4) {
            setTimeout(function() {
                if (inputPassword === phoneSettings.password) {
                    unlockPhone();
                } else {
                    // 错误动画
                    const dots = document.querySelector('.ta-password-dots');
                    if (dots) {
                        dots.style.animation = 'none';
                        dots.offsetHeight;
                        dots.style.animation = 'shake 0.4s';
                    }
                    inputPassword = '';
                    setTimeout(updatePasswordDots, 300);
                }
            }, 200);
        }
    }

    function handlePasswordDelete() {
        if (inputPassword.length > 0) {
            inputPassword = inputPassword.slice(0, -1);
            updatePasswordDots();
        }
    }

    function updatePasswordDots() {
        const dots = document.querySelectorAll('.ta-password-dots span');
        dots.forEach(function(dot, i) {
            if (i < inputPassword.length) {
                dot.classList.add('filled');
            } else {
                dot.classList.remove('filled');
            }
        });
    }

    // 解锁手机
    function unlockPhone() {
        isUnlocked = true;
        const lock = document.getElementById('ta-lock-screen');
        const home = document.getElementById('ta-home-screen');
        if (lock) lock.style.display = 'none';
        if (home) home.style.display = 'flex';
        inputPassword = '';
        updatePasswordDots();
    }

    // 锁定手机
    function lockPhone() {
        isUnlocked = false;
        currentApp = null;
        inputPassword = '';
        const lock = document.getElementById('ta-lock-screen');
        const home = document.getElementById('ta-home-screen');
        const appView = document.getElementById('ta-app-view');
        const settingsView = document.getElementById('ta-settings-view');
        if (lock) lock.style.display = 'flex';
        if (home) home.style.display = 'none';
        if (appView) appView.style.display = 'none';
        if (settingsView) settingsView.style.display = 'none';
        updatePasswordDots();
    }

    // 翻页
    function goToPage(idx) {
        const pages = document.querySelector('.ta-app-pages');
        const dots = document.querySelectorAll('.ta-page-dots span');
        const totalPages = document.querySelectorAll('.ta-app-page').length;
        currentPage = Math.max(0, Math.min(totalPages - 1, idx));
        if (pages) pages.style.transform = 'translateX(-' + (currentPage * 100) + '%)';
        dots.forEach(function(d, i) {
            d.classList.toggle('active', i === currentPage);
        });
    }

    // 打开应用
    function openApp(appId) {
        const appView = document.getElementById('ta-app-view');
        const home = document.getElementById('ta-home-screen');
        const titleEl = document.getElementById('ta-app-view-title');
        const content = document.getElementById('ta-app-view-content');
        if (!appView || !home) return;

        currentApp = appId;
        const appNames = {
            chat: '聊天收藏', envelope: '信封', mood: '心情手账',
            diary: '手账日记', moyu: '摸鱼小记', calendar: '日历',
            music: '音乐', accounting: '记账', live: '直播',
            shop: '商城', gift: '礼物', pet: '宠物',
            companion: '陪伴', moments: '朋友圈收藏', avatar: '头像',
            tarot: '塔罗', weather: '天气', photos: '相册',
            clock: '时钟', contacts: '通讯', browser: '浏览器',
            settings: '设置'
        };

        if (appId === 'settings') {
            openPhoneSettings();
            return;
        }

        if (appId === 'chat') {
            openChatSync();
            return;
        }

        if (appId === 'companion') {
            close();
            if (window.openCompanion) window.openCompanion();
            return;
        }

        if (titleEl) titleEl.textContent = appNames[appId] || '应用';

        // 渲染应用内容
        let html = '';
        if (appId === 'chat') {
            html = renderChatCollection();
        } else if (appId === 'moments') {
            html = renderMomentsCollection();
        } else if (appId === 'envelope') {
            html = '<div style="padding:20px;text-align:center;color:#999;font-size:13px;">信封功能开发中…</div>';
        } else {
            html = '<div style="padding:40px 20px;text-align:center;"><div style="font-size:48px;margin-bottom:16px;">📱</div><div style="font-size:14px;color:#999;">' + (appNames[appId] || '应用') + '功能开发中…</div></div>';
        }
        if (content) content.innerHTML = html;

        home.style.display = 'none';
        appView.style.display = 'flex';
    }

    // 关闭应用回到主屏幕
    function closeApp() {
        var appView = document.getElementById('ta-app-view');
        var home = document.getElementById('ta-home-screen');
        var settingsView = document.getElementById('ta-settings-view');
        var chatSyncView = document.getElementById('ta-chat-sync-view');
        currentApp = null;
        if (appView) appView.style.display = 'none';
        if (settingsView) settingsView.style.display = 'none';
        if (chatSyncView) chatSyncView.style.display = 'none';
        if (home) home.style.display = 'flex';
    }

    // ========== 聊天同步 ==========
    function openChatSync() {
        var home = document.getElementById('ta-home-screen');
        var appView = document.getElementById('ta-app-view');
        var settingsView = document.getElementById('ta-settings-view');
        var chatSyncView = document.getElementById('ta-chat-sync-view');
        if (!chatSyncView) return;

        if (home) home.style.display = 'none';
        if (appView) appView.style.display = 'none';
        if (settingsView) settingsView.style.display = 'none';
        chatSyncView.style.display = 'flex';
        refreshChatSync();
    }

    function closeChatSync() {
        var chatSyncView = document.getElementById('ta-chat-sync-view');
        var home = document.getElementById('ta-home-screen');
        if (chatSyncView) chatSyncView.style.display = 'none';
        if (home) home.style.display = 'flex';
    }

    function refreshChatSync() {
        var body = document.getElementById('ta-chat-sync-body');
        if (!body) return;

        // 从主界面获取聊天消息
        var msgs = [];
        if (typeof messages !== 'undefined' && Array.isArray(messages)) {
            msgs = messages;
        } else if (typeof window.messages !== 'undefined' && Array.isArray(window.messages)) {
            msgs = window.messages;
        }

        if (msgs.length === 0) {
            body.innerHTML = '<div style="padding:40px 20px;text-align:center;color:#999;font-size:13px;">暂无聊天记录<br>双击可刷新</div>';
            return;
        }

        // 同步头像（互换位置：TA在右，我在左）
        var myAvatar = '';
        var partnerAvatar = '';
        var myAvatarEl = document.getElementById('avatar-me');
        var partnerAvatarEl = document.getElementById('avatar-partner');
        if (myAvatarEl) myAvatar = myAvatarEl.src;
        if (partnerAvatarEl) partnerAvatar = partnerAvatarEl.src;

        // 渲染最近50条消息
        var recent = msgs.slice(-50);
        var html = '';
        recent.forEach(function(msg) {
            var isMe = msg.sender === 'me' || msg.sender === 'user';
            var content = escapeHtml(msg.content || msg.text || '');
            var time = '';
            if (msg.timestamp) {
                var d = new Date(msg.timestamp);
                time = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
            }
            // TA在右边，我在左边
            var avatar = isMe ? myAvatar : partnerAvatar;
            var sideClass = isMe ? 'ta-chat-sync-left' : 'ta-chat-sync-right';
            html += '<div class="ta-chat-sync-msg ' + sideClass + '">';
            html += '<img class="ta-chat-sync-msg-avatar" src="' + avatar + '" alt="">';
            html += '<div class="ta-chat-sync-bubble">' + content;
            if (time) html += '<span class="ta-chat-sync-time">' + time + '</span>';
            html += '</div>';
            html += '</div>';
        });
        body.innerHTML = html;
        body.scrollTop = body.scrollHeight;
    }

    // 打开手机设置
    function openPhoneSettings() {
        const appView = document.getElementById('ta-app-view');
        const settingsView = document.getElementById('ta-settings-view');
        const home = document.getElementById('ta-home-screen');
        if (!settingsView) return;

        // 更新密码状态显示
        const pwdStatus = document.getElementById('ta-password-status');
        if (pwdStatus) pwdStatus.textContent = phoneSettings.passwordEnabled ? '已设置' : '未设置';
        const colorName = document.getElementById('ta-phone-color-name');
        if (colorName) colorName.textContent = phoneSettings.colorName;

        if (home) home.style.display = 'none';
        if (appView) appView.style.display = 'none';
        settingsView.style.display = 'flex';
    }

    function closeSettings() {
        const settingsView = document.getElementById('ta-settings-view');
        const home = document.getElementById('ta-home-screen');
        if (settingsView) settingsView.style.display = 'none';
        if (home) home.style.display = 'flex';
    }

    // 颜色选择器
    function showColorPicker() {
        const colors = [
            { id: 'rose-gold', name: '玫瑰金', hex: '#e8b4b8' },
            { id: 'black', name: '黑色', hex: '#2d3436' },
            { id: 'white', name: '白色', hex: '#f5f6fa' },
            { id: 'blue', name: '远峰蓝', hex: '#5eaaa8' },
            { id: 'purple', name: '紫色', hex: '#a29bfe' },
            { id: 'green', name: '绿色', hex: '#00b894' },
        ];

        let html = '<div style="padding:16px;">';
        html += '<div style="font-size:15px;font-weight:600;margin-bottom:12px;">选择手机颜色</div>';
        html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">';
        colors.forEach(function(c) {
            const selected = phoneSettings.color === c.id;
            html += '<div class="ta-color-option' + (selected ? ' selected' : '') + '" data-color="' + c.id + '" data-name="' + c.name + '" style="text-align:center;cursor:pointer;padding:10px;border-radius:12px;border:2px solid ' + (selected ? c.hex : 'transparent') + ';">';
            html += '<div style="width:40px;height:40px;margin:0 auto 6px;border-radius:50%;background:' + c.hex + ';box-shadow:0 2px 8px rgba(0,0,0,0.2);"></div>';
            html += '<div style="font-size:11px;color:var(--text-secondary);">' + c.name + '</div>';
            html += '</div>';
        });
        html += '</div></div>';

        showTaModal(html, function(modal) {
            modal.querySelectorAll('.ta-color-option').forEach(function(opt) {
                opt.onclick = function() {
                    phoneSettings.color = opt.dataset.color;
                    phoneSettings.colorName = opt.dataset.name;
                    saveData();
                    applyPhoneColor();
                    const colorName = document.getElementById('ta-phone-color-name');
                    if (colorName) colorName.textContent = phoneSettings.colorName;
                    closeTaModal();
                };
            });
        });
    }

    // 壁纸选择器
    function showWallpaperPicker() {
        var wallpapers = [
            { id: 'default', name: '纯白', preview: '#ffffff' },
            { id: 'gradient1', name: '紫罗兰', preview: 'linear-gradient(135deg, #667eea, #764ba2)' },
            { id: 'gradient2', name: '粉红', preview: 'linear-gradient(135deg, #f093fb, #f5576c)' },
            { id: 'gradient3', name: '冰蓝', preview: 'linear-gradient(135deg, #4facfe, #00f2fe)' },
            { id: 'gradient4', name: '青绿', preview: 'linear-gradient(135deg, #43e97b, #38f9d7)' },
            { id: 'dark', name: '纯黑', preview: 'linear-gradient(180deg, #000, #1a1a1a)' },
        ];

        var html = '<div style="padding:16px;">';
        html += '<div style="font-size:15px;font-weight:600;margin-bottom:12px;">选择壁纸</div>';
        html += '<div style="font-size:12px;color:#999;margin-bottom:10px;">纯白背景字体更清晰，也可上传自定义图片</div>';
        html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">';
        wallpapers.forEach(function(w) {
            var isWhite = w.id === 'default';
            var textColor = isWhite ? '#333' : '#fff';
            html += '<div class="ta-wallpaper-option" data-wallpaper="' + w.id + '" style="cursor:pointer;border-radius:12px;overflow:hidden;aspect-ratio:9/16;background:' + w.preview + ';border:2px solid ' + (phoneSettings.wallpaper === w.id ? 'var(--accent-color)' : 'transparent') + ';">';
            html += '<div style="width:100%;height:100%;display:flex;align-items:flex-end;justify-content:center;padding:4px;font-size:10px;color:' + textColor + ';text-shadow:0 1px 2px rgba(0,0,0,0.3);">' + w.name + '</div>';
            html += '</div>';
        });
        html += '</div>';
        html += '<button id="ta-upload-wallpaper-btn" style="width:100%;padding:10px;margin-top:12px;background:var(--accent-color);color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;">📷 上传自定义壁纸</button>';
        html += '</div>';

        showTaModal(html, function(modal) {
            modal.querySelectorAll('.ta-wallpaper-option').forEach(function(opt) {
                opt.onclick = function() {
                    phoneSettings.wallpaper = opt.dataset.wallpaper;
                    saveData();
                    applyWallpaper();
                    closeTaModal();
                };
            });
            var uploadBtn = modal.querySelector('#ta-upload-wallpaper-btn');
            if (uploadBtn) {
                uploadBtn.onclick = function() {
                    closeTaModal();
                    var input = document.getElementById('ta-wallpaper-file-input');
                    if (input) input.click();
                };
            }
        });
    }

    // 密码设置
    function showPasswordSetting() {
        let html = '<div style="padding:16px;">';
        html += '<div style="font-size:15px;font-weight:600;margin-bottom:12px;">锁屏密码</div>';
        html += '<div style="margin-bottom:12px;font-size:12px;color:var(--text-secondary);">当前密码：' + (phoneSettings.passwordEnabled ? phoneSettings.password : '未设置') + '</div>';
        html += '<div style="display:flex;gap:8px;margin-bottom:12px;">';
        html += '<input type="text" id="ta-new-password" maxlength="4" placeholder="输入4位数字密码" style="flex:1;padding:10px;border:1px solid var(--border-color);border-radius:8px;font-size:14px;text-align:center;letter-spacing:4px;">';
        html += '</div>';
        html += '<button id="ta-save-password" style="width:100%;padding:10px;background:var(--accent-color);color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;">保存密码</button>';
        html += '<button id="ta-clear-password" style="width:100%;padding:10px;background:none;color:#ff5050;border:none;font-size:12px;cursor:pointer;margin-top:8px;">关闭密码</button>';
        html += '</div>';

        showTaModal(html, function(modal) {
            const saveBtn = modal.querySelector('#ta-save-password');
            const clearBtn = modal.querySelector('#ta-clear-password');
            const input = modal.querySelector('#ta-new-password');

            if (saveBtn) saveBtn.onclick = function() {
                const val = input.value.trim();
                if (/^\d{4}$/.test(val)) {
                    phoneSettings.password = val;
                    phoneSettings.passwordEnabled = true;
                    saveData();
                    closeTaModal();
                    if (typeof showToast === 'function') showToast('密码已更新');
                } else {
                    if (typeof showToast === 'function') showToast('请输入4位数字密码');
                }
            };
            if (clearBtn) clearBtn.onclick = function() {
                phoneSettings.passwordEnabled = false;
                saveData();
                closeTaModal();
                if (typeof showToast === 'function') showToast('密码已关闭');
            };
        });
    }

    // 通用弹窗
    function showTaModal(html, onReady) {
        let overlay = document.getElementById('ta-modal-overlay');
        if (overlay) overlay.remove();

        overlay = document.createElement('div');
        overlay.id = 'ta-modal-overlay';
        overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
        overlay.innerHTML = '<div class="ta-modal-box" style="width:100%;max-height:80%;background:var(--secondary-bg);border-radius:16px;overflow:auto;">' + html + '</div>';

        const shell = document.getElementById('ta-phone-shell');
        if (shell) shell.appendChild(overlay);

        overlay.onclick = function(e) {
            if (e.target === overlay) closeTaModal();
        };

        if (onReady) onReady(overlay);
    }

    function closeTaModal() {
        const overlay = document.getElementById('ta-modal-overlay');
        if (overlay) overlay.remove();
    }

    // 渲染聊天收藏
    function renderChatCollection() {
        if (collections.chat.length === 0) {
            return '<div style="padding:40px 20px;text-align:center;color:#999;font-size:13px;">暂无聊天收藏</div>';
        }
        let html = '<div style="padding:10px;">';
        const sorted = collections.chat.slice().sort(function(a, b) {
            if (chatSortMode === 'collected') return b.collectedTime - a.collectedTime;
            if (chatSortMode === 'original-desc') return b.originalTime - a.originalTime;
            return a.originalTime - b.originalTime;
        });
        sorted.forEach(function(item) {
            const date = new Date(item.originalTime);
            const timeStr = (date.getMonth()+1) + '/' + date.getDate() + ' ' + String(date.getHours()).padStart(2,'0') + ':' + String(date.getMinutes()).padStart(2,'0');
            html += '<div style="padding:10px;border-bottom:1px solid rgba(255,255,255,0.08);">';
            html += '<div style="font-size:13px;color:#fff;line-height:1.5;">' + escapeHtml(item.content) + '</div>';
            html += '<div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:4px;">' + timeStr + '</div>';
            html += '</div>';
        });
        html += '</div>';
        return html;
    }

    // 渲染朋友圈收藏
    function renderMomentsCollection() {
        if (collections.moments.length === 0) {
            return '<div style="padding:40px 20px;text-align:center;color:#999;font-size:13px;">暂无朋友圈收藏</div>';
        }
        let html = '<div style="padding:10px;">';
        collections.moments.slice().sort(function(a, b) {
            return b.collectedTime - a.collectedTime;
        }).forEach(function(item) {
            const date = new Date(item.originalTime);
            const timeStr = (date.getMonth()+1) + '/' + date.getDate();
            html += '<div style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.08);">';
            html += '<div style="font-size:13px;color:#fff;line-height:1.5;">' + escapeHtml(item.content) + '</div>';
            html += '<div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:6px;">' + timeStr + '</div>';
            html += '</div>';
        });
        html += '</div>';
        return html;
    }

    function escapeHtml(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // 收藏功能
    function addCollection(type, content, originalTime) {
        const item = {
            id: Date.now() + Math.random(),
            content: content,
            originalTime: originalTime || Date.now(),
            collectedTime: Date.now()
        };
        collections[type].unshift(item);
        saveData();
    }

    function tryCollectChat(text, timestamp) {
        if (!text || text.trim().length === 0) return;
        if (Math.random() < CHAT_CHANCE) {
            addCollection('chat', text.trim(), timestamp);
        }
    }

    function tryCollectMoment(text, timestamp) {
        if (!text || text.trim().length === 0) return;
        if (Math.random() < MOMENTS_CHANCE) {
            addCollection('moments', text.trim(), timestamp);
        }
    }

    // 初始化事件绑定
    function initEvents() {
        // 密码键盘
        const lockScreen = document.getElementById('ta-lock-screen');
        if (lockScreen) {
            lockScreen.querySelectorAll('.ta-password-keypad button[data-num]').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    handlePasswordInput(btn.dataset.num);
                });
            });
            const delBtn = lockScreen.querySelector('.ta-keypad-delete');
            if (delBtn) {
                delBtn.addEventListener('click', handlePasswordDelete);
            }
        }

        // 应用图标点击
        document.querySelectorAll('.ta-app-icon-btn, .ta-dock-app').forEach(function(btn) {
            btn.addEventListener('click', function() {
                const appId = btn.dataset.app;
                if (appId) openApp(appId);
            });
        });

        // 触摸滑动翻页
        const pagesWrapper = document.querySelector('.ta-pages-wrapper');
        if (pagesWrapper) {
            let touchStartX = 0;
            pagesWrapper.addEventListener('touchstart', function(e) {
                touchStartX = e.changedTouches[0].screenX;
            }, { passive: true });
            pagesWrapper.addEventListener('touchend', function(e) {
                const diff = touchStartX - e.changedTouches[0].screenX;
                if (Math.abs(diff) > 40) {
                    if (diff > 0) goToPage(currentPage + 1);
                    else goToPage(currentPage - 1);
                }
            }, { passive: true });
        }

        // 页面指示器点击
        document.querySelectorAll('.ta-page-dots span').forEach(function(dot, i) {
            dot.addEventListener('click', function() {
                goToPage(i);
            });
        });
    }

    // 打开TA的手机
    function open() {
        var container = document.getElementById('ta-phone-container');
        if (container) container.style.display = 'flex';
        updateTime();
        syncAvatars();

        // 如果未设置密码，直接进入主屏幕
        if (!phoneSettings.passwordEnabled) {
            unlockPhone();
        } else {
            lockPhone();
        }
    }

    // 同步主界面头像到手机桌面组件
    function syncAvatars() {
        var myAvatar = '';
        var partnerAvatar = '';
        var myAvatarEl = document.getElementById('avatar-me');
        var partnerAvatarEl = document.getElementById('avatar-partner');
        if (myAvatarEl) myAvatar = myAvatarEl.src;
        if (partnerAvatarEl) partnerAvatar = partnerAvatarEl.src;

        var widgetMe = document.getElementById('ta-widget-avatar-me');
        var widgetPartner = document.getElementById('ta-widget-avatar-partner');
        var syncPartner = document.getElementById('ta-chat-sync-partner-avatar');
        if (widgetMe && myAvatar) widgetMe.src = myAvatar;
        if (widgetPartner && partnerAvatar) widgetPartner.src = partnerAvatar;
        if (syncPartner && partnerAvatar) syncPartner.src = partnerAvatar;
    }

    function close() {
        const container = document.getElementById('ta-phone-container');
        if (container) container.style.display = 'none';
    }

    // 初始化
    function init() {
        loadData();
        applyPhoneColor();
        applyWallpaper();
        updateTime();
        setInterval(updateTime, 60000);

        // 延迟绑定事件（等DOM就绪）
        setTimeout(function() {
            initEvents();
        }, 200);
    }

    // 暴露到全局
    window.TaPhoneApp = {
        init: init,
        open: open,
        close: close,
        showTaPhone: open,
        hideTaPhone: close,
        openApp: openApp,
        closeApp: closeApp,
        openPhoneSettings: openPhoneSettings,
        closeSettings: closeSettings,
        showColorPicker: showColorPicker,
        showWallpaperPicker: showWallpaperPicker,
        showPasswordSetting: showPasswordSetting,
        lockPhone: lockPhone,
        unlockPhone: unlockPhone,
        tryCollectChat: tryCollectChat,
        tryCollectMoment: tryCollectMoment,
        goBack: closeApp,
        showTaPhoneTab: function(tab) { openApp(tab); },
        setChatSortMode: function(mode) { chatSortMode = mode; saveData(); },
        uploadWallpaper: uploadWallpaper,
        openChatSync: openChatSync,
        closeChatSync: closeChatSync,
        refreshChatSync: refreshChatSync,
        syncAvatars: syncAvatars,
        randomPartnerWallpaper: randomPartnerWallpaper
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
