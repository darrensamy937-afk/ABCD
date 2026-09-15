// ========== 免打扰模块 ==========
(function () {
    'use strict';

    var STORAGE_KEY = 'dnd_settings';
    var PARTNER_DND_KEY = 'partner_dnd_state';

    // 用户免打扰设置
    var userDND = {
        enabled: false,
        startTime: '23:00',
        endTime: '07:00'
    };

    // 对方免打扰状态
    var partnerDND = {
        enabled: false,
        startTime: '',
        endTime: ''
    };

    // 加载设置
    function loadUserDND() {
        try {
            var saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                var d = JSON.parse(saved);
                userDND.enabled = !!d.enabled;
                userDND.startTime = d.startTime || '23:00';
                userDND.endTime = d.endTime || '07:00';
            }
        } catch (e) {}
    }

    function saveUserDND() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(userDND));
        } catch (e) {}
    }

    function loadPartnerDND() {
        try {
            var saved = localStorage.getItem(PARTNER_DND_KEY);
            if (saved) {
                var d = JSON.parse(saved);
                partnerDND.enabled = !!d.enabled;
                partnerDND.startTime = d.startTime || '';
                partnerDND.endTime = d.endTime || '';
            }
        } catch (e) {}
    }

    function savePartnerDND() {
        try {
            localStorage.setItem(PARTNER_DND_KEY, JSON.stringify(partnerDND));
        } catch (e) {}
    }

    // 判断当前时间是否在免打扰时段内
    function isInDNDPeriod(startTime, endTime) {
        if (!startTime || !endTime) return false;
        var now = new Date();
        var nowMin = now.getHours() * 60 + now.getMinutes();
        var startMin = timeToMinutes(startTime);
        var endMin = timeToMinutes(endTime);

        if (startMin <= endMin) {
            return nowMin >= startMin && nowMin < endMin;
        } else {
            // 跨午夜，如 23:00 - 07:00
            return nowMin >= startMin || nowMin < endMin;
        }
    }

    function timeToMinutes(t) {
        var parts = t.split(':');
        return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }

    // 用户免打扰是否生效
    function isUserDNDActive() {
        if (!userDND.enabled) return false;
        return isInDNDPeriod(userDND.startTime, userDND.endTime);
    }

    // 对方免打扰是否生效
    function isPartnerDNDActive() {
        if (!partnerDND.enabled) return false;
        return isInDNDPeriod(partnerDND.startTime, partnerDND.endTime);
    }

    // 获取免打扰设置
    function getUserDNDSettings() {
        return { enabled: userDND.enabled, startTime: userDND.startTime, endTime: userDND.endTime };
    }

    function getPartnerDNDState() {
        return { enabled: partnerDND.enabled, startTime: partnerDND.startTime, endTime: partnerDND.endTime };
    }

    // 更新用户免打扰设置
    function setUserDND(enabled, startTime, endTime) {
        userDND.enabled = !!enabled;
        userDND.startTime = startTime || '23:00';
        userDND.endTime = endTime || '07:00';
        saveUserDND();
        updateDNDIndicators();
    }

    // 对方开启免打扰（随机时间段）
    function partnerEnableDND() {
        // 随机生成免打扰时间段，2-4小时
        var now = new Date();
        var startHour = now.getHours();
        var startMin = now.getMinutes();
        var durationHours = 2 + Math.floor(Math.random() * 3); // 2-4小时
        var endTotalMin = startHour * 60 + startMin + durationHours * 60;
        var endHour = Math.floor(endTotalMin / 60) % 24;
        var endMin = endTotalMin % 60;

        partnerDND.enabled = true;
        partnerDND.startTime = pad(startHour) + ':' + pad(startMin);
        partnerDND.endTime = pad(endHour) + ':' + pad(endMin);
        savePartnerDND();
        updateDNDIndicators();

        // 发送提示消息
        if (typeof window.addMessage === 'function') {
            window.addMessage({
                id: Date.now() + Math.random(),
                sender: 'partner',
                text: '我先休息会儿，等下再聊~',
                timestamp: new Date(),
                status: 'received',
                favorited: false,
                note: null,
                type: 'normal'
            });
        }

        // 发送免打扰恢复消息（定时结束后）
        var durationMs = durationHours * 60 * 60 * 1000;
        setTimeout(function () {
            partnerDisableDND();
            // 发送恢复消息
            if (typeof window.addMessage === 'function') {
                window.addMessage({
                    id: Date.now() + Math.random(),
                    sender: 'partner',
                    text: '我回来啦～刚才休息了一下',
                    timestamp: new Date(),
                    status: 'received',
                    favorited: false,
                    note: null,
                    type: 'normal'
                });
            }
        }, durationMs);
    }

    function partnerDisableDND() {
        partnerDND.enabled = false;
        partnerDND.startTime = '';
        partnerDND.endTime = '';
        savePartnerDND();
        updateDNDIndicators();
    }

    function pad(n) { return n < 10 ? '0' + n : '' + n; }

    // 更新头像上的免打扰标识
    function updateDNDIndicators() {
        // 用户头像免打扰标识
        var myAvatar = document.getElementById('my-avatar');
        if (myAvatar) {
            var parent = myAvatar.parentElement;
            if (parent) {
                if (isUserDNDActive()) {
                    parent.classList.add('dnd-active');
                } else {
                    parent.classList.remove('dnd-active');
                }
            }
        }

        // 对方头像免打扰标识
        var partnerAvatar = document.querySelector('.partner-info .avatar, #partner-avatar');
        if (partnerAvatar) {
            var p = partnerAvatar.closest('.avatar-container') || partnerAvatar.parentElement;
            if (p) {
                if (isPartnerDNDActive()) {
                    p.classList.add('dnd-active');
                } else {
                    p.classList.remove('dnd-active');
                }
            }
        }

        // 更新聊天消息中的头像标识
        var msgAvatars = document.querySelectorAll('.message-avatar');
        msgAvatars.forEach(function (avatar) {
            var msg = avatar.closest('.message-item');
            if (!msg) return;
            var isPartnerMsg = msg.classList.contains('partner-message') || !msg.classList.contains('user-message');
            if (isPartnerMsg) {
                if (isPartnerDNDActive()) {
                    avatar.classList.add('dnd-active-mini');
                } else {
                    avatar.classList.remove('dnd-active-mini');
                }
            }
        });
    }

    // 打开免打扰设置弹窗
    function openDNDSettings() {
        var existing = document.getElementById('dnd-settings-modal');
        if (existing) {
            existing.style.display = 'flex';
            updateDNDSettingsUI();
            return;
        }

        var modal = document.createElement('div');
        modal.id = 'dnd-settings-modal';
        modal.className = 'dnd-modal';
        modal.innerHTML = `
            <div class="dnd-modal-box">
                <div class="dnd-modal-header">
                    <span>免打扰设置</span>
                    <button class="dnd-modal-close" type="button">&times;</button>
                </div>
                <div class="dnd-modal-body">
                    <div class="dnd-setting-row">
                        <div class="dnd-setting-info">
                            <div class="dnd-setting-title">开启免打扰</div>
                            <div class="dnd-setting-desc">在设定时段内对方不会收到消息提醒</div>
                        </div>
                        <label class="dnd-switch">
                            <input type="checkbox" id="dnd-enabled-toggle">
                            <span class="dnd-slider"></span>
                        </label>
                    </div>
                    <div class="dnd-time-section" id="dnd-time-section">
                        <div class="dnd-time-row">
                            <div class="dnd-time-label">开始时间</div>
                            <input type="time" id="dnd-start-time" class="dnd-time-input">
                        </div>
                        <div class="dnd-time-row">
                            <div class="dnd-time-label">结束时间</div>
                            <input type="time" id="dnd-end-time" class="dnd-time-input">
                        </div>
                        <div class="dnd-time-hint">免打扰时段内，对方不会主动发消息，你的消息对方也不会回复</div>
                    </div>
                    <button class="dnd-save-btn" type="button">保存设置</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // 绑定事件
        modal.querySelector('.dnd-modal-close').addEventListener('click', function () {
            modal.style.display = 'none';
        });
        modal.addEventListener('click', function (e) {
            if (e.target === modal) modal.style.display = 'none';
        });

        var toggle = modal.querySelector('#dnd-enabled-toggle');
        toggle.addEventListener('change', function () {
            var timeSection = modal.querySelector('#dnd-time-section');
            timeSection.style.opacity = toggle.checked ? '1' : '0.5';
            timeSection.style.pointerEvents = toggle.checked ? 'auto' : 'none';
        });

        modal.querySelector('.dnd-save-btn').addEventListener('click', function () {
            var enabled = modal.querySelector('#dnd-enabled-toggle').checked;
            var startTime = modal.querySelector('#dnd-start-time').value || '23:00';
            var endTime = modal.querySelector('#dnd-end-time').value || '07:00';
            setUserDND(enabled, startTime, endTime);
            modal.style.display = 'none';
            if (typeof showToast === 'function') {
                showToast(enabled ? '免打扰已开启' : '免打扰已关闭');
            }
        });

        updateDNDSettingsUI();
    }

    function updateDNDSettingsUI() {
        var modal = document.getElementById('dnd-settings-modal');
        if (!modal) return;
        modal.querySelector('#dnd-enabled-toggle').checked = userDND.enabled;
        modal.querySelector('#dnd-start-time').value = userDND.startTime;
        modal.querySelector('#dnd-end-time').value = userDND.endTime;
        var timeSection = modal.querySelector('#dnd-time-section');
        timeSection.style.opacity = userDND.enabled ? '1' : '0.5';
        timeSection.style.pointerEvents = userDND.enabled ? 'auto' : 'none';
    }

    // 对方随机开启免打扰（由AI引擎调用）
    function checkPartnerAutoDND() {
        // 如果免打扰正在生效中，不再触发
        if (isPartnerDNDActive()) return false;

        // 如果 enabled 但已过期（时间段已过），先清除
        if (partnerDND.enabled && !isInDNDPeriod(partnerDND.startTime, partnerDND.endTime)) {
            partnerDisableDND();
        }

        var s = {};
        if (typeof window.settings !== 'undefined') s = window.settings;
        var chance = s.partnerDNDChance !== undefined ? s.partnerDNDChance : 10; // 默认10%概率
        if (Math.random() * 100 < chance) {
            partnerEnableDND();
            return true;
        }
        return false;
    }

    // 初始化设置滑块
    function initSettingsSlider() {
        var slider = document.getElementById('partner-dnd-chance-slider');
        var valueEl = document.getElementById('partner-dnd-chance-value');
        if (!slider || slider.dataset.dndReady) return;
        slider.dataset.dndReady = '1';

        // 读取保存的值
        var saved = 10;
        try {
            var v = localStorage.getItem('partnerDNDChance');
            if (v !== null) saved = parseInt(v) || 10;
        } catch (e) {}

        slider.value = saved;
        if (valueEl) valueEl.textContent = saved + '%';

        // 同步到 settings
        if (typeof window.settings !== 'undefined') {
            window.settings.partnerDNDChance = saved;
        }

        slider.addEventListener('input', function () {
            var v = parseInt(slider.value) || 0;
            if (valueEl) valueEl.textContent = v + '%';
        });

        slider.addEventListener('change', function () {
            var v = parseInt(slider.value) || 0;
            try {
                localStorage.setItem('partnerDNDChance', String(v));
            } catch (e) {}
            if (typeof window.settings !== 'undefined') {
                window.settings.partnerDNDChance = v;
            }
        });
    }

    // 初始化
    function init() {
        loadUserDND();
        loadPartnerDND();

        // 添加头像免打扰标识的CSS
        if (!document.getElementById('dnd-style')) {
            var style = document.createElement('style');
            style.id = 'dnd-style';
            style.textContent = `
                .dnd-modal{
                    position:fixed;top:0;left:0;width:100%;height:100%;
                    background:rgba(0,0,0,0.5);z-index:9999;
                    display:flex;align-items:center;justify-content:center;
                }
                .dnd-modal-box{
                    width:min(320px, 90vw);
                    background:var(--secondary-bg, #fff);
                    border-radius:16px;
                    overflow:hidden;
                }
                .dnd-modal-header{
                    padding:14px 16px;
                    font-size:15px;font-weight:600;
                    border-bottom:1px solid var(--border-color);
                    display:flex;align-items:center;justify-content:space-between;
                }
                .dnd-modal-close{
                    border:none;background:none;font-size:20px;
                    color:var(--text-secondary);cursor:pointer;
                }
                .dnd-modal-body{
                    padding:16px;
                }
                .dnd-setting-row{
                    display:flex;align-items:center;justify-content:space-between;
                    padding:10px 0;
                }
                .dnd-setting-info{flex:1;}
                .dnd-setting-title{font-size:14px;font-weight:500;}
                .dnd-setting-desc{font-size:11px;color:var(--text-secondary);margin-top:2px;}
                .dnd-switch{
                    position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0;
                }
                .dnd-switch input{opacity:0;width:0;height:0;}
                .dnd-slider{
                    position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;
                    background:#ccc;transition:.3s;border-radius:24px;
                }
                .dnd-slider:before{
                    position:absolute;content:"";height:18px;width:18px;
                    left:3px;bottom:3px;background:white;
                    transition:.3s;border-radius:50%;
                }
                .dnd-switch input:checked + .dnd-slider{
                    background:var(--accent-color, #07c160);
                }
                .dnd-switch input:checked + .dnd-slider:before{
                    transform:translateX(20px);
                }
                .dnd-time-section{
                    margin-top:12px;padding:12px;
                    background:var(--primary-bg, #f5f5f5);
                    border-radius:12px;
                    transition:opacity 0.3s;
                }
                .dnd-time-row{
                    display:flex;align-items:center;justify-content:space-between;
                    padding:6px 0;
                }
                .dnd-time-label{font-size:13px;}
                .dnd-time-input{
                    padding:6px 10px;border:1px solid var(--border-color);
                    border-radius:8px;font-size:14px;
                    background:var(--secondary-bg, #fff);
                    color:var(--text-primary);
                }
                .dnd-time-hint{
                    font-size:11px;color:var(--text-secondary);
                    margin-top:8px;line-height:1.4;
                }
                .dnd-save-btn{
                    width:100%;margin-top:16px;padding:10px;
                    background:var(--accent-color, #07c160);
                    color:#fff;border:none;border-radius:10px;
                    font-size:14px;font-weight:500;cursor:pointer;
                }
                /* 头像免打扰标识 */
                .avatar-container.dnd-active{
                    position:relative;
                }
                .avatar-container.dnd-active::after{
                    content:"🌙";
                    position:absolute;bottom:-2px;right:-2px;
                    width:18px;height:18px;
                    background:var(--secondary-bg, #fff);
                    border-radius:50%;
                    display:flex;align-items:center;justify-content:center;
                    font-size:10px;
                    border:2px solid var(--secondary-bg, #fff);
                    z-index:2;
                }
                .message-avatar.dnd-active-mini{
                    position:relative;
                }
                .message-avatar.dnd-active-mini::after{
                    content:"🌙";
                    position:absolute;bottom:-1px;right:-1px;
                    font-size:8px;
                    background:var(--secondary-bg, #fff);
                    border-radius:50%;
                    width:12px;height:12px;
                    display:flex;align-items:center;justify-content:center;
                    z-index:2;
                }
                /* 免打扰提示条 */
                .dnd-notice-bar{
                    padding:6px 12px;
                    background:rgba(var(--accent-color-rgb, 7,193,96),0.1);
                    color:var(--accent-color, #07c160);
                    font-size:12px;
                    text-align:center;
                    border-radius:8px;
                    margin:8px 12px;
                }
            `;
            document.head.appendChild(style);
        }

        // 定时检查免打扰状态更新
        setInterval(updateDNDIndicators, 60000);

        // 初始更新标识
        setTimeout(updateDNDIndicators, 500);

        // 初始化设置滑块（延迟到DOM就绪）
        setTimeout(initSettingsSlider, 800);
    }

    // 暴露到全局
    window.DNDApp = {
        init: init,
        openDNDSettings: openDNDSettings,
        isUserDNDActive: isUserDNDActive,
        isPartnerDNDActive: isPartnerDNDActive,
        getUserDNDSettings: getUserDNDSettings,
        getPartnerDNDState: getPartnerDNDState,
        setUserDND: setUserDND,
        partnerEnableDND: partnerEnableDND,
        partnerDisableDND: partnerDisableDND,
        checkPartnerAutoDND: checkPartnerAutoDND,
        updateDNDIndicators: updateDNDIndicators
    };

    // 自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
