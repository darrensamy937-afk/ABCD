/**
 * 陪伴功能模块
 * - 展示陪伴状态、在一起的天数
 * - 陪伴心情、暖心话语
 * - 互动按钮：拍一拍、抱抱、说晚安
 */
(function () {
    'use strict';

    if (window.CompanionApp && window.CompanionApp.__loaded) return;

    var STORAGE_KEY = 'companion_data_v1';

    // 陪伴起始日期（可自定义）
    var settings = {
        startDate: '',
        mood: 'happy',
        lastInteraction: 0,
        totalPats: 0,
        totalHugs: 0,
        totalGoodnights: 0
    };

    var MOODS = {
        happy: { label: '开心', emoji: '😊', color: '#ffd93b' },
        love: { label: '甜蜜', emoji: '🥰', color: '#ff8fa3' },
        miss: { label: '想念', emoji: '🥺', color: '#a8dadc' },
        calm: { label: '平静', emoji: '😌', color: '#b8e0d2' },
        playful: { label: '调皮', emoji: '😜', color: '#ffccd5' }
    };

    var WARM_WORDS = [
        '有你在身边，什么都很美好',
        '今天也想你了很多很多',
        '和你在一起的时间总是不够用',
        '你是我最喜欢的人呀',
        '谢谢你一直陪着我',
        '就算什么都不做，和你待着也很开心',
        '你笑起来真好看',
        '想和你一起去看日落',
        '你是我最温暖的依靠',
        '每天都在感谢遇见你',
        '有你的日子就是最好的日子',
        '你比星星还要耀眼'
    ];

    var PARTNER_REPLIES = {
        pat: ['嘿嘿，别拍啦~', '你拍我我就拍回去！', '再拍我就生气了哦~', '拍什么拍，打你哦', '好舒服，再拍拍~'],
        hug: ['抱抱~', '我也想抱抱你', '你的怀抱好温暖', '最喜欢你的拥抱了', '紧紧抱住不放'],
        goodnight: ['晚安，梦里见~', '你也早点睡哦', '晚安亲爱的~', '好梦，明天见', '梦里也要想我哦']
    };

    function loadData() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                var d = JSON.parse(raw);
                Object.assign(settings, d);
            }
            if (!settings.startDate) {
                settings.startDate = new Date().toISOString().split('T')[0];
                saveData();
            }
        } catch (e) {}
    }

    function saveData() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (e) {}
    }

    function $(id) { return document.getElementById(id); }

    function getPartnerName() {
        try {
            var s = (typeof window.getSettings === 'function') ? window.getSettings() : null;
            if (s && s.partnerName) return s.partnerName;
        } catch (e) {}
        return '对方';
    }

    function getMyName() {
        try {
            var s = (typeof window.getSettings === 'function') ? window.getSettings() : null;
            if (s && s.myName) return s.myName;
        } catch (e) {}
        return '我';
    }

    function showToast(msg) {
        if (typeof window.showNotification === 'function') {
            window.showNotification(msg, 'info', 2500);
        }
    }

    function sendPartnerMessage(text) {
        try {
            if (typeof window.addMessage === 'function') {
                window.addMessage({
                    id: Date.now() + Math.random(),
                    sender: getPartnerName(),
                    text: text,
                    timestamp: new Date(),
                    status: 'received',
                    type: 'normal',
                    favorited: false,
                    note: null
                });
            }
        } catch (e) {}
    }

    function calcDays() {
        if (!settings.startDate) return 0;
        var start = new Date(settings.startDate);
        var now = new Date();
        var diff = Math.floor((now - start) / (1000 * 60 * 60 * 24));
        return Math.max(0, diff);
    }

    function randItem(arr) {
        return arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : '';
    }

    function getMood() {
        var keys = Object.keys(MOODS);
        var key = settings.mood || 'happy';
        if (!MOODS[key]) key = 'happy';
        return MOODS[key];
    }

    function randomMood() {
        var keys = Object.keys(MOODS);
        return keys[Math.floor(Math.random() * keys.length)];
    }

    function hideOtherPages() {
        var home = document.getElementById('home-container');
        var chat = document.querySelector('.main-chat-area');
        if (home) {
            home.classList.remove('active');
            home.style.display = 'none';
        }
        if (chat) chat.style.display = 'none';
    }

    function restoreHome() {
        if (typeof window.showHomePage === 'function') {
            window.showHomePage();
            return;
        }
        var home = document.getElementById('home-container');
        if (home) {
            home.classList.add('active');
            home.style.display = 'flex';
        }
    }

    function open() {
        var page = $('companion-page');
        if (!page) return;
        hideOtherPages();
        page.style.display = 'flex';
        render();
    }

    function close() {
        var page = $('companion-page');
        if (page) page.style.display = 'none';
        restoreHome();
    }

    function render() {
        var body = $('companion-body');
        if (!body) return;

        var days = calcDays();
        var mood = getMood();
        var warmWord = randItem(WARM_WORDS);
        var partnerName = getPartnerName();

        var html = '';

        // 顶部陪伴状态卡
        html += '<div class="comp-card comp-hero-card">';
        html += '<div class="comp-mood-emoji" style="font-size:64px;">' + mood.emoji + '</div>';
        html += '<div class="comp-days-label">已经陪伴</div>';
        html += '<div class="comp-days-num">' + days + '</div>';
        html += '<div class="comp-days-unit">天</div>';
        html += '<div class="comp-mood-text">' + partnerName + '今天很' + mood.label + '</div>';
        html += '</div>';

        // 暖心话语
        html += '<div class="comp-card comp-warm-card">';
        html += '<div class="comp-warm-icon"><i class="fas fa-quote-left"></i></div>';
        html += '<div class="comp-warm-text">' + warmWord + '</div>';
        html += '<div class="comp-warm-author">—— ' + partnerName + '</div>';
        html += '</div>';

        // 互动按钮区
        html += '<div class="comp-card comp-action-card">';
        html += '<div class="comp-action-title">互动</div>';
        html += '<div class="comp-action-grid">';
        html += '<button class="comp-action-btn" id="comp-btn-pat">';
        html += '<div class="comp-action-icon"><i class="fas fa-hand-paper"></i></div>';
        html += '<span>拍一拍</span>';
        html += '<b class="comp-action-count">' + settings.totalPats + '</b>';
        html += '</button>';
        html += '<button class="comp-action-btn" id="comp-btn-hug">';
        html += '<div class="comp-action-icon"><i class="fas fa-hands-heart"></i></div>';
        html += '<span>抱抱</span>';
        html += '<b class="comp-action-count">' + settings.totalHugs + '</b>';
        html += '</button>';
        html += '<button class="comp-action-btn" id="comp-btn-night">';
        html += '<div class="comp-action-icon"><i class="fas fa-moon"></i></div>';
        html += '<span>说晚安</span>';
        html += '<b class="comp-action-count">' + settings.totalGoodnights + '</b>';
        html += '</button>';
        html += '</div>';
        html += '</div>';

        // 设置陪伴起始日期
        html += '<div class="comp-card comp-setting-card">';
        html += '<div class="comp-setting-row">';
        html += '<span class="comp-setting-label">陪伴起始日</span>';
        html += '<input type="date" class="comp-date-input" id="comp-start-date" value="' + settings.startDate + '">';
        html += '</div>';
        html += '<div class="comp-setting-row">';
        html += '<span class="comp-setting-label">今天的心情</span>';
        html += '<select class="comp-mood-select" id="comp-mood-select">';
        Object.keys(MOODS).forEach(function (key) {
            var m = MOODS[key];
            html += '<option value="' + key + '"' + (settings.mood === key ? ' selected' : '') + '>' + m.emoji + ' ' + m.label + '</option>';
        });
        html += '</select>';
        html += '</div>';
        html += '</div>';

        body.innerHTML = html;

        // 绑定事件
        var patBtn = $('comp-btn-pat');
        if (patBtn) patBtn.onclick = function () { doInteraction('pat'); };

        var hugBtn = $('comp-btn-hug');
        if (hugBtn) hugBtn.onclick = function () { doInteraction('hug'); };

        var nightBtn = $('comp-btn-night');
        if (nightBtn) nightBtn.onclick = function () { doInteraction('goodnight'); };

        var dateInput = $('comp-start-date');
        if (dateInput) dateInput.addEventListener('change', function () {
            settings.startDate = this.value;
            saveData();
            render();
        });

        var moodSelect = $('comp-mood-select');
        if (moodSelect) moodSelect.addEventListener('change', function () {
            settings.mood = this.value;
            saveData();
            render();
        });
    }

    function doInteraction(type) {
        var reply = randItem(PARTNER_REPLIES[type] || ['']);
        if (!reply) return;

        if (type === 'pat') {
            settings.totalPats++;
            // 随机心情变化
            if (Math.random() < 0.4) {
                settings.mood = randomMood();
            }
        } else if (type === 'hug') {
            settings.totalHugs++;
            if (Math.random() < 0.5) {
                settings.mood = 'love';
            }
        } else if (type === 'goodnight') {
            settings.totalGoodnights++;
            settings.mood = 'calm';
        }

        settings.lastInteraction = Date.now();
        saveData();

        showToast(getPartnerName() + ': ' + reply);
        sendPartnerMessage(reply);
        render();
    }

    // ESC 关闭
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            var page = $('companion-page');
            if (!page || page.style.display === 'none') return;
            e.preventDefault();
            close();
        }
    }, true);

    function init() {
        loadData();
    }

    window.CompanionApp = {
        __loaded: true,
        init: init,
        open: open,
        close: close,
        render: render
    };

    window.openCompanion = function () {
        if (window.CompanionApp) window.CompanionApp.open();
    };

    // 自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 300); });
    } else {
        setTimeout(init, 300);
    }
})();
