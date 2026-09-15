/**
 * 桌宠功能模块
 * - 设置面板：图片上传裁剪、生成桌宠、开关
 * - 桌宠显示：圆形头像、拖动、呼吸动画
 * - 互动功能：点击抖动心情气泡、抚摸爱心、双击弹跳
 * - 对方互动：随机抚摸/拍拍
 * - localStorage 持久化存储
 */
(function () {
    'use strict';

    const STORAGE_PREFIX = 'desk_pet_settings_v1';
    const STORAGE_KEYS = {
        IMAGE: `${STORAGE_PREFIX}_pet_image`,
        ENABLED: `${STORAGE_PREFIX}_pet_enabled`,
        POSITION: `${STORAGE_PREFIX}_pet_position`
    };

    // 会话隔离的存储键生成函数
    function getSessionKey(base) {
        const sid = (typeof window !== 'undefined' && window.SESSION_ID) ? window.SESSION_ID : 'default';
        return 'sess_' + sid + '_' + base;
    }

    const MOOD_TEXTS = [
        '今天也要开心呀~',
        '想你啦！',
        '嘿嘿~',
        '摸摸头',
        '你最棒了！',
        '加油加油！',
        '陪你一起~',
        'mua!',
        '今天真好看',
        '抱抱~'
    ];

    let petEnabled = false;
    let petImage = '';
    let petPosition = null;
    let petElement = null;
    let settingsPanel = null;
    let cropCanvas = null;
    let cropImage = null;
    let cropStartX = 0;
    let cropStartY = 0;
    let cropOffsetX = 0;
    let cropOffsetY = 0;
    let cropScale = 1;
    // 自由裁剪框（canvas 坐标系，280x280）
    let cropBoxX = 0;
    let cropBoxY = 0;
    let cropBoxW = 0;
    let cropBoxH = 0;
    // 套索裁剪状态：true=套索（自由路径），false=矩形
    let lassoMode = true;
    // 套索路径点集合 [{x,y}, ...]，坐标系为 canvas 内部坐标
    let lassoPath = [];
    // 是否正在绘制套索路径
    let isDrawing = false;
    let cropCleanupListeners = null;
    let isDraggingPet = false;
    let petDragStartX = 0;
    let petDragStartY = 0;
    let petStartLeft = 0;
    let petStartTop = 0;
    let hoverTimer = null;
    let lastClickTime = 0;
    let partnerEventTimer = null;

    // ========== 存储相关 ==========

    function loadSettings() {
        try {
            petImage = localStorage.getItem(getSessionKey(STORAGE_KEYS.IMAGE)) || '';
            petEnabled = localStorage.getItem(getSessionKey(STORAGE_KEYS.ENABLED)) === 'true';
            const pos = localStorage.getItem(getSessionKey(STORAGE_KEYS.POSITION));
            petPosition = pos ? JSON.parse(pos) : null;
        } catch (e) {
            petEnabled = false;
            petImage = '';
            petPosition = null;
        }
    }

    function savePetImage(imageData) {
        petImage = imageData;
        try {
            localStorage.setItem(getSessionKey(STORAGE_KEYS.IMAGE), imageData);
        } catch (e) {
            console.warn('保存桌宠图片失败', e);
        }
    }

    function savePetEnabled(enabled) {
        petEnabled = enabled;
        try {
            localStorage.setItem(getSessionKey(STORAGE_KEYS.ENABLED), enabled ? 'true' : 'false');
        } catch (e) {}
    }

    function savePetPosition(x, y) {
        petPosition = { x, y };
        try {
            localStorage.setItem(getSessionKey(STORAGE_KEYS.POSITION), JSON.stringify(petPosition));
        } catch (e) {}
    }

    // ========== 系统消息 ==========

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
        } catch (e) {}
    }

    // ========== CSS 样式注入 ==========

    function injectStyles() {
        if (document.getElementById('desk-pet-styles')) return;
        const style = document.createElement('style');
        style.id = 'desk-pet-styles';
        style.textContent = `
            /* 桌宠本体 */
            .desk-pet {
                position: fixed;
                width: 80px;
                height: 80px;
                cursor: grab;
                z-index: 9999;
                animation: pet-breath 3s ease-in-out infinite;
                user-select: none;
                -webkit-user-select: none;
                touch-action: none;
                perspective: 600px;
            }

            .desk-pet:active {
                cursor: grabbing;
            }

            .desk-pet img {
                width: 100%;
                height: 100%;
                object-fit: contain;
                pointer-events: none;
                filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.15));
            }

            .desk-pet.dragging {
                animation: none;
                transition: none;
            }

            /* 呼吸动画 */
            @keyframes pet-breath {
                0%, 100% {
                    transform: scale(1);
                }
                50% {
                    transform: scale(1.05);
                }
            }

            /* 抖动动画 */
            @keyframes pet-shake {
                0%, 100% { transform: translateX(0) rotate(0deg); }
                10%, 30%, 50%, 70%, 90% { transform: translateX(-3px) rotate(-3deg); }
                20%, 40%, 60%, 80% { transform: translateX(3px) rotate(3deg); }
            }

            .desk-pet.shaking {
                animation: pet-shake 0.5s ease-in-out;
            }

            /* 弹跳动画 */
            @keyframes pet-bounce {
                0%, 100% { transform: translateY(0); }
                30% { transform: translateY(-20px); }
                50% { transform: translateY(-10px); }
                70% { transform: translateY(-15px); }
            }

            .desk-pet.bouncing {
                animation: pet-bounce 0.6s ease-out;
            }

            /* 心情气泡 */
            .desk-pet-bubble {
                position: absolute;
                bottom: 70px;
                left: 50%;
                transform: translateX(-50%) scale(0);
                background: white;
                color: #333;
                padding: 8px 14px;
                border-radius: 18px;
                font-size: 13px;
                white-space: nowrap;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
                opacity: 0;
                transition: all 0.3s ease;
                pointer-events: none;
                z-index: 10000;
            }

            .desk-pet-bubble::after {
                content: '';
                position: absolute;
                bottom: -6px;
                left: 50%;
                transform: translateX(-50%);
                border-left: 6px solid transparent;
                border-right: 6px solid transparent;
                border-top: 6px solid white;
            }

            .desk-pet-bubble.show {
                transform: translateX(-50%) scale(1);
                opacity: 1;
            }

            /* 爱心特效 */
            .desk-pet-heart {
                position: absolute;
                font-size: 20px;
                pointer-events: none;
                animation: heart-float 1.5s ease-out forwards;
                z-index: 10001;
            }

            @keyframes heart-float {
                0% {
                    opacity: 1;
                    transform: translateY(0) scale(0.5);
                }
                50% {
                    opacity: 1;
                    transform: translateY(-30px) scale(1.2);
                }
                100% {
                    opacity: 0;
                    transform: translateY(-60px) scale(0.8);
                }
            }

            /* 设置面板 */
            .desk-pet-settings {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                border-radius: 16px;
                padding: 24px;
                width: 320px;
                max-width: 90vw;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
                z-index: 10002;
            }

            .desk-pet-settings h3 {
                margin: 0 0 16px 0;
                text-align: center;
                color: #333;
                font-size: 18px;
            }

            .desk-pet-settings-close {
                position: absolute;
                top: 12px;
                right: 16px;
                background: none;
                border: none;
                font-size: 20px;
                color: #999;
                cursor: pointer;
                padding: 4px;
            }

            .desk-pet-settings-close:hover {
                color: #333;
            }

            .desk-pet-preview {
                width: 100px;
                height: 100px;
                margin: 0 auto 16px;
                background: repeating-conic-gradient(#f0f0f0 0% 25%, #fff 0% 50%) 50% / 16px 16px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                border-radius: 12px;
                overflow: hidden;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .desk-pet-preview img {
                width: 100%;
                height: 100%;
                object-fit: contain;
            }

            .desk-pet-preview .placeholder-icon {
                font-size: 40px;
                color: #ff9fb2;
            }

            .desk-pet-actions {
                display: flex;
                gap: 10px;
                margin-bottom: 16px;
            }

            .desk-pet-btn {
                flex: 1;
                padding: 10px 16px;
                border: none;
                border-radius: 10px;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s;
            }

            .desk-pet-btn-primary {
                background: linear-gradient(135deg, #ff9fb2 0%, #ff6b8a 100%);
                color: white;
            }

            .desk-pet-btn-primary:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(255, 107, 138, 0.4);
            }

            .desk-pet-btn-secondary {
                background: #f0f0f0;
                color: #333;
            }

            .desk-pet-btn-secondary:hover {
                background: #e0e0e0;
            }

            .desk-pet-switch-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 0;
                border-top: 1px solid #f0f0f0;
            }

            .desk-pet-switch-label {
                font-size: 14px;
                color: #333;
            }

            .desk-pet-switch {
                position: relative;
                width: 48px;
                height: 28px;
                background: #ddd;
                border-radius: 14px;
                cursor: pointer;
                transition: background 0.3s;
            }

            .desk-pet-switch.active {
                background: #ff6b8a;
            }

            .desk-pet-switch::after {
                content: '';
                position: absolute;
                top: 2px;
                left: 2px;
                width: 24px;
                height: 24px;
                background: white;
                border-radius: 50%;
                transition: left 0.3s;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
            }

            .desk-pet-switch.active::after {
                left: 22px;
            }

            /* 裁剪弹窗 */
            .desk-pet-crop-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.7);
                z-index: 10003;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .desk-pet-crop-modal {
                background: white;
                border-radius: 16px;
                padding: 20px;
                width: 340px;
                max-width: 90vw;
            }

            .desk-pet-crop-modal h4 {
                margin: 0 0 16px 0;
                text-align: center;
                color: #333;
            }

            .desk-pet-crop-canvas-wrapper {
                position: relative;
                width: 280px;
                height: 280px;
                margin: 0 auto 16px;
                border-radius: 12px;
                overflow: hidden;
                background: repeating-conic-gradient(#f0f0f0 0% 25%, #fff 0% 50%) 50% / 20px 20px;
                cursor: grab;
                border: 2px dashed #ccc;
            }

            .desk-pet-crop-canvas-wrapper:active {
                cursor: grabbing;
            }

            .desk-pet-crop-canvas-wrapper canvas {
                display: block;
            }

            .desk-pet-crop-tip {
                text-align: center;
                font-size: 12px;
                color: #999;
                margin-bottom: 12px;
            }

            .desk-pet-crop-actions {
                display: flex;
                gap: 10px;
            }

            .desk-pet-mask {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 10001;
            }

            /* 对方互动气泡 */
            .desk-pet-partner-bubble {
                position: absolute;
                bottom: 70px;
                left: 50%;
                transform: translateX(-50%) scale(0);
                background: linear-gradient(135deg, #ff9fb2 0%, #ff6b8a 100%);
                color: white;
                padding: 6px 12px;
                border-radius: 14px;
                font-size: 12px;
                white-space: nowrap;
                box-shadow: 0 2px 8px rgba(255, 107, 138, 0.4);
                opacity: 0;
                transition: all 0.3s ease;
                pointer-events: none;
                z-index: 10000;
            }

            .desk-pet-partner-bubble::after {
                content: '';
                position: absolute;
                bottom: -5px;
                left: 50%;
                transform: translateX(-50%);
                border-left: 5px solid transparent;
                border-right: 5px solid transparent;
                border-top: 5px solid #ff6b8a;
            }

            .desk-pet-partner-bubble.show {
                transform: translateX(-50%) scale(1);
                opacity: 1;
            }

            /* ===== 三维立体效果 ===== */
            .pet-3d-container {
                position: relative;
                width: 100%;
                height: 100%;
                transform-style: preserve-3d;
                animation: pet-3d-rotate 4s ease-in-out infinite;
                transition: transform 0.35s ease;
            }

            /* 悬停时轻微浮起 */
            .desk-pet:hover .pet-3d-container {
                animation-play-state: paused;
                transform: translateZ(15px) !important;
            }

            /* 拖动时停止旋转，避免视觉抖动 */
            .desk-pet.dragging .pet-3d-container {
                animation: none;
                transform: none !important;
            }

            .pet-3d-container img {
                width: 100%;
                height: 100%;
                object-fit: contain;
                pointer-events: none;
                filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.15));
            }

            /* 高光层（光照效果） */
            .pet-highlight {
                position: absolute;
                top: 8%;
                left: 12%;
                width: 32%;
                height: 32%;
                background: radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.75) 0%, rgba(255, 255, 255, 0.25) 40%, transparent 70%);
                border-radius: 50%;
                pointer-events: none;
                transform: translateZ(10px);
            }

            /* 底部投影（椭圆形阴影） */
            .pet-shadow {
                position: absolute;
                bottom: -6px;
                left: 50%;
                width: 70%;
                height: 12px;
                background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.35) 0%, rgba(0, 0, 0, 0.12) 50%, transparent 75%);
                transform: translateX(-50%);
                border-radius: 50%;
                pointer-events: none;
                filter: blur(2px);
                animation: pet-shadow-pulse 3s ease-in-out infinite;
            }

            /* Y 轴轻微旋转动画 */
            @keyframes pet-3d-rotate {
                0%, 100% { transform: rotateY(-8deg); }
                50% { transform: rotateY(8deg); }
            }

            /* 阴影随呼吸律动 */
            @keyframes pet-shadow-pulse {
                0%, 100% { opacity: 0.6; transform: translateX(-50%) scale(1); }
                50% { opacity: 0.85; transform: translateX(-50%) scale(0.9); }
            }

            /* ===== 自由裁剪框 ===== */
            .desk-pet-crop-box {
                position: absolute;
                border: 2px dashed rgba(255, 255, 255, 0.95);
                box-sizing: border-box;
                cursor: move;
                z-index: 5;
            }

            .desk-pet-crop-handle {
                position: absolute;
                width: 14px;
                height: 14px;
                background: #fff;
                border: 2px solid #ff6b8a;
                border-radius: 50%;
                z-index: 10;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
            }

            .desk-pet-crop-handle.tl { top: -7px; left: -7px; cursor: nwse-resize; }
            .desk-pet-crop-handle.tr { top: -7px; right: -7px; cursor: nesw-resize; }
            .desk-pet-crop-handle.bl { bottom: -7px; left: -7px; cursor: nesw-resize; }
            .desk-pet-crop-handle.br { bottom: -7px; right: -7px; cursor: nwse-resize; }

            /* ===== 裁剪模式切换（套索 / 矩形）===== */
            .desk-pet-crop-mode-switch {
                display: flex;
                gap: 8px;
                margin-bottom: 12px;
                justify-content: center;
            }
            .desk-pet-crop-mode-btn {
                padding: 6px 16px;
                border: 1.5px solid #e0e0e0;
                border-radius: 8px;
                background: #f5f5f5;
                font-size: 13px;
                cursor: pointer;
                color: #666;
                transition: all 0.2s;
            }
            .desk-pet-crop-mode-btn:hover {
                background: #ececec;
            }
            .desk-pet-crop-mode-btn.active {
                border-color: #ff6b8a;
                background: #ff6b8a;
                color: #fff;
            }

            /* 套索模式：十字光标，隐藏矩形裁剪框 */
            .desk-pet-crop-canvas-wrapper.lasso-mode,
            .desk-pet-crop-canvas-wrapper.lasso-mode:active {
                cursor: crosshair;
            }
            .desk-pet-crop-canvas-wrapper.lasso-mode .desk-pet-crop-box {
                display: none;
            }
            .desk-pet-crop-canvas-wrapper.rect-mode {
                cursor: grab;
            }
            .desk-pet-crop-canvas-wrapper.rect-mode:active {
                cursor: grabbing;
            }
        `;
        document.head.appendChild(style);
    }

    // ========== 桌宠渲染 ==========

    function createPetElement() {
        if (petElement) return;
        const pet = document.createElement('div');
        pet.className = 'desk-pet';
        pet.id = 'desk-pet';

        // 三维立体容器（包裹图片 + 高光）
        const container3d = document.createElement('div');
        container3d.className = 'pet-3d-container';

        if (petImage) {
            const img = document.createElement('img');
            img.src = petImage;
            container3d.appendChild(img);
        } else {
            container3d.innerHTML = '<i class="fas fa-cat" style="font-size:36px;color:#ff9fb2;display:flex;align-items:center;justify-content:center;width:100%;height:100%;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.1));"></i>';
        }

        // 高光层（光照效果）
        const highlight = document.createElement('div');
        highlight.className = 'pet-highlight';
        container3d.appendChild(highlight);

        pet.appendChild(container3d);

        // 底部投影
        const shadow = document.createElement('div');
        shadow.className = 'pet-shadow';
        pet.appendChild(shadow);

        // 心情气泡
        const bubble = document.createElement('div');
        bubble.className = 'desk-pet-bubble';
        pet.appendChild(bubble);

        // 对方互动气泡
        const partnerBubble = document.createElement('div');
        partnerBubble.className = 'desk-pet-partner-bubble';
        pet.appendChild(partnerBubble);

        document.body.appendChild(pet);
        petElement = pet;

        // 设置初始位置
        setPetPosition();

        // 绑定事件
        bindPetEvents();

        // 启动对方随机互动
        startPartnerEvents();
    }

    function setPetPosition() {
        if (!petElement) return;
        if (petPosition && petPosition.x !== undefined) {
            petElement.style.left = petPosition.x + 'px';
            petElement.style.top = petPosition.y + 'px';
            petElement.style.right = 'auto';
            petElement.style.bottom = 'auto';
        } else {
            // 默认右下角
            petElement.style.right = '20px';
            petElement.style.bottom = '100px';
            petElement.style.left = 'auto';
            petElement.style.top = 'auto';
        }
    }

    function removePetElement() {
        if (petElement) {
            petElement.remove();
            petElement = null;
        }
        stopPartnerEvents();
    }

    function updatePetImage() {
        if (!petElement) return;

        // 仅更新三维容器内部内容，保留阴影、气泡等兄弟节点
        let container3d = petElement.querySelector('.pet-3d-container');
        if (!container3d) {
            container3d = document.createElement('div');
            container3d.className = 'pet-3d-container';
            petElement.insertBefore(container3d, petElement.firstChild);
        }

        const highlightHtml = '<div class="pet-highlight"></div>';
        if (petImage) {
            container3d.innerHTML = `<img src="${petImage}">${highlightHtml}`;
        } else {
            container3d.innerHTML = '<i class="fas fa-cat" style="font-size:36px;color:#ff9fb2;display:flex;align-items:center;justify-content:center;width:100%;height:100%;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.1));"></i>' + highlightHtml;
        }
    }

    // ========== 桌宠事件绑定 ==========

    function bindPetEvents() {
        if (!petElement) return;

        // 鼠标拖动
        petElement.addEventListener('mousedown', onPetMouseDown);
        document.addEventListener('mousemove', onPetMouseMove);
        document.addEventListener('mouseup', onPetMouseUp);

        // 触摸拖动
        petElement.addEventListener('touchstart', onPetTouchStart, { passive: false });
        document.addEventListener('touchmove', onPetTouchMove, { passive: false });
        document.addEventListener('touchend', onPetTouchEnd);

        // 点击
        petElement.addEventListener('click', onPetClick);

        // 悬停（抚摸）
        petElement.addEventListener('mouseenter', onPetHoverStart);
        petElement.addEventListener('mouseleave', onPetHoverEnd);
    }

    function onPetMouseDown(e) {
        if (e.button !== 0) return;
        startDrag(e.clientX, e.clientY);
    }

    function onPetMouseMove(e) {
        if (!isDraggingPet) return;
        doDrag(e.clientX, e.clientY);
    }

    function onPetMouseUp(e) {
        if (!isDraggingPet) return;
        endDrag();
    }

    function onPetTouchStart(e) {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        startDrag(e.touches[0].clientX, e.touches[0].clientY);
    }

    function onPetTouchMove(e) {
        if (!isDraggingPet || e.touches.length !== 1) return;
        e.preventDefault();
        doDrag(e.touches[0].clientX, e.touches[0].clientY);
    }

    function onPetTouchEnd(e) {
        if (!isDraggingPet) return;
        endDrag();
    }

    function startDrag(clientX, clientY) {
        isDraggingPet = true;
        petElement.classList.add('dragging');
        petDragStartX = clientX;
        petDragStartY = clientY;

        const rect = petElement.getBoundingClientRect();
        petStartLeft = rect.left;
        petStartTop = rect.top;

        // 清除悬停计时器
        clearHoverTimer();
    }

    function doDrag(clientX, clientY) {
        const dx = clientX - petDragStartX;
        const dy = clientY - petDragStartY;

        let newLeft = petStartLeft + dx;
        let newTop = petStartTop + dy;

        // 边界限制
        const petWidth = petElement.offsetWidth;
        const petHeight = petElement.offsetHeight;
        newLeft = Math.max(0, Math.min(window.innerWidth - petWidth, newLeft));
        newTop = Math.max(0, Math.min(window.innerHeight - petHeight, newTop));

        petElement.style.left = newLeft + 'px';
        petElement.style.top = newTop + 'px';
        petElement.style.right = 'auto';
        petElement.style.bottom = 'auto';
    }

    function endDrag() {
        isDraggingPet = false;
        petElement.classList.remove('dragging');

        const rect = petElement.getBoundingClientRect();
        savePetPosition(rect.left, rect.top);
    }

    function onPetClick(e) {
        // 拖动后不触发点击
        if (isDraggingPet) return;

        const now = Date.now();
        if (now - lastClickTime < 300) {
            // 双击 - 拍拍
            onPetPat();
            lastClickTime = 0;
            return;
        }
        lastClickTime = now;

        // 单击 - 抖动 + 心情气泡
        onPetTap();
    }

    function onPetTap() {
        if (!petElement) return;

        // 抖动动画
        petElement.classList.remove('shaking');
        void petElement.offsetWidth; // 触发重绘
        petElement.classList.add('shaking');
        setTimeout(() => petElement.classList.remove('shaking'), 500);

        // 发送系统消息
        sendSystemMessage('你戳了戳桌宠');

        // 心情气泡（桌宠随机回复）
        showMoodBubble();
    }

    function onPetPat() {
        if (!petElement) return;

        // 弹跳动画
        petElement.classList.remove('bouncing');
        void petElement.offsetWidth;
        petElement.classList.add('bouncing');
        setTimeout(() => petElement.classList.remove('bouncing'), 600);

        // 发送系统消息
        sendSystemMessage('你拍了拍桌宠');

        // 发送拍拍通知给对方（模拟）
        showPartnerBubble('对方收到了你的拍拍~');
        setTimeout(() => hidePartnerBubble(), 2000);

        // 模拟对方回拍
        setTimeout(() => {
            if (Math.random() < 0.5) {
                triggerPartnerPat();
            }
        }, 1500 + Math.random() * 2000);
    }

    function showMoodBubble() {
        if (!petElement) return;
        const bubble = petElement.querySelector('.desk-pet-bubble');
        if (!bubble) return;

        const text = MOOD_TEXTS[Math.floor(Math.random() * MOOD_TEXTS.length)];
        bubble.textContent = text;
        bubble.classList.add('show');

        setTimeout(() => {
            bubble.classList.remove('show');
        }, 2000);
    }

    function onPetHoverStart() {
        if (isDraggingPet) return;
        clearHoverTimer();
        hoverTimer = setTimeout(() => {
            onPetStroke();
        }, 1000);
    }

    function onPetHoverEnd() {
        clearHoverTimer();
    }

    function clearHoverTimer() {
        if (hoverTimer) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
        }
    }

    function onPetStroke() {
        if (!petElement) return;

        // 爱心特效
        spawnHearts();

        // 发送系统消息
        sendSystemMessage('你抚摸了桌宠');

        // 发送抚摸通知给对方（模拟）
        showPartnerBubble('对方收到了你的摸摸~');
        setTimeout(() => hidePartnerBubble(), 2000);

        // 模拟对方回摸
        setTimeout(() => {
            if (Math.random() < 0.6) {
                triggerPartnerStroke();
            }
        }, 2000 + Math.random() * 2000);
    }

    function spawnHearts() {
        if (!petElement) return;

        const heartEmojis = ['❤️', '💕', '💗', '💖', '💓'];
        const count = 5;

        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                if (!petElement) return;
                const heart = document.createElement('span');
                heart.className = 'desk-pet-heart';
                heart.textContent = heartEmojis[Math.floor(Math.random() * heartEmojis.length)];

                // 随机位置
                const offsetX = (Math.random() - 0.5) * 40;
                heart.style.left = `calc(50% + ${offsetX}px)`;
                heart.style.top = '10px';

                petElement.appendChild(heart);

                setTimeout(() => heart.remove(), 1500);
            }, i * 150);
        }
    }

    function showPartnerBubble(text) {
        if (!petElement) return;
        const bubble = petElement.querySelector('.desk-pet-partner-bubble');
        if (!bubble) return;
        bubble.textContent = text;
        bubble.classList.add('show');
    }

    function hidePartnerBubble() {
        if (!petElement) return;
        const bubble = petElement.querySelector('.desk-pet-partner-bubble');
        if (!bubble) return;
        bubble.classList.remove('show');
    }

    // ========== 对方随机互动 ==========

    function startPartnerEvents() {
        stopPartnerEvents();
        scheduleNextPartnerEvent();
    }

    function stopPartnerEvents() {
        if (partnerEventTimer) {
            clearTimeout(partnerEventTimer);
            partnerEventTimer = null;
        }
    }

    function scheduleNextPartnerEvent() {
        // 随机 30-120 秒后触发
        const delay = 30000 + Math.random() * 90000;
        partnerEventTimer = setTimeout(() => {
            if (!petEnabled || !petElement) return;

            // 50% 概率触发
            if (Math.random() < 0.5) {
                if (Math.random() < 0.5) {
                    triggerPartnerStroke();
                } else {
                    triggerPartnerPat();
                }
            }

            scheduleNextPartnerEvent();
        }, delay);
    }

    function triggerPartnerStroke() {
        if (!petElement) return;

        // 爱心特效
        spawnHearts();

        // 发送系统消息
        sendSystemMessage('对方摸了摸你的桌宠');

        // 对方抚摸气泡
        showPartnerBubble('对方摸了摸你的桌宠~');
        setTimeout(() => hidePartnerBubble(), 2500);

        // 轻微抖动
        petElement.classList.remove('shaking');
        void petElement.offsetWidth;
        petElement.classList.add('shaking');
        setTimeout(() => petElement.classList.remove('shaking'), 500);
    }

    function triggerPartnerPat() {
        if (!petElement) return;

        // 弹跳动画
        petElement.classList.remove('bouncing');
        void petElement.offsetWidth;
        petElement.classList.add('bouncing');
        setTimeout(() => petElement.classList.remove('bouncing'), 600);

        // 发送系统消息
        sendSystemMessage('对方拍了拍你的桌宠');

        // 对方拍拍气泡
        showPartnerBubble('对方拍了拍你的桌宠~');
        setTimeout(() => hidePartnerBubble(), 2500);
    }

    // ========== 设置面板 ==========

    function openSettings() {
        if (settingsPanel) {
            closeSettings();
            return;
        }

        injectStyles();

        // 遮罩
        const mask = document.createElement('div');
        mask.className = 'desk-pet-mask';
        mask.addEventListener('click', closeSettings);

        // 面板
        const panel = document.createElement('div');
        panel.className = 'desk-pet-settings';
        panel.innerHTML = `
            <button class="desk-pet-settings-close" id="desk-pet-settings-close">&times;</button>
            <h3>桌宠设置</h3>
            <div class="desk-pet-preview" id="desk-pet-preview">
                ${petImage ? `<img src="${petImage}">` : '<i class="fas fa-cat placeholder-icon"></i>'}
            </div>
            <div class="desk-pet-actions">
                <button class="desk-pet-btn desk-pet-btn-secondary" id="desk-pet-import-btn">
                    <i class="fas fa-image"></i> 导入图片
                </button>
                <button class="desk-pet-btn desk-pet-btn-primary" id="desk-pet-generate-btn" ${petImage ? '' : 'disabled style="opacity:0.5;cursor:not-allowed;"'}>
                    <i class="fas fa-magic"></i> 生成桌宠
                </button>
            </div>
            <div class="desk-pet-switch-row">
                <span class="desk-pet-switch-label">桌宠开关</span>
                <div class="desk-pet-switch ${petEnabled ? 'active' : ''}" id="desk-pet-switch"></div>
            </div>
            <input type="file" id="desk-pet-file-input" accept="image/*" style="display:none;">
        `;

        document.body.appendChild(mask);
        document.body.appendChild(panel);
        settingsPanel = { panel, mask };

        // 绑定事件
        document.getElementById('desk-pet-settings-close').addEventListener('click', closeSettings);
        document.getElementById('desk-pet-import-btn').addEventListener('click', onImportClick);
        document.getElementById('desk-pet-generate-btn').addEventListener('click', onGenerateClick);
        document.getElementById('desk-pet-switch').addEventListener('click', onSwitchToggle);
        document.getElementById('desk-pet-file-input').addEventListener('change', onFileSelected);
    }

    function closeSettings() {
        if (settingsPanel) {
            settingsPanel.panel.remove();
            settingsPanel.mask.remove();
            settingsPanel = null;
        }
        closeCropModal();
    }

    function onImportClick() {
        document.getElementById('desk-pet-file-input').click();
    }

    function onFileSelected(e) {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showToast('请选择图片文件');
            return;
        }

        const reader = new FileReader();
        reader.onload = function (ev) {
            openCropModal(ev.target.result);
        };
        reader.readAsDataURL(file);

        // 重置 input
        e.target.value = '';
    }

    function onGenerateClick() {
        if (!petImage) return;
        savePetEnabled(true);
        updateSwitchState();
        createPetElement();
        showToast('桌宠已生成！');
    }

    function onSwitchToggle() {
        const newState = !petEnabled;
        savePetEnabled(newState);
        updateSwitchState();

        if (newState) {
            createPetElement();
            showToast('桌宠已开启');
        } else {
            removePetElement();
            showToast('桌宠已关闭');
        }
    }

    function updateSwitchState() {
        if (!settingsPanel) return;
        const sw = document.getElementById('desk-pet-switch');
        if (sw) {
            sw.classList.toggle('active', petEnabled);
        }
    }

    // ========== 图片裁剪 ==========

    // 将鼠标/触摸事件坐标转换为 canvas 内部坐标
    function getCanvasPos(e) {
        if (!cropCanvas) return { x: 0, y: 0 };
        const rect = cropCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const scaleX = cropCanvas.width / rect.width;
        const scaleY = cropCanvas.height / rect.height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    // 套索绘制：开始（按下）
    function onLassoStart(e) {
        if (!lassoMode) return;
        e.preventDefault();
        isDrawing = true;
        lassoPath = [];
        lassoPath.push(getCanvasPos(e));
        drawCropCanvas();
    }

    // 套索绘制：移动中追加路径点
    function onLassoMove(e) {
        if (!lassoMode || !isDrawing) return;
        e.preventDefault();
        lassoPath.push(getCanvasPos(e));
        drawCropCanvas();
    }

    // 套索绘制：结束（抬起），自动闭合路径
    function onLassoEnd(e) {
        if (!lassoMode || !isDrawing) return;
        isDrawing = false;
        // 点数过少则视为无效路径
        if (lassoPath.length < 3) {
            lassoPath = [];
        }
        drawCropCanvas();
    }

    function openCropModal(imageData) {
        closeCropModal();

        // 重置套索状态（默认套索模式）
        lassoMode = true;
        lassoPath = [];
        isDrawing = false;

        const overlay = document.createElement('div');
        overlay.className = 'desk-pet-crop-overlay';
        overlay.id = 'desk-pet-crop-overlay';
        overlay.innerHTML = `
            <div class="desk-pet-crop-modal">
                <h4>裁剪图片</h4>
                <div class="desk-pet-crop-mode-switch">
                    <button class="desk-pet-crop-mode-btn active" data-mode="lasso">套索</button>
                    <button class="desk-pet-crop-mode-btn" data-mode="rect">矩形</button>
                </div>
                <div class="desk-pet-crop-canvas-wrapper lasso-mode" id="desk-pet-crop-wrapper">
                    <canvas id="desk-pet-crop-canvas" width="280" height="280"></canvas>
                    <div class="desk-pet-crop-box" id="desk-pet-crop-box">
                        <div class="desk-pet-crop-handle tl" data-mode="tl"></div>
                        <div class="desk-pet-crop-handle tr" data-mode="tr"></div>
                        <div class="desk-pet-crop-handle bl" data-mode="bl"></div>
                        <div class="desk-pet-crop-handle br" data-mode="br"></div>
                    </div>
                </div>
                <div class="desk-pet-crop-tip" id="desk-pet-crop-tip">在图片上自由绘制路径裁剪，路径外将变为透明</div>
                <div class="desk-pet-crop-actions">
                    <button class="desk-pet-btn desk-pet-btn-secondary" id="desk-pet-crop-clear">清除路径</button>
                    <button class="desk-pet-btn desk-pet-btn-secondary" id="desk-pet-crop-cancel">取消</button>
                    <button class="desk-pet-btn desk-pet-btn-primary" id="desk-pet-crop-confirm">确认</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        cropCanvas = document.getElementById('desk-pet-crop-canvas');
        const wrapper = document.getElementById('desk-pet-crop-wrapper');
        const cropBoxEl = document.getElementById('desk-pet-crop-box');
        const tipEl = document.getElementById('desk-pet-crop-tip');
        const canvasSize = 280;

        // 初始化矩形裁剪框：80% 大小，居中（用于矩形模式）
        cropBoxW = Math.round(canvasSize * 0.8);
        cropBoxH = Math.round(canvasSize * 0.8);
        cropBoxX = Math.round((canvasSize - cropBoxW) / 2);
        cropBoxY = Math.round((canvasSize - cropBoxH) / 2);

        function updateCropBoxDom() {
            if (!cropBoxEl) return;
            cropBoxEl.style.left = cropBoxX + 'px';
            cropBoxEl.style.top = cropBoxY + 'px';
            cropBoxEl.style.width = cropBoxW + 'px';
            cropBoxEl.style.height = cropBoxH + 'px';
        }
        updateCropBoxDom();

        // 适配图片：contain=true 整张图片完整显示，false 按一维填充（可溢出拖动）
        function fitImage(contain) {
            if (!cropImage) return;
            const imgRatio = cropImage.width / cropImage.height;
            if (contain) {
                // 套索模式：整张图完整显示在 canvas 内，便于圈选
                cropScale = imgRatio > 1 ? canvasSize / cropImage.width : canvasSize / cropImage.height;
            } else {
                // 矩形模式：按一维填充，另一维可溢出，可拖动查看
                cropScale = imgRatio > 1 ? canvasSize / cropImage.height : canvasSize / cropImage.width;
            }
            cropOffsetX = (canvasSize - cropImage.width * cropScale) / 2;
            cropOffsetY = (canvasSize - cropImage.height * cropScale) / 2;
        }

        // 加载图片
        cropImage = new Image();
        cropImage.onload = function () {
            fitImage(lassoMode);
            drawCropCanvas();
        };
        cropImage.src = imageData;

        // ===== 拖动状态 =====
        // dragMode: 'image'（拖动图片）| 'move'（移动裁剪框）| 'tl'/'tr'/'bl'/'br'（角点缩放）
        let dragMode = null;
        let dragStartClientX = 0;
        let dragStartClientY = 0;
        let startBoxX = 0, startBoxY = 0, startBoxW = 0, startBoxH = 0;
        let startImgOffsetX = 0, startImgOffsetY = 0;

        function clampImageOffset() {
            const scaledWidth = cropImage.width * cropScale;
            const scaledHeight = cropImage.height * cropScale;
            if (scaledWidth >= canvasSize) {
                if (cropOffsetX > 0) cropOffsetX = 0;
                if (cropOffsetX < canvasSize - scaledWidth) cropOffsetX = canvasSize - scaledWidth;
            } else {
                cropOffsetX = (canvasSize - scaledWidth) / 2;
            }
            if (scaledHeight >= canvasSize) {
                if (cropOffsetY > 0) cropOffsetY = 0;
                if (cropOffsetY < canvasSize - scaledHeight) cropOffsetY = canvasSize - scaledHeight;
            } else {
                cropOffsetY = (canvasSize - scaledHeight) / 2;
            }
        }

        function pointerDown(e, mode) {
            e.preventDefault();
            e.stopPropagation();
            dragMode = mode;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            dragStartClientX = clientX;
            dragStartClientY = clientY;
            startBoxX = cropBoxX; startBoxY = cropBoxY;
            startBoxW = cropBoxW; startBoxH = cropBoxH;
            startImgOffsetX = cropOffsetX; startImgOffsetY = cropOffsetY;
        }

        function pointerMove(e) {
            if (!dragMode || !cropImage) return;
            e.preventDefault();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const dx = clientX - dragStartClientX;
            const dy = clientY - dragStartClientY;
            const minSize = 40;

            if (dragMode === 'image') {
                // 拖动图片本身
                cropOffsetX = startImgOffsetX + dx;
                cropOffsetY = startImgOffsetY + dy;
                clampImageOffset();
                drawCropCanvas();
            } else if (dragMode === 'move') {
                // 移动裁剪框
                let nx = startBoxX + dx;
                let ny = startBoxY + dy;
                nx = Math.max(0, Math.min(canvasSize - cropBoxW, nx));
                ny = Math.max(0, Math.min(canvasSize - cropBoxH, ny));
                cropBoxX = nx;
                cropBoxY = ny;
                updateCropBoxDom();
                drawCropCanvas();
            } else {
                // 角点缩放
                const left = dragMode.indexOf('l') !== -1;
                const right = dragMode.indexOf('r') !== -1;
                const top = dragMode.indexOf('t') !== -1;
                const bottom = dragMode.indexOf('b') !== -1;

                let nx = startBoxX, ny = startBoxY, nw = startBoxW, nh = startBoxH;
                if (left) { nx = startBoxX + dx; nw = startBoxW - dx; }
                if (right) { nw = startBoxW + dx; }
                if (top) { ny = startBoxY + dy; nh = startBoxH - dy; }
                if (bottom) { nh = startBoxH + dy; }

                // 最小尺寸约束
                if (nw < minSize) {
                    if (left) nx = startBoxX + startBoxW - minSize;
                    nw = minSize;
                }
                if (nh < minSize) {
                    if (top) ny = startBoxY + startBoxH - minSize;
                    nh = minSize;
                }

                // 限制在 canvas 范围内
                if (nx < 0) { nw += nx; nx = 0; }
                if (ny < 0) { nh += ny; ny = 0; }
                if (nx + nw > canvasSize) nw = canvasSize - nx;
                if (ny + nh > canvasSize) nh = canvasSize - ny;
                if (nw < minSize) nw = minSize;
                if (nh < minSize) nh = minSize;

                cropBoxX = nx; cropBoxY = ny; cropBoxW = nw; cropBoxH = nh;
                updateCropBoxDom();
                drawCropCanvas();
            }
        }

        function pointerUp() {
            dragMode = null;
        }

        // 统一指针处理：根据当前模式分流到套索或矩形逻辑
        function onCanvasDown(e) {
            if (lassoMode) {
                onLassoStart(e);
            } else {
                pointerDown(e, 'image');
            }
        }
        function onCanvasMove(e) {
            if (lassoMode) {
                onLassoMove(e);
            } else {
                pointerMove(e);
            }
        }
        function onCanvasUp(e) {
            if (lassoMode) {
                onLassoEnd(e);
            } else {
                pointerUp();
            }
        }

        // 切换裁剪模式（套索 / 矩形）
        function switchMode(mode) {
            const newIsLasso = (mode === 'lasso');
            lassoMode = newIsLasso;
            // 按钮高亮
            overlay.querySelectorAll('.desk-pet-crop-mode-btn').forEach((btn) => {
                btn.classList.toggle('active', btn.dataset.mode === mode);
            });
            // wrapper 样式切换（光标 + 显隐矩形裁剪框）
            wrapper.classList.toggle('lasso-mode', newIsLasso);
            wrapper.classList.toggle('rect-mode', !newIsLasso);
            // 清除套索路径
            lassoPath = [];
            isDrawing = false;
            // 重新适配图片（套索=完整显示，矩形=可溢出填充）
            if (cropImage) {
                fitImage(newIsLasso);
            }
            // 矩形模式重置裁剪框居中
            if (!newIsLasso) {
                cropBoxW = Math.round(canvasSize * 0.8);
                cropBoxH = Math.round(canvasSize * 0.8);
                cropBoxX = Math.round((canvasSize - cropBoxW) / 2);
                cropBoxY = Math.round((canvasSize - cropBoxH) / 2);
                updateCropBoxDom();
            }
            // 清除路径按钮仅在套索模式显示
            const clearBtnEl = document.getElementById('desk-pet-crop-clear');
            if (clearBtnEl) clearBtnEl.style.display = newIsLasso ? '' : 'none';
            // 提示文案
            if (tipEl) {
                tipEl.textContent = newIsLasso
                    ? '在图片上自由绘制路径裁剪，路径外将变为透明'
                    : '拖动图片调整位置，拖动裁剪框移动，拖动角点调整大小';
            }
            drawCropCanvas();
        }

        // 画布指针事件（套索模式下绘制路径，矩形模式下拖动图片）
        wrapper.addEventListener('mousedown', onCanvasDown);
        wrapper.addEventListener('touchstart', onCanvasDown, { passive: false });

        // 矩形裁剪框移动（仅矩形模式生效，套索模式下裁剪框已隐藏）
        cropBoxEl.addEventListener('mousedown', (e) => pointerDown(e, 'move'));
        cropBoxEl.addEventListener('touchstart', (e) => pointerDown(e, 'move'), { passive: false });

        // 四角调整大小
        cropBoxEl.querySelectorAll('.desk-pet-crop-handle').forEach((handle) => {
            const mode = handle.dataset.mode;
            handle.addEventListener('mousedown', (e) => pointerDown(e, mode));
            handle.addEventListener('touchstart', (e) => pointerDown(e, mode), { passive: false });
        });

        document.addEventListener('mousemove', onCanvasMove);
        document.addEventListener('mouseup', onCanvasUp);
        document.addEventListener('touchmove', onCanvasMove, { passive: false });
        document.addEventListener('touchend', onCanvasUp);

        // 关闭时移除 document 级监听，避免重复绑定
        cropCleanupListeners = function () {
            document.removeEventListener('mousemove', onCanvasMove);
            document.removeEventListener('mouseup', onCanvasUp);
            document.removeEventListener('touchmove', onCanvasMove);
            document.removeEventListener('touchend', onCanvasUp);
        };

        // 模式切换按钮
        overlay.querySelectorAll('.desk-pet-crop-mode-btn').forEach((btn) => {
            btn.addEventListener('click', () => switchMode(btn.dataset.mode));
        });

        // 清除路径按钮
        const clearBtn = document.getElementById('desk-pet-crop-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                lassoPath = [];
                isDrawing = false;
                drawCropCanvas();
            });
        }

        // 取消/确认按钮
        document.getElementById('desk-pet-crop-cancel').addEventListener('click', closeCropModal);
        document.getElementById('desk-pet-crop-confirm').addEventListener('click', confirmCrop);
    }

    function drawCropCanvas() {
        if (!cropCanvas || !cropImage) return;
        const ctx = cropCanvas.getContext('2d');
        const canvasSize = cropCanvas.width;
        ctx.clearRect(0, 0, canvasSize, canvasSize);

        // 绘制棋盘格背景（表示透明区域）
        const gridSize = 14;
        for (let y = 0; y < canvasSize; y += gridSize) {
            for (let x = 0; x < canvasSize; x += gridSize) {
                ctx.fillStyle = ((x / gridSize + y / gridSize) % 2 < 1) ? '#f0f0f0' : '#ffffff';
                ctx.fillRect(x, y, gridSize, gridSize);
            }
        }

        // 绘制图片
        ctx.drawImage(
            cropImage,
            cropOffsetX,
            cropOffsetY,
            cropImage.width * cropScale,
            cropImage.height * cropScale
        );

        if (lassoMode) {
            // 套索模式：绘制路径及路径外遮罩
            if (lassoPath.length > 1) {
                // 路径线（绿色虚线）
                ctx.save();
                ctx.strokeStyle = '#07c160';
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 4]);
                ctx.beginPath();
                ctx.moveTo(lassoPath[0].x, lassoPath[0].y);
                for (let i = 1; i < lassoPath.length; i++) {
                    ctx.lineTo(lassoPath[i].x, lassoPath[i].y);
                }
                // 绘制结束（抬起）后且点数足够则自动闭合
                if (!isDrawing && lassoPath.length >= 3) {
                    ctx.closePath();
                }
                ctx.stroke();
                ctx.restore();

                // 路径闭合后，路径外加半透明遮罩（保留路径内清晰）
                if (!isDrawing && lassoPath.length >= 3) {
                    ctx.save();
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                    // even-odd 规则：外矩形 + 反向路径，路径内被挖空
                    ctx.beginPath();
                    ctx.rect(0, 0, canvasSize, canvasSize);
                    ctx.moveTo(lassoPath[0].x, lassoPath[0].y);
                    for (let i = lassoPath.length - 1; i >= 0; i--) {
                        ctx.lineTo(lassoPath[i].x, lassoPath[i].y);
                    }
                    ctx.closePath();
                    ctx.fill('evenodd');
                    ctx.restore();
                }
            }
        } else {
            // 矩形模式：裁剪框外的半透明遮罩（四条边）
            const bx = Math.max(0, Math.min(canvasSize, cropBoxX));
            const by = Math.max(0, Math.min(canvasSize, cropBoxY));
            const bw = Math.max(0, Math.min(canvasSize - bx, cropBoxW));
            const bh = Math.max(0, Math.min(canvasSize - by, cropBoxH));
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, canvasSize, by);                                   // 上
            ctx.fillRect(0, by + bh, canvasSize, canvasSize - (by + bh));         // 下
            ctx.fillRect(0, by, bx, bh);                                           // 左
            ctx.fillRect(bx + bw, by, canvasSize - (bx + bw), bh);                // 右
        }
    }

    function confirmCrop() {
        if (!cropCanvas || !cropImage) return;

        let resultData;

        if (lassoMode) {
            // 套索裁剪：沿绘制的路径裁剪出不规则形状
            if (lassoPath.length < 3) {
                showToast('请先在图片上绘制裁剪路径');
                return;
            }
            const canvasSize = cropCanvas.width;

            // 计算路径边界
            let minX = canvasSize, minY = canvasSize, maxX = 0, maxY = 0;
            for (let i = 0; i < lassoPath.length; i++) {
                minX = Math.min(minX, lassoPath[i].x);
                minY = Math.min(minY, lassoPath[i].y);
                maxX = Math.max(maxX, lassoPath[i].x);
                maxY = Math.max(maxY, lassoPath[i].y);
            }
            const pathW = maxX - minX;
            const pathH = maxY - minY;
            if (pathW < 5 || pathH < 5) {
                showToast('请绘制更大的裁剪区域');
                return;
            }

            // 输出 canvas 大小为路径边界大小（长边缩放到 200px）
            const maxOut = 200;
            const scale = (pathW >= pathH) ? (maxOut / pathW) : (maxOut / pathH);
            const outW = Math.max(1, Math.round(pathW * scale));
            const outH = Math.max(1, Math.round(pathH * scale));

            const outCanvas = document.createElement('canvas');
            outCanvas.width = outW;
            outCanvas.height = outH;
            const outCtx = outCanvas.getContext('2d');

            // 用路径裁剪：将路径点映射到输出 canvas 坐标
            outCtx.beginPath();
            outCtx.moveTo((lassoPath[0].x - minX) * scale, (lassoPath[0].y - minY) * scale);
            for (let i = 1; i < lassoPath.length; i++) {
                outCtx.lineTo((lassoPath[i].x - minX) * scale, (lassoPath[i].y - minY) * scale);
            }
            outCtx.closePath();
            outCtx.clip();

            // 绘制图片：将路径边界对应的源图片区域映射到输出 canvas
            // 路径外区域因被 clip 裁掉，自动保持透明
            outCtx.drawImage(
                cropImage,
                (minX - cropOffsetX) / cropScale, (minY - cropOffsetY) / cropScale,  // 源 x, y
                pathW / cropScale, pathH / cropScale,                                  // 源 w, h
                0, 0, outW, outH                                                       // 目标
            );

            resultData = outCanvas.toDataURL('image/png');
        } else {
            // 矩形裁剪（保留原有逻辑）
            const srcX = (cropBoxX - cropOffsetX) / cropScale;
            const srcY = (cropBoxY - cropOffsetY) / cropScale;
            const srcW = cropBoxW / cropScale;
            const srcH = cropBoxH / cropScale;

            // 输出尺寸保留裁剪框比例，长边为 200px
            const maxOut = 200;
            let outW, outH;
            if (cropBoxW >= cropBoxH) {
                outW = maxOut;
                outH = Math.max(1, Math.round(maxOut * cropBoxH / cropBoxW));
            } else {
                outH = maxOut;
                outW = Math.max(1, Math.round(maxOut * cropBoxW / cropBoxH));
            }

            const outCanvas = document.createElement('canvas');
            outCanvas.width = outW;
            outCanvas.height = outH;
            const outCtx = outCanvas.getContext('2d');

            // 保留透明背景；裁剪框超出图片边界的部分将自动保持透明
            outCtx.drawImage(
                cropImage,
                srcX, srcY, srcW, srcH,
                0, 0, outW, outH
            );

            resultData = outCanvas.toDataURL('image/png');
        }

        savePetImage(resultData);

        // 更新预览
        const preview = document.getElementById('desk-pet-preview');
        if (preview) {
            preview.innerHTML = `<img src="${resultData}">`;
        }

        // 更新生成按钮状态
        const genBtn = document.getElementById('desk-pet-generate-btn');
        if (genBtn) {
            genBtn.disabled = false;
            genBtn.style.opacity = '1';
            genBtn.style.cursor = 'pointer';
        }

        // 更新桌宠显示
        if (petElement) {
            updatePetImage();
        }

        closeCropModal();
        showToast('图片裁剪成功');
    }

    function closeCropModal() {
        const overlay = document.getElementById('desk-pet-crop-overlay');
        if (overlay) overlay.remove();
        if (cropCleanupListeners) {
            cropCleanupListeners();
            cropCleanupListeners = null;
        }
        cropCanvas = null;
        cropImage = null;
        cropBoxX = 0;
        cropBoxY = 0;
        cropBoxW = 0;
        cropBoxH = 0;
        // 重置套索状态（下次打开默认回到套索模式）
        lassoMode = true;
        lassoPath = [];
        isDrawing = false;
    }

    // ========== Toast 提示 ==========

    function showToast(msg) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg);
            return;
        }
        // 简易 toast
        const toast = document.createElement('div');
        toast.textContent = msg;
        toast.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 10004;
            animation: toast-fade 2s ease-out forwards;
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    }

    // ========== 初始化 ==========

    function init() {
        loadSettings();
        injectStyles();

        if (petEnabled) {
            // 延迟创建，确保页面加载完成
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', createPetElement);
            } else {
                createPetElement();
            }
        }

        // 暴露全局方法
        window.DeskPetApp = {
            openSettings: openSettings,
            closeSettings: closeSettings,
            isEnabled: () => petEnabled,
            getPetImage: () => petImage
        };
    }

    // 注入 toast 动画样式
    function injectToastAnimation() {
        if (document.getElementById('desk-pet-toast-style')) return;
        const style = document.createElement('style');
        style.id = 'desk-pet-toast-style';
        style.textContent = `
            @keyframes toast-fade {
                0% { opacity: 0; transform: translate(-50%, -40%); }
                15% { opacity: 1; transform: translate(-50%, -50%); }
                85% { opacity: 1; transform: translate(-50%, -50%); }
                100% { opacity: 0; transform: translate(-50%, -60%); }
            }
        `;
        document.head.appendChild(style);
    }

    // 启动
    injectToastAnimation();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
