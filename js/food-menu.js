/**
 * 吃什么 功能模块 v2
 * - 用户菜谱 + 对方菜谱
 * - 弹窗：输入菜谱、向对方询问、对方随机推荐
 * - 对方主动询问用户吃什么（纯随机触发）
 * - 以小卡片形式提问和回复，双方都是
 * - 对方提问时随机从菜谱挑选几个让用户选，用户也可直接填写推荐
 */
(function() {
    'use strict';

    var STORAGE_KEY = 'food_menu_settings_v1';

    // 会话隔离的存储键生成函数
    function getSessionKey(base) {
        var sid = (typeof window !== 'undefined' && window.SESSION_ID) ? window.SESSION_ID : 'default';
        return 'sess_' + sid + '_' + base;
    }

    var PARTNER_FOOD_REPLIES = [
        '我觉得{food}不错！',
        '想吃{food}吗？',
        '今天推荐{food}～',
        '不如试试{food}？',
        '{food}怎么样？',
        '突然好想吃{food}啊',
        '建议你吃{food}！',
        '想吃{food}就吃吧'
    ];

    var PARTNER_ASK_TEXTS = [
        '今天吃什么好呢？',
        '想好今天吃什么了吗？',
        '吃什么吃什么，纠结ing...',
        '你来决定今天吃什么吧！',
        '我想吃点好的，你呢？'
    ];

    var settings = {
        myMenu: [],
        partnerMenu: []
    };

    function loadData() {
        try {
            var saved = localStorage.getItem(getSessionKey(STORAGE_KEY));
            if (saved) {
                var d = JSON.parse(saved);
                Object.assign(settings, d);
            }
        } catch(e) {}
    }

    function saveData() {
        try {
            localStorage.setItem(getSessionKey(STORAGE_KEY), JSON.stringify(settings));
        } catch(e) {}
    }

    function $(id) { return document.getElementById(id); }

    function showNotification(msg) {
        if (typeof window.showNotification === 'function') {
            window.showNotification(msg, 'info', 3000);
        } else if (typeof showToast === 'function') {
            showToast(msg);
        }
    }

    function sendPartnerMessage(text) {
        try {
            if (typeof window.addMessage === 'function') {
                window.addMessage({
                    id: Date.now() + Math.random(),
                    sender: 'partner',
                    text: text,
                    timestamp: new Date(),
                    status: 'received',
                    type: 'normal',
                    favorited: false,
                    note: null
                });
            }
        } catch(e) {}
    }

    function sendSystemMessage(text) {
        try {
            if (typeof window.addMessage === 'function') {
                window.addMessage({
                    id: Date.now() + Math.random(),
                    sender: 'system',
                    text: text,
                    timestamp: new Date(),
                    status: 'received',
                    type: 'system',
                    favorited: false,
                    note: null
                });
            }
        } catch(e) {}
    }

    function randomItem(arr) {
        return arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : '';
    }

    function shuffleArray(arr) {
        var copy = arr.slice();
        for (var i = copy.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = copy[i];
            copy[i] = copy[j];
            copy[j] = tmp;
        }
        return copy;
    }

    function escapeHtml(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    function getPartnerName() {
        try {
            if (typeof window.settings !== 'undefined' && window.settings.partnerName) return window.settings.partnerName;
        } catch(e) {}
        return 'TA';
    }

    function getMyName() {
        try {
            if (typeof window.settings !== 'undefined' && window.settings.myName) return window.settings.myName;
        } catch(e) {}
        return '我';
    }

    // ========== 吃什么弹窗 ==========
    function openFoodPicker() {
        var overlay = $('food-menu-overlay');
        if (!overlay) {
            createFoodOverlay();
        }
        overlay = $('food-menu-overlay');
        if (!overlay) return;
        overlay.style.display = 'flex';
        renderFoodMenu();
    }

    function closeFoodPicker() {
        var overlay = $('food-menu-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    function createFoodOverlay() {
        var overlay = document.createElement('div');
        overlay.id = 'food-menu-overlay';
        overlay.className = 'food-menu-overlay';
        overlay.innerHTML = 
            '<div class="food-menu-box">' +
                '<div class="food-menu-header">' +
                    '<button class="food-menu-close" id="food-close-btn"><i class="fas fa-times"></i></button>' +
                    '<span class="food-menu-title">吃什么</span>' +
                '</div>' +
                '<div class="food-menu-body">' +
                    '<div class="food-menu-section">' +
                        '<div class="food-section-title"><span>我的菜谱</span><button class="food-add-btn" id="food-add-mine">+ 添加</button></div>' +
                        '<div class="food-chips" id="food-my-chips"></div>' +
                        '<input type="text" class="food-input" id="food-my-input" placeholder="输入菜名按回车添加" style="display:none;">' +
                    '</div>' +
                    '<div class="food-menu-section">' +
                        '<div class="food-section-title"><span>对方的菜谱</span><button class="food-add-btn" id="food-add-partner">+ 添加</button></div>' +
                        '<div class="food-chips" id="food-partner-chips"></div>' +
                        '<input type="text" class="food-input" id="food-partner-input" placeholder="输入菜名按回车添加" style="display:none;">' +
                    '</div>' +
                    '<div class="food-menu-actions">' +
                        '<button class="food-action-btn food-ask-btn" id="food-ask-partner"><i class="fas fa-comment"></i> 问对方吃什么</button>' +
                        '<button class="food-action-btn food-random-btn" id="food-random-pick"><i class="fas fa-dice"></i> 随机推荐</button>' +
                    '</div>' +
                    '<div class="food-result" id="food-result" style="display:none;"></div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        // 绑定事件
        $('food-close-btn').onclick = closeFoodPicker;
        $('food-add-mine').onclick = function() {
            var inp = $('food-my-input');
            inp.style.display = inp.style.display === 'none' ? 'block' : 'none';
            if (inp.style.display !== 'none') inp.focus();
        };
        $('food-add-partner').onclick = function() {
            var inp = $('food-partner-input');
            inp.style.display = inp.style.display === 'none' ? 'block' : 'none';
            if (inp.style.display !== 'none') inp.focus();
        };
        $('food-my-input').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                var val = this.value.trim();
                if (val && settings.myMenu.indexOf(val) === -1) {
                    settings.myMenu.push(val);
                    saveData();
                    this.value = '';
                    renderFoodMenu();
                }
            }
        });
        $('food-partner-input').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                var val = this.value.trim();
                if (val && settings.partnerMenu.indexOf(val) === -1) {
                    settings.partnerMenu.push(val);
                    saveData();
                    this.value = '';
                    renderFoodMenu();
                }
            }
        });
        $('food-ask-partner').onclick = askPartnerWhatToEat;
        $('food-random-pick').onclick = randomRecommend;

        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closeFoodPicker();
        });
    }

    function renderFoodMenu() {
        // 我的菜谱
        var myChips = $('food-my-chips');
        if (myChips) {
            var html = '';
            if (settings.myMenu.length === 0) {
                html = '<span class="food-empty">还没有菜谱，点击添加</span>';
            } else {
                settings.myMenu.forEach(function(food, i) {
                    html += '<span class="food-chip">' + escapeHtml(food) + '<button class="food-chip-del" data-menu="my" data-idx="' + i + '"><i class="fas fa-times"></i></button></span>';
                });
            }
            myChips.innerHTML = html;
            myChips.querySelectorAll('.food-chip-del').forEach(function(btn) {
                btn.onclick = function() {
                    var idx = parseInt(btn.dataset.idx);
                    settings.myMenu.splice(idx, 1);
                    saveData();
                    renderFoodMenu();
                };
            });
        }
        // 对方菜谱
        var pChips = $('food-partner-chips');
        if (pChips) {
            var html2 = '';
            if (settings.partnerMenu.length === 0) {
                html2 = '<span class="food-empty">还没有菜谱，点击添加</span>';
            } else {
                settings.partnerMenu.forEach(function(food, i) {
                    html2 += '<span class="food-chip partner">' + escapeHtml(food) + '<button class="food-chip-del" data-menu="partner" data-idx="' + i + '"><i class="fas fa-times"></i></button></span>';
                });
            }
            pChips.innerHTML = html2;
            pChips.querySelectorAll('.food-chip-del').forEach(function(btn) {
                btn.onclick = function() {
                    var idx = parseInt(btn.dataset.idx);
                    settings.partnerMenu.splice(idx, 1);
                    saveData();
                    renderFoodMenu();
                };
            });
        }
    }

    // ========== 吃什么小卡片渲染 ==========
    function renderFoodCardHTML(msg) {
        if (!msg || msg.type !== 'food-card' || !msg.foodCard) return '';
        var card = msg.foodCard;
        var partnerName = getPartnerName();
        var myName = getMyName();
        var html = '<div class="food-card-msg" data-food-msg-id="' + escapeHtml(String(msg.id)) + '" data-food-card-id="' + escapeHtml(card.cardId) + '">';

        if (card.role === 'ask') {
            // 提问卡片
            var askerName = card.from === 'partner' ? partnerName : myName;
            html += '<div class="food-card-header"><i class="fas fa-utensils"></i><span>' + escapeHtml(askerName) + '问：吃什么好呢？</span></div>';
            
            // 选项
            if (card.options && card.options.length > 0) {
                html += '<div class="food-card-options">';
                card.options.forEach(function(opt, i) {
                    var answered = card.answered;
                    var selectedCls = (answered && card.selectedFood === opt) ? ' selected' : '';
                    var disabled = answered ? ' disabled' : '';
                    html += '<button type="button" class="food-card-option-btn' + selectedCls + '"' + disabled + 
                        ' data-food-action="select" data-food-opt="' + escapeHtml(opt) + '" data-food-card-id="' + escapeHtml(card.cardId) + '">' + 
                        escapeHtml(opt) + '</button>';
                });
                html += '</div>';
            }

            // 自定义输入
            if (!card.answered) {
                html += '<div class="food-card-input-row">';
                html += '<input type="text" class="food-card-input" placeholder="或直接填写推荐…" data-food-card-id="' + escapeHtml(card.cardId) + '">';
                html += '<button type="button" class="food-card-send-btn" data-food-action="send-custom" data-food-card-id="' + escapeHtml(card.cardId) + '">推荐</button>';
                html += '</div>';
            } else {
                // 已回答
                var answererName = card.from === 'partner' ? myName : partnerName;
                html += '<div class="food-card-answered">' + escapeHtml(answererName) + '选择了：<b>' + escapeHtml(card.selectedFood) + '</b></div>';
            }
        } else if (card.role === 'reply') {
            // 回复卡片
            var replierName = card.from === 'partner' ? partnerName : myName;
            html += '<div class="food-card-header"><i class="fas fa-utensils"></i><span>' + escapeHtml(replierName) + '推荐</span></div>';
            // 态度标签
            if (card.attitude) {
                var attitudeCls = card.attitude === '想吃' ? 'food-attitude-like' : 'food-attitude-dislike';
                html += '<div class="food-card-attitude ' + attitudeCls + '">' + escapeHtml(card.attitude) + '</div>';
            }
            html += '<div class="food-card-reply-food">' + escapeHtml(card.food) + '</div>';
            if (card.comment) {
                html += '<div class="food-card-reply-comment">' + escapeHtml(card.comment) + '</div>';
            }
        }

        html += '</div>';
        return html;
    }

    // ========== 绑定卡片事件 ==========
    function bindFoodCardEvents() {
        document.addEventListener('click', function(e) {
            var btn = e.target.closest('[data-food-action]');
            if (!btn) return;

            e.preventDefault();
            e.stopPropagation();

            var action = btn.dataset.foodAction;
            var cardId = btn.dataset.foodCardId;

            if (action === 'select') {
                var food = btn.dataset.foodOpt;
                handleFoodSelect(cardId, food);
            } else if (action === 'send-custom') {
                var input = btn.parentElement.querySelector('.food-card-input');
                if (input) {
                    var val = input.value.trim();
                    if (val) {
                        handleFoodSelect(cardId, val);
                    }
                }
            }
        });

        // 回车键提交自定义推荐
        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Enter') return;
            var input = e.target.closest('.food-card-input');
            if (!input) return;
            var cardId = input.dataset.foodCardId;
            var val = input.value.trim();
            if (val) {
                e.preventDefault();
                handleFoodSelect(cardId, val);
            }
        });
    }

    // 处理用户选择/推荐食物
    function handleFoodSelect(cardId, food) {
        // 在 messages 中找到对应的卡片消息
        var msgs = (typeof window.messages !== 'undefined') ? window.messages : [];
        var msgIdx = -1;
        for (var i = 0; i < msgs.length; i++) {
            if (msgs[i].type === 'food-card' && msgs[i].foodCard && msgs[i].foodCard.cardId === cardId) {
                msgIdx = i;
                break;
            }
        }
        if (msgIdx < 0) return;

        var msg = msgs[msgIdx];
        var card = msg.foodCard;

        // 已经回答过的不再处理
        if (card.answered) return;

        // 标记已回答
        card.answered = true;
        card.selectedFood = food;

        // 发送用户的回复卡片
        sendFoodCardMessage('reply', 'user', food, '');

        // 对方回复
        setTimeout(function() {
            if (card.from === 'partner') {
                // 对方提问时，用户选择后，对方回复想吃/不想吃（同食物，60%想吃）
                var wantsToEat = Math.random() < 0.6;
                var attitude = wantsToEat ? '想吃' : '不想吃';
                var comment = wantsToEat ? '好呀，我也想吃这个！' : '这个嘛...我不太想吃';
                sendFoodCardMessage('reply', 'partner', food, comment, attitude);
            } else {
                // 用户提问时，对方从菜谱中随机选一个推荐（带态度，70%想吃）
                var partnerFood = '';
                if (settings.partnerMenu.length > 0) {
                    partnerFood = randomItem(settings.partnerMenu);
                } else if (settings.myMenu.length > 0) {
                    partnerFood = randomItem(settings.myMenu);
                } else {
                    partnerFood = randomItem(['火锅', '烤肉', '寿司', '面条', '炒饭', '沙拉']);
                }
                var reply = randomItem(PARTNER_FOOD_REPLIES).replace('{food}', partnerFood);
                var partnerAttitude = Math.random() < 0.7 ? '想吃' : '不想吃';
                sendFoodCardMessage('reply', 'partner', partnerFood, reply, partnerAttitude);
            }
        }, 1000 + Math.random() * 2000);

        // 重新渲染
        if (typeof renderMessages === 'function') {
            renderMessages(true);
        }
    }

    // 发送食物卡片消息
    function sendFoodCardMessage(role, from, food, comment, attitude) {
        try {
            if (typeof window.addMessage === 'function') {
                var cardId = 'food_' + Date.now() + '_' + Math.random();
                window.addMessage({
                    id: Date.now() + Math.random(),
                    sender: from === 'user' ? 'user' : 'partner',
                    text: '',
                    timestamp: new Date(),
                    status: from === 'user' ? 'sent' : 'received',
                    type: 'food-card',
                    foodCard: {
                        cardId: cardId,
                        role: role,
                        from: from,
                        food: food,
                        comment: comment || '',
                        attitude: attitude || '',
                        options: [],
                        answered: false,
                        selectedFood: ''
                    },
                    favorited: false,
                    note: null
                });
            }
        } catch(e) {}
    }

    // ========== 吃什么交互流程 ==========

    // 用户主动问对方吃什么（小卡片形式）
    function askPartnerWhatToEat() {
        // 从对方菜谱中随机挑选3-5个选项
        var allFoods = settings.partnerMenu.concat(settings.myMenu);
        if (allFoods.length === 0) {
            allFoods = ['火锅', '烤肉', '寿司', '面条', '炒饭', '沙拉', '披萨', '汉堡', '粥', '饺子'];
        }
        var shuffled = shuffleArray(allFoods);
        var pickCount = Math.min(shuffled.length, 3 + Math.floor(Math.random() * 3)); // 3-5个
        var options = shuffled.slice(0, pickCount);

        var cardId = 'food_' + Date.now() + '_' + Math.random();

        // 发送我的提问卡片
        try {
            if (typeof window.addMessage === 'function') {
                window.addMessage({
                    id: Date.now() + Math.random(),
                    sender: 'user',
                    text: '',
                    timestamp: new Date(),
                    status: 'sent',
                    type: 'food-card',
                    foodCard: {
                        cardId: cardId,
                        role: 'ask',
                        from: 'user',
                        options: options,
                        answered: false,
                        selectedFood: ''
                    },
                    favorited: false,
                    note: null
                });
            }
        } catch(e) {}

        // 对方回复（选择一个食物，带态度，70%想吃）
        setTimeout(function() {
            var food = randomItem(options);
            var reply = randomItem(PARTNER_FOOD_REPLIES).replace('{food}', food);
            var attitude = Math.random() < 0.7 ? '想吃' : '不想吃';
            sendFoodCardMessage('reply', 'partner', food, reply, attitude);
        }, 1500 + Math.random() * 2000);

        closeFoodPicker();
    }

    // 随机推荐
    function randomRecommend() {
        var allFoods = settings.myMenu.concat(settings.partnerMenu);
        if (allFoods.length === 0) {
            allFoods = ['火锅', '烤肉', '寿司', '面条', '炒饭', '沙拉', '披萨', '汉堡', '粥', '饺子'];
        }
        var food = randomItem(allFoods);
        var result = $('food-result');
        if (result) {
            result.style.display = 'block';
            result.innerHTML = '<div class="food-result-text">今天就吃 <b>' + escapeHtml(food) + '</b> 吧！</div>';
        }
        showNotification('推荐：' + food);
    }

    // ========== 对方主动问我吃什么（小卡片形式） ==========
    function partnerAskMeFood() {
        // 从我的菜谱和对方菜谱中随机挑选3-5个选项
        var allFoods = settings.myMenu.concat(settings.partnerMenu);
        if (allFoods.length === 0) {
            allFoods = ['火锅', '烤肉', '寿司', '面条', '炒饭', '沙拉', '披萨', '汉堡', '粥', '饺子'];
        }
        var shuffled = shuffleArray(allFoods);
        var pickCount = Math.min(shuffled.length, 3 + Math.floor(Math.random() * 3)); // 3-5个
        var options = shuffled.slice(0, pickCount);

        var cardId = 'food_' + Date.now() + '_' + Math.random();

        // 对方发送提问卡片
        try {
            if (typeof window.addMessage === 'function') {
                window.addMessage({
                    id: Date.now() + Math.random(),
                    sender: 'partner',
                    text: '',
                    timestamp: new Date(),
                    status: 'received',
                    type: 'food-card',
                    foodCard: {
                        cardId: cardId,
                        role: 'ask',
                        from: 'partner',
                        options: options,
                        answered: false,
                        selectedFood: ''
                    },
                    favorited: false,
                    note: null
                });
            }
        } catch(e) {}
    }

    // ========== 初始化 ==========
    function init() {
        loadData();
        bindFoodCardEvents();
    }

    window.FoodApp = {
        openFoodPicker: openFoodPicker,
        closeFoodPicker: closeFoodPicker,
        getSettings: function() { return settings; },
        renderFoodCardHTML: renderFoodCardHTML,
        partnerAskMeFood: partnerAskMeFood
    };

    // 注入CSS样式
    if (!document.getElementById('food-card-style')) {
        var style = document.createElement('style');
        style.id = 'food-card-style';
        style.textContent = `
            .food-card-msg {
                min-width: 200px;
                max-width: 280px;
                padding: 0;
                border-radius: 12px;
                overflow: hidden;
            }
            .food-card-header {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 10px 12px;
                background: rgba(7,193,96,0.08);
                font-size: 13px;
                font-weight: 600;
                color: var(--accent-color, #07c160);
            }
            .food-card-header i { font-size: 14px; }
            .food-card-options {
                padding: 8px;
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
            }
            .food-card-option-btn {
                padding: 6px 14px;
                border: 1px solid var(--border-color, #e0e0e0);
                background: var(--primary-bg, #f5f5f5);
                color: var(--text-primary, #333);
                border-radius: 16px;
                font-size: 13px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .food-card-option-btn:hover:not(:disabled) {
                background: var(--accent-color, #07c160);
                color: #fff;
                border-color: var(--accent-color, #07c160);
            }
            .food-card-option-btn.selected {
                background: var(--accent-color, #07c160);
                color: #fff;
                border-color: var(--accent-color, #07c160);
            }
            .food-card-option-btn:disabled {
                opacity: 0.6;
                cursor: default;
            }
            .food-card-input-row {
                display: flex;
                gap: 6px;
                padding: 8px;
                border-top: 1px solid var(--border-color, #e0e0e0);
            }
            .food-card-input {
                flex: 1;
                padding: 6px 10px;
                border: 1px solid var(--border-color, #e0e0e0);
                border-radius: 8px;
                font-size: 13px;
                background: var(--secondary-bg, #fff);
                color: var(--text-primary, #333);
                min-width: 0;
            }
            .food-card-send-btn {
                padding: 6px 12px;
                background: var(--accent-color, #07c160);
                color: #fff;
                border: none;
                border-radius: 8px;
                font-size: 13px;
                cursor: pointer;
                white-space: nowrap;
            }
            .food-card-answered {
                padding: 8px 12px;
                font-size: 13px;
                color: var(--text-secondary, #999);
            }
            .food-card-answered b {
                color: var(--accent-color, #07c160);
            }
            .food-card-attitude {
                padding: 4px 10px;
                margin: 10px 12px 0;
                font-size: 12px;
                font-weight: 600;
                border-radius: 12px;
                text-align: center;
                display: inline-block;
                position: relative;
                left: 50%;
                transform: translateX(-50%);
            }
            .food-card-attitude.food-attitude-like {
                background: rgba(7,193,96,0.12);
                color: var(--accent-color, #07c160);
            }
            .food-card-attitude.food-attitude-dislike {
                background: rgba(153,153,153,0.15);
                color: var(--text-secondary, #999);
            }
            .food-card-reply-food {
                padding: 12px;
                font-size: 16px;
                font-weight: 700;
                color: var(--accent-color, #07c160);
                text-align: center;
            }
            .food-card-reply-comment {
                padding: 0 12px 10px;
                font-size: 12px;
                color: var(--text-secondary, #999);
                text-align: center;
            }
        `;
        document.head.appendChild(style);
    }

    // 自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 500); });
    } else {
        setTimeout(init, 500);
    }

    // 会话切换时重新加载数据
    window.addEventListener('sessionChanged', function() {
        setTimeout(function() {
            if (typeof loadData === 'function') loadData();
        }, 200);
    });
})();
