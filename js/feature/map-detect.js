/**
 * 地图检测 v2
 * - 加号弹窗增加"地图"按钮
 * - 方形小地图：用户设置地点，可拖动调整位置
 * - 对方随机在地点之间移动
 * - 对方随机主动发送位置（概率触发，与拍一拍一致）
 * - 检测：输入自己位置 → 雷达坐标系 → 检测对方方位和距离
 */
(function() {
    'use strict';

    var STORAGE_KEY = 'map_detect_settings_v1';

    // 会话隔离的存储键生成函数
    function getSessionKey(base) {
        var sid = (typeof window !== 'undefined' && window.SESSION_ID) ? window.SESSION_ID : 'default';
        return 'sess_' + sid + '_' + base;
    }

    var settings = {
        locations: [],        // 地点列表 [{name, x, y}]
        partnerCurrentLocation: null,  // 对方当前所在地点名
        partnerLocationHistory: []     // 对方位置历史
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

    function escapeHtml(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    function getPartnerName() {
        try {
            if (typeof window.settings !== 'undefined' && window.settings.partnerName) return window.settings.partnerName;
        } catch(e) {}
        return 'TA';
    }

    function getPartnerAvatar() {
        try {
            if (typeof window.settings !== 'undefined' && window.settings.partnerAvatar) return window.settings.partnerAvatar;
        } catch(e) {}
        return '';
    }

    function getMyAvatar() {
        try {
            if (typeof window.settings !== 'undefined' && window.settings.myAvatar) return window.settings.myAvatar;
        } catch(e) {}
        return '';
    }

    function showToast(msg) {
        if (typeof window.showNotification === 'function') {
            window.showNotification(msg, 'info', 2000);
        } else if (typeof window.showToast === 'function') {
            window.showToast(msg);
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

    function sendLocationCardMessage(locationName, address) {
        try {
            if (typeof window.addMessage === 'function') {
                var cardId = 'loc_' + Date.now() + '_' + Math.random();
                window.addMessage({
                    id: Date.now() + Math.random(),
                    sender: 'partner',
                    text: '',
                    timestamp: new Date(),
                    status: 'received',
                    type: 'location-card',
                    locationCard: {
                        cardId: cardId,
                        name: locationName,
                        address: address || locationName,
                        time: new Date().toLocaleString()
                    },
                    favorited: false,
                    note: null
                });
            }
        } catch(e) {}
    }

    // ========== 地点管理 ==========
    function addLocation(name) {
        name = (name || '').trim();
        if (!name) return;
        if (settings.locations.some(function(l) { return l.name === name; })) return;
        // 随机生成坐标（在方形地图上的随机位置，留边距）
        settings.locations.push({
            name: name,
            x: 10 + Math.random() * 80,  // 10%-90%
            y: 10 + Math.random() * 80
        });
        saveData();
    }

    function removeLocation(index) {
        if (index >= 0 && index < settings.locations.length) {
            settings.locations.splice(index, 1);
            saveData();
        }
    }

    function updateLocationPosition(name, x, y) {
        var loc = settings.locations.find(function(l) { return l.name === name; });
        if (loc) {
            loc.x = Math.max(2, Math.min(98, x));
            loc.y = Math.max(2, Math.min(98, y));
            saveData();
        }
    }

    // 对方随机移动到新地点
    function partnerMoveToRandomLocation() {
        if (settings.locations.length === 0) return false;
        var available = settings.locations.filter(function(l) {
            return l.name !== settings.partnerCurrentLocation;
        });
        if (available.length === 0) {
            available = settings.locations.slice();
        }
        var newLoc = available[Math.floor(Math.random() * available.length)];
        settings.partnerCurrentLocation = newLoc.name;
        settings.partnerLocationHistory.push({
            name: newLoc.name,
            time: new Date().toISOString()
        });
        if (settings.partnerLocationHistory.length > 20) {
            settings.partnerLocationHistory = settings.partnerLocationHistory.slice(-20);
        }
        saveData();
        return true;
    }

    // 对方随机发送位置
    function partnerRandomSendLocation() {
        if (!partnerMoveToRandomLocation()) return;
        if (!settings.partnerCurrentLocation) return;
        var loc = settings.locations.find(function(l) {
            return l.name === settings.partnerCurrentLocation;
        });
        if (!loc) return;
        sendLocationCardMessage(loc.name, l.name);
    }

    // ========== 地图弹窗 ==========
    function openMapModal() {
        var overlay = $('map-detect-overlay');
        if (!overlay) {
            createMapOverlay();
        }
        overlay = $('map-detect-overlay');
        if (!overlay) return;
        overlay.style.display = 'flex';
        renderMap();
    }

    function closeMapModal() {
        var overlay = $('map-detect-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    function createMapOverlay() {
        var overlay = document.createElement('div');
        overlay.id = 'map-detect-overlay';
        overlay.className = 'map-detect-overlay';
        overlay.innerHTML = `
            <div class="map-detect-box">
                <div class="map-detect-header">
                    <button class="map-close-btn" id="map-close-btn"><i class="fas fa-times"></i></button>
                    <span class="map-title"><i class="fas fa-map-marked-alt"></i> 地图</span>
                    <button class="map-tab-btn active" id="map-tab-locations" data-tab="locations">地点管理</button>
                    <button class="map-tab-btn" id="map-tab-detect" data-tab="detect">位置检测</button>
                </div>
                <div class="map-detect-body">
                    <div class="map-panel" id="map-panel-locations" style="display:block;">
                        <div class="map-locations-section">
                            <div class="map-section-title">
                                <span>地点列表（拖动标记可调整位置）</span>
                            </div>
                            <div class="map-location-input-row">
                                <input type="text" id="map-loc-input" placeholder="输入地点名称（如：公司、家、咖啡厅）" maxlength="20">
                                <button id="map-loc-add-btn" class="map-loc-add-btn">添加</button>
                            </div>
                            <div class="map-loc-list" id="map-loc-list"></div>
                        </div>
                        <div class="map-canvas-section">
                            <div class="map-section-title">小地图</div>
                            <div class="mini-map-square" id="mini-map-canvas">
                                <div class="mini-map-grid-h"></div>
                                <div class="mini-map-grid-v"></div>
                                <div class="mini-map-inner" id="mini-map-inner"></div>
                            </div>
                            <div class="map-tip">提示：长按地点标记可拖动调整位置</div>
                        </div>
                    </div>
                    <div class="map-panel" id="map-panel-detect" style="display:none;">
                        <div class="map-detect-section">
                            <div class="map-section-title">先输入你所在的位置</div>
                            <div class="map-detect-input-row">
                                <input type="text" id="map-my-loc-input" placeholder="输入你所在的位置名称" maxlength="20">
                                <button id="map-detect-btn" class="map-detect-go-btn">开始检测</button>
                            </div>
                            <div class="radar-container" id="radar-container" style="display:none;">
                                <div class="radar-circle" id="radar-circle">
                                    <div class="radar-ring" style="width:100%;height:100%;"></div>
                                    <div class="radar-ring" style="width:66%;height:66%;"></div>
                                    <div class="radar-ring" style="width:33%;height:33%;"></div>
                                    <div class="radar-cross-h"></div>
                                    <div class="radar-cross-v"></div>
                                    <div class="radar-sweep" id="radar-sweep"></div>
                                    <div class="radar-center-avatar" id="radar-center-avatar"></div>
                                    <div class="radar-partner-marker" id="radar-partner-marker" style="display:none;">
                                        <div class="radar-partner-avatar" id="radar-partner-avatar"></div>
                                        <div class="radar-partner-label" id="radar-partner-label"></div>
                                    </div>
                                </div>
                                <div class="radar-info" id="radar-info"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        $('map-close-btn').onclick = closeMapModal;
        $('map-tab-locations').onclick = function() {
            $('map-tab-locations').classList.add('active');
            $('map-tab-detect').classList.remove('active');
            $('map-panel-locations').style.display = 'block';
            $('map-panel-detect').style.display = 'none';
            renderMap();
        };
        $('map-tab-detect').onclick = function() {
            $('map-tab-locations').classList.remove('active');
            $('map-tab-detect').classList.add('active');
            $('map-panel-locations').style.display = 'none';
            $('map-panel-detect').style.display = 'block';
        };
        $('map-loc-add-btn').onclick = function() {
            var inp = $('map-loc-input');
            if (inp.value.trim()) {
                addLocation(inp.value.trim());
                inp.value = '';
                renderMap();
            }
        };
        $('map-loc-input').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                if (this.value.trim()) {
                    addLocation(this.value.trim());
                    this.value = '';
                    renderMap();
                }
            }
        });
        $('map-detect-btn').onclick = startDetection;
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closeMapModal();
        });
    }

    var _draggingLoc = null;
    var _dragMapEl = null;

    function renderMap() {
        // 渲染地点列表
        var listEl = $('map-loc-list');
        if (listEl) {
            var html = '';
            if (settings.locations.length === 0) {
                html = '<div class="map-empty">还没有地点，点击添加</div>';
            } else {
                settings.locations.forEach(function(loc, i) {
                    var isCurrent = settings.partnerCurrentLocation === loc.name;
                    html += '<div class="map-loc-item' + (isCurrent ? ' current' : '') + '">';
                    html += '<span class="map-loc-name">' + escapeHtml(loc.name) + '</span>';
                    if (isCurrent) html += '<span class="map-loc-badge">对方在此</span>';
                    html += '<button class="map-loc-del" data-idx="' + i + '"><i class="fas fa-trash"></i></button>';
                    html += '</div>';
                });
            }
            listEl.innerHTML = html;
            listEl.querySelectorAll('.map-loc-del').forEach(function(btn) {
                btn.onclick = function(e) {
                    e.stopPropagation();
                    removeLocation(parseInt(btn.dataset.idx));
                    renderMap();
                };
            });
        }

        // 渲染方形小地图
        var mapInner = $('mini-map-inner');
        var mapCanvas = $('mini-map-canvas');
        if (mapInner) {
            var html2 = '';
            settings.locations.forEach(function(loc) {
                var isCurrent = settings.partnerCurrentLocation === loc.name;
                html2 += '<div class="mini-map-marker' + (isCurrent ? ' partner-marker' : '') + '" ' +
                    'data-name="' + escapeHtml(loc.name) + '" ' +
                    'style="left:' + loc.x + '%;top:' + loc.y + '%;">' +
                    '<div class="mini-map-dot' + (isCurrent ? ' partner-dot' : '') + '"></div>' +
                    '<span class="mini-map-label">' + escapeHtml(loc.name) + '</span>' +
                    '</div>';
            });
            mapInner.innerHTML = html2;

            // 绑定拖动事件
            mapInner.querySelectorAll('.mini-map-marker').forEach(function(marker) {
                var pressTimer = null;
                var isDragging = false;
                var name = marker.dataset.name;

                function startDrag(e) {
                    e.preventDefault();
                    isDragging = true;
                    _draggingLoc = name;
                    _dragMapEl = mapCanvas;
                    marker.style.cursor = 'grabbing';
                    marker.style.zIndex = '999';
                }

                marker.addEventListener('mousedown', function(e) {
                    pressTimer = setTimeout(function() {
                        startDrag(e);
                    }, 200);
                });

                marker.addEventListener('touchstart', function(e) {
                    pressTimer = setTimeout(function() {
                        startDrag(e);
                    }, 300);
                }, { passive: true });

                marker.addEventListener('mouseup', function() {
                    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
                });
                marker.addEventListener('touchend', function() {
                    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
                });
                marker.addEventListener('mouseleave', function() {
                    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
                });
            });

            // 全局拖动监听
            function onMouseMove(e) {
                if (!_draggingLoc || !_dragMapEl) return;
                var rect = _dragMapEl.getBoundingClientRect();
                var clientX = e.touches ? e.touches[0].clientX : e.clientX;
                var clientY = e.touches ? e.touches[0].clientY : e.clientY;
                var x = ((clientX - rect.left) / rect.width) * 100;
                var y = ((clientY - rect.top) / rect.height) * 100;
                updateLocationPosition(_draggingLoc, x, y);

                var markerEl = mapInner.querySelector('[data-name="' + _draggingLoc.replace(/"/g, '\\"') + '"]');
                if (markerEl) {
                    markerEl.style.left = Math.max(2, Math.min(98, x)) + '%';
                    markerEl.style.top = Math.max(2, Math.min(98, y)) + '%';
                }
            }

            function onMouseUp() {
                if (_draggingLoc) {
                    _draggingLoc = null;
                    _dragMapEl = null;
                    var markers = mapInner.querySelectorAll('.mini-map-marker');
                    markers.forEach(function(m) {
                        m.style.cursor = 'grab';
                        m.style.zIndex = '';
                    });
                    // 更新列表中的位置状态
                    renderMap();
                }
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('touchmove', onMouseMove, { passive: true });
            document.addEventListener('mouseup', onMouseUp);
            document.addEventListener('touchend', onMouseUp);
        }
    }

    // ========== 位置检测（雷达） ==========
    function startDetection() {
        var myLocInput = $('map-my-loc-input');
        var myLocName = (myLocInput.value || '').trim();
        if (!myLocName) {
            showToast('请先输入你的位置');
            return;
        }

        // 确保对方有当前位置
        if (!settings.partnerCurrentLocation && settings.locations.length > 0) {
            partnerMoveToRandomLocation();
        }

        var radarContainer = $('radar-container');
        var partnerMarker = $('radar-partner-marker');
        var partnerAvatar = $('radar-partner-avatar');
        var partnerLabel = $('radar-partner-label');
        var radarInfo = $('radar-info');
        var centerAvatar = $('radar-center-avatar');

        if (!radarContainer) return;
        radarContainer.style.display = 'block';

        // 设置中心头像（用户）
        var myAvatar = getMyAvatar();
        if (myAvatar) {
            centerAvatar.style.backgroundImage = 'url(' + myAvatar + ')';
            centerAvatar.innerHTML = '';
        } else {
            centerAvatar.innerHTML = '<i class="fas fa-user"></i>';
            centerAvatar.style.backgroundImage = 'none';
        }
        centerAvatar.title = '我 @ ' + escapeHtml(myLocName);

        // 先隐藏对方标记
        partnerMarker.classList.remove('radar-marker-show');
        partnerMarker.style.display = 'none';
        radarInfo.innerHTML = '<div class="radar-info-item"><i class="fas fa-spinner fa-spin"></i> 扫描中...</div>';

        // 确定对方位置
        var partnerLoc = settings.locations.find(function(l) {
            return l.name === settings.partnerCurrentLocation;
        });

        // 计算对方在雷达上的相对位置
        var px, py;
        // 雷达安全半径（百分比），确保标记（头像+标签）完全在圆内
        // 雷达圆半径为50%，考虑标记大小留出约15%余量
        var safeRadius = 35;
        if (partnerLoc) {
            // 将方形坐标（0-100）映射到雷达安全半径内
            // 中心是 (50,50)，计算相对位置
            var dx = partnerLoc.x - 50;
            var dy = partnerLoc.y - 50;
            // 归一化到雷达 safeRadius 半径内
            px = 50 + (dx / 50) * safeRadius;
            py = 50 + (dy / 50) * safeRadius;
        } else {
            // 没有地点时随机生成（在安全半径内）
            var randAngle = Math.random() * Math.PI * 2;
            var randRadius = 10 + Math.random() * (safeRadius - 10);
            px = 50 + Math.cos(randAngle) * randRadius;
            py = 50 + Math.sin(randAngle) * randRadius;
        }

        // 动画延迟后显示对方
        setTimeout(function() {
            // 安全检查：确保元素仍然存在（用户可能已关闭弹窗）
            if (!document.getElementById('radar-partner-marker')) return;

            // 设置位置
            partnerMarker.style.left = px + '%';
            partnerMarker.style.top = py + '%';

            // 设置头像
            var pAvatar = getPartnerAvatar();
            if (pAvatar) {
                partnerAvatar.style.backgroundImage = 'url(' + pAvatar + ')';
                partnerAvatar.innerHTML = '';
            } else {
                partnerAvatar.innerHTML = '<i class="fas fa-user"></i>';
                partnerAvatar.style.backgroundImage = 'none';
            }

            partnerLabel.textContent = settings.partnerCurrentLocation || '未知地点';

            // 先移除动画类，再强制重排，再加回来，确保动画每次都重播
            partnerMarker.classList.remove('radar-marker-show');
            partnerMarker.style.display = 'flex';
            // 强制浏览器重排，使动画重播
            void partnerMarker.offsetWidth;
            partnerMarker.classList.add('radar-marker-show');

            // 计算方位和距离
            var dx2 = px - 50;
            var dy2 = py - 50;
            var distance = Math.sqrt(dx2 * dx2 + dy2 * dy2);
            var angle = Math.atan2(dy2, dx2);
            var angleDeg = angle * 180 / Math.PI;
            if (angleDeg < 0) angleDeg += 360;

            var direction = '';
            if (angleDeg >= 337.5 || angleDeg < 22.5) direction = '正东';
            else if (angleDeg < 67.5) direction = '东南';
            else if (angleDeg < 112.5) direction = '正南';
            else if (angleDeg < 157.5) direction = '西南';
            else if (angleDeg < 202.5) direction = '正西';
            else if (angleDeg < 247.5) direction = '西北';
            else if (angleDeg < 292.5) direction = '正北';
            else direction = '东北';

            var distanceDesc = distance < 15 ? '很近' : (distance < 30 ? '较近' : (distance < 45 ? '较远' : '很远'));

            // 显示信息
            radarInfo.innerHTML = '<div class="radar-info-item"><b>' + escapeHtml(settings.partnerCurrentLocation || '未知地点') + '</b></div>' +
                '<div class="radar-info-item">方位：' + direction + '</div>' +
                '<div class="radar-info-item">距离：' + distanceDesc + '</div>' +
                '<div class="radar-info-item radar-info-hint">点击对方头像查看详情</div>';

            // 点击对方标记查看详情
            partnerMarker.onclick = function() {
                var detailHtml = '<div class="radar-info-item radar-info-detail">' +
                    '<b>对方位置</b><br>' +
                    '地点：' + escapeHtml(settings.partnerCurrentLocation || '未知') + '<br>' +
                    '方位：' + direction + '<br>' +
                    '距离：' + distanceDesc + '（约 ' + Math.round(distance * 20) + 'm）' +
                    '</div>';
                radarInfo.innerHTML = detailHtml;
            };
        }, 2500);
    }

    // ========== 渲染位置卡片消息 ==========
    function renderLocationCardHTML(msg) {
        if (!msg || msg.type !== 'location-card' || !msg.locationCard) return '';
        var card = msg.locationCard;
        var cardId = card.cardId || ('loc_' + msg.id);
        var html = '<div class="location-card-msg" data-loc-card-id="' + escapeHtml(cardId) + '">';
        html += '<div class="location-card-header"><i class="fas fa-map-marker-alt"></i> 位置分享</div>';
        html += '<div class="location-card-name">' + escapeHtml(card.name) + '</div>';
        html += '<div class="location-card-address">' + escapeHtml(card.address) + '</div>';
        html += '<div class="location-card-time">' + escapeHtml(card.time || '') + '</div>';
        html += '<div class="location-card-actions">';
        html += '<button type="button" class="location-card-btn" data-loc-action="navigate" data-loc-card="' + escapeHtml(cardId) + '" data-loc-name="' + escapeHtml(card.name) + '"><i class="fas fa-route"></i> 导航</button>';
        html += '<button type="button" class="location-card-btn" data-loc-action="view" data-loc-card="' + escapeHtml(cardId) + '" data-loc-name="' + escapeHtml(card.name) + '"><i class="fas fa-eye"></i> 查看</button>';
        html += '</div>';
        html += '</div>';
        return html;
    }

    // 绑定位置卡片按钮事件
    function bindLocationCardEvents() {
        document.addEventListener('click', function(e) {
            var btn = e.target.closest('[data-loc-action]');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            var action = btn.dataset.locAction;
            var name = btn.dataset.locName;
            if (action === 'navigate') {
                showToast('正在导航到 ' + name + '...');
                // 模拟打开地图导航
                setTimeout(function() {
                    showToast('已为您规划路线');
                }, 1500);
            } else if (action === 'view') {
                // 打开地图查看该位置
                if (window.MapDetectApp && typeof window.MapDetectApp.openMapModal === 'function') {
                    window.MapDetectApp.openMapModal();
                    // 切换到地点管理 tab 并高亮对应地点
                    setTimeout(function() {
                        var tabBtn = document.getElementById('map-tab-locations');
                        if (tabBtn) tabBtn.click();
                        // 高亮地点列表中的对应项
                        setTimeout(function() {
                            var locList = document.getElementById('map-loc-list');
                            if (locList) {
                                var items = locList.querySelectorAll('.map-loc-item');
                                items.forEach(function(item) {
                                    var nameEl = item.querySelector('.map-loc-name');
                                    if (nameEl && nameEl.textContent === name) {
                                        item.classList.add('highlight-flash');
                                        setTimeout(function() {
                                            item.classList.remove('highlight-flash');
                                        }, 2000);
                                        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                    }
                                });
                            }
                            // 高亮小地图上的对应标记
                            var mapInner = document.getElementById('mini-map-inner');
                            if (mapInner) {
                                var marker = mapInner.querySelector('[data-name="' + name.replace(/"/g, '\\"') + '"]');
                                if (marker) {
                                    marker.classList.add('highlight-flash');
                                    setTimeout(function() {
                                        marker.classList.remove('highlight-flash');
                                    }, 2000);
                                }
                            }
                        }, 200);
                    }, 100);
                } else {
                    showToast('查看位置：' + name);
                }
            }
        });
    }

    // ========== CSS ==========
    if (!document.getElementById('map-detect-style')) {
        var style = document.createElement('style');
        style.id = 'map-detect-style';
        style.textContent = `
            .map-detect-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.5); z-index: 9999; display: none;
                align-items: center; justify-content: center;
            }
            .map-detect-box {
                background: var(--secondary-bg, #fff); border-radius: 16px;
                width: 90%; max-width: 420px; max-height: 85vh; overflow: hidden;
                display: flex; flex-direction: column;
            }
            .map-detect-header {
                display: flex; align-items: center; gap: 8px; padding: 12px 16px;
                border-bottom: 1px solid var(--border-color, #e0e0e0);
            }
            .map-close-btn {
                background: none; border: none; font-size: 18px; cursor: pointer;
                color: var(--text-secondary, #999);
            }
            .map-title { flex: 1; font-size: 16px; font-weight: 600; color: var(--text-primary, #333); }
            .map-tab-btn {
                padding: 4px 12px; border: 1px solid var(--border-color, #e0e0e0);
                background: transparent; color: var(--text-secondary, #999);
                border-radius: 8px; font-size: 12px; cursor: pointer;
            }
            .map-tab-btn.active { background: var(--accent-color, #07c160); color: #fff; border-color: var(--accent-color, #07c160); }
            .map-detect-body { padding: 16px; overflow-y: auto; flex: 1; }
            .map-section-title { font-size: 13px; font-weight: 600; color: var(--text-primary, #333); margin-bottom: 8px; }
            .map-location-input-row, .map-detect-input-row { display: flex; gap: 8px; margin-bottom: 12px; }
            .map-location-input-row input, .map-detect-input-row input {
                flex: 1; padding: 8px 12px; border: 1px solid var(--border-color, #e0e0e0);
                border-radius: 8px; font-size: 13px; background: var(--primary-bg, #f5f5f5);
                color: var(--text-primary, #333);
            }
            .map-loc-add-btn, .map-detect-go-btn {
                padding: 8px 16px; background: var(--accent-color, #07c160); color: #fff;
                border: none; border-radius: 8px; font-size: 13px; cursor: pointer; white-space: nowrap;
            }
            .map-loc-list { margin-bottom: 16px; max-height: 150px; overflow-y: auto; }
            .map-loc-item {
                display: flex; align-items: center; gap: 8px; padding: 8px 12px;
                background: var(--primary-bg, #f5f5f5); border-radius: 8px; margin-bottom: 6px;
            }
            .map-loc-item.current { background: rgba(7,193,96,0.1); }
            .map-loc-item.highlight-flash {
                animation: highlight-flash 1s ease-in-out 2;
            }
            @keyframes highlight-flash {
                0%, 100% { background: var(--primary-bg, #f5f5f5); }
                50% { background: rgba(255, 193, 7, 0.4); }
            }
            .mini-map-marker.highlight-flash .mini-map-dot {
                animation: marker-highlight-flash 1s ease-in-out 2;
            }
            @keyframes marker-highlight-flash {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.5); box-shadow: 0 0 0 6px rgba(255,193,7,0.5); }
            }
            .map-loc-name { flex: 1; font-size: 13px; color: var(--text-primary, #333); }
            .map-loc-badge { font-size: 11px; color: var(--accent-color, #07c160); }
            .map-loc-del { background: none; border: none; color: var(--text-secondary, #999); cursor: pointer; font-size: 12px; }
            .map-empty { text-align: center; padding: 20px; color: var(--text-secondary, #999); font-size: 13px; }
            .map-canvas-section { margin-top: 16px; }
            .mini-map-square {
                width: 100%; aspect-ratio: 1; max-width: 340px; margin: 0 auto;
                background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
                border-radius: 12px; position: relative; overflow: hidden;
                border: 2px solid var(--border-color, #e0e0e0);
                user-select: none;
            }
            .mini-map-grid-h, .mini-map-grid-v {
                position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                pointer-events: none;
            }
            .mini-map-grid-h {
                background: repeating-linear-gradient(to bottom, transparent, transparent 19.5%, rgba(255,255,255,0.3) 19.5%, rgba(255,255,255,0.3) 20.5%);
            }
            .mini-map-grid-v {
                background: repeating-linear-gradient(to right, transparent, transparent 19.5%, rgba(255,255,255,0.3) 19.5%, rgba(255,255,255,0.3) 20.5%);
            }
            .mini-map-inner { width: 100%; height: 100%; position: relative; }
            .mini-map-marker {
                position: absolute; transform: translate(-50%,-100%); text-align: center;
                cursor: grab; touch-action: none;
            }
            .mini-map-marker:active { cursor: grabbing; }
            .mini-map-dot {
                width: 12px; height: 12px; background: var(--text-secondary, #999);
                border-radius: 50%; margin: 0 auto; border: 2px solid #fff;
                box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            }
            .mini-map-dot.partner-dot {
                background: var(--accent-color, #07c160);
                box-shadow: 0 0 0 3px rgba(7,193,96,0.3), 0 1px 3px rgba(0,0,0,0.3);
                animation: partner-pulse 2s ease-in-out infinite;
            }
            @keyframes partner-pulse {
                0%,100% { box-shadow: 0 0 0 3px rgba(7,193,96,0.3), 0 1px 3px rgba(0,0,0,0.3); }
                50% { box-shadow: 0 0 0 6px rgba(7,193,96,0.1), 0 1px 3px rgba(0,0,0,0.3); }
            }
            .mini-map-label {
                font-size: 10px; color: #333; white-space: nowrap; margin-top: 2px;
                background: rgba(255,255,255,0.85); padding: 1px 5px; border-radius: 4px;
                display: inline-block;
            }
            .mini-map-marker.partner-marker .mini-map-label {
                background: rgba(7,193,96,0.9); color: #fff;
            }
            .map-tip {
                text-align: center; font-size: 11px; color: var(--text-secondary, #999); margin-top: 6px;
            }
            .radar-container { margin-top: 16px; text-align: center; }
            .radar-circle {
                width: 280px; height: 280px; margin: 0 auto; position: relative;
                background: radial-gradient(circle, rgba(7,193,96,0.05) 0%, rgba(7,193,96,0.1) 100%);
                border-radius: 50%; border: 2px solid var(--border-color, #e0e0e0); overflow: visible;
            }
            .radar-ring {
                position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
                border: 1px dashed rgba(7,193,96,0.2); border-radius: 50%;
            }
            .radar-cross-h { position: absolute; top: 50%; left: 0; width: 100%; height: 1px; background: rgba(7,193,96,0.15); }
            .radar-cross-v { position: absolute; left: 50%; top: 0; width: 1px; height: 100%; background: rgba(7,193,96,0.15); }
            .radar-sweep {
                position: absolute; top: 50%; left: 50%; width: 50%; height: 2px;
                background: linear-gradient(to right, var(--accent-color, #07c160), transparent);
                transform-origin: left center; animation: radar-sweep 3s linear infinite; border-radius: 2px;
            }
            @keyframes radar-sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            .radar-center-avatar {
                position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
                width: 40px; height: 40px; border-radius: 50%; border: 2px solid var(--accent-color, #07c160);
                background-size: cover; background-position: center; background-color: #fff;
                display: flex; align-items: center; justify-content: center;
                color: var(--accent-color, #07c160); font-size: 16px; z-index: 10;
            }
            .radar-partner-marker {
                position: absolute; transform: translate(-50%,-50%);
                display: none; flex-direction: column; align-items: center;
                cursor: pointer; z-index: 30; overflow: visible;
                opacity: 0;
                pointer-events: none;
            }
            .radar-partner-marker.radar-marker-show {
                display: flex;
                opacity: 1;
                pointer-events: auto;
                animation: partner-fade-in 0.5s ease-out;
            }
            @keyframes partner-fade-in {
                from { opacity: 0; transform: translate(-50%,-50%) scale(0.5); }
                to { opacity: 1; transform: translate(-50%,-50%) scale(1); }
            }
            .radar-partner-avatar {
                width: 36px; height: 36px; border-radius: 50%;
                border: 2px solid #ff6b6b; background-size: cover; background-position: center;
                background-color: #fff;
                display: flex; align-items: center; justify-content: center;
                color: #ff6b6b; font-size: 14px;
                animation: radar-partner-pulse 2s ease-in-out infinite;
            }
            @keyframes radar-partner-pulse {
                0%,100% { box-shadow: 0 0 0 0 rgba(255,107,107,0.4); }
                50% { box-shadow: 0 0 0 8px rgba(255,107,107,0); }
            }
            .radar-partner-label {
                margin-top: 4px; font-size: 11px; color: #ff6b6b;
                background: rgba(255,255,255,0.9); padding: 1px 6px; border-radius: 4px;
                white-space: nowrap;
            }
            .radar-info { margin-top: 12px; text-align: center; }
            .radar-info-item { font-size: 13px; color: var(--text-primary, #333); margin-bottom: 4px; }
            .radar-info-unknown { color: var(--text-secondary, #999); }
            .radar-info-hint { font-size: 11px; color: var(--text-secondary, #999); }
            .radar-info-detail { text-align: left; padding: 10px 14px; background: var(--primary-bg, #f5f5f5); border-radius: 10px; line-height: 1.6; }
            /* 位置卡片消息 */
            .location-card-msg {
                min-width: 200px; max-width: 240px; padding: 0; border-radius: 12px; overflow: hidden;
            }
            .location-card-header { padding: 8px 12px; background: rgba(7,193,96,0.08); font-size: 12px; color: var(--accent-color, #07c160); }
            .location-card-name { padding: 8px 12px; font-size: 15px; font-weight: 700; color: var(--text-primary, #333); }
            .location-card-address { padding: 0 12px; font-size: 12px; color: var(--text-secondary, #999); }
            .location-card-time { padding: 4px 12px 8px; font-size: 11px; color: var(--text-secondary, #999); }
            .location-card-actions { display: flex; gap: 6px; padding: 8px; border-top: 1px solid var(--border-color, #e0e0e0); }
            .location-card-btn {
                flex: 1; padding: 6px; border: 1px solid var(--border-color, #e0e0e0);
                background: var(--primary-bg, #f5f5f5); color: var(--text-primary, #333);
                border-radius: 8px; font-size: 12px; cursor: pointer;
            }
            .location-card-btn:hover { background: var(--accent-color, #07c160); color: #fff; border-color: var(--accent-color, #07c160); }
        `;
        document.head.appendChild(style);
    }

    function init() {
        loadData();
        bindLocationCardEvents();
    }

    window.MapDetectApp = {
        openMapModal: openMapModal,
        closeMapModal: closeMapModal,
        renderLocationCardHTML: renderLocationCardHTML,
        partnerRandomSendLocation: partnerRandomSendLocation,
        partnerMoveToRandomLocation: partnerMoveToRandomLocation,
        getSettings: function() { return settings; }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 600); });
    } else {
        setTimeout(init, 600);
    }

    // 会话切换时重新加载数据
    window.addEventListener('sessionChanged', function() {
        setTimeout(function() {
            if (typeof loadData === 'function') loadData();
        }, 200);
    });
})();
