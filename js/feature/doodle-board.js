/**
 * 涂鸦板绘画模块 v1
 * - 全屏画布弹窗，支持多种预设笔迹（铅笔/毛笔/马克笔/荧光笔/喷漆/蜡笔）
 * - 自定义颜色（预设色板 + 取色器）、笔粗细调节、画布缩放与拖动
 * - 橡皮擦、清除全部、撤销/重做（基于 dataURL 快照，内存友好）
 * - 保存并以涂鸦卡片形式发送到聊天
 * - 对方随机生成涂鸦图片发送（概率触发，由 core.js 统一管理）
 * - 涂鸦消息以图片卡片形式显示在聊天中
 *
 * 模块结构：
 *   存储 -> 绘画状态管理 -> 弹窗 UI -> Canvas 绘画逻辑 -> 笔迹预设
 *   -> 撤销/重做 -> 对方随机涂鸦 -> 卡片消息渲染
 */
(function () {
    'use strict';

    // ========== 常量与存储 ==========
    var STORAGE_KEY = 'doodle_board_settings_v1';
    var MAX_UNDO = 20;

    // 会话隔离的存储键生成函数
    function getSessionKey(base) {
        var sid = (typeof window !== 'undefined' && window.SESSION_ID) ? window.SESSION_ID : 'default';
        return 'sess_' + sid + '_' + base;
    }

    // 预设颜色板
    var PRESET_COLORS = [
        '#000000', '#7d7d7d', '#ffffff',
        '#e74c3c', '#e67e22', '#f1c40f',
        '#2ecc71', '#1abc9c', '#3498db',
        '#9b59b6', '#e84393', '#a0522d'
    ];

    // 笔迹预设配置：sizeFactor 为粗细倍率，alpha 为不透明度，cap 为线帽
    var BRUSH_PRESETS = {
        pencil:      { label: '铅笔',   icon: 'fa-pencil-alt',  sizeFactor: 1.0, alpha: 1.0,  cap: 'round' },
        brush:       { label: '毛笔',   icon: 'fa-paint-brush', sizeFactor: 3.0, alpha: 0.45, cap: 'round' },
        marker:      { label: '马克笔', icon: 'fa-marker',      sizeFactor: 2.0, alpha: 1.0,  cap: 'round' },
        highlighter: { label: '荧光笔', icon: 'fa-highlighter', sizeFactor: 5.0, alpha: 0.22, cap: 'square' },
        spray:       { label: '喷漆',   icon: 'fa-spray-can',   sizeFactor: 2.0, alpha: 0.6,  cap: 'round' },
        crayon:      { label: '蜡笔',   icon: 'fa-pen',         sizeFactor: 1.6, alpha: 0.7,  cap: 'round' }
    };

    // 持久化设置
    var settings = {
        lastColor: '#000000',
        lastBrush: 'pencil',
        lastSize: 4
    };

    // ========== 画布运行时状态 ==========
    var overlay = null;
    var canvas = null;
    var ctx = null;
    var baseW = 0, baseH = 0;
    var dpr = 1;
    var eventsBound = false;
    var restoreToken = 0;
    var resizeTimer = null;

    var draw = {
        isDrawing: false,    // 正在绘制/拖动
        color: '#000000',
        brushSize: 4,
        brushType: 'pencil',
        isEraser: false,
        panMode: false,
        zoom: 1,
        lastX: 0,
        lastY: 0,
        sprayTimer: null,
        panStartX: 0,
        panStartY: 0,
        panScrollLeft: 0,
        panScrollTop: 0
    };

    // 撤销/重做（保存每次 stroke 前的 dataURL 快照）
    var undoStack = [];
    var redoStack = [];

    // ========== 工具函数 ==========
    function $(id) { return document.getElementById(id); }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function getPartnerName() {
        try {
            if (typeof window.settings !== 'undefined' && window.settings && window.settings.partnerName) {
                return window.settings.partnerName;
            }
        } catch (e) {}
        return 'TA';
    }

    function showNotification(msg, type, dur) {
        try {
            if (typeof window.showNotification === 'function') {
                window.showNotification(msg, type || 'info', dur || 2500);
            } else if (typeof window.showToast === 'function') {
                window.showToast(msg);
            }
        } catch (e) {}
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
        } catch (e) {}
    }

    function loadData() {
        try {
            var saved = localStorage.getItem(getSessionKey(STORAGE_KEY));
            if (saved) {
                var d = JSON.parse(saved);
                if (d) {
                    settings.lastColor = d.lastColor || settings.lastColor;
                    settings.lastBrush = d.lastBrush || settings.lastBrush;
                    settings.lastSize = d.lastSize || settings.lastSize;
                }
            }
        } catch (e) {}
    }

    function saveData() {
        try {
            localStorage.setItem(getSessionKey(STORAGE_KEY), JSON.stringify({
                lastColor: settings.lastColor,
                lastBrush: settings.lastBrush,
                lastSize: settings.lastSize
            }));
        } catch (e) {}
    }

    // ========== Canvas 初始化与缩放 ==========
    function setupCanvas() {
        var wrap = $('doodle-canvas-wrap');
        if (!wrap) return;
        canvas = $('doodle-canvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        dpr = Math.min(2, window.devicePixelRatio || 1);
        baseW = wrap.clientWidth || window.innerWidth;
        baseH = wrap.clientHeight || (window.innerHeight - 48 - 150);
        canvas.width = Math.round(baseW * dpr);
        canvas.height = Math.round(baseH * dpr);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        // 白色画布背景
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, baseW, baseH);
        draw.zoom = 1;
        applyZoom();
        undoStack = [];
        redoStack = [];
        updateUndoRedoUI();
    }

    function applyZoom() {
        if (!canvas) return;
        canvas.style.width = Math.round(baseW * draw.zoom) + 'px';
        canvas.style.height = Math.round(baseH * draw.zoom) + 'px';
        updateZoomUI();
    }

    function zoomIn() {
        draw.zoom = Math.min(4, +(draw.zoom * 1.25).toFixed(3));
        applyZoom();
    }

    function zoomOut() {
        draw.zoom = Math.max(0.25, +(draw.zoom / 1.25).toFixed(3));
        applyZoom();
    }

    function zoomReset() {
        draw.zoom = 1;
        applyZoom();
    }

    function updateZoomUI() {
        var label = $('doodle-zoom-label');
        if (label) label.textContent = Math.round(draw.zoom * 100) + '%';
    }

    // 把屏幕坐标映射为画布逻辑坐标（自动适配 dpr 与 CSS 缩放）
    function getCanvasPos(e) {
        var rect = canvas.getBoundingClientRect();
        var x = (e.clientX - rect.left) * (canvas.width / rect.width) / dpr;
        var y = (e.clientY - rect.top) * (canvas.height / rect.height) / dpr;
        return { x: x, y: y };
    }

    // 适配窗口尺寸变化（旋转/调整大小），保留当前画面
    function debouncedResize() {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resizeCanvas, 200);
    }

    function resizeCanvas() {
        if (!canvas || !overlay || overlay.style.display === 'none') return;
        var wrap = $('doodle-canvas-wrap');
        if (!wrap) return;
        var newW = wrap.clientWidth, newH = wrap.clientHeight;
        if (!newW || !newH) return;
        if (newW === baseW && newH === baseH) return;
        var oldURL = null;
        try { oldURL = canvas.toDataURL('image/png'); } catch (e) {}
        baseW = newW; baseH = newH;
        dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(baseW * dpr);
        canvas.height = Math.round(baseH * dpr);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, baseW, baseH);
        if (oldURL) {
            var img = new Image();
            img.onload = function () {
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                ctx.scale(dpr, dpr);
            };
            img.src = oldURL;
        }
        applyZoom();
        undoStack = [];
        redoStack = [];
        updateUndoRedoUI();
    }

    // ========== 撤销/重做 ==========
    function pushUndo() {
        var url;
        try { url = canvas.toDataURL('image/png'); } catch (e) { return; }
        undoStack.push(url);
        if (undoStack.length > MAX_UNDO) undoStack.shift();
        redoStack = [];
        updateUndoRedoUI();
    }

    function restoreFromURL(url) {
        var token = ++restoreToken;
        var img = new Image();
        img.onload = function () {
            if (token !== restoreToken) return; // 已被更新的操作取代
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            ctx.scale(dpr, dpr);
        };
        img.src = url;
    }

    function undo() {
        if (undoStack.length === 0) return;
        var prevURL = undoStack.pop();
        var curURL = null;
        try { curURL = canvas.toDataURL('image/png'); } catch (e) {}
        if (curURL) redoStack.push(curURL);
        restoreFromURL(prevURL);
        updateUndoRedoUI();
    }

    function redo() {
        if (redoStack.length === 0) return;
        var nextURL = redoStack.pop();
        var curURL = null;
        try { curURL = canvas.toDataURL('image/png'); } catch (e) {}
        if (curURL) undoStack.push(curURL);
        restoreFromURL(nextURL);
        updateUndoRedoUI();
    }

    function updateUndoRedoUI() {
        var undoBtn = $('doodle-undo');
        var redoBtn = $('doodle-redo');
        if (undoBtn) undoBtn.classList.toggle('disabled', undoStack.length === 0);
        if (redoBtn) redoBtn.classList.toggle('disabled', redoStack.length === 0);
    }

    function clearCanvas() {
        pushUndo();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, baseW, baseH);
    }

    // ========== 笔迹预设绘制 ==========
    // 喷漆：在 (cx, cy) 周围随机散布点
    function sprayAt(cx, cy) {
        var preset = BRUSH_PRESETS.spray;
        var radius = draw.brushSize * preset.sizeFactor * 2;
        var density = Math.max(6, Math.round(draw.brushSize * 3));
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = preset.alpha;
        ctx.fillStyle = draw.color;
        for (var i = 0; i < density; i++) {
            var angle = Math.random() * Math.PI * 2;
            var r = Math.random() * radius;
            var px = cx + Math.cos(angle) * r;
            var py = cy + Math.sin(angle) * r;
            ctx.beginPath();
            ctx.arc(px, py, 0.6, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    function startSpray() {
        stopSpray();
        draw.sprayTimer = setInterval(function () {
            if (!draw.isDrawing || draw.panMode) { stopSpray(); return; }
            sprayAt(draw.lastX, draw.lastY);
        }, 40);
    }

    function stopSpray() {
        if (draw.sprayTimer) { clearInterval(draw.sprayTimer); draw.sprayTimer = null; }
    }

    // 单点（点击不移动时留痕）
    function drawDot(x, y) {
        if (draw.isEraser) {
            ctx.save();
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(x, y, draw.brushSize * 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
        }
        var preset = BRUSH_PRESETS[draw.brushType] || BRUSH_PRESETS.pencil;
        var w = draw.brushSize * preset.sizeFactor;
        if (draw.brushType === 'spray') { sprayAt(x, y); return; }
        ctx.save();
        ctx.globalAlpha = preset.alpha;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = draw.color;
        if (draw.brushType === 'highlighter') {
            ctx.fillRect(x - w / 2, y - w / 2, w, w);
        } else {
            ctx.beginPath();
            ctx.arc(x, y, w / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // 线段（从上一点到当前点）
    function drawSegment(x, y, lx, ly) {
        // 橡皮擦：用白色覆盖
        if (draw.isEraser) {
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = draw.brushSize * 3;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(lx, ly);
            ctx.lineTo(x, y);
            ctx.stroke();
            ctx.restore();
            return;
        }
        var preset = BRUSH_PRESETS[draw.brushType] || BRUSH_PRESETS.pencil;
        var w = draw.brushSize * preset.sizeFactor;
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = preset.alpha;
        ctx.strokeStyle = draw.color;
        ctx.fillStyle = draw.color;
        ctx.lineCap = preset.cap;
        ctx.lineJoin = 'round';

        if (draw.brushType === 'spray') {
            // 沿线段路径喷洒
            var steps = Math.max(1, Math.ceil(Math.hypot(x - lx, y - ly) / 4));
            for (var i = 0; i <= steps; i++) {
                var t = i / steps;
                sprayAt(lx + (x - lx) * t, ly + (y - ly) * t);
            }
        } else if (draw.brushType === 'crayon') {
            // 蜡笔：抖动纹理，多 pass 叠加
            var j = Math.max(1, w * 0.2);
            for (var p = 0; p < 2; p++) {
                ctx.lineWidth = w * (0.75 + Math.random() * 0.5);
                ctx.beginPath();
                ctx.moveTo(lx + (Math.random() - 0.5) * j, ly + (Math.random() - 0.5) * j);
                ctx.lineTo(x + (Math.random() - 0.5) * j, y + (Math.random() - 0.5) * j);
                ctx.stroke();
            }
        } else {
            // 铅笔 / 毛笔 / 马克笔 / 荧光笔
            ctx.lineWidth = w;
            ctx.beginPath();
            ctx.moveTo(lx, ly);
            ctx.lineTo(x, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    // ========== 指针事件 ==========
    function onPointerDown(e) {
        if (!overlay || overlay.style.display === 'none') return;
        if (draw.panMode) { startPan(e); return; }
        e.preventDefault();
        try { if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId); } catch (err) {}
        draw.isDrawing = true;
        var p = getCanvasPos(e);
        draw.lastX = p.x;
        draw.lastY = p.y;
        pushUndo(); // 保存本笔之前的状态
        drawDot(p.x, p.y);
        if (draw.brushType === 'spray' && !draw.isEraser) startSpray();
    }

    function onPointerMove(e) {
        if (!draw.isDrawing) return;
        if (draw.panMode) { doPan(e); return; }
        e.preventDefault();
        var p = getCanvasPos(e);
        drawSegment(p.x, p.y, draw.lastX, draw.lastY);
        draw.lastX = p.x;
        draw.lastY = p.y;
    }

    function onPointerUp(e) {
        if (!draw.isDrawing) return;
        if (draw.panMode) { draw.isDrawing = false; return; }
        draw.isDrawing = false;
        stopSpray();
        try { if (canvas.releasePointerCapture && e && e.pointerId != null) canvas.releasePointerCapture(e.pointerId); } catch (err) {}
    }

    // 拖动画布（缩放后平移查看）
    function startPan(e) {
        var wrap = $('doodle-canvas-wrap');
        if (!wrap) return;
        draw.panStartX = e.clientX;
        draw.panStartY = e.clientY;
        draw.panScrollLeft = wrap.scrollLeft;
        draw.panScrollTop = wrap.scrollTop;
        draw.isDrawing = true;
    }

    function doPan(e) {
        var wrap = $('doodle-canvas-wrap');
        if (!wrap) return;
        wrap.scrollLeft = draw.panScrollLeft - (e.clientX - draw.panStartX);
        wrap.scrollTop = draw.panScrollTop - (e.clientY - draw.panStartY);
    }

    // ========== 工具选择 ==========
    function selectBrush(type) {
        if (!BRUSH_PRESETS[type]) type = 'pencil';
        draw.brushType = type;
        draw.isEraser = false;
        settings.lastBrush = type;
        saveData();
        var row = $('doodle-brush-row');
        if (row) {
            Array.prototype.forEach.call(row.querySelectorAll('.doodle-brush-btn'), function (b) {
                b.classList.toggle('active', b.dataset.brush === type);
            });
        }
        var eraserBtn = $('doodle-eraser');
        if (eraserBtn) eraserBtn.classList.remove('active');
        updateCanvasCursor();
    }

    function selectColor(color) {
        draw.color = color;
        settings.lastColor = color;
        saveData();
        var pal = $('doodle-palette');
        if (pal) {
            Array.prototype.forEach.call(pal.querySelectorAll('.doodle-swatch'), function (s) {
                s.classList.toggle('active', s.dataset.color === color);
            });
        }
        var ci = $('doodle-color-input');
        if (ci) ci.value = color;
        var cs = $('doodle-custom-swatch');
        if (cs) cs.style.background = color;
    }

    function setSize(n) {
        n = Math.max(1, Math.min(40, parseInt(n, 10) || 4));
        draw.brushSize = n;
        settings.lastSize = n;
        saveData();
        var slider = $('doodle-size-slider');
        if (slider) slider.value = n;
        var v = $('doodle-size-value');
        if (v) v.textContent = n;
    }

    function setEraser(on) {
        draw.isEraser = on;
        if (on) { draw.panMode = false; stopSpray(); }
        var eraserBtn = $('doodle-eraser');
        var panBtn = $('doodle-pan');
        if (eraserBtn) eraserBtn.classList.toggle('active', on);
        if (panBtn) panBtn.classList.remove('active');
        updateCanvasCursor();
    }

    function setPanMode(on) {
        draw.panMode = on;
        if (on) { draw.isEraser = false; stopSpray(); }
        var panBtn = $('doodle-pan');
        var eraserBtn = $('doodle-eraser');
        if (panBtn) panBtn.classList.toggle('active', on);
        if (eraserBtn) eraserBtn.classList.remove('active');
        updateCanvasCursor();
    }

    function updateCanvasCursor() {
        if (!canvas) return;
        if (draw.panMode) canvas.style.cursor = 'grab';
        else if (draw.isEraser) canvas.style.cursor = 'cell';
        else canvas.style.cursor = 'crosshair';
    }

    // ========== 保存并发送到聊天 ==========
    function saveAndSend() {
        if (!canvas) return;
        var dataURL;
        try { dataURL = canvas.toDataURL('image/png'); } catch (e) {
            showNotification('涂鸦保存失败，请重试', 'warning', 2000);
            return;
        }
        sendDoodleCardMessage('user', dataURL);
        closeDoodleBoard();
        showNotification('涂鸦已发送', 'success', 1800);
    }

    // 发送涂鸦卡片消息
    function sendDoodleCardMessage(from, dataURL) {
        try {
            if (typeof window.addMessage === 'function') {
                var cardId = 'doodle_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
                window.addMessage({
                    id: Date.now() + Math.random(),
                    sender: from === 'user' ? 'user' : 'partner',
                    text: '',
                    timestamp: new Date(),
                    status: from === 'user' ? 'sent' : 'received',
                    type: 'doodle-card',
                    doodleCard: {
                        cardId: cardId,
                        image: dataURL,
                        from: from,                 // 'user' 或 'partner'
                        time: new Date().toLocaleString()
                    },
                    favorited: false,
                    note: null
                });
                try {
                    if (typeof window.playSound === 'function') {
                        window.playSound(from === 'user' ? 'send' : 'message');
                    }
                } catch (e2) {}
                if (typeof window.renderMessages === 'function') {
                    try { window.renderMessages(true); } catch (e3) {}
                }
            }
        } catch (e) {}
    }

    // ========== 对方随机涂鸦生成 ==========
    // 随机选 2-4 种颜色，随机画 3-8 条线条/形状（直线、曲线、圆、三角、矩形）
    function generateRandomDoodle() {
        var w = 360, h = 280;
        var off = document.createElement('canvas');
        off.width = w; off.height = h;
        var c = off.getContext('2d');
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, w, h);

        var palette = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c',
            '#3498db', '#9b59b6', '#e84393', '#000000', '#a0522d'];
        // 随机选 2-4 种颜色
        var pool = palette.slice();
        for (var i = pool.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
        }
        var colorCount = 2 + Math.floor(Math.random() * 3);
        var colors = pool.slice(0, colorCount);

        // 随机画 3-8 个形状
        var shapeCount = 3 + Math.floor(Math.random() * 6);
        for (var s = 0; s < shapeCount; s++) {
            var col = colors[Math.floor(Math.random() * colors.length)];
            var type = Math.floor(Math.random() * 5); // 0直线 1曲线 2圆 3三角 4矩形
            c.strokeStyle = col;
            c.fillStyle = col;
            c.lineWidth = 2 + Math.random() * 8;
            c.lineCap = 'round';
            c.lineJoin = 'round';
            c.globalAlpha = 0.7 + Math.random() * 0.3;
            c.beginPath();
            if (type === 0) {
                // 直线
                c.moveTo(Math.random() * w, Math.random() * h);
                c.lineTo(Math.random() * w, Math.random() * h);
                c.stroke();
            } else if (type === 1) {
                // 曲线
                c.moveTo(Math.random() * w, Math.random() * h);
                c.quadraticCurveTo(Math.random() * w, Math.random() * h, Math.random() * w, Math.random() * h);
                c.stroke();
            } else if (type === 2) {
                // 圆
                var r = 10 + Math.random() * 50;
                c.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
                if (Math.random() < 0.5) c.fill(); else c.stroke();
            } else if (type === 3) {
                // 三角形
                var tx = Math.random() * w, ty = Math.random() * h;
                c.moveTo(tx, ty);
                c.lineTo(tx + (Math.random() - 0.5) * 90, ty + (Math.random() - 0.5) * 90);
                c.lineTo(tx + (Math.random() - 0.5) * 90, ty + (Math.random() - 0.5) * 90);
                c.closePath();
                if (Math.random() < 0.5) c.fill(); else c.stroke();
            } else {
                // 矩形
                var rx = Math.random() * w, ry = Math.random() * h;
                var rw = 20 + Math.random() * 80, rh = 20 + Math.random() * 80;
                c.rect(rx, ry, rw, rh);
                if (Math.random() < 0.5) c.fill(); else c.stroke();
            }
        }
        c.globalAlpha = 1;
        return off.toDataURL('image/png');
    }

    // 对方主动发送随机涂鸦（由 core.js 概率触发调用）
    function partnerSendDoodle() {
        var dataURL = generateRandomDoodle();
        var partnerName = getPartnerName();
        var hints = ['给你画了个东西～', '看我画的！', '涂鸦时间到～', '画了一幅送给你～', '猜猜我画了啥？'];
        var hint = hints[Math.floor(Math.random() * hints.length)];
        sendPartnerMessage(partnerName + '：' + hint);
        setTimeout(function () {
            sendDoodleCardMessage('partner', dataURL);
        }, 700);
    }

    // ========== 涂鸦卡片消息渲染 ==========
    function renderDoodleCardHTML(msg) {
        if (!msg || msg.type !== 'doodle-card' || !msg.doodleCard) return '';
        var card = msg.doodleCard;
        var cardId = escapeHtml(card.cardId || ('doodle_' + msg.id));
        var img = escapeHtml(card.image || '');
        var fromText = card.from === 'user' ? '我的涂鸦' : (getPartnerName() + ' 的涂鸦');
        var time = escapeHtml(card.time || '');
        var html = '<div class="doodle-card-msg" data-doodle-card-id="' + cardId + '">';
        html += '<div class="doodle-card-header"><i class="fas fa-paint-brush"></i> ' + escapeHtml(fromText) + '</div>';
        html += '<img class="doodle-card-img" src="' + img + '" alt="涂鸦" data-doodle-img="' + cardId + '">';
        if (time) html += '<div class="doodle-card-time">' + time + '</div>';
        html += '<div class="doodle-card-actions">';
        html += '<button type="button" class="doodle-card-btn" data-doodle-action="view" data-doodle-card="' + cardId + '"><i class="fas fa-expand"></i> 查看</button>';
        html += '<button type="button" class="doodle-card-btn" data-doodle-action="save" data-doodle-card="' + cardId + '"><i class="fas fa-download"></i> 保存</button>';
        html += '</div>';
        html += '</div>';
        return html;
    }

    function downloadImage(dataURL, name) {
        try {
            var a = document.createElement('a');
            a.href = dataURL;
            a.download = (name || 'doodle') + '.png';
            document.body.appendChild(a);
            a.click();
            a.remove();
            showNotification('涂鸦已保存到本地', 'success', 1500);
        } catch (e) {
            showNotification('保存失败', 'warning', 1500);
        }
    }

    // 绑定涂鸦卡片按钮事件（全局委托，只绑定一次）
    function bindCardEvents() {
        if (window.__doodleCardBound) return;
        window.__doodleCardBound = true;
        document.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-doodle-action]');
            var imgEl = e.target.closest('[data-doodle-img]');
            var src = '';
            if (btn) {
                e.preventDefault();
                e.stopPropagation();
                var cardEl = btn.closest('.doodle-card-msg');
                var imgNode = cardEl ? cardEl.querySelector('.doodle-card-img') : null;
                src = imgNode ? imgNode.src : '';
                var action = btn.dataset.doodleAction;
                if (action === 'view') {
                    if (src && typeof window.viewImage === 'function') window.viewImage(src);
                    else if (src) window.open(src, '_blank');
                } else if (action === 'save') {
                    if (src) downloadImage(src, btn.dataset.doodleCard);
                }
            } else if (imgEl) {
                e.preventDefault();
                if (typeof window.viewImage === 'function') window.viewImage(imgEl.src);
                else window.open(imgEl.src, '_blank');
            }
        });
    }

    // ========== 弹窗 UI ==========
    function renderBrushRow() {
        var row = $('doodle-brush-row');
        if (!row) return;
        var html = '';
        Object.keys(BRUSH_PRESETS).forEach(function (key) {
            var b = BRUSH_PRESETS[key];
            html += '<button type="button" class="doodle-brush-btn' + (key === draw.brushType ? ' active' : '') + '" data-brush="' + key + '">'
                + '<i class="fas ' + b.icon + '"></i><span>' + b.label + '</span></button>';
        });
        row.innerHTML = html;
    }

    function renderPalette() {
        var pal = $('doodle-palette');
        if (!pal) return;
        var html = '';
        PRESET_COLORS.forEach(function (c) {
            html += '<button type="button" class="doodle-swatch' + (c === draw.color ? ' active' : '') + '" data-color="' + c + '" style="background:' + c + '"></button>';
        });
        pal.innerHTML = html;
    }

    function buildOverlay() {
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.id = 'doodle-overlay';
        overlay.className = 'doodle-overlay';
        overlay.innerHTML = ''
            + '<div class="doodle-topbar">'
            +   '<button class="doodle-icon-btn" id="doodle-close" title="关闭"><i class="fas fa-times"></i></button>'
            +   '<span class="doodle-topbar-title">涂鸦板</span>'
            +   '<div class="doodle-zoom-group">'
            +     '<button class="doodle-icon-btn" id="doodle-zoom-out" title="缩小"><i class="fas fa-search-minus"></i></button>'
            +     '<span class="doodle-zoom-label" id="doodle-zoom-label">100%</span>'
            +     '<button class="doodle-icon-btn" id="doodle-zoom-in" title="放大"><i class="fas fa-search-plus"></i></button>'
            +     '<button class="doodle-icon-btn" id="doodle-zoom-reset" title="重置"><i class="fas fa-expand-arrows-alt"></i></button>'
            +   '</div>'
            + '</div>'
            + '<div class="doodle-canvas-wrap" id="doodle-canvas-wrap">'
            +   '<canvas id="doodle-canvas" class="doodle-canvas"></canvas>'
            + '</div>'
            + '<div class="doodle-toolbar">'
            +   '<div class="doodle-brush-row" id="doodle-brush-row"></div>'
            +   '<div class="doodle-color-row">'
            +     '<div class="doodle-palette" id="doodle-palette"></div>'
            +     '<label class="doodle-custom-color" title="自定义颜色">'
            +       '<input type="color" id="doodle-color-input" value="#000000">'
            +       '<span class="doodle-custom-swatch" id="doodle-custom-swatch"></span>'
            +     '</label>'
            +   '</div>'
            +   '<div class="doodle-size-row">'
            +     '<span class="doodle-size-label">粗细</span>'
            +     '<input type="range" id="doodle-size-slider" min="1" max="40" value="4" class="doodle-size-slider">'
            +     '<span class="doodle-size-value" id="doodle-size-value">4</span>'
            +   '</div>'
            +   '<div class="doodle-action-row">'
            +     '<button class="doodle-action-btn" id="doodle-eraser" title="橡皮擦"><i class="fas fa-eraser"></i><span>橡皮</span></button>'
            +     '<button class="doodle-action-btn" id="doodle-pan" title="拖动画布"><i class="fas fa-hand-paper"></i><span>移动</span></button>'
            +     '<button class="doodle-action-btn" id="doodle-undo" title="撤销"><i class="fas fa-undo"></i><span>上一步</span></button>'
            +     '<button class="doodle-action-btn" id="doodle-redo" title="重做"><i class="fas fa-redo"></i><span>下一步</span></button>'
            +     '<button class="doodle-action-btn doodle-danger" id="doodle-clear" title="清除全部"><i class="fas fa-trash"></i><span>清除</span></button>'
            +     '<button class="doodle-action-btn doodle-primary" id="doodle-send" title="发送"><i class="fas fa-paper-plane"></i><span>发送</span></button>'
            +   '</div>'
            + '</div>';
        document.body.appendChild(overlay);
        renderBrushRow();
        renderPalette();
        return overlay;
    }

    function bindOverlayEvents() {
        var closeBtn = $('doodle-close');
        if (closeBtn) closeBtn.onclick = function () { closeDoodleBoard(); };

        var zi = $('doodle-zoom-in'), zo = $('doodle-zoom-out'), zr = $('doodle-zoom-reset');
        if (zi) zi.onclick = zoomIn;
        if (zo) zo.onclick = zoomOut;
        if (zr) zr.onclick = zoomReset;

        var brushRow = $('doodle-brush-row');
        if (brushRow) {
            brushRow.addEventListener('click', function (e) {
                var btn = e.target.closest('[data-brush]');
                if (!btn) return;
                selectBrush(btn.dataset.brush);
            });
        }

        var pal = $('doodle-palette');
        if (pal) {
            pal.addEventListener('click', function (e) {
                var btn = e.target.closest('[data-color]');
                if (!btn) return;
                selectColor(btn.dataset.color);
            });
        }

        var colorInput = $('doodle-color-input');
        var customSwatch = $('doodle-custom-swatch');
        if (colorInput) {
            colorInput.value = draw.color;
            if (customSwatch) customSwatch.style.background = draw.color;
            colorInput.addEventListener('input', function () {
                selectColor(this.value);
                if (customSwatch) customSwatch.style.background = this.value;
            });
        }

        var slider = $('doodle-size-slider');
        var sizeVal = $('doodle-size-value');
        if (slider) {
            slider.value = draw.brushSize;
            if (sizeVal) sizeVal.textContent = draw.brushSize;
            slider.addEventListener('input', function () {
                setSize(parseInt(this.value, 10));
                if (sizeVal) sizeVal.textContent = this.value;
            });
        }

        var eraserBtn = $('doodle-eraser');
        var panBtn = $('doodle-pan');
        if (eraserBtn) eraserBtn.onclick = function () { setEraser(!draw.isEraser); };
        if (panBtn) panBtn.onclick = function () { setPanMode(!draw.panMode); };

        var undoBtn = $('doodle-undo'), redoBtn = $('doodle-redo'),
            clearBtn = $('doodle-clear'), sendBtn = $('doodle-send');
        if (undoBtn) undoBtn.onclick = undo;
        if (redoBtn) redoBtn.onclick = redo;
        if (clearBtn) clearBtn.onclick = clearCanvas;
        if (sendBtn) sendBtn.onclick = saveAndSend;

        // Canvas 指针事件
        canvas = $('doodle-canvas');
        if (canvas) {
            canvas.addEventListener('pointerdown', onPointerDown);
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
            window.addEventListener('pointercancel', onPointerUp);
            canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        }

        // 键盘快捷键：Esc 关闭，Ctrl/Cmd+Z 撤销，Ctrl/Cmd+Shift+Z 或 Ctrl+Y 重做
        document.addEventListener('keydown', function (e) {
            if (!overlay || overlay.style.display === 'none') return;
            if (e.key === 'Escape') { closeDoodleBoard(); }
            else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
                e.preventDefault();
                if (e.shiftKey) redo(); else undo();
            } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
                e.preventDefault();
                redo();
            }
        });

        // 窗口尺寸变化
        window.addEventListener('resize', debouncedResize);
    }

    function openDoodleBoard() {
        buildOverlay();
        overlay.style.display = 'flex';
        setupCanvas();
        if (!eventsBound) {
            bindOverlayEvents();
            eventsBound = true;
        }
        // 还原上次设置
        selectBrush(settings.lastBrush);
        selectColor(settings.lastColor);
        setSize(settings.lastSize);
        setEraser(false);
        setPanMode(false);
        updateUndoRedoUI();
        // 锁定背景滚动
        document.body.style.overflow = 'hidden';
    }

    function closeDoodleBoard() {
        if (!overlay) return;
        overlay.style.display = 'none';
        stopSpray();
        draw.isDrawing = false;
        document.body.style.overflow = '';
    }

    // ========== CSS 注入 ==========
    function injectCSS() {
        if (document.getElementById('doodle-board-style')) return;
        var style = document.createElement('style');
        style.id = 'doodle-board-style';
        style.textContent = ''
            + '.doodle-overlay{position:fixed;inset:0;z-index:9500;background:#f2f2f2;display:none;flex-direction:column;animation:doodleFadeIn .2s ease;}'
            + '@keyframes doodleFadeIn{from{opacity:0}to{opacity:1}}'
            + '.doodle-topbar{height:48px;flex-shrink:0;display:flex;align-items:center;gap:8px;padding:0 10px;background:#1f1f24;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.18);padding-top:env(safe-area-inset-top);height:calc(48px + env(safe-area-inset-top));}'
            + '.doodle-topbar-title{font-size:15px;font-weight:600;flex:1;text-align:center;}'
            + '.doodle-zoom-group{display:flex;align-items:center;gap:4px;}'
            + '.doodle-zoom-label{font-size:12px;min-width:38px;text-align:center;color:#ccc;}'
            + '.doodle-icon-btn{width:34px;height:34px;border-radius:8px;border:none;background:rgba(255,255,255,.1);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;}'
            + '.doodle-icon-btn:hover{background:rgba(255,255,255,.2);}'
            + '.doodle-canvas-wrap{flex:1;overflow:auto;background:#e9e9e9;display:flex;align-items:flex-start;justify-content:flex-start;position:relative;-webkit-overflow-scrolling:touch;}'
            + '.doodle-canvas{background:#fff;display:block;touch-action:none;box-shadow:0 2px 12px rgba(0,0,0,.12);}'
            + '.doodle-toolbar{flex-shrink:0;background:#1f1f24;color:#fff;padding:8px 10px calc(8px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:8px;box-shadow:0 -2px 8px rgba(0,0,0,.18);}'
            + '.doodle-brush-row{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;}'
            + '.doodle-brush-btn{flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:52px;padding:6px 4px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#ddd;cursor:pointer;font-size:11px;}'
            + '.doodle-brush-btn i{font-size:15px;}'
            + '.doodle-brush-btn.active{background:var(--accent-color,#c5a47e);color:#fff;border-color:transparent;}'
            + '.doodle-color-row{display:flex;align-items:center;gap:8px;}'
            + '.doodle-palette{display:flex;gap:6px;flex-wrap:wrap;flex:1;}'
            + '.doodle-swatch{width:24px;height:24px;border-radius:50%;border:2px solid rgba(255,255,255,.25);cursor:pointer;padding:0;}'
            + '.doodle-swatch.active{border-color:#fff;box-shadow:0 0 0 2px var(--accent-color,#c5a47e);}'
            + '.doodle-custom-color{position:relative;width:28px;height:28px;flex-shrink:0;cursor:pointer;}'
            + '.doodle-custom-color input[type=color]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;}'
            + '.doodle-custom-swatch{display:block;width:28px;height:28px;border-radius:50%;border:2px solid rgba(255,255,255,.25);background:#000;}'
            + '.doodle-size-row{display:flex;align-items:center;gap:8px;}'
            + '.doodle-size-label{font-size:12px;color:#bbb;}'
            + '.doodle-size-slider{flex:1;accent-color:var(--accent-color,#c5a47e);}'
            + '.doodle-size-value{font-size:12px;color:#ddd;min-width:26px;text-align:right;}'
            + '.doodle-action-row{display:flex;gap:6px;flex-wrap:wrap;}'
            + '.doodle-action-btn{flex:1;min-width:56px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#ddd;cursor:pointer;font-size:11px;}'
            + '.doodle-action-btn i{font-size:15px;}'
            + '.doodle-action-btn.active{background:var(--accent-color,#c5a47e);color:#fff;border-color:transparent;}'
            + '.doodle-action-btn.disabled{opacity:.35;pointer-events:none;}'
            + '.doodle-action-btn.doodle-primary{background:var(--accent-color,#c5a47e);color:#fff;border-color:transparent;}'
            + '.doodle-action-btn.doodle-danger{color:#ff7b7b;}'
            // 涂鸦卡片消息样式
            + '.doodle-card-msg{width:min(240px,100%);box-sizing:border-box;}'
            + '.doodle-card-header{font-size:12px;color:var(--text-secondary,#999);margin-bottom:4px;display:flex;align-items:center;gap:4px;}'
            + '.doodle-card-img{width:100%;max-width:240px;border-radius:8px;display:block;cursor:pointer;background:#fff;border:1px solid var(--border-color,#ebebeb);}'
            + '.doodle-card-time{font-size:10px;color:var(--text-secondary,#bbb);margin-top:4px;}'
            + '.doodle-card-actions{display:flex;gap:6px;margin-top:6px;}'
            + '.doodle-card-btn{flex:1;padding:6px 8px;border-radius:8px;border:1px solid var(--border-color,#ebebeb);background:var(--primary-bg,#f5f5f5);color:var(--text-primary,#333);font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;}'
            + '.doodle-card-btn:hover{opacity:.85;}';
        document.head.appendChild(style);
    }

    // ========== 初始化 ==========
    function init() {
        loadData();
        injectCSS();
        bindCardEvents();
    }

    // ========== 对外接口 ==========
    window.DoodleApp = {
        openDoodleBoard: openDoodleBoard,
        closeDoodleBoard: closeDoodleBoard,
        partnerSendDoodle: partnerSendDoodle,
        renderDoodleCardHTML: renderDoodleCardHTML,
        generateRandomDoodle: generateRandomDoodle
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 600); });
    } else {
        setTimeout(init, 600);
    }

    // 会话切换时重新加载数据
    window.addEventListener('sessionChanged', function () {
        setTimeout(function () {
            if (typeof loadData === 'function') loadData();
        }, 200);
    });
})();
