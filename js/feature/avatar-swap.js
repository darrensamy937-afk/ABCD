// ========== 头像交换模块 ==========
(function () {
    'use strict';

    if (window.AvatarSwapApp && window.AvatarSwapApp.__loaded) return;

    // ========== 存储键 ==========
    function getStorageKey(base) {
        var prefix = (typeof window.APP_PREFIX !== 'undefined') ? window.APP_PREFIX : 'sea_';
        var sid = (typeof window.SESSION_ID !== 'undefined') ? window.SESSION_ID : (window.SESSION_ID || 'default');
        return prefix + sid + '_' + base;
    }

    // ========== 状态 ==========
    var state = {
        myLibrary: [],       // 我的头像库 [{id, src, name}]
        partnerLibrary: [],  // 他的头像库 [{id, src, name}]
        currentTab: 'mine',  // 'mine' | 'theirs'
        selectedAvatar: null, // 当前选中的头像 src
        // 拒绝记录: { avatarSrc: { count, lastRejectTime } }
        rejectRecords: {},
        // 待处理邀请: { inviteId: { from, to, avatarSrc, status, timestamp } }
        pendingInvites: {},
        // 对方上次自己换头像的时间戳
        lastOwnAvatarChange: 0,
    };

    var MAX_REJECT = 3; // 同一头像最多拒绝3次
    var overlayEl = null;
    var dialogEl = null;

    // ========== 工具 ==========
    function $(id) { return document.getElementById(id); }
    function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function uid() { return 'av_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6); }
    function randItem(arr) { return arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null; }

    // 压缩图片：将 dataUrl 缩小到 maxSize 以内，返回压缩后的 dataUrl
    function compressAvatar(dataUrl, maxSize, quality, callback) {
        var img = new Image();
        var done = false;
        var timer = setTimeout(function () {
            if (!done) { done = true; callback(dataUrl); }
        }, 5000);
        img.onload = function () {
            if (done) return; done = true; clearTimeout(timer);
            var w = img.width, h = img.height;
            var scale = Math.min(1, maxSize / Math.max(w, h));
            var cw = Math.round(w * scale);
            var ch = Math.round(h * scale);
            var canvas = document.createElement('canvas');
            canvas.width = cw;
            canvas.height = ch;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, cw, ch);
            try {
                callback(canvas.toDataURL('image/jpeg', quality || 0.7));
            } catch (e) {
                callback(dataUrl);
            }
        };
        img.onerror = function () {
            if (done) return; done = true; clearTimeout(timer);
            callback(dataUrl);
        };
        img.src = dataUrl;
    }

    function showToast(msg) {
        if (typeof window.showNotification === 'function') {
            window.showNotification(msg, 'info', 2500);
        } else if (typeof showNotification === 'function') {
            showNotification(msg, 'info', 2500);
        }
    }

    // ========== 数据持久化 ==========
    function loadData() {
        try {
            var raw = localStorage.getItem(getStorageKey('avatar_swap_data'));
            if (raw) {
                var parsed = JSON.parse(raw);
                state.myLibrary = parsed.myLibrary || [];
                state.partnerLibrary = parsed.partnerLibrary || [];
                state.rejectRecords = parsed.rejectRecords || {};
                state.pendingInvites = parsed.pendingInvites || {};
                state.lastOwnAvatarChange = parsed.lastOwnAvatarChange || 0;
            }
        } catch (e) {
            console.warn('[AvatarSwap] loadData error:', e);
        }
    }

    function saveData() {
        try {
            localStorage.setItem(getStorageKey('avatar_swap_data'), JSON.stringify({
                myLibrary: state.myLibrary,
                partnerLibrary: state.partnerLibrary,
                rejectRecords: state.rejectRecords,
                pendingInvites: state.pendingInvites,
                lastOwnAvatarChange: state.lastOwnAvatarChange,
            }));
        } catch (e) {
            console.warn('[AvatarSwap] saveData error:', e);
        }
    }

    // ========== 获取设置 ==========
    function getSettings() {
        return (typeof window.settings !== 'undefined') ? window.settings : {};
    }

    function getPartnerName() {
        return getSettings().partnerName || 'TA';
    }

    function getMyName() {
        return getSettings().myName || '我';
    }

    // ========== 获取字卡库（站内统一） ==========
    function getSiteCardLib() {
        var pool = [];
        try {
            if (window._customReplies && Array.isArray(window._customReplies)) {
                window._customReplies.forEach(function (v) { if (v && String(v).trim()) pool.push(String(v).trim()); });
            }
        } catch (e) {}
        try {
            if (window._CONSTANTS && window._CONSTANTS.REPLY_MESSAGES && Array.isArray(window._CONSTANTS.REPLY_MESSAGES)) {
                window._CONSTANTS.REPLY_MESSAGES.forEach(function (v) { if (v && String(v).trim()) pool.push(String(v).trim()); });
            }
        } catch (e) {}
        return pool;
    }

    // 从字卡库随机选取一张字卡作为回复（AI启用时使用简单回复）
    function getRandomCardReply() {
        // AI 模式下不使用字卡库
        if (typeof window.AIEngine !== 'undefined' && window.AIEngine.isAIEnabled && window.AIEngine.isAIEnabled()) {
            var aiReplies = ['不太喜欢这个头像呢~', '还是现在的更好看吧', '换一个试试？', '嗯...我觉得一般般', '下次再换吧', '换个别的？'];
            return aiReplies[Math.floor(Math.random() * aiReplies.length)];
        }
        var lib = getSiteCardLib();
        if (lib && lib.length > 0) {
            return randItem(lib);
        }
        return '不太喜欢这个头像呢~'; // 兜底
    }

    // ========== 更新头像显示 ==========
    function updateAvatarDisplay(who, src) {
        // 更新聊天界面头像
        var avatarEl = (who === 'me')
            ? document.getElementById('my-avatar')
            : document.getElementById('partner-avatar');

        if (avatarEl) {
            if (src) {
                avatarEl.innerHTML = '<img src="' + esc(src) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
            } else {
                avatarEl.innerHTML = '<i class="fas fa-user"></i>';
            }
        }

        // 更新 settings
        var s = getSettings();
        if (who === 'me') {
            s.myAvatar = src;
        } else {
            s.partnerAvatar = src;
        }

        // 保存到 localforage
        if (typeof localforage !== 'undefined' && window.SESSION_ID) {
            var key = (who === 'me') ? 'myAvatar' : 'partnerAvatar';
            var storageKey = (typeof getStorageKey === 'function' && typeof window.APP_PREFIX !== 'undefined')
                ? window.APP_PREFIX + window.SESSION_ID + '_' + key
                : key;
            try { localStorage.setItem(storageKey, src); } catch (e) {}
            try { localforage.setItem(storageKey, src); } catch (e) {}
        }

        // 同步到 Home 页
        try {
            var homeAvatarTarget = who;
            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('homeGlobalUpdated', {
                    detail: { key: 'home_avatar_' + homeAvatarTarget, value: src }
                }));
            }
        } catch (e) {}

        // 触发 saveData
        if (typeof window.throttledSaveData === 'function') {
            window.throttledSaveData();
        } else if (typeof window.saveData === 'function') {
            try { window.saveData(); } catch (e) {}
        }
    }

    // ========== 检查头像是否被锁定（拒绝3次） ==========
    function isAvatarLocked(src, fromTab) {
        // fromTab: 'mine' = 我邀请对方换（对方拒绝），'theirs' = 对方邀请我换（我拒绝）
        var key = (fromTab === 'mine' ? 'mine_' : 'theirs_') + src;
        var record = state.rejectRecords[key];
        if (!record) return false;
        return record.count >= MAX_REJECT;
    }

    function getRejectCount(src, fromTab) {
        var key = (fromTab === 'mine' ? 'mine_' : 'theirs_') + src;
        var record = state.rejectRecords[key];
        return record ? record.count : 0;
    }

    function recordRejection(src, fromTab) {
        var key = (fromTab === 'mine' ? 'mine_' : 'theirs_') + src;
        if (!state.rejectRecords[key]) {
            state.rejectRecords[key] = { count: 0, lastRejectTime: 0 };
        }
        state.rejectRecords[key].count++;
        state.rejectRecords[key].lastRejectTime = Date.now();
        saveData();
    }

    // ========== 添加消息到聊天 ==========
    function addChatMessage(msgData) {
        if (typeof window.addMessage === 'function') {
            window.addMessage(msgData);
        }
    }

    // ========== 创建邀请卡片消息 ==========
    function createInviteMessage(who, avatarSrc, fromTab) {
        // who: 'user' = 我邀请对方, 'partner' = 对方邀请我
        // fromTab: 'mine' = 用我的库的头像, 'theirs' = 用他的库的头像
        var inviteId = uid();
        var isUserInviting = (who === 'user');

        var msg = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            sender: isUserInviting ? 'user' : (getPartnerName()),
            timestamp: new Date(),
            status: 'sent',
            favorited: false,
            note: null,
            type: 'avatar-invite',
            avatarInvite: {
                inviteId: inviteId,
                from: isUserInviting ? 'user' : 'partner',
                to: isUserInviting ? 'partner' : 'user',
                avatarSrc: avatarSrc,
                fromTab: fromTab,
                status: 'pending', // pending | accepted | rejected
            }
        };

        addChatMessage(msg);

        // 存储待处理邀请
        state.pendingInvites[inviteId] = {
            from: msg.avatarInvite.from,
            to: msg.avatarInvite.to,
            avatarSrc: avatarSrc,
            fromTab: fromTab,
            status: 'pending',
            timestamp: Date.now(),
            msgId: msg.id,
        };
        saveData();

        return inviteId;
    }

    // ========== 处理邀请 - 同意 ==========
    function acceptInvite(inviteId) {
        var invite = state.pendingInvites[inviteId];
        if (!invite || invite.status !== 'pending') return;

        invite.status = 'accepted';
        saveData();

        // 更新对应方的头像
        if (invite.to === 'partner') {
            // 我邀请对方换头像，对方同意 → 更新对方头像
            updateAvatarDisplay('partner', invite.avatarSrc);
        } else {
            // 对方邀请我换头像，我同意 → 更新我的头像
            updateAvatarDisplay('me', invite.avatarSrc);
        }

        // 更新消息卡片状态
        updateInviteCardUI(invite.msgId, 'accepted');

        // 如果是对方邀请我同意，发送一条系统消息
        if (invite.from === 'partner') {
            addChatMessage({
                id: Date.now(),
                sender: 'user',
                text: '好的，我换上啦~',
                timestamp: new Date(),
                status: 'sent',
                favorited: false,
                note: null,
                type: 'normal'
            });
        }

        showToast('头像已更换');
    }

    // ========== 处理邀请 - 拒绝 ==========
    function rejectInvite(inviteId) {
        var invite = state.pendingInvites[inviteId];
        if (!invite || invite.status !== 'pending') return;

        invite.status = 'rejected';
        saveData();

        // 记录拒绝次数
        recordRejection(invite.avatarSrc, invite.fromTab);

        // 更新消息卡片状态
        updateInviteCardUI(invite.msgId, 'rejected');

        // 如果是对方邀请我拒绝，发送一条系统消息
        if (invite.from === 'partner') {
            addChatMessage({
                id: Date.now(),
                sender: 'user',
                text: getRandomCardReply(),
                timestamp: new Date(),
                status: 'sent',
                favorited: false,
                note: null,
                type: 'normal'
            });
        } else {
            // 我邀请对方被拒绝，对方从字卡库随机选取字卡回复
            setTimeout(function () {
                addChatMessage({
                    id: Date.now(),
                    sender: getPartnerName(),
                    text: getRandomCardReply(),
                    timestamp: new Date(),
                    status: 'read',
                    favorited: false,
                    note: null,
                    type: 'normal'
                });
            }, 1000 + Math.random() * 2000);
        }

        showToast('已拒绝');
    }

    // ========== 更新邀请卡片UI ==========
    function updateInviteCardUI(msgId, status) {
        var cards = document.querySelectorAll('.avatar-invite-card[data-invite-msg-id="' + msgId + '"]');
        cards.forEach(function (card) {
            card.classList.add('invite-processed');
            var actionsEl = card.querySelector('.invite-actions');
            if (actionsEl) actionsEl.style.display = 'none';

            var resultEl = card.querySelector('.invite-result');
            if (resultEl) {
                resultEl.style.display = 'block';
                if (status === 'accepted') {
                    resultEl.className = 'invite-result accepted';
                    resultEl.textContent = '✓ 已同意，头像已更换';
                } else if (status === 'rejected') {
                    resultEl.className = 'invite-result rejected';
                    resultEl.textContent = '✗ 已拒绝';
                }
            }
        });
    }

    // ========== 渲染邀请卡片HTML ==========
    function renderInviteCardHTML(msg) {
        if (!msg || msg.type !== 'avatar-invite' || !msg.avatarInvite) return '';
        var inv = msg.avatarInvite;
        var isUserInviting = (inv.from === 'user');
        var partnerName = getPartnerName();
        var myName = getMyName();

        var fromName = isUserInviting ? myName : partnerName;
        var toName = isUserInviting ? partnerName : myName;
        var titleText = isUserInviting
            ? '我邀请' + partnerName + '换头像'
            : partnerName + '邀请你换头像';

        var processed = (inv.status !== 'pending');
        var resultText = '';
        if (processed) {
            if (inv.status === 'accepted') resultText = '✓ 已同意，头像已更换';
            else if (inv.status === 'rejected') resultText = '✗ 已拒绝';
        }

        var html = '<div class="avatar-invite-card" data-invite-msg-id="' + esc(String(msg.id)) + '" data-invite-id="' + esc(inv.inviteId) + '">';
        html += '<div class="invite-header"><i class="fas fa-exchange-alt"></i><span class="invite-title">' + esc(titleText) + '</span></div>';
        html += '<div class="invite-avatars">';

        // 当前头像
        var currentAvatar = isUserInviting ? (getSettings().partnerAvatar || '') : (getSettings().myAvatar || '');
        html += '<div class="invite-avatar-box">';
        html += '<div class="invite-avatar-img">';
        if (currentAvatar) {
            html += '<img src="' + esc(currentAvatar) + '">';
        } else {
            html += '<i class="fas fa-user" style="font-size:22px;color:#ccc;display:flex;align-items:center;justify-content:center;width:100%;height:100%;"></i>';
        }
        html += '</div>';
        html += '<div class="invite-avatar-label">' + esc(toName) + '</div>';
        html += '</div>';

        // 箭头
        html += '<i class="fas fa-chevron-right invite-arrow"></i>';

        // 新头像
        html += '<div class="invite-avatar-box">';
        html += '<div class="invite-avatar-img" style="border-color:var(--accent-color,#e91e63);">';
        html += '<img src="' + esc(inv.avatarSrc) + '">';
        html += '</div>';
        html += '<div class="invite-avatar-label">新头像</div>';
        html += '</div>';

        html += '</div>'; // invite-avatars

        // 结果
        html += '<div class="invite-result" style="display:none;"></div>';

        // 操作按钮（只有待处理且是对方邀请我时才显示按钮）
        if (!processed && !isUserInviting) {
            html += '<div class="invite-actions">';
            html += '<button type="button" class="btn-reject" data-invite-action="reject" data-invite-id="' + esc(inv.inviteId) + '">拒绝</button>';
            html += '<button type="button" class="btn-accept" data-invite-action="accept" data-invite-id="' + esc(inv.inviteId) + '">同意</button>';
            html += '</div>';
        } else if (!processed && isUserInviting) {
            // 我发出的邀请，等待对方回复
            html += '<div class="invite-actions" style="opacity:0.5;pointer-events:none;">';
            html += '<button type="button" class="btn-reject" disabled>等待回复...</button>';
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    // ========== 绑定邀请卡片事件 ==========
    function bindInviteCardEvents() {
        // 使用事件委托
        document.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-invite-action]');
            if (!btn) return;

            e.preventDefault();
            e.stopPropagation();

            var inviteId = btn.dataset.inviteId;
            var action = btn.dataset.inviteAction;

            if (action === 'accept') {
                acceptInvite(inviteId);
            } else if (action === 'reject') {
                rejectInvite(inviteId);
            }
        }, true);
    }

    // ========== 渲染头像库网格 ==========
    function renderGrid() {
        var body = $('avatar-swap-body');
        if (!body) return;

        var library = (state.currentTab === 'mine') ? state.myLibrary : state.partnerLibrary;
        var fromTab = state.currentTab;

        if (!library || library.length === 0) {
            body.innerHTML = '<div class="avatar-swap-empty">' +
                '<i class="fas fa-images"></i>' +
                '<p>头像库还是空的</p>' +
                '<p style="font-size:12px;">点击下方 + 上传头像</p>' +
                '</div>';
            // 仍然显示上传按钮
            body.innerHTML += '<div class="avatar-swap-grid" style="grid-template-columns:1fr;max-width:80px;margin:16px auto 0;">' +
                '<div class="avatar-swap-upload" id="avatar-swap-upload-btn"><i class="fas fa-plus"></i></div>' +
                '</div>';
            bindUploadBtn();
            return;
        }

        var html = '<div class="avatar-swap-grid">';

        // 上传按钮
        html += '<div class="avatar-swap-upload" id="avatar-swap-upload-btn"><i class="fas fa-plus"></i></div>';

        // 头像列表
        library.forEach(function (item) {
            var locked = isAvatarLocked(item.src, fromTab);
            var rejectCount = getRejectCount(item.src, fromTab);

            html += '<div class="avatar-swap-item' + (state.selectedAvatar === item.src ? ' selected' : '') + '" data-src="' + esc(item.src) + '" data-id="' + esc(item.id) + '">';

            if (locked) {
                html += '<div class="avatar-swap-locked"><i class="fas fa-lock"></i><div class="avatar-swap-locked-text">已拒绝3次</div></div>';
            } else if (rejectCount > 0) {
                html += '<div class="avatar-swap-reject-count">' + rejectCount + '/' + MAX_REJECT + '</div>';
            }

            html += '<img src="' + esc(item.src) + '">';
            html += '<button class="avatar-swap-delete" data-del-id="' + esc(item.id) + '" title="删除"><i class="fas fa-times"></i></button>';
            html += '</div>';
        });

        html += '</div>';

        body.innerHTML = html;

        // 绑定事件
        bindUploadBtn();
        bindGridItems();
    }

    function bindUploadBtn() {
        var btn = $('avatar-swap-upload-btn');
        if (btn) {
            btn.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                triggerUpload();
            };
        }
    }

    function bindGridItems() {
        var items = document.querySelectorAll('.avatar-swap-item');
        items.forEach(function (item) {
            item.onclick = function (e) {
                // 如果点的是删除按钮，不选中
                if (e.target.closest('.avatar-swap-delete')) return;

                var locked = item.querySelector('.avatar-swap-locked');
                if (locked) {
                    showToast('该头像已被拒绝3次，无法再次邀请');
                    return;
                }

                var src = item.dataset.src;
                state.selectedAvatar = src;

                // 更新选中状态
                document.querySelectorAll('.avatar-swap-item').forEach(function (el) {
                    el.classList.remove('selected');
                });
                item.classList.add('selected');

                // 更新发送按钮状态
                updateSendBtn();
            };
        });

        // 删除按钮
        document.querySelectorAll('.avatar-swap-delete').forEach(function (btn) {
            btn.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                var id = btn.dataset.delId;
                deleteAvatar(id);
            };
        });
    }

    function updateSendBtn() {
        var btn = $('avatar-swap-send');
        if (!btn) return;

        if (state.selectedAvatar) {
            btn.disabled = false;
            if (state.currentTab === 'mine') {
                btn.textContent = '邀请' + getPartnerName() + '换头像';
            } else {
                btn.textContent = '上传给' + getPartnerName() + '换头像';
            }
        } else {
            btn.disabled = true;
            btn.textContent = '请选择头像';
        }
    }

    // ========== 上传头像 ==========
    function triggerUpload() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = function (e) {
            var file = e.target.files[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                showToast('图片不能超过5MB');
                return;
            }

            var reader = new FileReader();
            reader.onload = function (ev) {
                var rawSrc = ev.target.result;
                // 压缩图片到 200px，质量 0.7，避免 localStorage 超限
                compressAvatar(rawSrc, 200, 0.7, function (src) {
                    var item = {
                        id: uid(),
                        src: src,
                        name: file.name || '头像'
                    };

                    if (state.currentTab === 'mine') {
                        state.myLibrary.push(item);
                    } else {
                        state.partnerLibrary.push(item);
                    }
                    saveData();
                    renderGrid();
                    showToast('头像已添加到库');
                });
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    // ========== 删除头像 ==========
    function deleteAvatar(id) {
        var library = (state.currentTab === 'mine') ? state.myLibrary : state.partnerLibrary;
        var idx = library.findIndex(function (item) { return item.id === id; });
        if (idx >= 0) {
            library.splice(idx, 1);
            // 如果删除的是当前选中的，清除选中
            if (state.selectedAvatar) {
                var delItem = library.find(function (item) { return item.src === state.selectedAvatar; });
                if (!delItem) state.selectedAvatar = null;
            }
            saveData();
            renderGrid();
            updateSendBtn();
            showToast('已删除');
        }
    }

    // ========== 发送邀请 ==========
    function sendInvite() {
        if (!state.selectedAvatar) {
            showToast('请先选择头像');
            return;
        }

        var fromTab = state.currentTab;
        var locked = isAvatarLocked(state.selectedAvatar, fromTab);
        if (locked) {
            showToast('该头像已被拒绝3次，无法再次邀请');
            return;
        }

        if (fromTab === 'mine') {
            // 用我的库的头像邀请对方换
            createInviteMessage('user', state.selectedAvatar, fromTab);
            showToast('已发送换头像邀请');

            // 模拟对方回复
            simulatePartnerResponse(state.selectedAvatar, fromTab);
        } else {
            // 用他的库的头像，相当于建议对方用这个头像
            createInviteMessage('user', state.selectedAvatar, fromTab);
            showToast('已发送换头像邀请');

            simulatePartnerResponse(state.selectedAvatar, fromTab);
        }

        // 关闭弹窗
        closeDialog();
    }

    // ========== 模拟对方回复（同意/拒绝） ==========
    function simulatePartnerResponse(avatarSrc, fromTab) {
        var delay = 2000 + Math.random() * 4000;

        setTimeout(function () {
            // 查找最新的待处理邀请
            var pendingInvite = null;
            var pendingId = null;
            for (var id in state.pendingInvites) {
                var inv = state.pendingInvites[id];
                if (inv.status === 'pending' && inv.avatarSrc === avatarSrc && inv.from === 'user') {
                    pendingInvite = inv;
                    pendingId = id;
                    break;
                }
            }

            if (!pendingInvite) return;

            // 使用设置中的拒绝概率
            var s = getSettings();
            var baseRejectProb = (s.avatarRejectChance !== undefined ? s.avatarRejectChance : 30) / 100;
            // 拒绝次数越多，越倾向于拒绝（每次拒绝 +10%）
            var rejectCount = getRejectCount(avatarSrc, fromTab);
            var rejectProb = Math.min(0.95, baseRejectProb + (rejectCount * 0.1));
            var willAccept = Math.random() > rejectProb;

            if (willAccept) {
                // 对方同意
                acceptInvite(pendingId);
            } else {
                // 对方拒绝
                rejectInvite(pendingId);
            }
        }, delay);
    }

    // ========== 对方主动邀请我换头像 ==========
    function partnerAutoInviteMe() {
        // 从用户（我的）头像库随机选一个，邀请用户换这个头像
        var library = state.myLibrary;
        if (!library || library.length === 0) return;

        // 获取用户当前头像，排除掉（不邀请换当前正在用的头像）
        var s = getSettings();
        var currentAvatar = s.myAvatar || '';

        // 随机选一个未被锁定且不是当前头像的
        var available = library.filter(function (item) {
            return !isAvatarLocked(item.src, 'theirs') && item.src !== currentAvatar;
        });
        if (available.length === 0) return;

        var chosen = randItem(available);
        if (!chosen) return;

        // 对方发邀请卡片
        createInviteMessage('partner', chosen.src, 'theirs');

        // 显示打字动画
        if (typeof window._showTypingIndicatorWithText === 'function') {
            window._showTypingIndicatorWithText(getPartnerName() + ' 想让你换头像');
            setTimeout(function () {
                if (typeof window._hideTypingIndicatorGlobal === 'function') {
                    window._hideTypingIndicatorGlobal();
                }
            }, 1500);
        }
    }

    // ========== 创建弹窗 ==========
    function createDialog() {
        // 移除已有弹窗
        var existing = $('avatar-swap-overlay');
        if (existing) existing.remove();

        // 创建遮罩
        overlayEl = document.createElement('div');
        overlayEl.id = 'avatar-swap-overlay';
        overlayEl.className = 'avatar-swap-overlay';

        // 创建弹窗
        dialogEl = document.createElement('div');
        dialogEl.className = 'avatar-swap-dialog';

        var partnerName = getPartnerName();

        dialogEl.innerHTML =
            '<div class="avatar-swap-header">' +
            '  <div class="avatar-swap-title"><i class="fas fa-exchange-alt"></i> 头像交换</div>' +
            '  <button class="avatar-swap-close" type="button" id="avatar-swap-close-btn"><i class="fas fa-times"></i></button>' +
            '</div>' +
            '<div class="avatar-swap-tabs">' +
            '  <div class="avatar-swap-tab active" data-tab="mine">我的头像库</div>' +
            '  <div class="avatar-swap-tab" data-tab="theirs">' + esc(partnerName) + '的头像库</div>' +
            '</div>' +
            '<div class="avatar-swap-body" id="avatar-swap-body"></div>' +
            '<div class="avatar-swap-footer">' +
            '  <button class="avatar-swap-btn avatar-swap-btn-secondary" type="button" id="avatar-swap-cancel">取消</button>' +
            '  <button class="avatar-swap-btn avatar-swap-btn-primary" type="button" id="avatar-swap-send" disabled>请选择头像</button>' +
            '</div>';

        overlayEl.appendChild(dialogEl);
        document.body.appendChild(overlayEl);

        // 点击遮罩关闭
        overlayEl.addEventListener('click', function (e) {
            if (e.target === overlayEl) closeDialog();
        });

        // 关闭按钮
        var closeBtn = $('avatar-swap-close-btn');
        if (closeBtn) closeBtn.onclick = function () { closeDialog(); };

        // 取消按钮
        var cancelBtn = $('avatar-swap-cancel');
        if (cancelBtn) cancelBtn.onclick = function () { closeDialog(); };

        // Tab 切换
        var tabs = dialogEl.querySelectorAll('.avatar-swap-tab');
        tabs.forEach(function (tab) {
            tab.onclick = function () {
                state.currentTab = tab.dataset.tab;
                state.selectedAvatar = null;
                tabs.forEach(function (t) { t.classList.remove('active'); });
                tab.classList.add('active');
                renderGrid();
                updateSendBtn();
            };
        });

        // 发送按钮
        var sendBtn = $('avatar-swap-send');
        if (sendBtn) sendBtn.onclick = function () { sendInvite(); };

        // 动画显示
        requestAnimationFrame(function () {
            overlayEl.classList.add('show');
        });

        // 渲染网格
        renderGrid();
    }

    function closeDialog() {
        if (overlayEl) {
            overlayEl.classList.remove('show');
            setTimeout(function () {
                if (overlayEl && overlayEl.parentNode) {
                    overlayEl.parentNode.removeChild(overlayEl);
                }
                overlayEl = null;
                dialogEl = null;
            }, 250);
        }
    }

    // ========== 打开弹窗 ==========
    function open() {
        loadData();
        state.currentTab = 'mine';
        state.selectedAvatar = null;
        createDialog();
    }

    // ========== 注册到加号菜单（MutationObserver 方式） ==========
    var attachMenuObserver = null;

    function registerToAttachMenu() {
        // 使用 MutationObserver 监听 #chat-attach-menu 被添加到 DOM
        if (attachMenuObserver) return; // 已注册

        attachMenuObserver = new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var added = mutations[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                    var node = added[j];
                    // 检查是否是 chat-attach-menu 或包含它
                    var menu = null;
                    if (node.id === 'chat-attach-menu') {
                        menu = node;
                    } else if (node.querySelector && node.querySelector('#chat-attach-menu')) {
                        menu = node.querySelector('#chat-attach-menu');
                    }
                    if (menu) {
                        injectAvatarButton(menu);
                    }
                }
            }
        });

        attachMenuObserver.observe(document.body, { childList: true, subtree: true });

        // 也检查当前是否已有菜单（可能在 observer 注册前就创建了）
        var existing = document.getElementById('chat-attach-menu');
        if (existing) injectAvatarButton(existing);
    }

    // 向已有的加号菜单注入「换头像」按钮
    function injectAvatarButton(menu) {
        if (!menu || menu.querySelector('[data-action="avatar-swap"]')) return;

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.action = 'avatar-swap';
        btn.innerHTML = '<i class="fas fa-user-circle"></i><span>换头像</span>';

        // 插入到第一个位置
        if (menu.firstChild) {
            menu.insertBefore(btn, menu.firstChild);
        } else {
            menu.appendChild(btn);
        }

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (menu.parentNode) menu.parentNode.removeChild(menu);
            open();
        }, true);
    }

    // ========== 对方主动自己换头像（每天一次） ==========
    function partnerAutoChangeOwnAvatar() {
        // 从对方的头像库随机选一个
        if (!state.partnerLibrary || state.partnerLibrary.length === 0) return;

        // 检查今天是否已经换过
        var today = new Date().toDateString();
        var lastChange = state.lastOwnAvatarChange;
        if (lastChange && new Date(lastChange).toDateString() === today) return;

        // 随机选一个头像
        var available = state.partnerLibrary.filter(function (item) {
            return item.src;
        });
        if (available.length === 0) return;

        var chosen = randItem(available);
        if (!chosen) return;

        // 更新对方头像
        updateAvatarDisplay('partner', chosen.src);

        // 记录换头像日期
        state.lastOwnAvatarChange = Date.now();
        saveData();

        // 发送一条聊天消息
        var cardReply = getRandomCardReply();
        setTimeout(function () {
            addChatMessage({
                id: Date.now() + Math.floor(Math.random() * 1000),
                sender: getPartnerName(),
                text: '换了个新头像 ' + (cardReply || ''),
                timestamp: new Date(),
                status: 'read',
                favorited: false,
                note: null,
                type: 'normal'
            });
        }, 800 + Math.random() * 1500);
    }

    // ========== 初始化 ==========
    function init() {
        loadData();
        bindInviteCardEvents();
        registerToAttachMenu();
    }

    // ========== 自动初始化 ==========
    function autoInit() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () {
                setTimeout(init, 500);
            });
        } else {
            setTimeout(init, 500);
        }
    }

    // ========== 暴露全局 ==========
    window.AvatarSwapApp = {
        __loaded: true,
        init: init,
        open: open,
        close: closeDialog,
        renderInviteCardHTML: renderInviteCardHTML,
        partnerAutoInviteMe: partnerAutoInviteMe,
        partnerAutoChangeOwnAvatar: partnerAutoChangeOwnAvatar,
    };

    autoInit();

})();
