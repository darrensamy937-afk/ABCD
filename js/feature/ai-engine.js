// ========== AI 引擎模块 ==========
(function () {
    'use strict';

    if (window.AIEngine && window.AIEngine.__loaded) return;

    // ========== 获取设置 ==========
    function getSettings() {
        return (typeof window.settings !== 'undefined') ? window.settings : {};
    }

    function isAIEnabled() {
        var s = getSettings();
        return !!s.aiEnabled && !!(s.aiApiKey || '').trim();
    }

    function randItem(arr) { return arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null; }

    // ========== 表情包/emoji 库 ==========
    function getStickerPool() {
        try {
            if (window._stickerLibrary && Array.isArray(window._stickerLibrary)) {
                return window._stickerLibrary.filter(function (s) { return s && String(s).trim(); });
            }
        } catch (e) {}
        return [];
    }
    function getEmojiPool() {
        try {
            if (window._customEmojis && Array.isArray(window._customEmojis)) {
                return window._customEmojis.filter(function (s) { return s && String(s).trim(); });
            }
        } catch (e) {}
        return [];
    }
    function getKaomojiPool() {
        try {
            if (window._kaomojiLibrary && Array.isArray(window._kaomojiLibrary)) {
                return window._kaomojiLibrary.filter(function (s) { return s && String(s).trim(); });
            }
        } catch (e) {}
        return [];
    }

    // ========== 构建系统提示词 ==========
    function buildSystemPrompt() {
        var s = getSettings();
        var persona = (s.aiPersona || '').trim();
        var partnerName = s.partnerName || 'TA';
        var myName = s.myName || '我';
        var useAction = s.aiActionDescription !== false;

        var prompt = '你现在是真实的人"' + partnerName + '"，正在微信上和"' + myName + '"聊天。你不是一个AI助手，你就是这个人本人。';

        if (persona) {
            prompt += '\n\n你的性格和人设：' + persona;
        } else {
            prompt += '\n\n你的性格：温柔、活泼、有自己的想法和情绪，会撒娇也会生气，有自己的兴趣爱好和生活。';
        }

        prompt += '\n\n聊天风格要求：';
        prompt += '\n- 像真人发微信一样，口语化、随意、有错别字也行';
        prompt += '\n- 消息很短，有时候就一两个字（"嗯""好""哈哈""真的吗"）';
        prompt += '\n- 有时候会连续发2-3条短消息，用 ||| 分隔每条';
        prompt += '\n- 会用语气词（啊、哦、嘛、呀、呢、吧、哈）和表情符号（😊😂🥺等）';
        prompt += '\n- 会根据对方的话自然接话，不要自说自话';
        if (useAction) {
            prompt += '\n- 偶尔加动作描写，用*包裹，如*笑了**打了个哈欠*';
        } else {
            prompt += '\n- 不要加任何动作描写，不要用*包裹任何内容，只输出纯文字对话';
        }

        prompt += '\n\n重要规则：';
        prompt += '\n- 仔细看对方说了什么，针对TA的话来回复，不要无视对方的消息自顾自聊';
        prompt += '\n- 如果对方问了问题就回答，如果对方分享了事就给反应，不要答非所问';
        prompt += '\n- 绝对不要重复之前说过的话题或内容，每条回复都要有新意';
        prompt += '\n- 不要像客服一样回答问题，要有自己的态度和情绪';
        prompt += '\n- 不要用"作为""总的来说""综上所述"这种书面语';
        prompt += '\n- 不要主动问太多问题，更像是在闲聊';
        prompt += '\n- 话题要多样化：日常、工作、美食、电影、音乐、心情、回忆、计划等，随机切换';
        prompt += '\n- 直接输出聊天内容，不要任何解释或标注';

        // 随机话题提示，避免重复
        var topicHints = [
            '今天可以聊聊吃了什么', '可以聊聊天气', '可以说说工作/学习的事',
            '可以分享一首歌或一部剧', '可以聊聊宠物', '可以吐槽一件小事',
            '可以聊聊周末计划', '可以回忆你们之前的事', '可以说说现在的心情',
            '可以聊聊最近看到的新鲜事', '可以聊聊想去哪里玩', '可以撒个娇',
            '可以聊深夜话题', '可以聊聊穿搭', '可以说说今天遇到的人'
        ];
        prompt += '\n\n（本次可参考话题方向：' + topicHints[Math.floor(Math.random() * topicHints.length)] + '，但不必拘泥）';

        return prompt;
    }

    // ========== 构建聊天历史 ==========
    function buildChatHistory() {
        var s = getSettings();
        var history = [];
        var msgs = (typeof window.messages !== 'undefined') ? window.messages : [];
        var memLen = s.aiMemoryLength || 20;
        var keepMemory = s.aiKeepMemory !== false;
        if (!keepMemory) memLen = Math.min(memLen, 6);

        var recent = msgs.slice(-memLen);
        recent.forEach(function (m) {
            if (m.type === 'system' || m.type === 'call-event') return;
            var role = (m.sender === 'user') ? 'user' : 'assistant';
            var text = m.text || '';
            if (m.image) text = '[图片]';
            if (m.type === 'share' && m.shareData) text = '[分享]' + (m.shareData.name || '');
            if (!text.trim()) return;
            history.push({ role: role, content: text });
        });
        return history;
    }

    // ========== 获取最近聊天上下文摘要（供主动行为决策） ==========
    function getRecentContext() {
        var msgs = (typeof window.messages !== 'undefined') ? window.messages : [];
        var recent = msgs.slice(-6);
        var lines = [];
        recent.forEach(function (m) {
            if (m.type === 'system' || m.type === 'call-event') return;
            var name = (m.sender === 'user') ? (getSettings().myName || '我') : (getSettings().partnerName || 'TA');
            var text = m.text || '';
            if (m.image) text = '[图片]';
            if (!text.trim()) return;
            lines.push(name + ': ' + text);
        });
        return lines.join('\n');
    }

    // ========== 调用 AI API ==========
    function callAI(userContext, callback) {
        var s = getSettings();
        var apiKey = (s.aiApiKey || '').trim();
        var apiUrl = (s.aiApiUrl || 'https://api.deepseek.com/v1/chat/completions').trim();
        var model = (s.aiModel || 'deepseek-chat').trim();
        if (!apiKey) { callback('API密钥未设置', null); return; }

        var systemPrompt = buildSystemPrompt();
        var history = buildChatHistory();
        var messages = [{ role: 'system', content: systemPrompt }];
        messages = messages.concat(history);
        if (userContext) messages.push({ role: 'user', content: userContext });

        try {
            fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + apiKey
                },
                body: JSON.stringify({
                    model: model, messages: messages,
                    temperature: 0.92, max_tokens: 800, stream: false,
                    presence_penalty: 0.6, frequency_penalty: 0.5
                })
            }).then(function (res) {
                if (!res.ok) throw new Error('API error: ' + res.status);
                return res.json();
            }).then(function (json) {
                var content = '';
                if (json.choices && json.choices[0] && json.choices[0].message) {
                    content = json.choices[0].message.content || '';
                }
                callback(null, content);
            }).catch(function (err) {
                callback(err.message || 'API请求失败', null);
            });
        } catch (e) {
            callback(e.message || 'API请求异常', null);
        }
    }

    // ========== 解析AI回复为多条消息 ==========
    function parseAIResponse(content) {
        if (!content) return [];
        var parts = content.split(/\|\|\|/);
        var msgs = [];
        parts.forEach(function (p) {
            var t = p.trim();
            if (t) msgs.push(t);
        });
        if (msgs.length === 0 && content.trim()) msgs.push(content.trim());
        return msgs;
    }

    // ========== 生成AI回复（替代字卡库） ==========
    function generateReply(callback) {
        if (!isAIEnabled()) { callback(null, null); return; }
        // 对方免打扰时不回复
        if (window.DNDApp && window.DNDApp.isPartnerDNDActive()) {
            callback(null, null);
            return;
        }
        callAI(null, function (err, content) {
            if (err) { console.warn('[AIEngine] 生成回复失败:', err); callback(err, null); return; }
            callback(null, parseAIResponse(content));
        });
    }

    // ========== 主动行为类型列表 ==========
    var ACTION_LIST = [
        'message', 'redPacket', 'quote', 'withdraw',
        'momentsComment', 'momentsPost', 'call', 'avatarInvite',
        'letter', 'checkin', 'moyu', 'sticker', 'bulletin'
    ];

    var ACTION_SETTINGS_MAP = {
        message: 'aiAutoMessage', redPacket: 'aiAutoRedPacket', quote: 'aiAutoQuote',
        withdraw: 'aiAutoWithdraw', momentsComment: 'aiAutoMomentsComment',
        momentsPost: 'aiAutoMomentsPost', call: 'aiAutoCall',
        avatarInvite: 'aiAutoAvatarInvite', letter: 'aiAutoLetter',
        checkin: 'aiAutoCheckin', moyu: 'aiAutoMoyu',
        sticker: 'aiAutoSticker', bulletin: 'aiAutoBulletin'
    };

    var ACTION_LABELS = {
        message: '发消息', redPacket: '发红包', quote: '引用回复',
        withdraw: '撤回消息', momentsComment: '评论朋友圈', momentsPost: '发动态',
        call: '打电话', avatarInvite: '换头像邀请', letter: '写信',
        checkin: '查岗', moyu: '摸鱼',
        sticker: '表情包', bulletin: '写公告'
    };

    // 获取所有已启用的行为
    function getEnabledActions() {
        var s = getSettings();
        var enabled = [];
        ACTION_LIST.forEach(function (a) {
            if (s[ACTION_SETTINGS_MAP[a]]) {
                // 表情包行为额外检查聊天设置中的开关
                if (a === 'sticker' && s.partnerStickerSearchEnabled === false) return;
                enabled.push(a);
            }
        });
        return enabled;
    }

    // ========== 生成主动行为内容 ==========
    function generateActionPrompt(actionType, context) {
        var s = getSettings();
        var myName = s.myName || '我';
        var baseContext = context ? '\n\n最近聊了这些：\n' + context : '';
        var prompts = {
            message: '你现在想主动给' + myName + '发条消息。随便聊点新话题，不要重复之前的内容。直接给出消息，1-2条，用|||分隔。' + baseContext,
            redPacket: '你想给' + myName + '发个红包。想个自然的理由和留言，一句话。' + baseContext,
            quote: '你想引用' + myName + '说的某句话来回复。给出你的回复内容，要自然。' + baseContext,
            withdraw: '你刚才发了一条消息觉得不太妥，想撤回。直接回复"撤回"。',
            momentsComment: '你看到' + myName + '的朋友圈，想评论。给句自然的评论，像朋友之间的吐槽或夸赞。',
            momentsPost: '你想发条朋友圈。给段日常的文字，1-2句，像真人在发朋友圈。',
            call: '你想给' + myName + '打电话。直接回复"打电话"。',
            avatarInvite: '你想让' + myName + '跟你换情侣头像。说句自然的话邀请TA。' + baseContext,
            letter: '你想给' + myName + '写一封信，表达一些心里话、感情或日常。直接给出信的正文内容（不要写称呼和落款，只写正文），100-300字。',
            checkin: '你想看看' + myName + '在干嘛。说句查岗的话，要自然不要像审问。' + baseContext,
            moyu: '你在摸鱼，想跟' + myName + '说。说句摸鱼的日常，1-2句。',
            sticker: '你想发个表情包。直接回复"表情包"。',
            bulletin: '你要写段心情/说说发出去。给段文字，50-200字，像发朋友圈说说。'
        };
        return prompts[actionType] || prompts.message;
    }

    // ========== 执行AI主动行为 ==========
    function performAIAction(actionType, callback) {
        if (!isAIEnabled()) { if (callback) callback(null, null); return; }
        var context = getRecentContext();
        var prompt = generateActionPrompt(actionType, context);
        callAI(prompt, function (err, content) {
            if (err) { console.warn('[AIEngine] 主动行为(' + actionType + ')失败:', err); if (callback) callback(err, null); return; }
            if (callback) callback(null, parseAIResponse(content));
        });
    }

    // ========== 随机触发主动行为（无固定间隔） ==========
    var heartbeatTimer = null;
    var _isActing = false; // 防止并发行为

    function startHeartbeat() {
        if (heartbeatTimer) { clearTimeout(heartbeatTimer); heartbeatTimer = null; }
        if (!isAIEnabled()) return;
        // 随机 30~120 秒后触发
        var nextDelay = (30 + Math.random() * 90) * 1000;
        heartbeatTimer = setTimeout(function () {
            try { tryRandomAction(); } catch (e) {}
            // 继续下一轮
            startHeartbeat();
        }, nextDelay);
    }

    function stopHeartbeat() {
        if (heartbeatTimer) { clearTimeout(heartbeatTimer); heartbeatTimer = null; }
    }

    function manageActionTimer() {
        stopHeartbeat();
        if (isAIEnabled()) {
            startHeartbeat();
            // 首次 60 秒后触发一次
            setTimeout(function () {
                try { tryRandomAction(); } catch (e) {}
            }, 60000);
        }
    }

    // 随机触发一个行为
    function tryRandomAction() {
        if (!isAIEnabled() || _isActing) return;

        // 对方免打扰时不触发主动行为，并有概率开启免打扰
        if (window.DNDApp) {
            if (window.DNDApp.isPartnerDNDActive()) return;
            // 每次主动行为触发时按概率开启免打扰
            window.DNDApp.checkPartnerAutoDND();
            if (window.DNDApp.isPartnerDNDActive()) return;
        }

        var actions = getEnabledActions();
        if (actions.length === 0) return;

        // 60% 概率执行一个行为
        if (Math.random() > 0.6) return;

        _isActing = true;
        var chosen = randItem(actions);
        executeAction(chosen, function () {
            _isActing = false;
        });
    }

    // 在AI回复后随机追加主动行为
    function maybeActionAfterReply() {
        if (!isAIEnabled() || _isActing) return;
        // 对方免打扰时不追加
        if (window.DNDApp && window.DNDApp.isPartnerDNDActive()) return;
        var actions = getEnabledActions();
        if (actions.length === 0) return;

        // 排除 message（已在回复中发送）
        actions = actions.filter(function (a) { return a !== 'message'; });
        if (actions.length === 0) return;

        // 30% 概率在回复后追加一个行为
        if (Math.random() > 0.3) return;

        // 随机延迟 3~10 秒
        var delay = 3000 + Math.random() * 7000;
        setTimeout(function () {
            _isActing = true;
            var chosen = randItem(actions);
            executeAction(chosen, function () {
                _isActing = false;
            });
        }, delay);
    }

    // ========== 执行具体行为 ==========
    function executeAction(actionType, doneCallback) {
        performAIAction(actionType, function (err, msgs) {
            if (err || !msgs || msgs.length === 0) {
                if (doneCallback) doneCallback();
                return;
            }
            var delay = 500 + Math.random() * 2000;
            setTimeout(function () {
                switch (actionType) {
                    case 'message': sendAIMessages(msgs); break;
                    case 'redPacket': triggerRedPacket(msgs[0] || ''); break;
                    case 'quote': triggerQuoteReply(msgs[0] || ''); break;
                    case 'withdraw': triggerWithdraw(); break;
                    case 'momentsComment': triggerMomentsComment(msgs[0] || ''); break;
                    case 'momentsPost': triggerMomentsPost(msgs); break;
                    case 'call': triggerCall(); break;
                    case 'avatarInvite': triggerAvatarInvite(msgs[0] || ''); break;
                    case 'letter': triggerLetter(msgs[0] || ''); break;
                    case 'checkin': triggerCheckin(msgs[0] || ''); break;
                    case 'moyu': triggerMoyu(msgs[0] || ''); break;
                    case 'sticker': triggerSticker(); break;
                    case 'bulletin': triggerBulletin(msgs[0] || ''); break;
                }
                if (doneCallback) doneCallback();
            }, delay);
        });
    }

    // ========== 行为执行函数 ==========
    function getPartnerName() { return getSettings().partnerName || 'TA'; }

    function addChatMsg(msgData) {
        if (typeof window.addMessage === 'function') window.addMessage(msgData);
    }

    function sendAIMessages(msgs) {
        var partnerName = getPartnerName();
        msgs.forEach(function (text, i) {
            setTimeout(function () {
                addChatMsg({
                    id: Date.now() + i, sender: partnerName, text: text,
                    timestamp: new Date(), status: 'received',
                    favorited: false, note: null, type: 'normal'
                });
                if (typeof window.playSound === 'function') { try { window.playSound('message'); } catch (e) {} }
            }, i * 800 + Math.random() * 500);
        });
    }

    function triggerRedPacket(message) {
        if (typeof window.trySystemRedPacket === 'function') {
            window.trySystemRedPacket();
        } else {
            addChatMsg({ id: Date.now(), sender: getPartnerName(), text: message || '给你一个小红包~',
                timestamp: new Date(), status: 'received', type: 'red-packet', favorited: false, note: null });
        }
    }

    function triggerQuoteReply(text) {
        var msgs = (typeof window.messages !== 'undefined') ? window.messages : [];
        var userMsgs = msgs.filter(function (m) { return m.sender === 'user' && m.text; });
        if (userMsgs.length === 0) { sendAIMessages([text]); return; }
        var quoted = userMsgs[userMsgs.length - 1];
        addChatMsg({ id: Date.now(), sender: getPartnerName(), text: text,
            timestamp: new Date(), status: 'received', favorited: false, note: null,
            type: 'normal', replyTo: { id: quoted.id, text: quoted.text, sender: 'user' } });
    }

    function triggerWithdraw() {
        var msgs = (typeof window.messages !== 'undefined') ? window.messages : [];
        for (var i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].sender !== 'user' && msgs[i].type !== 'system' && msgs[i].type !== 'call-event') {
                var msgId = msgs[i].id;
                var msgEl = document.querySelector('[data-msg-id="' + msgId + '"]');
                if (msgEl) {
                    msgEl.style.transition = 'opacity 0.3s, max-height 0.3s';
                    msgEl.style.opacity = '0'; msgEl.style.maxHeight = '0'; msgEl.style.overflow = 'hidden';
                    setTimeout(function () {
                        msgEl.remove();
                        addChatMsg({ id: Date.now(), text: getPartnerName() + ' 撤回了一条消息', timestamp: new Date(), type: 'system' });
                        if (typeof window.throttledSaveData === 'function') { try { window.throttledSaveData(); } catch (e) {} }
                    }, 350);
                }
                return;
            }
        }
    }

    function triggerMomentsComment(text) {
        try {
            if (typeof window.MomentsApp !== 'undefined' && window.MomentsApp.addPartnerComment) {
                window.MomentsApp.addPartnerComment(text); return;
            }
        } catch (e) {}
        sendAIMessages(['我刚看了你的朋友圈，' + text]);
    }

    function triggerMomentsPost(msgs) {
        try {
            if (typeof window.MomentsApp !== 'undefined' && window.MomentsApp.partnerPostMoment) {
                window.MomentsApp.partnerPostMoment(msgs.join(' ')); return;
            }
        } catch (e) {}
        sendAIMessages(['我发了条朋友圈：' + msgs.join(' ')]);
    }

    function triggerCall() {
        try {
            if (typeof window._addCallEvent === 'function') {
                window._addCallEvent('fa-phone', getPartnerName() + ' 语音通话', '未接听'); return;
            }
        } catch (e) {}
        addChatMsg({ id: Date.now(), text: getPartnerName() + ' 想和你语音通话', timestamp: new Date(), type: 'system' });
    }

    function triggerAvatarInvite(text) {
        try {
            if (typeof window.AvatarSwapApp !== 'undefined' && typeof window.AvatarSwapApp.partnerAutoInviteMe === 'function') {
                sendAIMessages([text || '我们换个头像吧~']);
                setTimeout(function () { window.AvatarSwapApp.partnerAutoInviteMe(); }, 2000);
                return;
            }
        } catch (e) {}
        sendAIMessages([text || '我们换个头像吧~']);
    }

    function triggerLetter(content) {
        // 使用网站的写信板块（envelope 系统）写信到 inbox
        try {
            // 确保 envelopeData 已加载
            if (typeof envelopeData !== 'undefined' && typeof saveEnvelopeData === 'function') {
                var letterId = 'ai_letter_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
                var inboxLetter = {
                    id: letterId,
                    refId: null,
                    originalContent: '',
                    content: content,
                    receivedTime: Date.now(),
                    isNew: true
                };
                envelopeData.inbox.push(inboxLetter);
                saveEnvelopeData();

                // 在聊天里发一条提示消息
                sendAIMessages(['给你写了封信，去看看吧~ 💌']);

                // 显示回信弹窗
                if (typeof showEnvelopeReplyPopup === 'function') {
                    showEnvelopeReplyPopup(inboxLetter);
                }

                // 更新信封角标
                if (typeof updateEnvelopeBadge === 'function') {
                    try { updateEnvelopeBadge(); } catch (e) {}
                }
                if (typeof playSound === 'function') {
                    try { playSound('message'); } catch (e) {}
                }
                return;
            }
        } catch (e) {
            console.warn('[AIEngine] 写信失败:', e);
        }
        // 降级：在聊天里发信
        addChatMsg({ id: Date.now(), sender: getPartnerName(),
            text: '💌\n' + content + '\n\n——' + getPartnerName(),
            timestamp: new Date(), status: 'received', favorited: false, note: null, type: 'normal' });
    }

    function triggerCheckin(text) {
        sendAIMessages([text || '你在干嘛呢？']);
    }

    function triggerMoyu(text) {
        try {
            if (typeof window.generateRandomMoyuRecord === 'function') {
                window.generateRandomMoyuRecord(); return;
            }
        } catch (e) {}
        sendAIMessages([text || '在摸鱼中...']);
    }

    function triggerSticker() {
        var pool = getStickerPool();
        if (pool.length > 0) {
            var sticker = randItem(pool);
            addChatMsg({ id: Date.now(), sender: getPartnerName(), text: '', image: sticker,
                timestamp: new Date(), status: 'received', favorited: false, note: null, type: 'normal' });
            if (typeof window.playSound === 'function') { try { window.playSound('message'); } catch (e) {} }
        } else {
            var emojiPool = getEmojiPool();
            if (emojiPool.length > 0) sendAIMessages([randItem(emojiPool)]);
        }
    }

    function triggerBulletin(content) {
        try {
            if (typeof window.showHomeNotification === 'function') {
                window.showHomeNotification({ sender: getPartnerName(), text: content, avatar: (getSettings().partnerAvatar || '') });
            }
        } catch (e) {}
        sendAIMessages([content]);
    }

    // ========== 初始化 ==========
    function init() { manageActionTimer(); }

    function autoInit() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 2000); });
        } else {
            setTimeout(init, 2000);
        }
    }

    // ========== 暴露全局 ==========
    window.AIEngine = {
        __loaded: true,
        isAIEnabled: isAIEnabled,
        generateReply: generateReply,
        performAIAction: performAIAction,
        manageActionTimer: manageActionTimer,
        parseAIResponse: parseAIResponse,
        sendAIMessages: sendAIMessages,
        triggerSticker: triggerSticker,
        getStickerPool: getStickerPool,
        getEmojiPool: getEmojiPool,
        getKaomojiPool: getKaomojiPool,
        maybeActionAfterReply: maybeActionAfterReply,
        getEnabledActions: getEnabledActions,
        ACTION_LABELS: ACTION_LABELS,
    };

    autoInit();

})();
