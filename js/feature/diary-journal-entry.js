(function(){
    'use strict';
    if (window.DiaryJournalApp && window.DiaryJournalApp.__entry) return;
    let opening = false;

    /* ============ 桥接：向手账日记 iframe 暴露主站字卡/颜文字/表情库/头像 ============
     * 这些数组在 state.js 中以 let 声明（非 window 属性），但与本脚本共享全局词法作用域，
     * 因此此处可直接按名引用，再通过 window 上的函数暴露给同源 iframe。
     */
    window.getDiaryReplyLibrary = function () {
        return {
            customReplies: (typeof customReplies !== 'undefined' && customReplies) ? customReplies : [],
            kaomojiLibrary: (typeof kaomojiLibrary !== 'undefined' && kaomojiLibrary) ? kaomojiLibrary : [],
            customEmojis: (typeof customEmojis !== 'undefined' && customEmojis) ? customEmojis : [],
            stickerLibrary: (typeof stickerLibrary !== 'undefined' && stickerLibrary) ? stickerLibrary : [],
            myStickerLibrary: (typeof myStickerLibrary !== 'undefined' && myStickerLibrary) ? myStickerLibrary : []
        };
    };
    window.getDiaryPartnerAvatar = function () {
        try {
            if (typeof homeGetGlobal === 'function') {
                const av = homeGetGlobal('home_avatar_partner');
                if (av) return av;
            }
        } catch (e) {}
        try {
            if (typeof settings !== 'undefined' && settings && settings.partnerAvatar) return settings.partnerAvatar;
        } catch (e) {}
        return null;
    };

    function getPage() { return document.getElementById('diary-journal-page'); }
    function getFrame() { return document.getElementById('diary-journal-frame'); }

    function hideOtherFullPages() {
        const home = document.getElementById('home-container');
        const chat = document.querySelector('.main-chat-area');
        if (home) { home.classList.remove('active'); home.style.display = 'none'; }
        if (chat) chat.style.display = 'none';
        document.body.classList.add('diary-journal-open');
    }

    function restoreHome() {
        document.body.classList.remove('diary-journal-open');
        if (typeof window.showHomePage === 'function') { window.showHomePage(); return; }
        const home = document.getElementById('home-container');
        if (home) { home.classList.add('active'); home.style.display = 'flex'; }
    }

    function open() {
        const page = getPage();
        const frame = getFrame();
        if (!page || !frame) {
            (window.showNotification || function(){})('手账日记未加载', 'error');
            return false;
        }
        if (opening) return false;
        opening = true;
        setTimeout(() => { opening = false; }, 250);

        // 懒加载 iframe（首次打开时设置 src）
        if (!frame.dataset.loaded) {
            frame.src = 'diary-journal.html';
            frame.dataset.loaded = '1';
        }
        hideOtherFullPages();
        page.style.display = 'flex';
        try { frame.focus(); } catch (e) {}
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
        const page = getPage();
        if (!page) return;
        page.style.display = 'none';
        restoreHome();
    }

    function reload() {
        const frame = getFrame();
        if (!frame) return;
        frame.removeAttribute('src');
        frame.dataset.loaded = '';
        setTimeout(() => {
            frame.src = 'diary-journal.html';
            frame.dataset.loaded = '1';
        }, 60);
    }

    // 图标点击（捕获阶段，和音游入口一致）
    document.addEventListener('click', e => {
        const icon = e.target.closest('.app-icon[data-app="diary-journal"]');
        const item = e.target.closest('.app-item');
        if (!icon && !(item && item.querySelector('.app-icon[data-app="diary-journal"]'))) return;
        openFromIcon(e);
    }, true);

    // ESC 关闭
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            const page = getPage();
            if (page && page.style.display !== 'none') close();
        }
    });

    window.DiaryJournalApp = { __entry: true, open, openFromIcon, close, reload };
})();
