/**
 * 扔水果 & 切水果 功能模块 v2
 * - 扔水果：选emoji + 动作词 → 扔向聊天气泡前头像 → 系统提示 → 每次必触发回复
 * - 切水果双人对战：60秒计时，分别计分，AI不与用户重合
 * - 对方可主动申请一起玩切水果
 */
(function() {
    'use strict';

    var STORAGE_KEY = 'fruit_throw_settings_v2';

    function getSessionKey(base) {
        var sid = (typeof window !== 'undefined' && window.SESSION_ID) ? window.SESSION_ID : 'default';
        return 'sess_' + sid + '_' + base;
    }

    var FRUITS = ['🍎', '🍊', '🍌', '🍇', '🍓', '🍑', '🍒', '🥭', '🍍', '🥝', '🍉', '🍐'];

    var ACTIONS = [
        '我很生气，向对方扔了',
        '开玩笑地向对方扔了',
        '撒娇地向对方扔了',
        '笑着向对方扔了',
        '无聊地向对方扔了',
        '调皮地向对方扔了',
        '认真地扔了',
        '傲娇地向对方扔了',
        '哼！生气地向对方扔了',
        '开开心心地向对方扔了',
        '气鼓鼓地向对方扔了'
    ];

    var PARTNER_REPLIES = [
        '喂！干嘛扔我！',
        '哼，我也要扔你！',
        '好疼啊...你变坏了',
        '哈哈，接住！',
        '你是不是皮痒了？',
        '哇，好甜的水果～',
        '别扔了别扔了！',
        '我生气了！非常生气！',
        '你再扔我就不理你了',
        '嘿嘿，我喜欢这个水果',
        '你扔得真准啊...',
        '看我的反击！',
        '哼！讨厌啦～',
        '哇塞你干的好事',
        '哎呀，打到我了！',
        '你干嘛啦！'
    ];

    var PARTNER_ACTIONS = [
        '对方生气地向你扔了',
        '对方笑着向你扔了',
        '对方挑衅地向你扔了',
        '对方撒娇地扔了',
        '对方无聊地向你扔了'
    ];

    var settings = {
        lastPartnerThrowTime: 0,
        lastPartnerSliceInvite: 0
    };

    var selectedFruit = '';
    var selectedAction = '';

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

    function escapeHtml(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function showNotification(msg) {
        if (typeof window.showNotification === 'function') {
            window.showNotification(msg, 'info', 3000);
        } else if (typeof showToast === 'function') {
            showToast(msg);
        }
    }

    // ========== 扔水果选择器 ==========
    function openThrowPicker() {
        var overlay = $('fruit-picker-overlay');
        if (!overlay) return;
        overlay.style.display = 'flex';
        selectedFruit = '';
        selectedAction = '';
        renderFruitGrid();
        renderActionList();
        updatePreview();
        $('fruit-step-1').style.display = 'block';
        $('fruit-step-2').style.display = 'none';
    }

    function closeThrowPicker() {
        var overlay = $('fruit-picker-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    function renderFruitGrid() {
        var grid = $('fruit-emoji-grid');
        if (!grid) return;
        var html = '';
        FRUITS.forEach(function(fruit) {
            var sel = selectedFruit === fruit ? 'selected' : '';
            html += '<button class="fruit-emoji-btn ' + sel + '" data-fruit="' + fruit + '">' + fruit + '</button>';
        });
        grid.innerHTML = html;
        grid.querySelectorAll('.fruit-emoji-btn').forEach(function(btn) {
            btn.onclick = function() {
                selectedFruit = btn.dataset.fruit;
                renderFruitGrid();
                updatePreview();
                $('fruit-step-1').style.display = 'none';
                $('fruit-step-2').style.display = 'block';
            };
        });
    }

    function renderActionList() {
        var list = $('fruit-action-list');
        if (!list) return;
        var html = '';
        ACTIONS.forEach(function(action) {
            var sel = selectedAction === action ? 'selected' : '';
            html += '<button class="fruit-action-btn ' + sel + '" data-action="' + escapeHtml(action) + '">' + escapeHtml(action) + ' ' + selectedFruit + '</button>';
        });
        html += '<button class="fruit-action-btn" data-action="__random__">随机选择</button>';
        list.innerHTML = html;
        list.querySelectorAll('.fruit-action-btn').forEach(function(btn) {
            btn.onclick = function() {
                var action = btn.dataset.action;
                if (action === '__random__') {
                    action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
                }
                selectedAction = action;
                executeThrow();
            };
        });
    }

    function updatePreview() {
        var preview = $('fruit-preview');
        if (!preview) return;
        if (selectedFruit && selectedAction) {
            preview.innerHTML = '<span style="font-size:28px;">' + selectedFruit + '</span><span style="margin-left:8px;font-size:13px;">' + escapeHtml(selectedAction) + ' ' + selectedFruit + '</span>';
            preview.style.display = 'flex';
        } else if (selectedFruit) {
            preview.innerHTML = '<span style="font-size:28px;">' + selectedFruit + '</span><span style="margin-left:8px;font-size:13px;">已选水果，请选动作词</span>';
            preview.style.display = 'flex';
        } else {
            preview.innerHTML = '';
            preview.style.display = 'none';
        }
    }

    // ========== 执行扔水果 ==========
    function executeThrow() {
        if (!selectedFruit || !selectedAction) return;

        var message = selectedAction + ' ' + selectedFruit;

        // 在聊天界面对方最后一条消息的头像上显示特效
        showFruitOnChatAvatar(selectedFruit);

        // 发送系统消息
        sendSystemMessage(message);

        closeThrowPicker();

        // 每次扔必触发对方一句回复
        setTimeout(function() {
            triggerPartnerReply();
        }, 1500 + Math.random() * 1500);

        selectedFruit = '';
        selectedAction = '';
    }

    // 查找聊天区域中最后一条消息的头像
    // who: 'partner' = 对方头像, 'me' = 用户头像
    function findLastAvatar(who) {
        // 主聊天容器
        var containers = [
            document.getElementById('chat-container'),
            document.getElementById('chatBody'),
            document.querySelector('.main-chat-area'),
            document.getElementById('ta-chat-sync-body')
        ].filter(Boolean);

        // 主聊天选择器
        var mainSelector = who === 'partner'
            ? '.message-wrapper.received .message-avatar'
            : '.message-wrapper.sent .message-avatar';

        // TA手机聊天选择器
        var taSelector = who === 'partner'
            ? '.ta-chat-sync-msg.ta-chat-sync-right .ta-chat-sync-msg-avatar'
            : '.ta-chat-sync-msg.ta-chat-sync-left .ta-chat-sync-msg-avatar';

        for (var c = 0; c < containers.length; c++) {
            var container = containers[c];
            // 先尝试主聊天选择器
            var avatars = container.querySelectorAll(mainSelector);
            if (avatars.length > 0) return avatars[avatars.length - 1];
            // 再尝试TA手机聊天选择器
            var taAvatars = container.querySelectorAll(taSelector);
            if (taAvatars.length > 0) return taAvatars[taAvatars.length - 1];
            // 通用回退：遍历所有头像找匹配的wrapper
            var allAvatars = container.querySelectorAll('.message-avatar, .ta-chat-sync-msg-avatar');
            for (var i = allAvatars.length - 1; i >= 0; i--) {
                var wrapper = allAvatars[i].closest('.message-wrapper');
                if (wrapper) {
                    if (who === 'partner' && wrapper.classList.contains('received')) return allAvatars[i];
                    if (who === 'me' && wrapper.classList.contains('sent')) return allAvatars[i];
                }
                var taMsg = allAvatars[i].closest('.ta-chat-sync-msg');
                if (taMsg) {
                    if (who === 'partner' && taMsg.classList.contains('ta-chat-sync-right')) return allAvatars[i];
                    if (who === 'me' && taMsg.classList.contains('ta-chat-sync-left')) return allAvatars[i];
                }
            }
        }
        return null;
    }

    // 在聊天界面对方气泡前的头像上显示水果特效
    function showFruitOnChatAvatar(emoji) {
        var partnerAvatar = findLastAvatar('partner');

        // 如果聊天区找不到，回退到hero头像
        if (!partnerAvatar) {
            partnerAvatar = document.getElementById('avatar-partner') || document.querySelector('.hero-avatar-right .hero-avatar');
        }
        if (!partnerAvatar) return;

        var rect = partnerAvatar.getBoundingClientRect();
        var layer = getOrCreateLayer();

        var fruitEl = document.createElement('div');
        fruitEl.className = 'fruit-hit-effect';
        fruitEl.textContent = emoji;
        fruitEl.style.left = (rect.left + rect.width / 2 - 24) + 'px';
        fruitEl.style.top = (rect.top + rect.height / 2 - 24) + 'px';
        layer.appendChild(fruitEl);

        partnerAvatar.classList.add('fruit-avatar-shake');

        setTimeout(function() {
            if (fruitEl.parentNode) {
                fruitEl.classList.add('fade-out');
                setTimeout(function() {
                    if (fruitEl.parentNode) fruitEl.parentNode.removeChild(fruitEl);
                }, 300);
            }
            partnerAvatar.classList.remove('fruit-avatar-shake');
        }, 3000);
    }

    // 在用户头像上显示水果特效（对方扔向用户）
    function showFruitOnUserChatAvatar(emoji) {
        var myAvatar = findLastAvatar('me');

        if (!myAvatar) {
            myAvatar = document.getElementById('avatar-me') || document.querySelector('.hero-avatar-left .hero-avatar');
        }
        if (!myAvatar) return;

        var rect = myAvatar.getBoundingClientRect();
        var layer = getOrCreateLayer();

        var fruitEl = document.createElement('div');
        fruitEl.className = 'fruit-hit-effect';
        fruitEl.textContent = emoji;
        fruitEl.style.left = (rect.left + rect.width / 2 - 24) + 'px';
        fruitEl.style.top = (rect.top + rect.height / 2 - 24) + 'px';
        layer.appendChild(fruitEl);

        myAvatar.classList.add('fruit-avatar-shake');

        setTimeout(function() {
            if (fruitEl.parentNode) {
                fruitEl.classList.add('fade-out');
                setTimeout(function() {
                    if (fruitEl.parentNode) fruitEl.parentNode.removeChild(fruitEl);
                }, 300);
            }
            myAvatar.classList.remove('fruit-avatar-shake');
        }, 3000);
    }

    function getOrCreateLayer() {
        var layer = $('fruit-throw-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.id = 'fruit-throw-layer';
            layer.className = 'fruit-throw-layer';
            document.body.appendChild(layer);
        }
        return layer;
    }

    // ========== 消息发送 ==========
    function sendSystemMessage(text) {
        try {
            var msgObj = {
                id: Date.now() + Math.random(),
                sender: 'system',
                text: text,
                timestamp: new Date(),
                status: 'received',
                type: 'system',
                favorited: false,
                note: null
            };
            if (typeof window.addMessage === 'function') {
                window.addMessage(msgObj);
            }
        } catch(e) { console.warn('[FruitApp] sendSystemMessage:', e); }
    }

    function sendPartnerMessage(text) {
        try {
            var msgObj = {
                id: Date.now() + Math.random(),
                sender: 'partner',
                text: text,
                timestamp: new Date(),
                status: 'received',
                type: 'normal',
                favorited: false,
                note: null
            };
            if (typeof window.addMessage === 'function') {
                window.addMessage(msgObj);
            }
        } catch(e) { console.warn('[FruitApp] sendPartnerMessage:', e); }
    }

    // 每次扔必触发对方一句回复（纯随机，无概率设置）
    function triggerPartnerReply() {
        var r = Math.random();
        if (r < 0.35) {
            // 对方也扔水果回来
            var fruit = FRUITS[Math.floor(Math.random() * FRUITS.length)];
            var action = PARTNER_ACTIONS[Math.floor(Math.random() * PARTNER_ACTIONS.length)];
            var msg = action + ' ' + fruit;
            sendSystemMessage(msg);
            showFruitOnUserChatAvatar(fruit);
        } else {
            // 对方文字回复（不含颜文字）
            var reply = PARTNER_REPLIES[Math.floor(Math.random() * PARTNER_REPLIES.length)];
            sendPartnerMessage(reply);
        }
    }

    // ========== 双击头像扔水果 ==========
    function bindAvatarThrow() {
        var partnerAvatar = document.getElementById('avatar-partner');
        if (partnerAvatar) {
            partnerAvatar.addEventListener('dblclick', function(e) {
                e.preventDefault(); e.stopPropagation();
                throwAtPartner();
            });
        }
    }

    function throwAtPartner() {
        var fruit = FRUITS[Math.floor(Math.random() * FRUITS.length)];
        var action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
        selectedFruit = fruit;
        selectedAction = action;
        var message = action + ' ' + fruit;
        showFruitOnChatAvatar(fruit);
        sendSystemMessage(message);
        selectedFruit = '';
        selectedAction = '';

        setTimeout(function() {
            triggerPartnerReply();
        }, 1500 + Math.random() * 1500);
    }

    // ========== 对方主动扔水果和切水果邀请已移至 checkConversationStart，纯随机触发 ==========

    // 显示切水果邀请弹窗
    function showSliceInvitePopup() {
        // 移除已有的弹窗
        var existing = document.getElementById('slice-invite-popup');
        if (existing) existing.remove();

        var popup = document.createElement('div');
        popup.id = 'slice-invite-popup';
        popup.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10002;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
        popup.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px 28px;text-align:center;max-width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.2);">' +
            '<div style="font-size:40px;margin-bottom:12px;">🍎🔪</div>' +
            '<h3 style="margin:0 0 8px;font-size:18px;color:#333;">切水果大战邀请</h3>' +
            '<p style="margin:0 0 16px;font-size:13px;color:#888;">对方邀请你一起玩切水果！<br>60秒限时，看谁切得多～</p>' +
            '<div style="display:flex;gap:12px;justify-content:center;">' +
                '<button id="slice-invite-accept" style="border:none;border-radius:20px;background:#4CAF50;color:#fff;padding:8px 24px;font-size:14px;cursor:pointer;font-weight:600;">接受</button>' +
                '<button id="slice-invite-reject" style="border:none;border-radius:20px;background:#e0e0e0;color:#666;padding:8px 24px;font-size:14px;cursor:pointer;">拒绝</button>' +
            '</div></div>';
        document.body.appendChild(popup);

        var acceptBtn = popup.querySelector('#slice-invite-accept');
        var rejectBtn = popup.querySelector('#slice-invite-reject');
        if (acceptBtn) {
            acceptBtn.onclick = function() {
                popup.remove();
                openSliceGame();
            };
        }
        if (rejectBtn) {
            rejectBtn.onclick = function() {
                popup.remove();
                sendPartnerMessage('现在不想玩，下次吧～');
            };
        }
    }

    // ========== 音视频上传 ==========
    function handleMediaUpload(input) {
        if (!input.files || !input.files[0]) return;
        var file = input.files[0];
        var type = file.type;
        var isAudio = type.startsWith('audio/');
        var isVideo = type.startsWith('video/');
        if (!isAudio && !isVideo) { showNotification('请选择音频或视频文件'); return; }
        if (file.size > 30 * 1024 * 1024) { showNotification('文件不能超过30MB'); return; }

        // 使用 sendChatMediaFile 创建带播放器的媒体消息
        if (typeof window.sendChatMediaFile === 'function') {
            window.sendChatMediaFile(file, 'user');
        } else {
            // 回退方案：发送文本消息
            var fileName = file.name || '未命名';
            var msgContent = isAudio ? '🎵 发送了音频：' + fileName : '🎬 发送了视频：' + fileName;
            showNotification('已上传' + (isAudio ? '音频' : '视频') + '：' + fileName);
            try {
                if (typeof window.addMessage === 'function') {
                    window.addMessage({
                        id: Date.now() + Math.random(),
                        sender: 'me',
                        text: msgContent,
                        timestamp: new Date(),
                        status: 'sent',
                        type: 'normal',
                        favorited: false,
                        note: null
                    });
                }
            } catch(e) {}
        }
        input.value = '';
    }

    // ========== 切水果双人对战游戏 ==========
    var sliceGame = {
        running: false,
        canvas: null,
        ctx: null,
        W: 0, H: 0,
        fruits: [],
        userSlices: [],
        aiSlices: [],
        userScore: 0,
        aiScore: 0,
        timeLeft: 60,
        timerId: null,
        animationId: null,
        lastSpawn: 0,
        lastAiMove: 0,
        aiTargetX: 0,
        aiTargetY: 0,
        aiPrevX: 0,
        aiPrevY: 0
    };

    function openSliceGame() {
        var overlay = $('fruit-slice-overlay');
        if (!overlay) return;
        overlay.style.display = 'flex';

        // 重置游戏UI
        var html = '<div class="fruit-slice-topbar">' +
            '<div class="fruit-slice-score-box"><span>我</span><b id="fs-user-score">0</b></div>' +
            '<div class="fruit-slice-timer" id="fs-timer">60s</div>' +
            '<div class="fruit-slice-score-box"><span>对方</span><b id="fs-ai-score">0</b></div>' +
            '</div>' +
            '<div class="fruit-slice-arena">' +
                '<canvas id="fruit-slice-canvas"></canvas>' +
                '<div class="fruit-slice-ai-cursor" id="fs-ai-cursor"></div>' +
            '</div>' +
            '<div class="fruit-slice-bottombar">' +
                '<button onclick="window.FruitApp.closeSliceGame()">退出</button>' +
            '</div>';
        overlay.innerHTML = html;

        sliceGame.canvas = $('fruit-slice-canvas');
        if (!sliceGame.canvas) return;
        sliceGame.ctx = sliceGame.canvas.getContext('2d');

        function resize() {
            var arena = sliceGame.canvas.parentElement;
            sliceGame.W = sliceGame.canvas.width = arena.offsetWidth;
            sliceGame.H = sliceGame.canvas.height = arena.offsetHeight;
        }
        resize();

        sliceGame.running = true;
        sliceGame.userScore = 0;
        sliceGame.aiScore = 0;
        sliceGame.timeLeft = 60;
        sliceGame.fruits = [];
        sliceGame.userSlices = [];
        sliceGame.aiSlices = [];
        sliceGame.lastSpawn = Date.now();
        sliceGame.lastAiMove = Date.now();
        sliceGame.aiTargetX = sliceGame.W * 0.75;
        sliceGame.aiTargetY = sliceGame.H * 0.3;
        sliceGame.aiPrevX = sliceGame.aiTargetX;
        sliceGame.aiPrevY = sliceGame.aiTargetY;

        // 计时器
        sliceGame.timerId = setInterval(function() {
            sliceGame.timeLeft--;
            var timerEl = $('fs-timer');
            if (timerEl) timerEl.textContent = sliceGame.timeLeft + 's';
            if (sliceGame.timeLeft <= 0) {
                endSliceGame();
            }
        }, 1000);

        // 用户切割
        var lastX = 0, lastY = 0, isDown = false;
        function getPos(e) {
            var rect = sliceGame.canvas.getBoundingClientRect();
            var x, y;
            if (e.touches && e.touches[0]) { x = e.touches[0].clientX - rect.left; y = e.touches[0].clientY - rect.top; }
            else { x = e.clientX - rect.left; y = e.clientY - rect.top; }
            return { x: x, y: y };
        }
        function onDown(e) { e.preventDefault(); isDown = true; var p = getPos(e); lastX = p.x; lastY = p.y; }
        function onMove(e) {
            if (!isDown) return;
            e.preventDefault();
            var p = getPos(e);
            sliceGame.userSlices.push({ x1: lastX, y1: lastY, x2: p.x, y2: p.y, life: 12 });
            checkSliceHit(p.x, p.y, 'user');
            lastX = p.x; lastY = p.y;
        }
        function onUp() { isDown = false; }

        sliceGame.canvas.addEventListener('mousedown', onDown);
        sliceGame.canvas.addEventListener('mousemove', onMove);
        sliceGame.canvas.addEventListener('mouseup', onUp);
        sliceGame.canvas.addEventListener('touchstart', onDown, { passive: false });
        sliceGame.canvas.addEventListener('touchmove', onMove, { passive: false });
        sliceGame.canvas.addEventListener('touchend', onUp);

        gameLoop();
    }

    function checkSliceHit(x, y, who) {
        sliceGame.fruits.forEach(function(f) {
            if (f.cut) return;
            var dx = x - f.x, dy = y - f.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < f.r + 18) {
                f.cut = true;
                f.cutBy = who;
                if (who === 'user') {
                    sliceGame.userScore += 10;
                    var el = $('fs-user-score');
                    if (el) el.textContent = sliceGame.userScore;
                } else {
                    sliceGame.aiScore += 10;
                    var el2 = $('fs-ai-score');
                    if (el2) el2.textContent = sliceGame.aiScore;
                }
            }
        });
    }

    function closeSliceGame() {
        var overlay = $('fruit-slice-overlay');
        if (overlay) {
            overlay.style.display = 'none';
            overlay.innerHTML = ''; // 清理游戏内容
        }
        sliceGame.running = false;
        if (sliceGame.timerId) clearInterval(sliceGame.timerId);
        if (sliceGame.animationId) cancelAnimationFrame(sliceGame.animationId);
    }

    function endSliceGame() {
        sliceGame.running = false;
        if (sliceGame.timerId) clearInterval(sliceGame.timerId);

        var result = '';
        if (sliceGame.userScore > sliceGame.aiScore) {
            result = '你赢了！' + sliceGame.userScore + ' : ' + sliceGame.aiScore;
        } else if (sliceGame.userScore < sliceGame.aiScore) {
            result = '对方赢了！' + sliceGame.aiScore + ' : ' + sliceGame.userScore;
        } else {
            result = '平局！' + sliceGame.userScore + ' : ' + sliceGame.aiScore;
        }

        var overlay = $('fruit-slice-overlay');
        if (overlay) {
            var endDiv = document.createElement('div');
            endDiv.className = 'fruit-slice-result';
            endDiv.innerHTML = '<div class="fruit-slice-result-box"><h3>' + result + '</h3><p>我的得分：' + sliceGame.userScore + '</p><p>对方得分：' + sliceGame.aiScore + '</p><button onclick="window.FruitApp.closeSliceGame()">关闭</button></div>';
            overlay.appendChild(endDiv);
        }

        // 发送结果到聊天
        sendSystemMessage('切水果大战结束 — ' + result);

        if (sliceGame.animationId) cancelAnimationFrame(sliceGame.animationId);
    }

    function gameLoop() {
        if (!sliceGame.running) return;
        var ctx = sliceGame.ctx;
        var W = sliceGame.W, H = sliceGame.H;
        if (!ctx) return;

        ctx.clearRect(0, 0, W, H);

        // 背景分区线（AI区/用户区）
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(0, H * 0.45);
        ctx.lineTo(W, H * 0.45);
        ctx.stroke();
        ctx.setLineDash([]);
        // 标注区域
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(255,150,100,0.4)';
        ctx.fillText('对方区域', 8, H * 0.45 - 6);
        ctx.fillStyle = 'rgba(100,200,255,0.4)';
        ctx.fillText('我的区域', 8, H * 0.45 + 14);

        var now = Date.now();

        // 生成水果 — 双方区域各50%概率，确保公平
        if (now - sliceGame.lastSpawn > 700) {
            sliceGame.lastSpawn = now;
            var fruit = FRUITS[Math.floor(Math.random() * FRUITS.length)];
            var startX = W * 0.15 + Math.random() * W * 0.7;

            // 50%概率在对方区域(上半区)，50%在用户区(下半区)
            if (Math.random() < 0.5) {
                // 对方区域生成：从分区线上方抛出，先上后下
                sliceGame.fruits.push({
                    x: startX,
                    y: H * 0.45 - 20,  // 从分区线上方一点开始
                    vx: (startX > W / 2 ? -1 : 1) * (1 + Math.random() * 2),
                    vy: -6 - Math.random() * 2.5,  // 向上弹起，速度与用户区对称
                    r: 22,
                    emoji: fruit,
                    cut: false,
                    rot: Math.random() * 0.5,
                    region: 'ai'
                });
            } else {
                // 用户区域生成：从底部弹出，向上飞
                sliceGame.fruits.push({
                    x: startX,
                    y: H - 40,
                    vx: (startX > W / 2 ? -1 : 1) * (1 + Math.random() * 2),
                    vy: -7 - Math.random() * 3,
                    r: 22,
                    emoji: fruit,
                    cut: false,
                    rot: Math.random() * 0.5,
                    region: 'user'
                });
            }
        }

        // AI移动（每200ms更新目标）— AI只在上半区活动，不与用户重合
        if (now - sliceGame.lastAiMove > 200) {
            sliceGame.lastAiMove = now;
            // 找最近未切的水果（AI优先追AI区的水果，也追上半区的水果）
            var target = null;
            var minDist = Infinity;
            sliceGame.fruits.forEach(function(f) {
                if (f.cut) return;
                // AI追上半区的水果或AI区生成的水果
                if (f.y < H * 0.55 || f.region === 'ai') {
                    // 避免与用户最近切割位置重合
                    var userLastX = sliceGame.userSlices.length > 0 ? sliceGame.userSlices[sliceGame.userSlices.length - 1].x2 : -1;
                    var userLastY = sliceGame.userSlices.length > 0 ? sliceGame.userSlices[sliceGame.userSlices.length - 1].y2 : -1;
                    var distToUser = Math.sqrt((f.x - userLastX) ** 2 + (f.y - userLastY) ** 2);
                    if (distToUser < 80) return; // 跳过离用户太近的水果
                    // AI区水果优先（距离权重减半）
                    var priority = f.region === 'ai' ? 0.5 : 1;
                    var d = (Math.abs(f.x - sliceGame.aiTargetX) + Math.abs(f.y - sliceGame.aiTargetY)) * priority;
                    if (d < minDist) { minDist = d; target = f; }
                }
            });
            if (target) {
                sliceGame.aiTargetX = target.x;
                sliceGame.aiTargetY = target.y;
            } else {
                // 没有目标时在上半区随机移动
                sliceGame.aiTargetX = W * 0.2 + Math.random() * W * 0.6;
                sliceGame.aiTargetY = H * 0.1 + Math.random() * H * 0.35;
            }
        }

        // AI平滑移动
        var aiCursor = $('fs-ai-cursor');
        if (aiCursor) {
            var speed = 0.12;
            sliceGame.aiPrevX += (sliceGame.aiTargetX - sliceGame.aiPrevX) * speed;
            sliceGame.aiPrevY += (sliceGame.aiTargetY - sliceGame.aiPrevY) * speed;
            // 限制AI在上半区，不与用户重合
            if (sliceGame.aiPrevY > H * 0.45) sliceGame.aiPrevY = H * 0.45;
            if (sliceGame.aiPrevY < 5) sliceGame.aiPrevY = 5;

            aiCursor.style.left = (sliceGame.aiPrevX - 12) + 'px';
            aiCursor.style.top = (sliceGame.aiPrevY - 12) + 'px';

            // AI切割检测
            if (Math.random() < 0.3) {
                checkSliceHit(sliceGame.aiPrevX, sliceGame.aiPrevY, 'ai');
            }
            // AI轨迹
            sliceGame.aiSlices.push({
                x1: sliceGame.aiPrevX, y1: sliceGame.aiPrevY,
                x2: sliceGame.aiPrevX + (Math.random() - 0.5) * 30,
                y2: sliceGame.aiPrevY + (Math.random() - 0.5) * 30,
                life: 8
            });
        }

        // 更新和绘制水果
        sliceGame.fruits = sliceGame.fruits.filter(function(f) {
            if (f.cut) {
                f.rot += 0.3; f.vy += 0.3; f.x += f.vx; f.y += f.vy;
                ctx.save();
                ctx.translate(f.x, f.y);
                ctx.rotate(f.rot);
                ctx.font = '20px serif';
                ctx.globalAlpha = 0.4;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(f.emoji, 0, 0);
                ctx.restore();
                ctx.globalAlpha = 1;
            } else {
                // 双方使用相同重力，确保物理一致
                f.vy += 0.22; f.x += f.vx; f.y += f.vy;
                // 限制水平不超出画面
                if (f.x < f.r) { f.x = f.r; f.vx = Math.abs(f.vx); }
                if (f.x > W - f.r) { f.x = W - f.r; f.vx = -Math.abs(f.vx); }
                // 限制不超出顶部边界
                if (f.y < f.r + 10) { f.y = f.r + 10; f.vy = Math.abs(f.vy) * 0.5; }
                // 限制不超出底部
                if (f.y > H + 40) return false;
                ctx.font = '28px serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(f.emoji, f.x, f.y);
            }
            return f.y < H + 60;
        });

        // 用户切割轨迹
        ctx.strokeStyle = 'rgba(100, 200, 255, 0.7)';
        ctx.lineWidth = 3;
        sliceGame.userSlices = sliceGame.userSlices.filter(function(s) {
            s.life--;
            if (s.life <= 0) return false;
            ctx.globalAlpha = s.life / 12;
            ctx.beginPath();
            ctx.moveTo(s.x1, s.y1);
            ctx.lineTo(s.x2, s.y2);
            ctx.stroke();
            return true;
        });
        ctx.globalAlpha = 1;

        // AI切割轨迹
        ctx.strokeStyle = 'rgba(255, 150, 100, 0.6)';
        ctx.lineWidth = 2;
        sliceGame.aiSlices = sliceGame.aiSlices.filter(function(s) {
            s.life--;
            if (s.life <= 0) return false;
            ctx.globalAlpha = s.life / 8;
            ctx.beginPath();
            ctx.moveTo(s.x1, s.y1);
            ctx.lineTo(s.x2, s.y2);
            ctx.stroke();
            return true;
        });
        ctx.globalAlpha = 1;

        sliceGame.animationId = requestAnimationFrame(gameLoop);
    }

    // ========== 对方主动行为（由 core.js 按概率触发） ==========

    // 对方主动扔水果给我
    function partnerThrowFruit() {
        var fruit = FRUITS[Math.floor(Math.random() * FRUITS.length)];
        var action = PARTNER_ACTIONS[Math.floor(Math.random() * PARTNER_ACTIONS.length)];
        sendSystemMessage(action + ' ' + fruit);
        showFruitOnUserChatAvatar(fruit);
        saveData();
    }

    // 对方主动邀请切水果
    function partnerInviteSlice() {
        sendPartnerMessage('一起玩切水果吧！看谁切得多～');
        showSliceInvitePopup();
        saveData();
    }

    // ========== 初始化 ==========
    function init() {
        loadData();
        setTimeout(function() { bindAvatarThrow(); }, 1500);
    }

    window.FruitApp = {
        openThrowPicker: openThrowPicker,
        closeThrowPicker: closeThrowPicker,
        openSliceGame: openSliceGame,
        closeSliceGame: closeSliceGame,
        handleMediaUpload: handleMediaUpload,
        throwAtPartner: throwAtPartner,
        partnerThrowFruit: partnerThrowFruit,
        partnerInviteSlice: partnerInviteSlice,
        getSettings: function() { return settings; }
    };

    window.addEventListener('sessionChanged', function() {
        setTimeout(function() { loadData(); }, 200);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
