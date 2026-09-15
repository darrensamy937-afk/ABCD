/**
 * 标点符号库 v2
 * - 在自定义回复中增加标点符号库（批量输入，每行一个）
 * - 聊天节奏中增加"标点符号拼字卡"开关，打开后自动触发
 * - 对方会随机使用标点符号作为拼字卡中间的间隔符号
 */
(function() {
    'use strict';

    var STORAGE_KEY = 'punctuation_library_v1';
    var SETTINGS_KEY = 'punctuation_settings_v1';

    // 会话隔离的存储键生成函数
    function getSessionKey(base) {
        var sid = (typeof window !== 'undefined' && window.SESSION_ID) ? window.SESSION_ID : 'default';
        return 'sess_' + sid + '_' + base;
    }

    // 默认标点符号
    var DEFAULT_PUNCTUATIONS = ['，', '。', '！', '？', '～', '…', '、', '·'];

    var punctuationLibrary = [];
    var settings = {
        punctCardEnabled: false  // 标点符号拼字卡开关
    };

    function loadData() {
        try {
            var saved = localStorage.getItem(getSessionKey(STORAGE_KEY));
            if (saved) {
                var d = JSON.parse(saved);
                if (Array.isArray(d)) {
                    punctuationLibrary = d;
                }
            }
            if (punctuationLibrary.length === 0) {
                punctuationLibrary = DEFAULT_PUNCTUATIONS.slice();
            }
        } catch(e) {
            punctuationLibrary = DEFAULT_PUNCTUATIONS.slice();
        }

        // 加载设置
        try {
            var s = localStorage.getItem(getSessionKey(SETTINGS_KEY));
            if (s) {
                var sd = JSON.parse(s);
                Object.assign(settings, sd);
            }
        } catch(e) {}

        // 导入后需要重新渲染列表
        try {
            renderPunctuationList();
        } catch(e) {}
    }

    function saveData() {
        try {
            localStorage.setItem(getSessionKey(STORAGE_KEY), JSON.stringify(punctuationLibrary));
        } catch(e) {}
    }

    function saveSettings() {
        try {
            localStorage.setItem(getSessionKey(SETTINGS_KEY), JSON.stringify(settings));
        } catch(e) {}
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

    /**
     * 触发标点符号拼字卡：
     * 从字卡库随机抽取几条，中间用标点符号间隔，发送给用户
     */
    function triggerPunctuationCard() {
        var customReplies = [];
        try {
            if (typeof window.customReplies !== 'undefined' && Array.isArray(window.customReplies)) {
                customReplies = window.customReplies;
            }
        } catch(e) {}

        if (customReplies.length === 0) {
            sendPartnerMessage('字卡库还是空的，先添加一些字卡吧～');
            return;
        }

        // 随机抽取 2-4 张字卡
        var cardCount = 2 + Math.floor(Math.random() * 3);
        if (cardCount > customReplies.length) cardCount = customReplies.length;

        // 随机抽取不重复的字卡
        var shuffled = customReplies.slice();
        for (var i = shuffled.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = shuffled[i];
            shuffled[i] = shuffled[j];
            shuffled[j] = tmp;
        }
        var pickedCards = shuffled.slice(0, cardCount);

        // 随机选一个标点符号
        var punct = punctuationLibrary.length > 0
            ? punctuationLibrary[Math.floor(Math.random() * punctuationLibrary.length)]
            : '，';

        // 用标点符号拼接
        var combined = pickedCards.join(punct);

        // 发送系统提示
        var partnerName = getPartnerName();
        sendSystemMessage(partnerName + ' 使用了标点符号拼字卡（间隔符：' + punct + '）');

        // 发送拼接后的消息
        setTimeout(function() {
            sendPartnerMessage(combined);
        }, 800);
    }

    /**
     * 渲染标点符号库面板（在回复库中标点符号tab）
     * 批量输入模式：textarea 每行一个标点符号
     */
    function renderPunctuationList(container) {
        // 未传入容器时，尝试从 DOM 查找标点面板容器；
        // 面板尚未打开（无对应 DOM 元素）则安全跳过，不报错
        if (!container) {
            try {
                container = document.getElementById('custom-replies-list');
            } catch(e) { container = null; }
        }
        if (!container) return;

        var html = '';
        html += '<div class="punctuation-lib-section">';
        html += '<div class="punctuation-lib-header">';
        html += '<span>标点符号库</span>';
        html += '<span class="punctuation-lib-count">' + punctuationLibrary.length + ' 个</span>';
        html += '</div>';

        // 批量输入 textarea
        html += '<div class="punctuation-batch-input">';
        html += '<textarea id="punct-batch-textarea" rows="5" placeholder="批量输入标点符号，每行一个…">' + punctuationLibrary.join('\n') + '</textarea>';
        html += '</div>';

        // 操作按钮
        html += '<div class="punctuation-batch-actions">';
        html += '<button class="punct-batch-reset-btn" id="punct-reset-btn"><i class="fas fa-undo"></i> 恢复默认</button>';
        html += '<button class="punct-batch-save-btn" id="punct-save-btn"><i class="fas fa-check"></i> 保存</button>';
        html += '</div>';

        // 预览区域
        html += '<div class="punctuation-preview">';
        html += '<div class="punctuation-preview-label">预览</div>';
        html += '<div class="punctuation-chips" id="punct-chips-preview">';
        punctuationLibrary.forEach(function(p) {
            html += '<span class="punct-chip">' + escapeHtml(p) + '</span>';
        });
        html += '</div>';
        html += '</div>';

        // 提示
        html += '<div class="punctuation-lib-tip">';
        html += '<i class="fas fa-info-circle"></i> 每行一个标点符号，保存后自动去重';
        html += '</div>';

        // 手动触发按钮
        html += '<div class="punctuation-lib-action">';
        html += '<button class="punctuation-trigger-btn" id="punct-trigger-btn"><i class="fas fa-magic"></i> 使用标点符号拼字卡</button>';
        html += '</div>';

        html += '</div>';
        container.innerHTML = html;

        // 绑定事件
        var textarea = container.querySelector('#punct-batch-textarea');
        var saveBtn = container.querySelector('#punct-save-btn');
        var resetBtn = container.querySelector('#punct-reset-btn');
        var triggerBtn = container.querySelector('#punct-trigger-btn');
        var preview = container.querySelector('#punct-chips-preview');

        // 实时预览
        if (textarea && preview) {
            textarea.addEventListener('input', function() {
                var lines = this.value.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
                // 去重
                var unique = [];
                var seen = {};
                for (var i = 0; i < lines.length; i++) {
                    if (!seen[lines[i]]) {
                        seen[lines[i]] = true;
                        unique.push(lines[i]);
                    }
                }
                preview.innerHTML = unique.map(function(p) {
                    return '<span class="punct-chip">' + escapeHtml(p) + '</span>';
                }).join('');
            });
        }

        // 保存
        if (saveBtn && textarea) {
            saveBtn.addEventListener('click', function() {
                var lines = textarea.value.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
                // 去重
                var unique = [];
                var seen = {};
                for (var i = 0; i < lines.length; i++) {
                    if (!seen[lines[i]]) {
                        seen[lines[i]] = true;
                        unique.push(lines[i]);
                    }
                }
                if (unique.length === 0) {
                    if (typeof showNotification === 'function') {
                        showNotification('至少保留一个标点符号', 'error');
                    }
                    return;
                }
                punctuationLibrary = unique;
                saveData();
                renderPunctuationList(container);
                if (typeof showNotification === 'function') {
                    showNotification('已保存 ' + punctuationLibrary.length + ' 个标点符号', 'success');
                }
            });
        }

        // 恢复默认
        if (resetBtn && textarea) {
            resetBtn.addEventListener('click', function() {
                if (!confirm('确定恢复默认标点符号吗？当前内容将被覆盖。')) return;
                punctuationLibrary = DEFAULT_PUNCTUATIONS.slice();
                saveData();
                renderPunctuationList(container);
                if (typeof showNotification === 'function') {
                    showNotification('已恢复默认', 'success');
                }
            });
        }

        // 触发按钮
        if (triggerBtn) {
            triggerBtn.addEventListener('click', function() {
                triggerPunctuationCard();
                // 关闭回复库弹窗
                var modal = document.getElementById('custom-replies-modal');
                if (modal && typeof hideModal === 'function') hideModal(modal);
            });
        }
    }

    // 标点拼字卡开关：是否启用
    function isPunctCardEnabled() {
        return !!settings.punctCardEnabled;
    }

    function setPunctCardEnabled(enabled) {
        settings.punctCardEnabled = !!enabled;
        saveSettings();
    }

    // 注入CSS
    if (!document.getElementById('punct-lib-style')) {
        var style = document.createElement('style');
        style.id = 'punct-lib-style';
        style.textContent = `
            .punctuation-lib-section { padding: 8px; }
            .punctuation-lib-header {
                display: flex; justify-content: space-between; align-items: center;
                padding: 8px 4px; font-size: 14px; font-weight: 600;
                color: var(--text-primary, #333);
            }
            .punctuation-lib-count {
                font-size: 12px; color: var(--text-secondary, #999); font-weight: 400;
            }
            .punctuation-batch-input {
                padding: 8px 4px;
            }
            .punctuation-batch-input textarea {
                width: 100%; min-height: 120px; padding: 12px 14px;
                border: 1.5px solid var(--border-color, #e0e0e0);
                border-radius: 12px; background: var(--primary-bg, #f5f5f5);
                color: var(--text-primary, #333); font-size: 15px; line-height: 1.6;
                resize: vertical; box-sizing: border-box;
                font-family: inherit;
            }
            .punctuation-batch-input textarea:focus {
                outline: none; border-color: var(--accent-color, #07c160);
                background: var(--secondary-bg, #fff);
            }
            .punctuation-batch-actions {
                display: flex; gap: 8px; padding: 8px 4px;
            }
            .punct-batch-reset-btn {
                flex: 1; padding: 10px; border: 1.5px solid var(--border-color, #e0e0e0);
                background: var(--primary-bg, #f5f5f5); color: var(--text-primary, #333);
                border-radius: 10px; font-size: 13px; cursor: pointer;
                display: flex; align-items: center; justify-content: center; gap: 6px;
            }
            .punct-batch-save-btn {
                flex: 1; padding: 10px; background: var(--accent-color, #07c160);
                color: #fff; border: none; border-radius: 10px; font-size: 13px; cursor: pointer;
                display: flex; align-items: center; justify-content: center; gap: 6px;
            }
            .punct-batch-save-btn:hover { opacity: 0.9; }
            .punctuation-preview {
                margin-top: 12px; padding: 12px;
                background: var(--primary-bg, #f5f5f5); border-radius: 12px;
            }
            .punctuation-preview-label {
                font-size: 12px; color: var(--text-secondary, #999); margin-bottom: 8px;
            }
            .punctuation-chips {
                display: flex; flex-wrap: wrap; gap: 6px;
            }
            .punct-chip {
                padding: 6px 10px; background: var(--secondary-bg, #fff);
                border: 1px solid var(--border-color, #e0e0e0); border-radius: 8px;
                font-size: 15px; color: var(--text-primary, #333);
            }
            .punctuation-lib-tip {
                margin-top: 12px; padding: 10px 12px;
                background: rgba(7, 193, 96, 0.06); border-radius: 10px;
                font-size: 12px; color: var(--text-secondary, #999);
                line-height: 1.6;
            }
            .punctuation-lib-tip i {
                color: var(--accent-color, #07c160); margin-right: 4px;
            }
            .punctuation-lib-action {
                margin-top: 12px;
            }
            .punctuation-trigger-btn {
                width: 100%; padding: 12px; background: var(--accent-color, #07c160);
                color: #fff; border: none; border-radius: 12px; font-size: 14px;
                cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
                font-weight: 500;
            }
            .punctuation-trigger-btn:hover { opacity: 0.9; }
        `;
        document.head.appendChild(style);
    }

    function init() {
        loadData();
        try {
            renderPunctuationList();
        } catch(e) {}
    }

    window.PunctuationLib = {
        getLibrary: function() { return punctuationLibrary; },
        getRandom: function() {
            if (punctuationLibrary.length === 0) return '，';
            return punctuationLibrary[Math.floor(Math.random() * punctuationLibrary.length)];
        },
        triggerPunctuationCard: triggerPunctuationCard,
        renderPunctuationList: renderPunctuationList,
        saveData: saveData,
        reload: function() { loadData(); },
        isPunctCardEnabled: isPunctCardEnabled,
        setPunctCardEnabled: setPunctCardEnabled,
        getSettings: function() { return Object.assign({}, settings); }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 500); });
    } else {
        setTimeout(init, 500);
    }

    // 会话切换时重新加载数据
    window.addEventListener('sessionChanged', function() {
        setTimeout(function() { loadData(); }, 100);
    });
})();
