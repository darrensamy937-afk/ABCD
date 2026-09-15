(function(){
    'use strict';
    if (window.MusicBuddyApp && window.MusicBuddyApp.__inlineMusicBuddyEntry) return;
    let opening = false;

    function getPage() {
        return document.getElementById('music-buddy-page');
    }

    function hideOtherFullPages() {
        var home = document.getElementById('home-container');
        var chat = document.querySelector('.main-chat-area');
        var musicGame = document.getElementById('music-game-page');
        if (home) {
            home.classList.remove('active');
            home.style.display = 'none';
        }
        if (chat) chat.style.display = 'none';
        if (musicGame) musicGame.style.display = 'none';
        document.body.classList.add('music-buddy-open');
    }

    function restoreHome() {
        document.body.classList.remove('music-buddy-open');
        if (typeof window.showHomePage === 'function') {
            window.showHomePage();
            return;
        }
        var home = document.getElementById('home-container');
        if (home) {
            home.classList.add('active');
            home.style.display = 'flex';
        }
    }

    function open() {
        var page = getPage();
        if (!page) return false;
        if (opening) return false;
        opening = true;
        setTimeout(function(){ opening = false; }, 250);

        // First-time initialization of the inline music player app
        if (window.MusicBuddyApp && typeof window.MusicBuddyApp.init === 'function' && !window.MusicBuddyApp._initialized) {
            try {
                window.MusicBuddyApp.init();
            } catch(e) { console.error('[MusicBuddy] init error:', e); }
            window.MusicBuddyApp._initialized = true;
        }

        hideOtherFullPages();
        page.style.display = 'flex';
        // Hide global floating player when entering music buddy
        if (window.MusicBuddyApp && window.MusicBuddyApp.hideGlobalFloat) {
            window.MusicBuddyApp.hideGlobalFloat();
        }
        return false;
    }

    function openFromIcon(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
            if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        }
        open();
        return false;
    }

    function close() {
        var page = getPage();
        if (!page) return;
        page.style.display = 'none';
        // Show global floating player when leaving music buddy
        if (window.MusicBuddyApp && window.MusicBuddyApp.showGlobalFloat) {
            window.MusicBuddyApp.showGlobalFloat();
        }
        restoreHome();
    }

    function reload() {
        // 使用完整的重载函数：清除定时器、关闭弹窗、重置标志后再 init
        if (window.MusicBuddyApp && typeof window.MusicBuddyApp.reloadApp === 'function') {
            try {
                window.MusicBuddyApp.reloadApp();
            } catch(e) { console.error('[MusicBuddy] reload error:', e); }
            window.MusicBuddyApp._initialized = true;
        } else if (window.MusicBuddyApp && typeof window.MusicBuddyApp.init === 'function') {
            try {
                window.MusicBuddyApp.init();
            } catch(e) { console.error('[MusicBuddy] reload init error:', e); }
            window.MusicBuddyApp._initialized = true;
        }
    }

    document.addEventListener('click', function(e) {
        var icon = e.target.closest('.app-icon[data-app="music-buddy"]');
        var item = e.target.closest('.app-item');
        if (!icon && !(item && item.querySelector('.app-icon[data-app="music-buddy"]'))) return;
        openFromIcon(e);
    }, true);

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            var page = getPage();
            if (!page || page.style.display === 'none') return;
            
            // 优先关闭弹窗/全屏播放器/对方主页，而不是直接关闭整个应用
            var mbRoot = page;
            var fullPlayer = document.getElementById('fullPlayer');
            var partnerPage = document.getElementById('partnerPage');
            var openModals = mbRoot.querySelectorAll('.mb-modal.show');
            var notifPopup = document.getElementById('notifPopup');
            var chatCard = document.getElementById('chatCard');
            
            // 如果通知弹窗正在显示，先关闭通知
            if (notifPopup && notifPopup.classList.contains('show')) {
                e.preventDefault();
                e.stopPropagation();
                notifPopup.classList.remove('show');
                return;
            }
            
            // 如果有弹窗打开，先关闭弹窗
            if (openModals && openModals.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                openModals.forEach(function(m) { m.classList.remove('show'); });
                return;
            }
            
            // 如果对方主页打开，先关闭对方主页
            if (partnerPage && partnerPage.classList.contains('show')) {
                e.preventDefault();
                e.stopPropagation();
                partnerPage.classList.remove('show');
                return;
            }
            
            // 如果全屏播放器打开，先关闭全屏播放器
            if (fullPlayer && fullPlayer.classList.contains('show')) {
                e.preventDefault();
                e.stopPropagation();
                fullPlayer.classList.remove('show');
                var wrap = page.querySelector('.mb-app-wrap');
                if (wrap) {
                    setTimeout(function() {
                        if (!fullPlayer.classList.contains('show')) {
                            wrap.classList.remove('fp-open');
                        }
                    }, 380);
                }
                if (chatCard) { chatCard.classList.remove('show'); }
                return;
            }
            
            // 没有任何弹窗/播放器打开时，才关闭整个应用
            close();
        }
    }, true); // 使用捕获阶段，确保在 app 内部处理器之前执行

    window.MusicBuddyApp = {
        __inlineMusicBuddyEntry: true,
        open: open,
        openFromIcon: openFromIcon,
        close: close,
        reload: reload
    };
})();
