/**
 * 好友联机功能模块 v1
 * - 账号注册/登录系统（localStorage 模拟服务端）
 * - 好友搜索和添加
 * - 使用 BroadcastChannel 实现同浏览器多标签实时通信
 * - 好友会话管理（与现有会话系统集成）
 * - 好友视角左右翻转
 */
(function() {
    'use strict';

    var ACCOUNT_KEY = 'fc_accounts_v1';       // 所有注册账号
    var MY_ACCOUNT_KEY = 'fc_my_account_v1'; // 当前登录账号
    var FRIENDS_KEY = 'fc_friends_v1';       // 好友列表
    var FRIEND_MSG_PREFIX = 'fc_msg_';       // 好友消息存储前缀
    var CHANNEL_NAME = 'friend_connect_channel_v1';

    var bc = null; // BroadcastChannel 实例
    var myAccount = null;    // { id, username, nickname, avatar, password }
    var friends = [];        // [{ id, username, nickname, avatar, sessionId, status }]
    var messageHandlers = {}; // sessionId -> handler

    // ========== 工具函数 ==========

    function $(id) { return document.getElementById(id); }

    function escapeHtml(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    function genId() {
        return 'fc_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
    }

    // 生成6位数字用户ID，确保唯一
    function genUserId() {
        var accounts = getAllAccounts();
        var uid;
        do {
            uid = String(100000 + Math.floor(Math.random() * 900000));
        } while (accounts[uid] || (accounts._uidIndex && accounts._uidIndex[uid]));
        return uid;
    }

    // 通过 UID 查找账号
    function findAccountByUid(uid) {
        var accounts = getAllAccounts();
        // 先直接查找
        if (accounts[uid] && accounts[uid].uid === uid) return accounts[uid];
        // 通过索引查找
        if (accounts._uidIndex && accounts._uidIndex[uid]) {
            var username = accounts._uidIndex[uid];
            return accounts[username] || null;
        }
        // 遍历查找
        for (var key in accounts) {
            if (key === '_uidIndex') continue;
            if (accounts.hasOwnProperty(key) && accounts[key].uid === uid) {
                return accounts[key];
            }
        }
        return null;
    }

    function genSessionId() {
        return 'fc_s_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 8);
    }

    function hashPassword(pwd) {
        var hash = 0;
        for (var i = 0; i < pwd.length; i++) {
            var ch = pwd.charCodeAt(i);
            hash = ((hash << 5) - hash) + ch;
            hash = hash & hash;
        }
        return 'h_' + Math.abs(hash).toString(36);
    }

    function showNotification(msg, type) {
        type = type || 'info';
        if (typeof window.showNotification === 'function') {
            window.showNotification(msg, type, 3000);
        }
    }

    function fallbackCopy(text) {
        try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showNotification('ID号已复制：' + text, 'success');
        } catch(e) {
            showNotification('请手动复制：' + text, 'info');
        }
    }

    // ========== 数据读写 ==========

    function getAllAccounts() {
        try {
            var raw = localStorage.getItem(ACCOUNT_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch(e) { return {}; }
    }

    function saveAllAccounts(accounts) {
        try { localStorage.setItem(ACCOUNT_KEY, JSON.stringify(accounts)); } catch(e) {}
    }

    function loadMyAccount() {
        try {
            var raw = localStorage.getItem(MY_ACCOUNT_KEY);
            if (raw) {
                myAccount = JSON.parse(raw);
                return true;
            }
        } catch(e) {}
        myAccount = null;
        return false;
    }

    function saveMyAccount() {
        try {
            if (myAccount) {
                localStorage.setItem(MY_ACCOUNT_KEY, JSON.stringify(myAccount));
            } else {
                localStorage.removeItem(MY_ACCOUNT_KEY);
            }
        } catch(e) {}
    }

    function loadFriends() {
        try {
            var raw = localStorage.getItem(FRIENDS_KEY);
            friends = raw ? JSON.parse(raw) : [];
        } catch(e) { friends = []; }
    }

    function saveFriends() {
        try { localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends)); } catch(e) {}
    }

    function getFriendMessages(sessionId) {
        try {
            var raw = localStorage.getItem(FRIEND_MSG_PREFIX + sessionId);
            return raw ? JSON.parse(raw) : [];
        } catch(e) { return []; }
    }

    function saveFriendMessages(sessionId, msgs) {
        try { localStorage.setItem(FRIEND_MSG_PREFIX + sessionId, JSON.stringify(msgs)); } catch(e) {}
    }

    function getAppPrefix() {
        try {
            if (typeof window.APP_PREFIX !== 'undefined') return window.APP_PREFIX;
        } catch(e) {}
        return 'chatApp_';
    }

    // ========== BroadcastChannel 实时通信 ==========

    function initChannel() {
        if (bc) return;
        try {
            bc = new BroadcastChannel(CHANNEL_NAME);
            bc.onmessage = function(ev) {
                var data = ev.data;
                if (!data || !data.type) return;

                switch(data.type) {
                    case 'fc_message':
                        handleIncomingMessage(data);
                        break;
                    case 'fc_friend_request':
                        handleIncomingFriendRequest(data);
                        break;
                    case 'fc_friend_response':
                        handleIncomingFriendResponse(data);
                        break;
                    case 'fc_typing':
                        handleIncomingTyping(data);
                        break;
                    case 'fc_presence':
                        handleIncomingPresence(data);
                        break;
                    case 'fc_read':
                        handleIncomingRead(data);
                        break;
                    case 'fc_moment_like':
                        handleIncomingMomentLike(data);
                        break;
                    case 'fc_moment_comment':
                        handleIncomingMomentComment(data);
                        break;
                    case 'fc_moment_publish':
                        handleIncomingMomentPublish(data);
                        break;
                }
            };
        } catch(e) {
            console.warn('[FriendConnect] BroadcastChannel 不可用，实时通信功能受限');
        }
    }

    function broadcast(data) {
        if (!bc) initChannel();
        if (bc) {
            try { bc.postMessage(data); } catch(e) {}
        }
    }

    // ========== 消息处理 ==========

    function handleIncomingMessage(data) {
        var sessionId = data.sessionId;
        var msg = data.message;
        if (!sessionId || !msg) return;

        // 检查是否是给我的
        if (msg.to !== (myAccount ? myAccount.id : null)) return;

        // 去重：检查是否已存在相同 id 的消息
        var existingMsgs = getFriendMessages(sessionId);
        var isDuplicate = existingMsgs.some(function(m) { return m.id === msg.id; });
        if (isDuplicate) return;

        // 存储消息到 localStorage（跨标签同步用）
        existingMsgs.push(msg);
        saveFriendMessages(sessionId, existingMsgs);

        var appMsg = {
            id: msg.id || Date.now(),
            sender: 'partner',
            text: msg.text,
            image: msg.image || null,
            timestamp: new Date(msg.timestamp),
            status: 'received',
            type: msg.image ? 'image' : 'normal',
            favorited: false,
            note: null
        };

        // 如果当前正在这个会话的聊天界面，实时显示
        if (window.SESSION_ID === sessionId) {
            // 调用原始 addMessage 渲染消息（它内部会调用 throttledSaveData 存到 localforage）
            var origAdd = window.addMessage._fcOriginal || (window.addMessage._fcHooked ? null : window.addMessage);
            if (origAdd) {
                origAdd(appMsg);
            } else if (typeof window.addMessage === 'function') {
                window.addMessage(appMsg);
            }
            // 发送已读回执（用户正在查看该会话）
            var friend0 = friends.find(function(f) { return f.sessionId === sessionId; });
            if (friend0) {
                broadcast({
                    type: 'fc_read',
                    to: friend0.id,
                    from: myAccount.id,
                    sessionId: sessionId
                });
            }
        } else {
            // 不在当前会话，需要手动存储到 localforage（让 loadData 能加载）
            if (typeof localforage !== 'undefined') {
                try {
                    localforage.getItem(getAppPrefix() + sessionId + '_chatMessages').then(function(stored) {
                        var arr = Array.isArray(stored) ? stored : [];
                        // 再次去重
                        if (!arr.some(function(m) { return m.id === appMsg.id; })) {
                            arr.push(appMsg);
                            localforage.setItem(getAppPrefix() + sessionId + '_chatMessages', arr);
                        }
                    });
                } catch(e) {}
            }

            // 显示通知
            var friend = friends.find(function(f) { return f.sessionId === sessionId; });
            if (friend) {
                showNotification(friend.nickname + '：' + (msg.text || '[图片]'), 'info');
                updateFriendUnread(sessionId, 1);
                renderFriendsList();
            }
        }

        // 派发事件
        window.dispatchEvent(new CustomEvent('fc:message', { detail: { sessionId: sessionId, message: msg } }));
    }

    function handleIncomingFriendRequest(data) {
        if (!myAccount) return;
        if (data.to !== myAccount.id) return;

        var fromAccount = data.fromAccount;
        if (!fromAccount) return;

        // 检查是否已经是好友
        var existing = friends.find(function(f) { return f.id === fromAccount.id; });
        if (existing) {
            broadcast({
                type: 'fc_friend_response',
                to: fromAccount.id,
                from: myAccount.id,
                accepted: false,
                reason: 'already_friends',
                sessionId: existing.sessionId
            });
            return;
        }

        // 显示好友请求弹窗
        showFriendRequestModal(fromAccount);
    }

    function handleIncomingFriendResponse(data) {
        if (!myAccount) return;
        if (data.to !== myAccount.id) return;

        if (data.accepted) {
            // 对方接受了好友请求
            var sessionId = data.sessionId || genSessionId();

            // 创建本地好友记录
            var friend = friends.find(function(f) { return f.id === data.from; });
            if (!friend) {
                friend = {
                    id: data.from,
                    uid: data.fromUid || '',
                    username: data.fromUsername || '好友',
                    nickname: data.fromNickname || data.fromUsername || '好友',
                    avatar: data.fromAvatar || '',
                    sessionId: sessionId,
                    status: 'online',
                    unread: 0
                };
                friends.push(friend);
            } else {
                friend.sessionId = sessionId;
                if (data.fromUid) friend.uid = data.fromUid;
            }
            saveFriends();

            // 创建会话
            createFriendSession(friend);

            showNotification(data.fromNickname + ' 接受了你的好友请求', 'success');
            renderFriendsList();
        } else {
            if (data.reason === 'already_friends') {
                showNotification('你们已经是好友了', 'info');
            } else {
                showNotification(data.fromNickname + ' 拒绝了你的好友请求', 'info');
            }
        }
    }

    var _fcTypingTimer = null;

    function handleIncomingTyping(data) {
        if (!myAccount || data.to !== myAccount.id) return;
        if (window.SESSION_ID !== data.sessionId) return;

        if (data.typing) {
            if (typeof window._showTypingIndicatorWithText === 'function') {
                window._showTypingIndicatorWithText((data.fromName || '好友') + ' 正在输入');
            }
            // 自动隐藏定时器（防止对方关闭页面后一直显示）
            if (_fcTypingTimer) clearTimeout(_fcTypingTimer);
            _fcTypingTimer = setTimeout(function() {
                if (typeof window._hideTypingIndicatorGlobal === 'function') {
                    window._hideTypingIndicatorGlobal();
                }
            }, 5000);
        } else {
            if (_fcTypingTimer) { clearTimeout(_fcTypingTimer); _fcTypingTimer = null; }
            if (typeof window._hideTypingIndicatorGlobal === 'function') {
                window._hideTypingIndicatorGlobal();
            }
        }
    }

    function handleIncomingPresence(data) {
        if (!myAccount || data.to !== myAccount.id) return;
        var friend = friends.find(function(f) { return f.id === data.from; });
        if (friend) {
            friend.status = data.status;
            // 更新好友的实时头像和昵称信息
            if (data.nickname) friend.nickname = data.nickname;
            if (data.avatar !== undefined) friend.avatar = data.avatar;
            if (data.uid) friend.uid = data.uid;
            saveFriends();
            renderFriendsList();

            // 如果正在查看该好友的会话，更新头像和昵称
            if (window.SESSION_ID === friend.sessionId) {
                // 更新 partner status 显示
                var statusEl = document.getElementById('partner-status');
                if (statusEl) {
                    statusEl.innerHTML = '<span>' + (data.status === 'online' ? '在线' : '离线') + '</span>';
                }
                // 更新 partner 头像和昵称
                if (typeof localforage !== 'undefined') {
                    var settingsKey = getAppPrefix() + friend.sessionId + '_chatSettings';
                    localforage.getItem(settingsKey).then(function(stored) {
                        var settings = stored || {};
                        settings.partnerName = friend.nickname;
                        if (friend.avatar) settings.partnerAvatar = friend.avatar;
                        localforage.setItem(settingsKey, settings);
                        if (friend.avatar) {
                            localforage.setItem(getAppPrefix() + friend.sessionId + '_partnerAvatar', friend.avatar);
                        }
                        // 刷新 UI
                        if (typeof window.loadData === 'function') {
                            window.loadData();
                        }
                        if (typeof window.updateUI === 'function') {
                            window.updateUI();
                        }
                    }).catch(function(e) {});
                }
            }
        }
    }

    function handleIncomingRead(data) {
        if (!myAccount || data.to !== myAccount.id) return;
        // 更新消息已读状态
        var msgs = getFriendMessages(data.sessionId);
        msgs.forEach(function(m) {
            if (m.from === myAccount.id) m.read = true;
        });
        saveFriendMessages(data.sessionId, msgs);

        // 更新 localforage 中的消息状态
        if (typeof localforage !== 'undefined') {
            try {
                localforage.getItem(getAppPrefix() + data.sessionId + '_chatMessages').then(function(stored) {
                    if (!Array.isArray(stored)) return;
                    var changed = false;
                    stored.forEach(function(m) {
                        if (m.sender === 'user' && m.status !== 'read') {
                            m.status = 'read';
                            changed = true;
                        }
                    });
                    if (changed) {
                        localforage.setItem(getAppPrefix() + data.sessionId + '_chatMessages', stored);
                    }
                });
            } catch(e) {}
        }

        if (window.SESSION_ID === data.sessionId) {
            // 更新 DOM 中的消息状态
            var container = document.getElementById('chat-container');
            if (container) {
                var statusEls = container.querySelectorAll('.message-status');
                statusEls.forEach(function(el) {
                    if (el.textContent === '已发送' || el.textContent === '已送达') {
                        el.textContent = '已读';
                        el.classList.remove('unread');
                        el.classList.add('read');
                    }
                });
            }
        }
    }

    // ========== 朋友圈互动 ==========

    function handleIncomingMomentLike(data) {
        if (!myAccount || data.to !== myAccount.id) return;
        // 好友点赞了我的朋友圈动态
        var momentId = data.momentId;
        var likerName = data.likerName || '好友';
        var liked = data.liked;

        // 更新 MomentsApp 中的数据
        if (typeof window.MomentsApp !== 'undefined' && typeof window.MomentsApp._getMomentsData === 'function') {
            var momentsData = window.MomentsApp._getMomentsData();
            var m = momentsData.find(function(x) { return x.id === momentId; });
            if (m) {
                if (!Array.isArray(m.likes)) m.likes = [];
                var idx = m.likes.indexOf(likerName);
                if (liked && idx < 0) {
                    m.likes.push(likerName);
                    showNotification(likerName + ' 赞了你的朋友圈动态', 'info');
                } else if (!liked && idx >= 0) {
                    m.likes.splice(idx, 1);
                }
                if (typeof window.MomentsApp._saveMomentsToStorage === 'function') {
                    window.MomentsApp._saveMomentsToStorage();
                }
                if (typeof window.MomentsApp._renderMoments === 'function') {
                    window.MomentsApp._renderMoments();
                }
            }
        }
    }

    function handleIncomingMomentComment(data) {
        if (!myAccount || data.to !== myAccount.id) return;
        // 好友评论了我的朋友圈动态
        var momentId = data.momentId;
        var comment = data.comment;
        if (!comment || !comment.name || !comment.text) return;

        if (typeof window.MomentsApp !== 'undefined' && typeof window.MomentsApp._getMomentsData === 'function') {
            var momentsData = window.MomentsApp._getMomentsData();
            var m = momentsData.find(function(x) { return x.id === momentId; });
            if (m) {
                if (!Array.isArray(m.comments)) m.comments = [];
                // 检查是否已存在（防重复）
                var exists = m.comments.some(function(c) {
                    return c.name === comment.name && c.text === comment.text && c.time === comment.time;
                });
                if (!exists) {
                    m.comments.push(comment);
                    showNotification(comment.name + ' 评论了你的朋友圈动态', 'info');
                    if (typeof window.MomentsApp._saveMomentsToStorage === 'function') {
                        window.MomentsApp._saveMomentsToStorage();
                    }
                    if (typeof window.MomentsApp._renderMoments === 'function') {
                        window.MomentsApp._renderMoments();
                    }
                }
            }
        }
    }

    // 发送朋友圈点赞给好友
    function sendMomentLike(friendId, momentId, liked, likerName) {
        if (!myAccount) return;
        broadcast({
            type: 'fc_moment_like',
            to: friendId,
            from: myAccount.id,
            momentId: momentId,
            liked: liked,
            likerName: likerName || myAccount.nickname
        });
    }

    // 发送朋友圈评论给好友
    function sendMomentComment(friendId, momentId, comment) {
        if (!myAccount) return;
        broadcast({
            type: 'fc_moment_comment',
            to: friendId,
            from: myAccount.id,
            momentId: momentId,
            comment: comment
        });
    }

    // 发布朋友圈动态时通知好友
    function sendMomentPublish(momentData) {
        if (!myAccount) return;
        // 构造精简的动态数据（避免传输大图片）
        var lite = {
            id: momentData.id,
            text: momentData.text || '',
            author: 'friend',
            authorInfo: {
                id: myAccount.id,
                uid: myAccount.uid || '',
                nickname: myAccount.nickname,
                avatar: myAccount.avatar || ''
            },
            images: [], // 不传图，好友自己看文字
            time: Date.now(),
            location: momentData.location || '',
            likes: [],
            comments: [],
            likedByMe: false,
            isFromFriend: true
        };
        friends.forEach(function(friend) {
            broadcast({
                type: 'fc_moment_publish',
                to: friend.id,
                from: myAccount.id,
                moment: lite
            });
        });
    }

    // 收到好友发布的动态
    function handleIncomingMomentPublish(data) {
        if (!myAccount || data.to !== myAccount.id) return;
        var moment = data.moment;
        if (!moment || !moment.id) return;

        if (typeof window.MomentsApp !== 'undefined' && typeof window.MomentsApp._getMomentsData === 'function') {
            var momentsData = window.MomentsApp._getMomentsData();
            // 检查是否已存在
            var existing = momentsData.find(function(x) { return x.id === moment.id; });
            if (existing) return;

            // 设置头像和昵称
            var authorInfo = moment.authorInfo || {};
            moment.avatar = authorInfo.avatar || '';
            moment.nickname = authorInfo.nickname || '好友';
            moment.identity = '好友';
            moment.images = [];
            moment.likes = moment.likes || [];
            moment.comments = moment.comments || [];
            moment.mentions = [];

            // 插入到数据开头
            momentsData.unshift(moment);

            if (typeof window.MomentsApp._saveMomentsToStorage === 'function') {
                window.MomentsApp._saveMomentsToStorage();
            }
            if (typeof window.MomentsApp._renderMoments === 'function') {
                window.MomentsApp._renderMoments();
            }

            showNotification((authorInfo.nickname || '好友') + ' 发布了新朋友圈动态', 'info');
        }
    }

    // ========== 未读计数 ==========

    function updateFriendUnread(sessionId, count) {
        var friend = friends.find(function(f) { return f.sessionId === sessionId; });
        if (friend) {
            friend.unread = (friend.unread || 0) + count;
            saveFriends();
        }
    }

    function clearFriendUnread(sessionId) {
        var friend = friends.find(function(f) { return f.sessionId === sessionId; });
        if (friend) {
            friend.unread = 0;
            saveFriends();
            renderFriendsList();
        }
    }

    // ========== 发送消息 ==========

    function sendMessage(sessionId, text, image) {
        if (!myAccount) return;
        var friend = friends.find(function(f) { return f.sessionId === sessionId; });
        if (!friend) return;

        var msg = {
            id: genId(),
            from: myAccount.id,
            to: friend.id,
            text: text || '',
            image: image || null,
            timestamp: Date.now(),
            read: false
        };

        // 存储到本地（localStorage 跨标签同步）
        var msgs = getFriendMessages(sessionId);
        msgs.push(msg);
        saveFriendMessages(sessionId, msgs);

        // 通过 BroadcastChannel 发送
        broadcast({
            type: 'fc_message',
            sessionId: sessionId,
            message: msg
        });
    }

    function sendTyping(sessionId, isTyping) {
        if (!myAccount) return;
        var friend = friends.find(function(f) { return f.sessionId === sessionId; });
        if (!friend) return;

        broadcast({
            type: 'fc_typing',
            to: friend.id,
            from: myAccount.id,
            fromName: myAccount.nickname,
            sessionId: sessionId,
            typing: isTyping
        });
    }

    function sendPresence(status) {
        if (!myAccount) return;
        friends.forEach(function(friend) {
            broadcast({
                type: 'fc_presence',
                to: friend.id,
                from: myAccount.id,
                fromUid: myAccount.uid || '',
                nickname: myAccount.nickname,
                avatar: myAccount.avatar || '',
                status: status
            });
        });
    }

    // 同步注册信息到所有好友会话和当前会话
    function syncAccountToSessions() {
        if (!myAccount || typeof localforage === 'undefined') return;

        // 更新所有好友会话中的"我"的头像和昵称
        friends.forEach(function(friend) {
            var settingsKey = getAppPrefix() + friend.sessionId + '_chatSettings';
            localforage.getItem(settingsKey).then(function(stored) {
                var settings = stored || {};
                settings.myName = myAccount.nickname;
                settings.myAvatar = myAccount.avatar || '';
                settings.partnerName = friend.nickname;
                settings.partnerAvatar = friend.avatar || '';
                settings.isFriendSession = true;
                settings.friendId = friend.id;
                localforage.setItem(settingsKey, settings);

                // 更新"我"的头像
                if (myAccount.avatar) {
                    localforage.setItem(getAppPrefix() + friend.sessionId + '_myAvatar', myAccount.avatar);
                }
                // 更新好友头像
                if (friend.avatar) {
                    localforage.setItem(getAppPrefix() + friend.sessionId + '_partnerAvatar', friend.avatar);
                }
            }).catch(function(e) {});
        });

        // 更新当前会话的头像
        if (window.SESSION_ID) {
            var curSettingsKey = getAppPrefix() + window.SESSION_ID + '_chatSettings';
            localforage.getItem(curSettingsKey).then(function(stored) {
                var settings = stored || {};
                var friend = friends.find(function(f) { return f.sessionId === window.SESSION_ID; });
                if (friend) {
                    settings.myName = myAccount.nickname;
                    settings.myAvatar = myAccount.avatar || '';
                    settings.partnerName = friend.nickname;
                    settings.partnerAvatar = friend.avatar || '';
                    settings.isFriendSession = true;
                    localforage.setItem(curSettingsKey, settings);
                    if (myAccount.avatar) {
                        localforage.setItem(getAppPrefix() + window.SESSION_ID + '_myAvatar', myAccount.avatar);
                    }
                    if (friend.avatar) {
                        localforage.setItem(getAppPrefix() + window.SESSION_ID + '_partnerAvatar', friend.avatar);
                    }
                    // 刷新 UI
                    if (typeof window.updateUI === 'function') {
                        setTimeout(function() { window.updateUI(); }, 200);
                    }
                    if (typeof window.loadData === 'function') {
                        setTimeout(function() { window.loadData(); }, 200);
                    }
                }
            }).catch(function(e) {});
        }
    }

    // ========== 好友会话创建 ==========

    function createFriendSession(friend) {
        if (typeof localforage === 'undefined') return;

        var sessionList = [];
        try {
            localforage.getItem(getAppPrefix() + 'sessionList').then(function(stored) {
                if (Array.isArray(stored)) sessionList = stored;
                // 检查是否已存在
                var existing = sessionList.find(function(s) { return s.id === friend.sessionId; });
                if (!existing) {
                    sessionList.push({
                        id: friend.sessionId,
                        name: friend.nickname,
                        createdAt: Date.now(),
                        type: 'friend'
                    });
                    localforage.setItem(getAppPrefix() + 'sessionList', sessionList);
                    if (typeof window.sessionList !== 'undefined') window.sessionList = sessionList;
                }

                // 写入会话设置
                localforage.setItem(getAppPrefix() + friend.sessionId + '_chatSettings', {
                    partnerName: friend.nickname,
                    partnerAvatar: friend.avatar || '',
                    myName: myAccount.nickname,
                    myAvatar: myAccount.avatar || '',
                    isFriendSession: true,
                    friendId: friend.id
                });

                // 写入头像
                if (friend.avatar) {
                    localforage.setItem(getAppPrefix() + friend.sessionId + '_partnerAvatar', friend.avatar);
                }
                if (myAccount.avatar) {
                    localforage.setItem(getAppPrefix() + friend.sessionId + '_myAvatar', myAccount.avatar);
                }

                // 刷新聊天列表
                if (typeof window.renderChatList === 'function') {
                    window.renderChatList();
                }
            });
        } catch(e) {
            console.error('[FriendConnect] 创建好友会话失败:', e);
        }
    }

    // ========== 注册/登录 UI ==========

    function openAuthModal() {
        closeAuthModal();

        var overlay = document.createElement('div');
        overlay.id = 'fc-auth-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100003;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';

        var panel = document.createElement('div');
        panel.style.cssText = 'background:var(--secondary-bg,#fff);border-radius:18px;padding:24px;width:85%;max-width:360px;box-shadow:0 20px 60px rgba(0,0,0,0.4);animation:popIn 0.22s cubic-bezier(.34,1.56,.64,1);';

        panel.innerHTML =
            '<div style="text-align:center;margin-bottom:20px;">' +
                '<div style="font-size:32px;margin-bottom:8px;"><i class="fas fa-user-friends" style="color:var(--accent-color,#b8a9c9);"></i></div>' +
                '<div style="font-size:17px;font-weight:700;color:var(--text-primary,#3a3a3a);">好友联机</div>' +
                '<div style="font-size:12px;color:var(--text-secondary,#8a8a8a);margin-top:4px;">注册账号，和朋友实时聊天</div>' +
            '</div>' +
            '<div id="fc-auth-tabs" style="display:flex;gap:8px;margin-bottom:16px;">' +
                '<button id="fc-tab-login" style="flex:1;padding:10px;border:none;border-radius:10px;background:var(--accent-color,#b8a9c9);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">登录</button>' +
                '<button id="fc-tab-register" style="flex:1;padding:10px;border:1.5px solid var(--border-color,#e0e0e0);border-radius:10px;background:none;color:var(--text-secondary,#8a8a8a);font-size:13px;font-weight:600;cursor:pointer;">注册</button>' +
            '</div>' +
            '<div id="fc-auth-form"></div>';

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closeAuthModal();
        });

        $('fc-tab-login').onclick = function() { showLoginForm(); };
        $('fc-tab-register').onclick = function() { showRegisterForm(); };
        showLoginForm();
    }

    function closeAuthModal() {
        var el = $('fc-auth-overlay');
        if (el) el.remove();
    }

    function showLoginForm() {
        var form = $('fc-auth-form');
        if (!form) return;
        form.innerHTML =
            '<div style="margin-bottom:12px;">' +
                '<input id="fc-login-username" type="text" placeholder="用户名或ID号" style="width:100%;padding:11px 14px;border:1.5px solid var(--border-color,#e0e0e0);border-radius:10px;font-size:14px;background:var(--primary-bg,#f5f5f5);color:var(--text-primary,#3a3a3a);box-sizing:border-box;">' +
            '</div>' +
            '<div style="margin-bottom:16px;">' +
                '<input id="fc-login-password" type="password" placeholder="密码" style="width:100%;padding:11px 14px;border:1.5px solid var(--border-color,#e0e0e0);border-radius:10px;font-size:14px;background:var(--primary-bg,#f5f5f5);color:var(--text-primary,#3a3a3a);box-sizing:border-box;">' +
            '</div>' +
            '<button id="fc-login-btn" style="width:100%;padding:12px;border:none;border-radius:10px;background:var(--accent-color,#b8a9c9);color:#fff;font-size:14px;font-weight:700;cursor:pointer;">登录</button>';

        // 切换 tab 样式
        $('fc-tab-login').style.cssText = 'flex:1;padding:10px;border:none;border-radius:10px;background:var(--accent-color,#b8a9c9);color:#fff;font-size:13px;font-weight:700;cursor:pointer;';
        $('fc-tab-register').style.cssText = 'flex:1;padding:10px;border:1.5px solid var(--border-color,#e0e0e0);border-radius:10px;background:none;color:var(--text-secondary,#8a8a8a);font-size:13px;font-weight:600;cursor:pointer;';

        $('fc-login-btn').onclick = doLogin;
        $('fc-login-password').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') doLogin();
        });
    }

    function showRegisterForm() {
        var form = $('fc-auth-form');
        if (!form) return;
        form.innerHTML =
            '<div style="background:var(--primary-bg,#f5f5f5);border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:11px;color:var(--text-secondary,#8a8a8a);line-height:1.5;">' +
                '<i class="fas fa-info-circle" style="color:var(--accent-color,#b8a9c9);margin-right:4px;"></i>' +
                '注册后将获得专属6位ID号，分享给好友即可被搜索添加' +
            '</div>' +
            '<div style="margin-bottom:10px;">' +
                '<input id="fc-reg-username" type="text" placeholder="设置用户名" maxlength="20" style="width:100%;padding:11px 14px;border:1.5px solid var(--border-color,#e0e0e0);border-radius:10px;font-size:14px;background:var(--primary-bg,#f5f5f5);color:var(--text-primary,#3a3a3a);box-sizing:border-box;">' +
            '</div>' +
            '<div style="margin-bottom:10px;">' +
                '<input id="fc-reg-nickname" type="text" placeholder="昵称（可选）" maxlength="20" style="width:100%;padding:11px 14px;border:1.5px solid var(--border-color,#e0e0e0);border-radius:10px;font-size:14px;background:var(--primary-bg,#f5f5f5);color:var(--text-primary,#3a3a3a);box-sizing:border-box;">' +
            '</div>' +
            '<div style="margin-bottom:10px;">' +
                '<input id="fc-reg-password" type="password" placeholder="设置密码" style="width:100%;padding:11px 14px;border:1.5px solid var(--border-color,#e0e0e0);border-radius:10px;font-size:14px;background:var(--primary-bg,#f5f5f5);color:var(--text-primary,#3a3a3a);box-sizing:border-box;">' +
            '</div>' +
            '<div style="margin-bottom:16px;position:relative;">' +
                '<div id="fc-reg-avatar-preview" style="width:56px;height:56px;border-radius:50%;background:var(--primary-bg,#f5f5f5);border:2px dashed var(--border-color,#e0e0e0);display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;">' +
                    '<i class="fas fa-camera" style="color:var(--text-secondary,#8a8a8a);font-size:18px;"></i>' +
                '</div>' +
                '<input id="fc-reg-avatar-input" type="file" accept="image/*" style="display:none;">' +
                '<span style="font-size:12px;color:var(--text-secondary,#8a8a8a);margin-left:12px;vertical-align:bottom;">点击设置头像（可选）</span>' +
            '</div>' +
            '<button id="fc-reg-btn" style="width:100%;padding:12px;border:none;border-radius:10px;background:var(--accent-color,#b8a9c9);color:#fff;font-size:14px;font-weight:700;cursor:pointer;">注册</button>';

        $('fc-tab-register').style.cssText = 'flex:1;padding:10px;border:none;border-radius:10px;background:var(--accent-color,#b8a9c9);color:#fff;font-size:13px;font-weight:700;cursor:pointer;';
        $('fc-tab-login').style.cssText = 'flex:1;padding:10px;border:1.5px solid var(--border-color,#e0e0e0);border-radius:10px;background:none;color:var(--text-secondary,#8a8a8a);font-size:13px;font-weight:600;cursor:pointer;';

        var avatarData = null;
        var preview = $('fc-reg-avatar-preview');
        var input = $('fc-reg-avatar-input');
        preview.onclick = function() { input.click(); };
        input.onchange = function(e) {
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function(ev) {
                avatarData = ev.target.result;
                preview.innerHTML = '<img src="' + avatarData + '" style="width:100%;height:100%;object-fit:cover;">';
                preview.style.border = 'none';
            };
            reader.readAsDataURL(file);
        };

        $('fc-reg-btn').onclick = function() { doRegister(avatarData); };
    }

    function doLogin() {
        var input = $('fc-login-username').value.trim();
        var password = $('fc-login-password').value;
        if (!input || !password) {
            showNotification('请填写用户名/ID和密码', 'warning');
            return;
        }

        var accounts = getAllAccounts();
        var account = null;

        // 先尝试用用户名查找
        if (accounts[input]) {
            account = accounts[input];
        } else {
            // 再用 UID 查找
            account = findAccountByUid(input);
        }

        if (!account) {
            showNotification('账号不存在', 'error');
            return;
        }
        if (account.password !== hashPassword(password)) {
            showNotification('密码错误', 'error');
            return;
        }

        myAccount = {
            id: account.id,
            uid: account.uid || '',
            username: account.username,
            nickname: account.nickname || account.username,
            avatar: account.avatar || '',
            password: account.password
        };
        saveMyAccount();
        loadFriends();
        initChannel();
        sendPresence('online');

        closeAuthModal();
        showNotification('登录成功！欢迎回来，' + myAccount.nickname, 'success');
        syncAccountToSessions();
        openFriendsPanel();
    }

    function doRegister(avatarData) {
        var username = $('fc-reg-username').value.trim();
        var nickname = $('fc-reg-nickname').value.trim() || username;
        var password = $('fc-reg-password').value;
        if (!username || !password) {
            showNotification('请填写用户名和密码', 'warning');
            return;
        }
        if (username.length < 2) {
            showNotification('用户名至少2个字符', 'warning');
            return;
        }
        if (password.length < 4) {
            showNotification('密码至少4个字符', 'warning');
            return;
        }

        var accounts = getAllAccounts();
        if (accounts[username]) {
            showNotification('用户名已存在', 'error');
            return;
        }

        var uid = genUserId();

        var account = {
            id: genId(),
            uid: uid,
            username: username,
            nickname: nickname,
            avatar: avatarData || '',
            password: hashPassword(password),
            createdAt: Date.now()
        };
        accounts[username] = account;

        // 维护 UID -> username 索引
        if (!accounts._uidIndex) accounts._uidIndex = {};
        accounts._uidIndex[uid] = username;
        saveAllAccounts(accounts);

        myAccount = {
            id: account.id,
            uid: account.uid,
            username: account.username,
            nickname: account.nickname,
            avatar: account.avatar,
            password: account.password
        };
        saveMyAccount();
        friends = [];
        saveFriends();
        initChannel();
        sendPresence('online');

        closeAuthModal();
        showNotification('注册成功！你的ID号：' + uid + '，分享给好友添加你吧', 'success');
        setTimeout(function() {
            showNotification('你的ID号：' + uid, 'info', 5000);
        }, 1000);
        syncAccountToSessions();
        openFriendsPanel();
    }

    function logout() {
        sendPresence('offline');
        myAccount = null;
        saveMyAccount();
        friends = [];
        if (bc) { try { bc.close(); } catch(e) {} bc = null; }
        closeFriendsPanel();
        showNotification('已退出登录', 'info');
    }

    // ========== 好友面板 ==========

    function openFriendsPanel() {
        closeFriendsPanel();
        if (!myAccount) {
            openAuthModal();
            return;
        }

        var overlay = document.createElement('div');
        overlay.id = 'fc-panel-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100003;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';

        var panel = document.createElement('div');
        panel.style.cssText = 'background:var(--secondary-bg,#fff);border-radius:18px;padding:20px;width:90%;max-width:400px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.4);animation:popIn 0.22s cubic-bezier(.34,1.56,.64,1);';

        panel.innerHTML =
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
                '<div style="display:flex;align-items:center;gap:10px;">' +
                    '<div style="width:40px;height:40px;border-radius:50%;overflow:hidden;background:var(--primary-bg,#f5f5f5);">' + (myAccount.avatar ? '<img src="' + myAccount.avatar + '" style="width:100%;height:100%;object-fit:cover;">' : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--accent-color,#b8a9c9);">' + escapeHtml(myAccount.nickname.charAt(0)) + '</div>') + '</div>' +
                    '<div>' +
                        '<div style="font-size:14px;font-weight:700;color:var(--text-primary,#3a3a3a);">' + escapeHtml(myAccount.nickname) + '</div>' +
                        '<div style="font-size:11px;color:var(--text-secondary,#8a8a8a);">@' + escapeHtml(myAccount.username) + '</div>' +
                    '</div>' +
                '</div>' +
                '<button id="fc-panel-close" style="border:none;background:none;font-size:18px;color:var(--text-secondary,#8a8a8a);cursor:pointer;padding:4px;"><i class="fas fa-times"></i></button>' +
            '</div>' +
            '<div style="background:var(--primary-bg,#f5f5f5);border-radius:10px;padding:10px 12px;margin-bottom:12px;display:flex;align-items:center;gap:8px;">' +
                '<i class="fas fa-id-badge" style="color:var(--accent-color,#b8a9c9);font-size:16px;"></i>' +
                '<div>' +
                    '<div style="font-size:10px;color:var(--text-secondary,#8a8a8a);">我的ID号</div>' +
                    '<div style="font-size:16px;font-weight:700;color:var(--text-primary,#3a3a3a);letter-spacing:1px;">' + escapeHtml(myAccount.uid || '未知') + '</div>' +
                '</div>' +
                '<button id="fc-copy-uid" style="margin-left:auto;border:1px solid var(--border-color,#e0e0e0);border-radius:6px;padding:4px 8px;background:none;font-size:11px;color:var(--text-secondary,#8a8a8a);cursor:pointer;">复制</button>' +
            '</div>' +
            '<div style="display:flex;gap:8px;margin-bottom:12px;">' +
                '<input id="fc-search-input" type="text" placeholder="输入好友ID号搜索" style="flex:1;padding:10px 14px;border:1.5px solid var(--border-color,#e0e0e0);border-radius:10px;font-size:13px;background:var(--primary-bg,#f5f5f5);color:var(--text-primary,#3a3a3a);" inputmode="numeric">' +
                '<button id="fc-search-btn" style="padding:10px 16px;border:none;border-radius:10px;background:var(--accent-color,#b8a9c9);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">搜索</button>' +
            '</div>' +
            '<div style="font-size:12px;font-weight:600;color:var(--text-secondary,#8a8a8a);margin-bottom:8px;">好友列表</div>' +
            '<div id="fc-friends-list" style="flex:1;overflow-y:auto;"></div>' +
            '<div style="margin-top:12px;display:flex;gap:8px;">' +
                '<button id="fc-logout-btn" style="flex:1;padding:10px;border:1.5px solid var(--border-color,#e0e0e0);border-radius:10px;background:none;color:var(--text-secondary,#8a8a8a);font-size:13px;cursor:pointer;">退出登录</button>' +
            '</div>';

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closeFriendsPanel();
        });
        $('fc-panel-close').onclick = closeFriendsPanel;
        $('fc-search-btn').onclick = doSearchFriend;
        $('fc-search-input').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') doSearchFriend();
        });
        $('fc-logout-btn').onclick = logout;

        // 复制UID
        var copyBtn = $('fc-copy-uid');
        if (copyBtn) {
            copyBtn.onclick = function() {
                var uid = myAccount.uid || '';
                if (!uid) return;
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(uid).then(function() {
                        showNotification('ID号已复制：' + uid, 'success');
                    }).catch(function() {
                        fallbackCopy(uid);
                    });
                } else {
                    fallbackCopy(uid);
                }
            };
        }

        renderFriendsList();
    }

    function closeFriendsPanel() {
        var el = $('fc-panel-overlay');
        if (el) el.remove();
    }

    function renderFriendsList() {
        var container = $('fc-friends-list');
        if (!container) return;

        if (friends.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:30px 16px;color:var(--text-secondary,#8a8a8a);">' +
                '<i class="fas fa-user-plus" style="font-size:28px;margin-bottom:8px;display:block;"></i>' +
                '<div style="font-size:13px;">还没有好友，去搜索添加吧</div>' +
            '</div>';
            return;
        }

        container.innerHTML = friends.map(function(f) {
            var avatarHTML = f.avatar
                ? '<img src="' + f.avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
                : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--accent-color,#b8a9c9);background:var(--primary-bg,#f5f5f5);border-radius:50%;">' + escapeHtml((f.nickname || '?').charAt(0)) + '</div>';
            var statusColor = f.status === 'online' ? '#1dd1a1' : '#ccc';
            var unreadBadge = (f.unread || 0) > 0 ? '<div style="position:absolute;top:-2px;right:-2px;background:#ff4757;color:#fff;font-size:10px;min-width:18px;height:18px;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 4px;font-weight:700;">' + f.unread + '</div>' : '';
            return '<div class="fc-friend-item" data-session="' + f.sessionId + '" style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;cursor:pointer;transition:background 0.15s;">' +
                '<div style="position:relative;width:40px;height:40px;flex-shrink:0;">' + avatarHTML + unreadBadge + '</div>' +
                '<div style="flex:1;min-width:0;">' +
                    '<div style="font-size:13px;font-weight:600;color:var(--text-primary,#3a3a3a);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(f.nickname) + '</div>' +
                    '<div style="font-size:11px;display:flex;align-items:center;gap:6px;">' +
                        '<span style="color:' + statusColor + ';">' + (f.status === 'online' ? '在线' : '离线') + '</span>' +
                        (f.uid ? '<span style="color:var(--accent-color,#b8a9c9);font-weight:600;">ID: ' + escapeHtml(f.uid) + '</span>' : '') +
                    '</div>' +
                '</div>' +
            '</div>';
        }).join('');

        container.querySelectorAll('.fc-friend-item').forEach(function(item) {
            item.addEventListener('click', function() {
                var sessionId = item.dataset.session;
                closeFriendsPanel();
                enterFriendChat(sessionId);
            });
            item.addEventListener('mouseenter', function() {
                item.style.background = 'var(--primary-bg,#f5f5f5)';
            });
            item.addEventListener('mouseleave', function() {
                item.style.background = '';
            });
        });
    }

    // ========== 搜索好友 ==========

    function doSearchFriend() {
        var query = $('fc-search-input').value.trim();
        if (!query) {
            showNotification('请输入好友ID号', 'warning');
            return;
        }

        // 尝试精确匹配 UID
        var account = findAccountByUid(query);

        if (account) {
            if (account.id === (myAccount ? myAccount.id : null) || account.username === (myAccount ? myAccount.username : null)) {
                showNotification('不能添加自己为好友', 'warning');
                return;
            }
            showSearchResults([account], query);
        } else {
            // 如果精确匹配失败，尝试模糊匹配 UID 或用户名
            var accounts = getAllAccounts();
            var results = [];
            for (var key in accounts) {
                if (key === '_uidIndex') continue;
                if (accounts.hasOwnProperty(key)) {
                    var acc = accounts[key];
                    if (acc.id === (myAccount ? myAccount.id : null)) continue;
                    // 匹配 UID
                    if (acc.uid && acc.uid.indexOf(query) !== -1) {
                        results.push(acc);
                    }
                    // 也匹配用户名和昵称
                    else if ((acc.username && acc.username.toLowerCase().indexOf(query.toLowerCase()) !== -1) ||
                        (acc.nickname && acc.nickname.toLowerCase().indexOf(query.toLowerCase()) !== -1)) {
                        results.push(acc);
                    }
                }
            }
            showSearchResults(results, query);
        }
    }

    function showSearchResults(results, query) {
        var existing = $('fc-search-results-overlay');
        if (existing) existing.remove();

        var overlay = document.createElement('div');
        overlay.id = 'fc-search-results-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100004;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';

        var panel = document.createElement('div');
        panel.style.cssText = 'background:var(--secondary-bg,#fff);border-radius:18px;padding:20px;width:85%;max-width:360px;max-height:60vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.4);';

        panel.innerHTML =
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">' +
                '<div style="font-size:14px;font-weight:700;color:var(--text-primary,#3a3a3a);">搜索结果</div>' +
                '<button id="fc-search-close" style="border:none;background:none;font-size:16px;color:var(--text-secondary,#8a8a8a);cursor:pointer;"><i class="fas fa-times"></i></button>' +
            '</div>' +
            '<div id="fc-search-list" style="flex:1;overflow-y:auto;"></div>';

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) overlay.remove();
        });
        $('fc-search-close').onclick = function() { overlay.remove(); };

        var list = $('fc-search-list');
        if (results.length === 0) {
            list.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-secondary,#8a8a8a);font-size:13px;">未找到用户 "' + escapeHtml(query) + '"</div>';
            return;
        }

        list.innerHTML = results.map(function(acc) {
            var isFriend = friends.some(function(f) { return f.id === acc.id; });
            var avatarHTML = acc.avatar
                ? '<img src="' + acc.avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
                : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--accent-color,#b8a9c9);background:var(--primary-bg,#f5f5f5);border-radius:50%;">' + escapeHtml((acc.nickname || acc.username).charAt(0)) + '</div>';
            return '<div class="fc-search-item" data-id="' + acc.id + '" style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;">' +
                '<div style="width:38px;height:38px;flex-shrink:0;">' + avatarHTML + '</div>' +
                '<div style="flex:1;min-width:0;">' +
                    '<div style="font-size:13px;font-weight:600;color:var(--text-primary,#3a3a3a);">' + escapeHtml(acc.nickname || acc.username) + '</div>' +
                    '<div style="font-size:11px;color:var(--accent-color,#b8a9c9);font-weight:600;">ID: ' + escapeHtml(acc.uid || acc.id) + '</div>' +
                '</div>' +
                (isFriend
                    ? '<button disabled style="padding:6px 12px;border:1.5px solid var(--border-color,#e0e0e0);border-radius:8px;background:none;color:var(--text-secondary,#8a8a8a);font-size:12px;">已添加</button>'
                    : '<button class="fc-add-friend-btn" data-id="' + acc.id + '" style="padding:6px 12px;border:none;border-radius:8px;background:var(--accent-color,#b8a9c9);color:#fff;font-size:12px;font-weight:600;cursor:pointer;">添加</button>') +
            '</div>';
        }).join('');

        list.querySelectorAll('.fc-add-friend-btn').forEach(function(btn) {
            btn.onclick = function() {
                var accId = btn.dataset.id;
                var acc = results.find(function(r) { return r.id === accId; });
                if (acc) {
                    sendFriendRequest(acc);
                    btn.textContent = '已发送';
                    btn.disabled = true;
                    btn.style.cssText = 'padding:6px 12px;border:1.5px solid var(--border-color,#e0e0e0);border-radius:8px;background:none;color:var(--text-secondary,#8a8a8a);font-size:12px;';
                }
            };
        });
    }

    // ========== 好友请求 ==========

    function sendFriendRequest(targetAccount) {
        broadcast({
            type: 'fc_friend_request',
            to: targetAccount.id,
            fromAccount: {
                id: myAccount.id,
                uid: myAccount.uid || '',
                username: myAccount.username,
                nickname: myAccount.nickname,
                avatar: myAccount.avatar
            }
        });
        showNotification('好友请求已发送给 ' + (targetAccount.nickname || targetAccount.username) + '（ID: ' + (targetAccount.uid || '') + '）', 'info');
    }

    function showFriendRequestModal(fromAccount) {
        var overlay = document.createElement('div');
        overlay.id = 'fc-request-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100005;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';

        var panel = document.createElement('div');
        panel.style.cssText = 'background:var(--secondary-bg,#fff);border-radius:18px;padding:24px;width:85%;max-width:320px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.4);animation:popIn 0.22s cubic-bezier(.34,1.56,.64,1);';

        var avatarHTML = fromAccount.avatar
            ? '<img src="' + fromAccount.avatar + '" style="width:60px;height:60px;border-radius:50%;object-fit:cover;margin:0 auto 10px;display:block;">'
            : '<div style="width:60px;height:60px;border-radius:50%;background:var(--primary-bg,#f5f5f5);display:flex;align-items:center;justify-content:center;font-size:24px;color:var(--accent-color,#b8a9c9);margin:0 auto 10px;">' + escapeHtml((fromAccount.nickname || fromAccount.username).charAt(0)) + '</div>';

        panel.innerHTML =
            '<div style="font-size:14px;font-weight:600;color:var(--text-secondary,#8a8a8a);margin-bottom:12px;">好友请求</div>' +
            avatarHTML +
            '<div style="font-size:15px;font-weight:700;color:var(--text-primary,#3a3a3a);margin-bottom:4px;">' + escapeHtml(fromAccount.nickname || fromAccount.username) + '</div>' +
            '<div style="font-size:12px;color:var(--accent-color,#b8a9c9);font-weight:600;margin-bottom:4px;">ID: ' + escapeHtml(fromAccount.uid || fromAccount.id) + '</div>' +
            '<div style="font-size:12px;color:var(--text-secondary,#8a8a8a);margin-bottom:20px;">@' + escapeHtml(fromAccount.username) + ' 想加你为好友</div>' +
            '<div style="display:flex;gap:10px;">' +
                '<button id="fc-reject-btn" style="flex:1;padding:11px;border:1.5px solid var(--border-color,#e0e0e0);border-radius:10px;background:none;color:var(--text-secondary,#8a8a8a);font-size:13px;cursor:pointer;">拒绝</button>' +
                '<button id="fc-accept-btn" style="flex:1;padding:11px;border:none;border-radius:10px;background:var(--accent-color,#b8a9c9);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">接受</button>' +
            '</div>';

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        var sessionId = genSessionId();

        $('fc-accept-btn').onclick = function() {
            // 创建本地好友记录
            var friend = {
                id: fromAccount.id,
                uid: fromAccount.uid || '',
                username: fromAccount.username,
                nickname: fromAccount.nickname || fromAccount.username,
                avatar: fromAccount.avatar || '',
                sessionId: sessionId,
                status: 'online',
                unread: 0
            };
            friends.push(friend);
            saveFriends();
            createFriendSession(friend);

            // 通知对方
            broadcast({
                type: 'fc_friend_response',
                to: fromAccount.id,
                from: myAccount.id,
                fromUid: myAccount.uid || '',
                fromUsername: myAccount.username,
                fromNickname: myAccount.nickname,
                fromAvatar: myAccount.avatar,
                accepted: true,
                sessionId: sessionId
            });

            overlay.remove();
            showNotification('已添加 ' + friend.nickname + ' 为好友', 'success');
            renderFriendsList();
        };

        $('fc-reject-btn').onclick = function() {
            broadcast({
                type: 'fc_friend_response',
                to: fromAccount.id,
                from: myAccount.id,
                fromNickname: myAccount.nickname,
                accepted: false
            });
            overlay.remove();
        };
    }

    // ========== 进入好友聊天 ==========

    function enterFriendChat(sessionId) {
        if (typeof window.enterChatWithSession === 'function') {
            window.enterChatWithSession(sessionId);
        } else if (typeof window.switchObjectSession === 'function') {
            window.switchObjectSession(sessionId);
        }

        // 清除未读并发送已读回执
        setTimeout(function() {
            clearFriendUnread(sessionId);
            // 发送已读回执
            var friend = friends.find(function(f) { return f.sessionId === sessionId; });
            if (friend && myAccount) {
                broadcast({
                    type: 'fc_read',
                    to: friend.id,
                    from: myAccount.id,
                    sessionId: sessionId
                });
            }
        }, 500);
    }

    // ========== 初始化 ==========

    function hookAddMessage() {
        var originalAddMessage = window.addMessage;
        if (!originalAddMessage || originalAddMessage._fcHooked) return;

        var hooked = function(msg) {
            // 如果当前是好友会话，且消息来自用户，则通过好友通道转发
            if (myAccount && msg.sender === 'user' && window.SESSION_ID) {
                var friend = friends.find(function(f) { return f.sessionId === window.SESSION_ID; });
                if (friend) {
                    sendMessage(friend.sessionId, msg.text, msg.image);
                }
            }
            return originalAddMessage(msg);
        };
        hooked._fcHooked = true;
        hooked._fcOriginal = originalAddMessage;
        window.addMessage = hooked;
    }

    function hookUserTyping() {
        var input = document.getElementById('message-input') || document.getElementById('messageInput');
        if (!input || input._fcTypingHooked) return;
        input._fcTypingHooked = true;

        var typingTimer = null;
        var isTyping = false;

        input.addEventListener('input', function() {
            if (!myAccount) return;
            var friend = friends.find(function(f) { return f.sessionId === window.SESSION_ID; });
            if (!friend) return;

            if (!isTyping) {
                isTyping = true;
                sendTyping(friend.sessionId, true);
            }

            if (typingTimer) clearTimeout(typingTimer);
            typingTimer = setTimeout(function() {
                isTyping = false;
                sendTyping(friend.sessionId, false);
            }, 1500);
        });

        // 发送消息后停止输入状态
        var sendBtn = document.getElementById('send-btn') || document.getElementById('sendBtn');
        if (sendBtn) {
            sendBtn.addEventListener('click', function() {
                if (isTyping) {
                    isTyping = false;
                    if (typingTimer) clearTimeout(typingTimer);
                    var friend = friends.find(function(f) { return f.sessionId === window.SESSION_ID; });
                    if (friend) sendTyping(friend.sessionId, false);
                }
            });
        }
    }

    function hookRenderChatList() {
        var original = window.renderChatList;
        if (!original || original._fcHooked) return;

        var hooked = async function() {
            await original();
            // 给好友会话添加标记
            var container = document.getElementById('chat-list-items');
            if (!container) return;
            container.querySelectorAll('.chat-list-item').forEach(function(item) {
                var sid = item.dataset.id;
                var friend = friends.find(function(f) { return f.sessionId === sid; });
                if (friend && !item.querySelector('.fc-friend-badge')) {
                    var badge = document.createElement('span');
                    badge.className = 'fc-friend-badge';
                    badge.style.cssText = 'position:absolute;top:2px;right:2px;background:var(--accent-color,#b8a9c9);color:#fff;font-size:9px;padding:1px 5px;border-radius:8px;font-weight:600;';
                    badge.textContent = '好友';
                    badge.title = '好友联机会话';
                    item.style.position = 'relative';
                    item.appendChild(badge);
                }
            });
        };
        hooked._fcHooked = true;
        window.renderChatList = hooked;
    }

    function init() {
        loadMyAccount();
        loadFriends();
        initChannel();

        if (myAccount) {
            sendPresence('online');
        }

        // 监听页面关闭，发送离线状态
        window.addEventListener('beforeunload', function() {
            sendPresence('offline');
        });

        // 监听会话切换，如果是好友会话则清除未读、发送已读回执、同步消息
        window.addEventListener('sessionChanged', function(ev) {
            var sessionId = ev.detail ? ev.detail.sessionId : window.SESSION_ID;
            if (!sessionId) return;
            var friend = friends.find(function(f) { return f.sessionId === sessionId; });
            if (friend) {
                clearFriendUnread(sessionId);
                // 发送已读回执
                if (myAccount) {
                    broadcast({
                        type: 'fc_read',
                        to: friend.id,
                        from: myAccount.id,
                        sessionId: sessionId
                    });
                }
                // 延迟同步好友消息到 localforage（确保 loadData 已完成）
                setTimeout(function() {
                    loadFriendMessagesIntoSession(sessionId);
                }, 300);
            }
        });

        // 钩入消息发送：拦截用户发送的消息，通过好友通道转发
        // 延迟执行确保 core.js 的 addMessage 已就绪
        setTimeout(function() {
            hookAddMessage();
            hookUserTyping();
            hookRenderChatList();
        }, 100);

        // 监听 partner-status 更新
        window.addEventListener('fc:message', function(ev) {
            // 可以在这里添加额外的消息处理逻辑
        });
    }

    function loadFriendMessagesIntoSession(sessionId) {
        var msgs = getFriendMessages(sessionId);
        if (!msgs.length || !myAccount) return;
        if (typeof window.messages === 'undefined' || !Array.isArray(window.messages)) return;

        var friend = friends.find(function(f) { return f.sessionId === sessionId; });
        if (!friend) return;

        // 检查 localforage 是否已有这些消息，如果没有则补充
        if (typeof localforage !== 'undefined') {
            try {
                localforage.getItem(getAppPrefix() + sessionId + '_chatMessages').then(function(stored) {
                    var arr = Array.isArray(stored) ? stored : [];
                    var existingIds = {};
                    arr.forEach(function(m) { existingIds[m.id] = true; });

                    var needSync = false;
                    msgs.forEach(function(m) {
                        var appMsg = {
                            id: m.id,
                            sender: m.from === myAccount.id ? 'user' : 'partner',
                            text: m.text,
                            image: m.image || null,
                            timestamp: new Date(m.timestamp),
                            status: m.from === myAccount.id ? 'sent' : 'received',
                            type: m.image ? 'image' : 'normal',
                            favorited: false,
                            note: null
                        };
                        if (!existingIds[appMsg.id]) {
                            arr.push(appMsg);
                            needSync = true;
                        }
                    });

                    if (needSync) {
                        localforage.setItem(getAppPrefix() + sessionId + '_chatMessages', arr);
                        // 如果当前正在查看这个会话，重新渲染
                        if (window.SESSION_ID === sessionId && typeof window.renderMessages === 'function') {
                            // 更新 messages 数组
                            if (typeof window.messages !== 'undefined' && Array.isArray(window.messages)) {
                                window.messages.length = 0;
                                arr.forEach(function(m) { window.messages.push(m); });
                                window.renderMessages(false);
                            }
                        }
                    }
                });
            } catch(e) { console.warn('[FriendConnect] 消息同步失败:', e); }
        }
    }

    // ========== 公开接口 ==========

    window.FriendConnect = {
        init: init,
        openAuthModal: openAuthModal,
        openFriendsPanel: openFriendsPanel,
        isLoggedIn: function() { return !!myAccount; },
        getMyAccount: function() { return myAccount; },
        getFriends: function() { return friends; },
        sendMessage: sendMessage,
        sendTyping: sendTyping,
        enterFriendChat: enterFriendChat,
        isFriendSession: function(sessionId) {
            return friends.some(function(f) { return f.sessionId === sessionId; });
        },
        loadFriendMessagesIntoSession: loadFriendMessagesIntoSession,
        sendMomentLike: sendMomentLike,
        sendMomentComment: sendMomentComment,
        sendMomentPublish: sendMomentPublish
    };

    // 自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
