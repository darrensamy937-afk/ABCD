/**
 * 直播应用 · 入口控制器
 * 负责页面显隐、图标点击拦截、ESC关闭等
 */
(function(){
    'use strict';
    if (window.LiveStreamApp && window.LiveStreamApp.__entry) return;

    var opening = false;

    function hideOtherFullPages() {
        var home = document.getElementById('home-container');
        if (home) home.style.display = 'none';
        var chat = document.querySelector('.main-chat-area');
        if (chat) chat.style.display = 'none';
        // 隐藏其他全页功能
        var pages = document.querySelectorAll('[id$="-page"]');
        pages.forEach(function(p) {
            if (p.id !== 'live-stream-page' && p.id !== 'home-container') {
                p.style.display = 'none';
            }
        });
        document.body.classList.add('ls-active');
    }

    function restoreHome() {
        var home = document.getElementById('home-container');
        if (home) home.style.display = '';
        document.body.classList.remove('ls-active');
        if (typeof window.showHomePage === 'function') {
            window.showHomePage();
        }
    }

    function open() {
        var page = document.getElementById('live-stream-page');
        if (!page) return false;
        if (opening) return false;
        opening = true;
        setTimeout(function(){ opening = false; }, 300);

        // 首次打开时初始化
        if (window.LiveStreamApp && !window.LiveStreamApp._initialized) {
            window.LiveStreamApp.init();
            window.LiveStreamApp._initialized = true;
        }

        hideOtherFullPages();
        page.style.display = 'flex';
        return false;
    }

    function openFromIcon(event) {
        if (event) { event.preventDefault(); event.stopPropagation(); }
        open();
        return false;
    }

    function close() {
        var page = document.getElementById('live-stream-page');
        if (page) page.style.display = 'none';
        restoreHome();
    }

    function reload() {
        if (window.LiveStreamApp && window.LiveStreamApp._reload) {
            window.LiveStreamApp._reload();
        }
    }

    // 捕获阶段监听图标点击
    document.addEventListener('click', function(e) {
        var icon = e.target.closest('.app-icon[data-app="live-stream"]');
        if (!icon) return;
        openFromIcon(e);
    }, true);

    // ESC 关闭（带弹窗优先级处理）
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return;
        var page = document.getElementById('live-stream-page');
        if (!page || page.style.display === 'none') return;

        // 优先关闭弹窗
        var modals = page.querySelectorAll('.ls-modal-overlay[style*="display: flex"], .ls-modal-overlay[style*="display:flex"]');
        if (modals.length > 0) {
            modals.forEach(function(m) { m.style.display = 'none'; });
            e.preventDefault();
            return;
        }
        // 其次关闭子视图
        var subViews = page.querySelectorAll('.ls-records-view[style*="display: flex"], .ls-settings-view[style*="display: flex"], .ls-analysis-view[style*="display: flex"]');
        if (subViews.length > 0) {
            subViews.forEach(function(v) { v.style.display = 'none'; });
            e.preventDefault();
            return;
        }
        // 最后关闭整个应用
        close();
    }, true);

    window.LiveStreamApp = {
        __entry: true,
        open: open,
        openFromIcon: openFromIcon,
        close: close,
        reload: reload,
        _initialized: false
    };
})();
