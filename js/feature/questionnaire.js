/**
 * questionnaire.js - 问卷功能模块
 * 支持创建问卷（选择题/填空题/问答题）、发送给对方、对方填写、字卡抽取回答
 */
(function () {
  'use strict';

  // ========== 数据结构 ==========
  /*
   * 问卷数据结构:
   * {
   *   id: 'qnr_xxx',
   *   title: '问卷标题',
   *   questions: [
   *     {
   *       id: 'q_xxx',
   *       type: 'choice' | 'blank' | 'qa',
   *       title: '题目内容',
   *       timeLimit: 30,          // 秒
   *       // choice 类型:
   *       options: ['选项1','选项2'],
   *       multiple: false,         // 是否多选
   *       // blank 类型:
   *       blankText: '文本内容____挖空____更多',  // ____ 表示挖空位置
   *       blanks: ['挖空1','挖空2'],  // 挖空内容列表
   *       // qa 类型:
   *       qaText: '大文本内容',
   *       qaImage: 'data:image/...' 或 null,
   *     }
   *   ],
   *   totalTime: 120,  // 总时长（秒）
   *   createdAt: Date.now(),
   *   status: 'draft' | 'sent' | 'completed' | 'declined',
   *   answers: null,   // 填写后的答案
   *   answeredAt: null,
   *   inviteAttempts: 0, // 对方邀请用户回答的尝试次数
   * }
   */

  // ========== 工具函数 ==========
  function genId(prefix) {
    return (prefix || 'id_') + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function(s) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s];
    });
  }

  function getPartnerName() {
    return (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '对方';
  }

  function getMyName() {
    return (typeof settings !== 'undefined' && settings.myName) ? settings.myName : '我';
  }

  function getStorageKey(base) {
    if (typeof window.SESSION_ID === 'undefined' || !window.SESSION_ID) {
      if (typeof SESSION_ID !== 'undefined' && SESSION_ID) {
        return (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'CHAT_APP_V3_') + SESSION_ID + '_' + base;
      }
      return 'CHAT_APP_V3_default_' + base;
    }
    return (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'CHAT_APP_V3_') + window.SESSION_ID + '_' + base;
  }

  // 获取字卡列表
  function getWordCards() {
    var cards = [];
    if (typeof customReplies !== 'undefined' && Array.isArray(customReplies)) cards = cards.concat(customReplies);
    if (window._customReplies && Array.isArray(window._customReplies)) cards = cards.concat(window._customReplies);
    if (window._kaomojiLibrary && Array.isArray(window._kaomojiLibrary)) cards = cards.concat(window._kaomojiLibrary);
    // 去重
    var seen = {};
    return cards.filter(function(c) {
      var s = String(c || '').trim();
      if (!s || seen[s]) return false;
      seen[s] = true;
      return true;
    });
  }

  // 随机抽取N张字卡
  function pickRandomCards(n) {
    var cards = getWordCards();
    if (cards.length === 0) return ['（字卡库为空）'];
    n = Math.min(n || 5, cards.length);
    var shuffled = cards.slice().sort(function() { return Math.random() - 0.5; });
    return shuffled.slice(0, n);
  }

  // ========== 问卷数据存储 ==========
  var QNR_STORAGE_KEY = 'questionnaires';

  async function loadQuestionnaires() {
    try {
      if (typeof localforage !== 'undefined') {
        var data = await localforage.getItem(getStorageKey(QNR_STORAGE_KEY));
        if (data && Array.isArray(data)) return data;
      }
    } catch(e) {}
    // localStorage fallback
    try {
      var raw = localStorage.getItem(getStorageKey(QNR_STORAGE_KEY));
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    return [];
  }

  function saveQuestionnaires(list) {
    // 先同步保存到 localStorage（快速、不阻塞）
    try {
      localStorage.setItem(getStorageKey(QNR_STORAGE_KEY), JSON.stringify(list));
    } catch(e) {
      console.warn('[QNR] localStorage保存失败:', e);
    }
    // 异步保存到 localforage（不阻塞UI，加超时保护）
    try {
      if (typeof localforage !== 'undefined') {
        var lfPromise = localforage.setItem(getStorageKey(QNR_STORAGE_KEY), list);
        // 5秒超时保护，防止 localforage 挂起
        Promise.race([
          lfPromise,
          new Promise(function(_, reject) { setTimeout(function() { reject(new Error('timeout')); }, 5000); })
        ]).catch(function(e) {
          console.warn('[QNR] localforage保存失败或超时:', e);
        });
      }
    } catch(e) {
      console.warn('[QNR] localforage调用异常:', e);
    }
    return Promise.resolve();
  }

  // ========== 当前编辑状态 ==========
  var editingQnr = null;   // 正在编辑的问卷
  var qnrList = [];        // 所有问卷列表

  // ========== 创建/编辑问卷界面 ==========
  function openQuestionnaireEditor(existingQnr) {
    closeQuestionnaireEditor();
    editingQnr = existingQnr || {
      id: genId('qnr_'),
      title: '',
      questions: [],
      createdAt: Date.now(),
      status: 'draft'
    };

    var overlay = document.createElement('div');
    overlay.className = 'qnr-overlay active';
    overlay.id = 'qnr-editor-overlay';
    overlay.innerHTML = buildEditorHTML();
    document.body.appendChild(overlay);

    bindEditorEvents();
    renderQuestions();
    updateTotalTime();
  }

  function buildEditorHTML() {
    return '' +
    '<div class="qnr-modal">' +
      '<div class="qnr-editor-header">' +
        '<h3>📝 ' + (editingQnr.title ? '编辑问卷' : '创建问卷') + '</h3>' +
        '<button class="qnr-close-btn" id="qnr-btn-close">✕</button>' +
      '</div>' +
      '<div class="qnr-editor-body">' +
        '<div class="qnr-validation-msg" id="qnr-validation-msg"></div>' +
        '<input type="text" class="qnr-title-input" id="qnr-title" placeholder="问卷标题" value="' + escapeHtml(editingQnr.title) + '">' +
        '<div class="qnr-total-time" id="qnr-total-time">' +
          '<i class="fas fa-clock"></i> 总回答时长：<strong>0</strong> 秒' +
        '</div>' +
        '<div id="qnr-questions-container"></div>' +
        '<div class="qnr-type-selector" id="qnr-type-selector">' +
          '<div class="qnr-type-option" data-q-type="choice">' +
            '<span class="qnr-type-option-icon">📋</span>' +
            '<div class="qnr-type-option-info">' +
              '<div class="qnr-type-option-title">选择题</div>' +
              '<div class="qnr-type-option-desc">单选或多选，设置选项</div>' +
            '</div>' +
          '</div>' +
          '<div class="qnr-type-option" data-q-type="blank">' +
            '<span class="qnr-type-option-icon">✏️</span>' +
            '<div class="qnr-type-option-info">' +
              '<div class="qnr-type-option-title">填空题</div>' +
              '<div class="qnr-type-option-desc">挖空填答，对方从字卡抽取回答</div>' +
            '</div>' +
          '</div>' +
          '<div class="qnr-type-option" data-q-type="qa">' +
            '<span class="qnr-type-option-icon">💬</span>' +
            '<div class="qnr-type-option-info">' +
              '<div class="qnr-type-option-title">问答题</div>' +
              '<div class="qnr-type-option-desc">可导入大文本或图片，对方从字卡抽取回答</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<button class="qnr-add-question-btn" id="qnr-add-question-btn">' +
          '<i class="fas fa-plus"></i> 添加题目' +
        '</button>' +
      '</div>' +
      '<div class="qnr-editor-footer">' +
        '<button class="qnr-btn qnr-btn-cancel" id="qnr-btn-cancel">取消</button>' +
        '<button class="qnr-btn qnr-btn-save" id="qnr-btn-save">保存</button>' +
        '<button class="qnr-btn qnr-btn-send" id="qnr-btn-send">保存并发送</button>' +
      '</div>' +
    '</div>';
  }

  function bindEditorEvents() {
    var titleInput = document.getElementById('qnr-title');
    if (titleInput) {
      titleInput.addEventListener('input', function() {
        editingQnr.title = this.value;
      });
    }

    // 关闭按钮
    var closeBtn = document.getElementById('qnr-btn-close');
    if (closeBtn) closeBtn.addEventListener('click', function(e) { e.preventDefault(); closeQuestionnaireEditor(); });

    // 取消按钮
    var cancelBtn = document.getElementById('qnr-btn-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function(e) { e.preventDefault(); closeQuestionnaireEditor(); });

    // 保存按钮
    var saveBtn = document.getElementById('qnr-btn-save');
    if (saveBtn) saveBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('[QNR] 保存按钮被点击');
      saveQuestionnaire(false);
    });

    // 保存并发送按钮
    var sendBtn = document.getElementById('qnr-btn-send');
    if (sendBtn) sendBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('[QNR] 保存并发送按钮被点击');
      saveQuestionnaire(true);
    });

    // 添加题目按钮
    var addQBtn = document.getElementById('qnr-add-question-btn');
    if (addQBtn) addQBtn.addEventListener('click', function(e) { e.preventDefault(); toggleTypeSelector(); });

    // 题目类型选项
    var typeOptions = document.querySelectorAll('.qnr-type-option[data-q-type]');
    typeOptions.forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.preventDefault();
        var type = el.getAttribute('data-q-type');
        if (type) addQuestion(type);
      });
    });
  }

  function toggleTypeSelector() {
    var sel = document.getElementById('qnr-type-selector');
    if (sel) sel.classList.toggle('active');
  }

  function addQuestion(type) {
    var q = {
      id: genId('q_'),
      type: type,
      title: '',
      timeLimit: 30
    };
    if (type === 'choice') {
      q.options = ['', ''];
      q.multiple = false;
    } else if (type === 'blank') {
      q.blankText = '';
      q.blanks = [];
    } else if (type === 'qa') {
      q.qaText = '';
      q.qaImages = [];  // 支持多张图片
    }
    editingQnr.questions.push(q);
    document.getElementById('qnr-type-selector').classList.remove('active');
    renderQuestions();
    updateTotalTime();
  }

  function deleteQuestion(idx) {
    editingQnr.questions.splice(idx, 1);
    renderQuestions();
    updateTotalTime();
  }

  function renderQuestions() {
    var container = document.getElementById('qnr-questions-container');
    if (!container) return;
    if (editingQnr.questions.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:20px;color:#999;font-size:13px;">还没有题目，点击下方按钮添加</div>';
      return;
    }
    container.innerHTML = editingQnr.questions.map(function(q, idx) {
      return renderQuestionCard(q, idx);
    }).join('');

    // 事件委托：处理所有 data-action 按钮点击（只需绑定一次，容器不会被 innerHTML 替换）
    if (!container._qnrDelegated) {
      container._qnrDelegated = true;
      container.addEventListener('click', function(e) {
        var el = e.target.closest('[data-action]');
        if (!el) return;
        var action = el.getAttribute('data-action');
        var idx = parseInt(el.getAttribute('data-idx'));
        if (isNaN(idx)) return;
        if (action === 'del-q') {
          e.preventDefault();
          deleteQuestion(idx);
        } else if (action === 'del-opt') {
          e.preventDefault();
          removeOption(idx, parseInt(el.getAttribute('data-oi')));
        } else if (action === 'add-opt') {
          e.preventDefault();
          addOption(idx);
        } else if (action === 'del-qa-img') {
          e.preventDefault();
          removeQaImage(idx, parseInt(el.getAttribute('data-img-idx')));
        } else if (action === 'focus-blank') {
          e.preventDefault();
          focusBlank(idx, parseInt(el.getAttribute('data-blank-idx')));
        }
      });
    }

    // 绑定 input/change 事件（每次渲染都需要重新绑定，因为子元素被替换了）
    editingQnr.questions.forEach(function(q, idx) {
      var titleEl = document.getElementById('qnr-q-title-' + idx);
      if (titleEl) {
        titleEl.addEventListener('input', function() { q.title = this.value; });
      }
      var timeEl = document.getElementById('qnr-q-time-' + idx);
      if (timeEl) {
        timeEl.addEventListener('input', function() { q.timeLimit = parseInt(this.value) || 30; updateTotalTime(); });
      }
      if (q.type === 'choice') {
        q.options.forEach(function(opt, oi) {
          var optEl = document.getElementById('qnr-opt-' + idx + '-' + oi);
          if (optEl) optEl.addEventListener('input', function() { q.options[oi] = this.value; });
        });
        var multiEl = document.getElementById('qnr-multi-' + idx);
        if (multiEl) multiEl.addEventListener('change', function() { q.multiple = this.checked; });
      } else if (q.type === 'blank') {
        var blankEl = document.getElementById('qnr-blank-text-' + idx);
        if (blankEl) blankEl.addEventListener('input', function() {
          q.blankText = this.value;
          renderBlankPreview(idx);
        });
        renderBlankPreview(idx);
      } else if (q.type === 'qa') {
        var qaEl = document.getElementById('qnr-qa-text-' + idx);
        if (qaEl) qaEl.addEventListener('input', function() { q.qaText = this.value; });
        var imgBtn = document.getElementById('qnr-qa-img-btn-' + idx);
        if (imgBtn) imgBtn.addEventListener('click', function() {
          var input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.multiple = true;
          input.onchange = function(e) {
            var files = Array.prototype.slice.call(e.target.files);
            if (files.length === 0) return;
            if (q.qaImage && !q.qaImages) { q.qaImages = [q.qaImage]; q.qaImage = null; }
            if (!q.qaImages) q.qaImages = [];
            var remaining = files.length;
            files.forEach(function(file) {
              var reader = new FileReader();
              reader.onload = function(ev) {
                q.qaImages.push(ev.target.result);
                remaining--;
                if (remaining === 0) {
                  renderQuestions();
                }
              };
              reader.readAsDataURL(file);
            });
          };
          input.click();
        });
      }
    });
  }

  function renderQuestionCard(q, idx) {
    var typeLabel = q.type === 'choice' ? '选择题' : (q.type === 'blank' ? '填空题' : '问答题');
    var typeIcon = q.type === 'choice' ? '📋' : (q.type === 'blank' ? '✏️' : '💬');

    var html = '<div class="qnr-question-card">' +
      '<div class="qnr-q-header">' +
        '<div class="qnr-q-number">' + (idx + 1) + '</div>' +
        '<span class="qnr-q-type-badge ' + q.type + '">' + typeIcon + ' ' + typeLabel + '</span>' +
        '<button class="qnr-q-delete" data-action="del-q" data-idx="' + idx + '"><i class="fas fa-trash"></i></button>' +
      '</div>' +
      '<input type="text" class="qnr-q-input" id="qnr-q-title-' + idx + '" placeholder="题目内容" value="' + escapeHtml(q.title) + '">';

    if (q.type === 'choice') {
      html += '<div id="qnr-options-' + idx + '">';
      q.options.forEach(function(opt, oi) {
        html += '<div class="qnr-option-row">' +
          '<input type="text" class="qnr-option-input" id="qnr-opt-' + idx + '-' + oi + '" placeholder="选项 ' + (oi + 1) + '" value="' + escapeHtml(opt) + '">' +
          (q.options.length > 2 ? '<button class="qnr-option-del" data-action="del-opt" data-idx="' + idx + '" data-oi="' + oi + '">✕</button>' : '') +
        '</div>';
      });
      html += '</div>';
      html += '<button class="qnr-add-option-btn" data-action="add-opt" data-idx="' + idx + '"><i class="fas fa-plus"></i> 添加选项</button>';
      html += '<div class="qnr-meta-row">' +
        '<label class="qnr-multi-toggle"><input type="checkbox" id="qnr-multi-' + idx + '" ' + (q.multiple ? 'checked' : '') + '> 多选</label>' +
      '</div>';
    } else if (q.type === 'blank') {
      html += '<textarea class="qnr-qa-textarea" id="qnr-blank-text-' + idx + '" placeholder="输入题目文本，用 ____ 标记挖空位置（例如：我最喜欢____因为____）">' + escapeHtml(q.blankText) + '</textarea>';
      html += '<div class="qnr-blank-tip">💡 用 ____ (四个下划线) 标记挖空位置，对方需从字卡抽取填入</div>';
      html += '<div class="qnr-blank-area" id="qnr-blank-preview-' + idx + '"></div>';
    } else if (q.type === 'qa') {
      // 兼容旧数据：将 qaImage 转为 qaImages
      if (q.qaImage && !q.qaImages) { q.qaImages = [q.qaImage]; q.qaImage = null; }
      if (!q.qaImages) q.qaImages = [];

      html += '<div class="qnr-qa-import">' +
        '<button class="qnr-qa-import-btn" id="qnr-qa-img-btn-' + idx + '"><i class="fas fa-image"></i> 添加图片</button>' +
        '<span style="font-size:12px;color:#999;">可添加多张</span>' +
      '</div>';
      // 多图片预览容器
      html += '<div class="qnr-qa-images" id="qnr-qa-images-' + idx + '">';
      q.qaImages.forEach(function(img, imgIdx) {
        html += '<div class="qnr-qa-image-item">' +
          '<img src="' + img + '">' +
          '<button class="qnr-qa-image-remove" data-action="del-qa-img" data-idx="' + idx + '" data-img-idx="' + imgIdx + '">✕</button>' +
        '</div>';
      });
      html += '</div>';
      html += '<textarea class="qnr-qa-textarea" id="qnr-qa-text-' + idx + '" placeholder="输入大文本内容（可选），对方从字卡抽取回答">' + escapeHtml(q.qaText) + '</textarea>';
    }

    html += '<div class="qnr-meta-row">' +
      '<span class="qnr-time-label">⏱ 作答时间</span>' +
      '<input type="number" class="qnr-time-input" id="qnr-q-time-' + idx + '" value="' + (q.timeLimit || 30) + '" min="5" max="300">' +
      '<span class="qnr-time-label">秒</span>' +
    '</div>';

    html += '</div>';
    return html;
  }

  function renderBlankPreview(idx) {
    var q = editingQnr.questions[idx];
    if (!q || q.type !== 'blank') return;
    var previewEl = document.getElementById('qnr-blank-preview-' + idx);
    if (!previewEl) return;

    // 解析挖空
    var text = q.blankText || '';
    var parts = text.split(/_{4,}/);
    var blanks = [];
    var match = text.match(/_{4,}/g);
    if (match) blanks = match.map(function(m, i) { return '空' + (i + 1); });
    q.blanks = blanks;

    var html = '';
    for (var i = 0; i < parts.length; i++) {
      html += escapeHtml(parts[i]);
      if (i < parts.length - 1) {
        html += '<span class="blank-mark" data-action="focus-blank" data-idx="' + idx + '" data-blank-idx="' + i + '">[空' + (i + 1) + ']</span>';
      }
    }
    if (!text) html = '<span style="color:#ccc;font-size:13px;">预览区域（输入文本后显示）</span>';
    previewEl.innerHTML = html;
  }

  function focusBlank(idx, blankIdx) {
    // 滚动到对应的文本框
    var textarea = document.getElementById('qnr-blank-text-' + idx);
    if (textarea) { textarea.focus(); }
  }

  function removeQaImage(qIdx, imgIdx) {
    var q = editingQnr.questions[qIdx];
    if (q && q.qaImages && imgIdx >= 0 && imgIdx < q.qaImages.length) {
      q.qaImages.splice(imgIdx, 1);
      renderQuestions();
    }
  }

  function addOption(idx) {
    var q = editingQnr.questions[idx];
    if (q && q.type === 'choice') {
      q.options.push('');
      renderQuestions();
    }
  }

  function removeOption(idx, oi) {
    var q = editingQnr.questions[idx];
    if (q && q.type === 'choice' && q.options.length > 2) {
      q.options.splice(oi, 1);
      renderQuestions();
    }
  }

  function updateTotalTime() {
    var total = 0;
    editingQnr.questions.forEach(function(q) {
      total += parseInt(q.timeLimit) || 0;
    });
    editingQnr.totalTime = total;
    var el = document.getElementById('qnr-total-time');
    if (el) {
      el.innerHTML = '<i class="fas fa-clock"></i> 总回答时长：<strong>' + total + '</strong> 秒' +
        (total > 0 ? '（超出总时长 30s 后自动提交）' : '');
    }
  }

  function closeQuestionnaireEditor() {
    var overlay = document.getElementById('qnr-editor-overlay');
    if (overlay) overlay.remove();
    editingQnr = null;
  }

  // ========== 保存问卷 ==========
  function showValidationMsg(msg, type) {
    var el = document.getElementById('qnr-validation-msg');
    if (!el) { _notify(msg, type); return; }
    el.className = 'qnr-validation-msg show ' + (type || 'warning');
    el.innerHTML = '<i class="fas fa-' + (type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'exclamation-triangle') + '"></i> ' + escapeHtml(msg);
    // 滚动到顶部让用户看到消息
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // 3秒后自动隐藏
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(function() {
      el.className = 'qnr-validation-msg';
    }, 3000);
  }

  function clearValidationMsg() {
    var el = document.getElementById('qnr-validation-msg');
    if (el) el.className = 'qnr-validation-msg';
  }

  function saveQuestionnaire(send) {
    try {
      clearValidationMsg();

      if (!editingQnr) { console.warn('[QNR] editingQnr is null'); return; }
      var titleEl = document.getElementById('qnr-title');
      if (!titleEl) { console.warn('[QNR] title element not found'); return; }
      editingQnr.title = titleEl.value.trim() || '未命名问卷';
      if (editingQnr.questions.length === 0) {
        showValidationMsg('请至少添加一道题目', 'warning');
        return;
      }
      // 验证题目
      for (var i = 0; i < editingQnr.questions.length; i++) {
        var q = editingQnr.questions[i];
        // 同步输入框值到数据（防止未触发input事件的情况）
        var titleInput = document.getElementById('qnr-q-title-' + i);
        if (titleInput) q.title = titleInput.value;
        if (!q.title || !q.title.trim()) {
          showValidationMsg('第' + (i + 1) + '题没有填写题目内容', 'warning');
          return;
        }
        if (q.type === 'choice') {
          // 同步选项输入框值
          if (q.options) {
            q.options = q.options.map(function(opt, oi) {
              var optEl = document.getElementById('qnr-opt-' + i + '-' + oi);
              return optEl ? optEl.value : opt;
            });
          }
          var validOpts = (q.options || []).filter(function(o) { return o && o.trim(); });
          if (validOpts.length < 2) {
            showValidationMsg('第' + (i + 1) + '题至少需要2个选项', 'warning');
            return;
          }
          q.options = validOpts;
        }
        // 同步时间限制
        var timeEl = document.getElementById('qnr-q-time-' + i);
        if (timeEl) q.timeLimit = parseInt(timeEl.value) || 30;
      }

      // 按钮加载状态
      var saveBtn = document.getElementById('qnr-btn-save');
      var sendBtn = document.getElementById('qnr-btn-send');
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '保存中...'; }
      if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '保存中...'; }

      // 保存到列表
      var existingIdx = -1;
      for (var j = 0; j < qnrList.length; j++) {
        if (qnrList[j].id === editingQnr.id) { existingIdx = j; break; }
      }
      var savedQnr = JSON.parse(JSON.stringify(editingQnr));
      savedQnr.status = 'draft';
      if (existingIdx >= 0) {
        qnrList[existingIdx] = savedQnr;
      } else {
        qnrList.push(savedQnr);
      }
      saveQuestionnaires(qnrList);

      _notify('问卷已保存', 'success');

      closeQuestionnaireEditor();

      if (send) {
        sendQuestionnaire(savedQnr);
      } else {
        // 打开问卷列表
        openQuestionnaireList();
      }
    } catch(err) {
      console.error('[QNR] saveQuestionnaire error:', err);
      showValidationMsg('保存失败: ' + (err.message || err), 'error');
      // 恢复按钮状态
      var saveBtn2 = document.getElementById('qnr-btn-save');
      var sendBtn2 = document.getElementById('qnr-btn-send');
      if (saveBtn2) { saveBtn2.disabled = false; saveBtn2.textContent = '保存'; }
      if (sendBtn2) { sendBtn2.disabled = false; sendBtn2.textContent = '保存并发送'; }
    }
  }

  // 统一通知函数
  function _notify(msg, type) {
    try {
      if (typeof window.showNotification === 'function') { window.showNotification(msg, type); return; }
      if (typeof showNotification === 'function') { showNotification(msg, type); return; }
    } catch(e) {}
    alert(msg);
  }

  // 统一获取 addMessage
  function _getAddMessage() {
    try {
      if (typeof addMessage === 'function') return addMessage;
      if (typeof window.addMessage === 'function') return window.addMessage;
    } catch(e) {}
    return null;
  }

  // ========== 问卷列表 ==========
  async function openQuestionnaireList() {
    qnrList = await loadQuestionnaires();
    closeQuestionnaireList();

    var overlay = document.createElement('div');
    overlay.className = 'qnr-overlay active';
    overlay.id = 'qnr-list-overlay';
    overlay.innerHTML = '' +
    '<div class="qnr-modal">' +
      '<div class="qnr-editor-header">' +
        '<h3>📋 我的问卷</h3>' +
        '<button class="qnr-close-btn" id="qnr-list-close">✕</button>' +
      '</div>' +
      '<div class="qnr-editor-body" id="qnr-list-body">' +
        (qnrList.length === 0 ? '<div style="text-align:center;padding:30px;color:#999;">还没有问卷，点击下方按钮创建</div>' :
          qnrList.map(function(qnr) {
            return '<div class="qnr-list-item">' +
              '<div class="qnr-list-item-info">' +
                '<div class="qnr-list-item-title">' + escapeHtml(qnr.title) + '</div>' +
                '<div class="qnr-list-item-meta">' + qnr.questions.length + ' 题 · 总时长 ' + (qnr.totalTime || 0) + ' 秒 · ' +
                  (qnr.status === 'completed' ? '✅ 已完成' : qnr.status === 'sent' ? '📤 已发送' : '📝 草稿') +
                '</div>' +
              '</div>' +
              '<div class="qnr-list-item-actions">' +
                '<button class="qnr-list-item-btn send" data-action="list-send" data-id="' + qnr.id + '">发送</button>' +
                '<button class="qnr-list-item-btn edit" data-action="list-edit" data-id="' + qnr.id + '">编辑</button>' +
                '<button class="qnr-list-item-btn del" data-action="list-del" data-id="' + qnr.id + '">删除</button>' +
              '</div>' +
            '</div>';
          }).join('')
        ) +
      '</div>' +
      '<div class="qnr-editor-footer">' +
        '<button class="qnr-btn qnr-btn-send" id="qnr-list-create">+ 创建新问卷</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(overlay);

    // 绑定事件
    var closeBtn = document.getElementById('qnr-list-close');
    if (closeBtn) closeBtn.addEventListener('click', function() { closeQuestionnaireList(); });
    var createBtn = document.getElementById('qnr-list-create');
    if (createBtn) createBtn.addEventListener('click', function() { createNew(); });
    // 列表项按钮事件委托
    overlay.addEventListener('click', function(e) {
      var el = e.target.closest('[data-action^="list-"]');
      if (!el) return;
      var action = el.getAttribute('data-action');
      var id = el.getAttribute('data-id');
      if (action === 'list-send') { e.preventDefault(); sendById(id); }
      else if (action === 'list-edit') { e.preventDefault(); editQuestionnaire(id); }
      else if (action === 'list-del') { e.preventDefault(); deleteQuestionnaire(id); }
    });
  }

  function closeQuestionnaireList() {
    var overlay = document.getElementById('qnr-list-overlay');
    if (overlay) overlay.remove();
  }

  async function editQuestionnaire(id) {
    var qnr = qnrList.find(function(x) { return x.id === id; });
    if (!qnr) return;
    closeQuestionnaireList();
    openQuestionnaireEditor(JSON.parse(JSON.stringify(qnr)));
  }

  async function deleteQuestionnaire(id) {
    if (!confirm('确定删除此问卷？')) return;
    qnrList = qnrList.filter(function(x) { return x.id !== id; });
    await saveQuestionnaires(qnrList);
    openQuestionnaireList();
  }

  function createNew() {
    closeQuestionnaireList();
    openQuestionnaireEditor(null);
  }

  // ========== 发送问卷到聊天 ==========
  function sendQuestionnaire(qnr) {
    var _addMessage = _getAddMessage();
    if (!_addMessage) {
      console.error('[QNR] addMessage function not found');
      _notify('发送失败：聊天未初始化', 'error');
      return;
    }

    // 发送问卷卡片消息
    _addMessage({
      id: Date.now(),
      sender: 'user',
      text: '',
      timestamp: new Date(),
      status: 'sent',
      type: 'questionnaire',
      questionnaire: JSON.parse(JSON.stringify(qnr))
    });

    try { if (typeof playSound === 'function') playSound('send'); else if (typeof window.playSound === 'function') window.playSound('send'); } catch(e) {}

    // 更新状态为已发送
    var idx = qnrList.findIndex(function(x) { return x.id === qnr.id; });
    if (idx >= 0) {
      qnrList[idx].status = 'sent';
      saveQuestionnaires(qnrList);
    }

    // 模拟对方收到问卷后的反应
    setTimeout(function() {
      simulatePartnerReceiveQuestionnaire(qnr);
    }, 1500 + Math.random() * 2000);
  }

  function sendById(id) {
    var qnr = qnrList.find(function(x) { return x.id === id; });
    if (qnr) sendQuestionnaire(qnr);
  }

  // ========== 对方接收问卷 ==========
  function simulatePartnerReceiveQuestionnaire(qnr) {
    // 对方发一条消息表示收到了
    var _addMessage = _getAddMessage();
    if (_addMessage) {
      _addMessage({
        id: Date.now(),
        sender: 'partner',
        text: '收到了你的问卷《' + qnr.title + '》，让我看看～',
        timestamp: new Date(),
        status: 'received',
        type: 'normal'
      });
    }

    // 弹出邀请让"对方"决定是否填写（这里模拟对方接受填写）
    setTimeout(function() {
      simulatePartnerFillQuestionnaire(qnr);
    }, 2000 + Math.random() * 2000);
  }

  // ========== 对方填写问卷（按实际时长填写，显示"正在填写问卷"指示器）==========
  function simulatePartnerFillQuestionnaire(qnr) {
    var startTime = Date.now();
    var totalTime = qnr.totalTime || 120;
    var answers = [];
    var currentIdx = 0;

    // 显示"正在填写问卷"指示器
    showFillingIndicator(true);

    // 逐题填写（模拟实际作答过程，每题按时间限制等待）
    function fillNextQuestion() {
      if (currentIdx >= qnr.questions.length) {
        // 所有题目填写完毕
        completeFilling();
        return;
      }

      var q = qnr.questions[currentIdx];
      var answer = { questionId: q.id, type: q.type, questionTitle: q.title };
      var questionStartTime = Date.now();

      // 根据题目类型生成答案
      if (q.type === 'choice') {
        if (q.multiple) {
          var count = Math.min(Math.floor(Math.random() * 2) + 1, q.options.length);
          var shuffled = q.options.slice().sort(function() { return Math.random() - 0.5; });
          answer.selectedOptions = shuffled.slice(0, count);
        } else {
          answer.selectedOptions = [q.options[Math.floor(Math.random() * q.options.length)]];
        }
      } else if (q.type === 'blank') {
        var cards = pickRandomCards(q.blanks ? q.blanks.length : 1);
        answer.blankAnswers = cards;
        var parts = (q.blankText || '').split(/_{4,}/);
        var filledText = '';
        for (var i = 0; i < parts.length; i++) {
          filledText += parts[i];
          if (i < cards.length) filledText += '【' + cards[i] + '】';
        }
        answer.filledText = filledText;
      } else if (q.type === 'qa') {
        var qaCards = pickRandomCards(Math.floor(Math.random() * 2) + 1);
        answer.qaAnswer = qaCards.join('；');
      }

      // 实际等待时间：按题目时间限制的一定比例模拟（模拟阅读+思考+作答）
      // 取题目时间限制的 40%-80% 作为模拟等待时间，最少3秒
      var simWaitMs = Math.max(3000, Math.floor((q.timeLimit || 30) * (0.4 + Math.random() * 0.4) * 1000));

      setTimeout(function() {
        // 记录该题实际用时
        answer.timeSpent = Math.floor((Date.now() - questionStartTime) / 1000);
        answers.push(answer);
        currentIdx++;
        fillNextQuestion();
      }, simWaitMs);
    }

    // 完成填写
    function completeFilling() {
      // 计算实际总用时
      var actualDuration = Math.floor((Date.now() - startTime) / 1000);
      var isOvertime = actualDuration > totalTime + 30;

      // 隐藏"正在填写问卷"指示器
      showFillingIndicator(false);

      // 保存答案和实际时长
      qnr.answers = answers;
      qnr.status = 'completed';
      qnr.answeredAt = Date.now();
      qnr.totalTimeSpent = actualDuration;
      qnr.isOvertime = isOvertime;

      // 更新存储
      var idx = qnrList.findIndex(function(x) { return x.id === qnr.id; });
      if (idx >= 0) {
        qnrList[idx] = qnr;
        saveQuestionnaires(qnrList);
      }

      // 对方发送填写完成的消息
      var _addMessage = _getAddMessage();
      if (_addMessage) {
        _addMessage({
          id: Date.now(),
          sender: 'partner',
          text: '',
          timestamp: new Date(),
          status: 'received',
          type: 'questionnaire',
          questionnaire: JSON.parse(JSON.stringify(qnr)),
          isAnswer: true
        });
      }

      // 提醒用户
      _notify(getPartnerName() + ' 完成了问卷《' + qnr.title + '》（用时 ' + actualDuration + ' 秒）', 'success');
    }

    // 开始填写
    fillNextQuestion();
  }

  // 显示/隐藏"正在填写问卷"指示器
  function showFillingIndicator(show) {
    try {
      if (show) {
        var text = getPartnerName() + ' 正在填写问卷';
        if (typeof window._showTypingIndicatorWithText === 'function') {
          window._showTypingIndicatorWithText(text);
        } else {
          // 降级：直接操作DOM
          var tiWrapper = document.getElementById('typing-indicator-wrapper');
          var tiLabel = document.getElementById('typing-indicator-label');
          if (tiLabel) tiLabel.textContent = text;
          if (tiWrapper) tiWrapper.style.display = 'block';
        }
      } else {
        if (typeof window._hideTypingIndicatorGlobal === 'function') {
          window._hideTypingIndicatorGlobal();
        } else {
          // 降级：直接操作DOM
          var tiW = document.getElementById('typing-indicator-wrapper');
          if (tiW) tiW.style.display = 'none';
        }
      }
    } catch(e) {
      console.warn('[QNR] showFillingIndicator error:', e);
    }
  }

  // ========== 对方随机邀请用户回答 ==========
  async function simulatePartnerInviteUser() {
    qnrList = await loadQuestionnaires();
    var savedQnrs = qnrList.filter(function(q) { return q.status === 'draft' || q.status === 'sent'; });
    if (savedQnrs.length === 0) return;

    var randomQnr = savedQnrs[Math.floor(Math.random() * savedQnrs.length)];

    // 检查邀请次数
    if (randomQnr.inviteAttempts >= 3) return;

    randomQnr.inviteAttempts = (randomQnr.inviteAttempts || 0) + 1;
    await saveQuestionnaires(qnrList);

    // 对方发消息
    var _addMessage = _getAddMessage();
    if (_addMessage) {
      var inviteTexts = [
        '我有个问卷想让你填一下～',
        '帮我做做这个问卷吧！',
        '想了解你更多，填填这个问卷好不好？'
      ];
      _addMessage({
        id: Date.now(),
        sender: 'partner',
        text: inviteTexts[Math.floor(Math.random() * inviteTexts.length)],
        timestamp: new Date(),
        status: 'received',
        type: 'normal'
      });
    }

    // 弹出邀请弹窗
    setTimeout(function() {
      showInvitePopup(randomQnr);
    }, 1000);
  }

  function showInvitePopup(qnr) {
    // 移除已有的
    var existing = document.getElementById('qnr-invite-overlay');
    if (existing) existing.remove();

    var remaining = 3 - (qnr.inviteAttempts || 0);
    var overlay = document.createElement('div');
    overlay.className = 'qnr-invite-overlay active';
    overlay.id = 'qnr-invite-overlay';
    overlay.innerHTML = '' +
    '<div class="qnr-invite-modal">' +
      '<div class="qnr-invite-header">' +
        '<div class="qnr-invite-icon">📋</div>' +
        '<div class="qnr-invite-title">' + escapeHtml(getPartnerName()) + ' 邀请你填写问卷</div>' +
        '<div class="qnr-invite-desc">《' + escapeHtml(qnr.title) + '》</div>' +
        '<div class="qnr-invite-attempts">' + (remaining > 0 ? '还可拒绝 ' + remaining + ' 次' : '已达到最大邀请次数') + '</div>' +
      '</div>' +
      '<div class="qnr-invite-body">' +
        '<div class="qnr-invite-q-preview">' +
          qnr.questions.map(function(q, i) {
            var typeLabel = q.type === 'choice' ? '📋选择题' : (q.type === 'blank' ? '✏️填空题' : '💬问答题');
            return '<div>' + (i + 1) + '. ' + typeLabel + ' · ' + escapeHtml(q.title) + '</div>';
          }).join('') +
          '<div style="margin-top:6px;color:#999;">⏱ 总时长 ' + (qnr.totalTime || 0) + ' 秒</div>' +
        '</div>' +
      '</div>' +
      '<div class="qnr-invite-footer">' +
        '<button class="qnr-invite-btn qnr-invite-btn-decline" data-action="invite-decline" data-id="' + qnr.id + '">' +
          (remaining > 0 ? '拒绝' : '关闭') + '</button>' +
        '<button class="qnr-invite-btn qnr-invite-btn-accept" data-action="invite-accept" data-id="' + qnr.id + '">去填写</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function(e) {
      var el = e.target.closest('[data-action^="invite-"]');
      if (!el) return;
      var action = el.getAttribute('data-action');
      var id = el.getAttribute('data-id');
      if (action === 'invite-decline') { e.preventDefault(); declineInvite(id); }
      else if (action === 'invite-accept') { e.preventDefault(); acceptInvite(id); }
    });
  }

  function closeInvitePopup() {
    var overlay = document.getElementById('qnr-invite-overlay');
    if (overlay) overlay.remove();
  }

  async function acceptInvite(id) {
    closeInvitePopup();
    var qnr = qnrList.find(function(x) { return x.id === id; });
    if (!qnr) return;

    // 重置邀请次数
    qnr.inviteAttempts = 0;
    await saveQuestionnaires(qnrList);

    // 对方回复
    var _addMessage = _getAddMessage();
    if (_addMessage) {
      _addMessage({
        id: Date.now(),
        sender: 'partner',
        text: '太好了！等你填完告诉我～',
        timestamp: new Date(),
        status: 'received',
        type: 'normal'
      });
    }

    // 打开填写界面
    openFillQuestionnaire(qnr, true);
  }

  async function declineInvite(id) {
    closeInvitePopup();
    var qnr = qnrList.find(function(x) { return x.id === id; });
    if (!qnr) return;

    var remaining = 3 - (qnr.inviteAttempts || 0);

    // 对方回复
    var _addMessage = _getAddMessage();
    if (_addMessage) {
      var declineTexts = [
        '好吧，那下次再说',
        '没关系，你有空的时候再说',
        '嗯嗯，不急'
      ];
      _addMessage({
        id: Date.now(),
        sender: 'partner',
        text: declineTexts[Math.floor(Math.random() * declineTexts.length)],
        timestamp: new Date(),
        status: 'received',
        type: 'normal'
      });
    }

    if (remaining > 0) {
      // 对方可以再发送
      setTimeout(function() {
        simulatePartnerInviteUser();
      }, 3000 + Math.random() * 3000);
    } else {
      // 达到3次，不再发送
      setTimeout(function() {
        var _addMsg = _getAddMessage();
        if (_addMsg) {
          _addMsg({
            id: Date.now(),
            sender: 'partner',
            text: '好吧，那就不勉强了～',
            timestamp: new Date(),
            status: 'received',
            type: 'normal'
          });
        }
      }, 1500);
    }
  }

  // ========== 用户填写问卷界面 ==========
  var fillState = null;

  function openFillQuestionnaire(qnr, isFromInvite) {
    closeFillQuestionnaire();
    fillState = {
      qnr: JSON.parse(JSON.stringify(qnr)),
      currentIdx: 0,
      answers: [],
      startTime: Date.now(),
      timer: null,
      remainingTime: (qnr.totalTime || 120) + 30, // 总时长+30秒
      isFromInvite: isFromInvite || false
    };

    var overlay = document.createElement('div');
    overlay.className = 'qnr-overlay active';
    overlay.id = 'qnr-fill-overlay';
    overlay.innerHTML = buildFillHTML();
    document.body.appendChild(overlay);

    bindFillEvents();
    renderFillQuestion();
    startFillTimer();
  }

  function bindFillEvents() {
    var cancelBtn = document.getElementById('qnr-fill-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function(e) { e.preventDefault(); cancelFill(); });
    var prevBtn = document.getElementById('qnr-fill-prev');
    if (prevBtn) prevBtn.addEventListener('click', function(e) { e.preventDefault(); fillPrev(); });
    var nextBtn = document.getElementById('qnr-fill-next');
    if (nextBtn) nextBtn.addEventListener('click', function(e) { e.preventDefault(); fillNext(); });
  }

  function buildFillHTML() {
    var qnr = fillState.qnr;
    return '' +
    '<div class="qnr-modal qnr-fill-modal">' +
      '<div class="qnr-fill-header">' +
        '<div class="qnr-fill-title">' + escapeHtml(qnr.title) + '</div>' +
        '<div class="qnr-fill-timer" id="qnr-fill-timer"><i class="fas fa-clock"></i> 剩余时间：' + fillState.remainingTime + 's</div>' +
      '</div>' +
      '<div class="qnr-fill-body" id="qnr-fill-body"></div>' +
      '<div class="qnr-fill-footer">' +
        '<button class="qnr-btn qnr-btn-cancel" id="qnr-fill-cancel">放弃</button>' +
        '<button class="qnr-btn qnr-btn-save" id="qnr-fill-prev" style="display:none;">上一题</button>' +
        '<button class="qnr-btn qnr-btn-send" id="qnr-fill-next">下一题</button>' +
      '</div>' +
    '</div>';
  }

  // 为当前题目预生成字卡池（进入题目时生成，切换题目时刷新）
  var fillCardPool = [];

  function ensureCardPool(q) {
    if (q.type === 'blank') {
      var blankCount = (q.blankText || '').match(/_{4,}/g);
      blankCount = blankCount ? blankCount.length : 1;
      fillCardPool = pickRandomCards(Math.max(8, blankCount * 4));
    } else if (q.type === 'qa') {
      fillCardPool = pickRandomCards(12);
    }
  }

  function renderFillQuestion() {
    var qnr = fillState.qnr;
    var idx = fillState.currentIdx;
    var q = qnr.questions[idx];
    if (!q) return;

    var body = document.getElementById('qnr-fill-body');
    if (!body) return;

    // 进入新题目时刷新字卡池
    ensureCardPool(q);

    var html = '<div class="qnr-fill-q-card">' +
      '<div class="qnr-fill-q-title">' +
        '<div class="qnr-fill-q-num">' + (idx + 1) + '</div>' +
        '<span>' + escapeHtml(q.title) + '</span>' +
        '<span class="qnr-fill-q-time">⏱ ' + (q.timeLimit || 30) + 's</span>' +
      '</div>';

    if (q.type === 'choice') {
      html += '<div id="qnr-fill-options">';
      q.options.forEach(function(opt, oi) {
        var checked = '';
        var existing = fillState.answers[idx];
        if (existing && existing.selectedOptions && existing.selectedOptions.indexOf(opt) >= 0) checked = 'selected';
        html += '<div class="qnr-option-item ' + checked + '" data-action="toggle-opt" data-idx="' + idx + '" data-oi="' + oi + '">' +
          '<input type="' + (q.multiple ? 'checkbox' : 'radio') + '" class="qnr-option-' + (q.multiple ? 'checkbox' : 'radio') + '" ' + (checked ? 'checked' : '') + '>' +
          '<span class="qnr-option-text">' + escapeHtml(opt) + '</span>' +
        '</div>';
      });
      html += '</div>';
    } else if (q.type === 'blank') {
      // 填空题：显示带空位的文本，字卡直接内联展示在下方
      var parts = (q.blankText || '').split(/_{4,}/);
      var blankCount = parts.length - 1;
      var existingAns = fillState.answers[idx];
      // 当前选中的空位索引（默认第一个未填的）
      var activeBlank = -1;
      for (var bi = 0; bi < blankCount; bi++) {
        if (!existingAns || !existingAns.blankAnswers || !existingAns.blankAnswers[bi]) {
          activeBlank = bi;
          break;
        }
      }
      if (activeBlank === -1) activeBlank = 0; // 全填了，默认第一个

      // 更新当前激活空位
      currentBlankIdx = activeBlank;

      html += '<div class="qnr-blank-display" id="qnr-blank-display">';
      for (var i = 0; i < parts.length; i++) {
        html += escapeHtml(parts[i]);
        if (i < parts.length - 1) {
          var filled = existingAns && existingAns.blankAnswers && existingAns.blankAnswers[i];
          var isActive = (i === activeBlank);
          html += '<span class="qnr-blank-slot' + (filled ? ' filled' : '') + (isActive ? ' active' : '') +
            '" id="qnr-blank-slot-' + i + '" data-blank-idx="' + i + '">' +
            (filled ? escapeHtml(filled) : '[空' + (i + 1) + ']') + '</span>';
        }
      }
      html += '</div>';

      // 已用过的字卡索引集合
      var usedCardIndices = {};
      if (existingAns && existingAns.blankAnswers) {
        existingAns.blankAnswers.forEach(function(ans) {
          if (ans) {
            for (var ci = 0; ci < fillCardPool.length; ci++) {
              if (fillCardPool[ci] === ans) { usedCardIndices[ci] = true; break; }
            }
          }
        });
      }

      // 字卡直接内联展示（类似聊天回信机制）
      html += '<div class="qnr-card-picker" style="display:flex;margin-top:10px;">';
      fillCardPool.forEach(function(card, ci) {
        var isUsed = usedCardIndices[ci];
        html += '<div class="qnr-card-chip' + (isUsed ? ' used' : '') + '" data-card-idx="' + ci + '"' +
          (isUsed ? '' : ' data-usable="1"') + '>' + escapeHtml(card) + '</div>';
      });
      html += '</div>';
      html += '<div style="font-size:12px;color:#999;margin-top:6px;">💡 点击字卡填入当前空位，点击空位切换填入位置</div>';
    } else if (q.type === 'qa') {
      // 问答题 - 兼容旧数据
      if (q.qaImage && !q.qaImages) { q.qaImages = [q.qaImage]; q.qaImage = null; }
      if (q.qaImages && q.qaImages.length > 0) {
        html += '<div class="qnr-qa-image-gallery">';
        q.qaImages.forEach(function(img) {
          html += '<img class="qnr-qa-image" src="' + img + '">';
        });
        html += '</div>';
      }
      if (q.qaText) {
        html += '<div class="qnr-qa-content">' + escapeHtml(q.qaText) + '</div>';
      }
      // 显示已选字卡回答
      var existingAns = fillState.answers[idx];
      var selectedCards = existingAns ? existingAns.qaAnswer || '' : '';
      if (selectedCards) {
        html += '<div style="margin-top:8px;padding:8px 12px;background:rgba(102,126,234,0.08);border-radius:8px;">';
        html += '<div style="font-size:12px;color:#888;margin-bottom:4px;">已选回答：</div>';
        html += '<div style="font-size:14px;color:#667eea;font-weight:600;">' + escapeHtml(selectedCards) + '</div>';
        html += '</div>';
      }

      // 已选字卡索引集合
      var usedQAIndices = {};
      if (selectedCards) {
        var selectedArr = selectedCards.split('；');
        fillCardPool.forEach(function(card, ci) {
          if (selectedArr.indexOf(card) >= 0) usedQAIndices[ci] = true;
        });
      }

      // 字卡直接内联展示
      html += '<div style="margin-top:8px;">';
      html += '<div style="font-size:12px;color:#888;margin-bottom:6px;">从下方字卡中点选回答（可多选）：</div>';
      html += '<div class="qnr-card-picker" style="display:flex;">';
      fillCardPool.forEach(function(card, ci) {
        var isUsed = usedQAIndices[ci];
        html += '<div class="qnr-card-chip' + (isUsed ? ' used' : '') + '" data-card-idx="' + ci + '"' +
          (isUsed ? '' : ' data-usable="1"') + '>' + escapeHtml(card) + '</div>';
      });
      html += '</div>';
      html += '</div>';
    }

    html += '</div>';
    body.innerHTML = html;

    // 选项点击事件委托
    if (!body._qnrFillDelegated) {
      body._qnrFillDelegated = true;
      body.addEventListener('click', function(e) {
        var el = e.target.closest('[data-action="toggle-opt"]');
        if (!el) return;
        e.preventDefault();
        var idx2 = parseInt(el.getAttribute('data-idx'));
        var oi = parseInt(el.getAttribute('data-oi'));
        toggleOption(idx2, oi, el);
      });
    }

    // 绑定字卡点击事件
    bindCardClicks(q);

    // 绑定空位点击事件（填空题切换激活空位）
    if (q.type === 'blank') {
      bindBlankSlotClicks();
    }

    // 更新按钮
    var prevBtn = document.getElementById('qnr-fill-prev');
    var nextBtn = document.getElementById('qnr-fill-next');
    if (prevBtn) prevBtn.style.display = idx > 0 ? '' : 'none';
    if (nextBtn) nextBtn.textContent = (idx === qnr.questions.length - 1) ? '提交' : '下一题';
  }

  // 绑定字卡点击事件
  function bindCardClicks(q) {
    var chips = document.querySelectorAll('#qnr-fill-body .qnr-card-chip[data-usable="1"]');
    chips.forEach(function(el) {
      el.addEventListener('click', function() {
        var ci = parseInt(el.getAttribute('data-card-idx'));
        var cardText = fillCardPool[ci];
        if (!cardText) return;
        if (q.type === 'blank') {
          fillBlankWithCard(currentBlankIdx, cardText, ci);
        } else if (q.type === 'qa') {
          selectQACard(cardText, ci);
        }
      });
    });
  }

  // 绑定空位点击事件（切换当前激活空位）
  function bindBlankSlotClicks() {
    var slots = document.querySelectorAll('#qnr-fill-body .qnr-blank-slot');
    slots.forEach(function(el) {
      el.addEventListener('click', function() {
        var bi = parseInt(el.getAttribute('data-blank-idx'));
        currentBlankIdx = bi;
        // 更新激活样式
        slots.forEach(function(s) { s.classList.remove('active'); });
        el.classList.add('active');
      });
    });
  }

  // 填空题：用字卡填充指定空位
  function fillBlankWithCard(blankIdx, cardText, cardIdx) {
    var qIdx = fillState.currentIdx;
    var q = fillState.qnr.questions[qIdx];
    if (!fillState.answers[qIdx]) fillState.answers[qIdx] = { questionId: q.id, type: 'blank', blankAnswers: [] };
    if (!fillState.answers[qIdx].blankAnswers) fillState.answers[qIdx].blankAnswers = [];

    // 如果该字卡已被其他空位使用，先移除
    var existingPos = fillState.answers[qIdx].blankAnswers.indexOf(cardText);
    if (existingPos >= 0 && existingPos !== blankIdx) {
      fillState.answers[qIdx].blankAnswers[existingPos] = null;
    }

    // 填入
    fillState.answers[qIdx].blankAnswers[blankIdx] = cardText;

    // 构建填空后文本
    var parts = (q.blankText || '').split(/_{4,}/);
    var filledText = '';
    for (var i = 0; i < parts.length; i++) {
      filledText += parts[i];
      if (i < fillState.answers[qIdx].blankAnswers.length) {
        var ans = fillState.answers[qIdx].blankAnswers[i];
        if (ans) filledText += '【' + ans + '】';
      }
    }
    fillState.answers[qIdx].filledText = filledText;

    // 重新渲染以更新字卡可用状态
    renderFillQuestion();
  }

  function toggleOption(qIdx, optIdx, el) {
    var q = fillState.qnr.questions[qIdx];
    var opt = q.options[optIdx];
    if (!fillState.answers[qIdx]) fillState.answers[qIdx] = { questionId: q.id, type: 'choice', selectedOptions: [] };
    var ans = fillState.answers[qIdx];
    if (!ans.selectedOptions) ans.selectedOptions = [];

    if (q.multiple) {
      // 多选
      var i = ans.selectedOptions.indexOf(opt);
      if (i >= 0) {
        ans.selectedOptions.splice(i, 1);
        el.classList.remove('selected');
        el.querySelector('input').checked = false;
      } else {
        ans.selectedOptions.push(opt);
        el.classList.add('selected');
        el.querySelector('input').checked = true;
      }
    } else {
      // 单选
      ans.selectedOptions = [opt];
      var allItems = document.querySelectorAll('#qnr-fill-options .qnr-option-item');
      allItems.forEach(function(item) {
        item.classList.remove('selected');
        var input = item.querySelector('input');
        if (input) input.checked = false;
      });
      el.classList.add('selected');
      el.querySelector('input').checked = true;
    }
  }

  var currentBlankIdx = -1;

  // selectQACard: 点击字卡切换选中/取消选中（类似聊天回信的字卡点选）
  function selectQACard(cardText, cardIdx) {
    var idx = fillState.currentIdx;
    if (!fillState.answers[idx]) fillState.answers[idx] = { questionId: fillState.qnr.questions[idx].id, type: 'qa', qaAnswer: '' };
    var existing = fillState.answers[idx].qaAnswer || '';
    var selectedArr = existing ? existing.split('；') : [];

    // 切换：已选则取消，未选则添加
    var pos = selectedArr.indexOf(cardText);
    if (pos >= 0) {
      selectedArr.splice(pos, 1);
    } else {
      selectedArr.push(cardText);
    }
    fillState.answers[idx].qaAnswer = selectedArr.join('；');

    // 重新渲染以更新字卡状态
    renderFillQuestion();
  }

  function fillNext() {
    var qnr = fillState.qnr;
    var idx = fillState.currentIdx;
    var q = qnr.questions[idx];

    // 验证是否已作答
    var ans = fillState.answers[idx];
    if (!ans || (q.type === 'choice' && (!ans.selectedOptions || ans.selectedOptions.length === 0)) ||
        (q.type === 'blank' && (!ans.blankAnswers || ans.blankAnswers.length === 0)) ||
        (q.type === 'qa' && !ans.qaAnswer)) {
      _notify('请先作答此题', 'warning');
      return;
    }

    if (idx === qnr.questions.length - 1) {
      // 最后一题，提交
      submitFillQuestionnaire();
    } else {
      fillState.currentIdx++;
      renderFillQuestion();
    }
  }

  function fillPrev() {
    if (fillState.currentIdx > 0) {
      fillState.currentIdx--;
      renderFillQuestion();
    }
  }

  function startFillTimer() {
    if (fillState.timer) clearInterval(fillState.timer);
    fillState.timer = setInterval(function() {
      fillState.remainingTime--;
      var timerEl = document.getElementById('qnr-fill-timer');
      if (timerEl) {
        timerEl.innerHTML = '<i class="fas fa-clock"></i> 剩余时间：' + fillState.remainingTime + 's';
        if (fillState.remainingTime <= 10) {
          timerEl.classList.add('danger');
        } else if (fillState.remainingTime <= 30) {
          timerEl.classList.add('warning');
        }
      }
      if (fillState.remainingTime <= 0) {
        clearInterval(fillState.timer);
        _notify('时间到！自动提交问卷', 'warning');
        submitFillQuestionnaire();
      }
    }, 1000);
  }

  function submitFillQuestionnaire() {
    if (fillState.timer) { clearInterval(fillState.timer); fillState.timer = null; }
    var qnr = fillState.qnr;
    var totalTimeSpent = (qnr.totalTime || 120) + 30 - fillState.remainingTime;
    var isOvertime = fillState.remainingTime <= 0;

    qnr.answers = fillState.answers;
    qnr.status = 'completed';
    qnr.answeredAt = Date.now();
    qnr.totalTimeSpent = totalTimeSpent;
    qnr.isOvertime = isOvertime;
    qnr.filledByUser = true;

    // 保存
    var idx = qnrList.findIndex(function(x) { return x.id === qnr.id; });
    if (idx >= 0) {
      qnrList[idx] = qnr;
    } else {
      qnrList.push(qnr);
    }
    saveQuestionnaires(qnrList);

    // 发送完成消息到聊天
    var _addMessage = _getAddMessage();
    if (_addMessage) {
      _addMessage({
        id: Date.now(),
        sender: 'user',
        text: '',
        timestamp: new Date(),
        status: 'sent',
        type: 'questionnaire',
        questionnaire: JSON.parse(JSON.stringify(qnr)),
        isAnswer: true
      });
    }

    try { if (typeof playSound === 'function') playSound('send'); else if (typeof window.playSound === 'function') window.playSound('send'); } catch(e) {}

    // 对方回复
    setTimeout(function() {
      var _addMsg = _getAddMessage();
      if (_addMsg) {
        var replyTexts = [
          '看到你的回答了！',
          '填完了呀，谢谢～',
          '原来你是这样想的呀',
          '有意思，让我仔细看看'
        ];
        _addMsg({
          id: Date.now(),
          sender: 'partner',
          text: replyTexts[Math.floor(Math.random() * replyTexts.length)],
          timestamp: new Date(),
          status: 'received',
          type: 'normal'
        });
      }
    }, 1500 + Math.random() * 2000);

    // 关闭填写界面
    closeFillQuestionnaire();

    // 显示结果
    _notify('问卷已提交！', 'success');
  }

  function cancelFill() {
    if (fillState.timer) { clearInterval(fillState.timer); fillState.timer = null; }
    closeFillQuestionnaire();
  }

  function closeFillQuestionnaire() {
    var overlay = document.getElementById('qnr-fill-overlay');
    if (overlay) overlay.remove();
    fillState = null;
  }

  // ========== 查看问卷结果 ==========
  function showResult(qnr) {
    var existing = document.getElementById('qnr-result-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.className = 'qnr-result-overlay active';
    overlay.id = 'qnr-result-overlay';

    var answersHTML = '';
    if (qnr.answers && qnr.answers.length > 0) {
      answersHTML = qnr.answers.map(function(ans, i) {
        var q = qnr.questions[i] || {};
        var answerText = '';
        if (ans.type === 'choice') {
          answerText = (ans.selectedOptions || []).join('、');
        } else if (ans.type === 'blank') {
          answerText = ans.filledText || (ans.blankAnswers || []).join('、');
          // 高亮填入的内容
          if (ans.filledText) {
            answerText = escapeHtml(ans.filledText).replace(/【(.+?)】/g, '<span class="blank-fill">【$1】</span>');
          } else {
            answerText = escapeHtml((ans.blankAnswers || []).join('、'));
          }
        } else if (ans.type === 'qa') {
          answerText = escapeHtml(ans.qaAnswer || '');
        }
        // 显示问答题的图片
        var qaImagesHTML = '';
        if (q.type === 'qa') {
          // 兼容旧数据
          var qaImgs = q.qaImages || (q.qaImage ? [q.qaImage] : []);
          if (qaImgs.length > 0) {
            qaImagesHTML = '<div class="qnr-qa-image-gallery" style="margin-bottom:6px;">';
            qaImgs.forEach(function(img) {
              qaImagesHTML += '<img class="qnr-qa-image" src="' + img + '">';
            });
            qaImagesHTML += '</div>';
          }
        }
        return '<div class="qnr-result-q">' +
          '<div class="qnr-result-q-title">' + (i + 1) + '. ' + escapeHtml(q.title || '') + '</div>' +
          qaImagesHTML +
          '<div class="qnr-result-q-answer">' + answerText + '</div>' +
          (ans.timeSpent ? '<div style="font-size:11px;color:#aaa;margin-top:2px;">用时 ' + ans.timeSpent + 's</div>' : '') +
        '</div>';
      }).join('');
    } else {
      answersHTML = '<div style="text-align:center;padding:20px;color:#999;">暂无回答</div>';
    }

    overlay.innerHTML = '' +
    '<div class="qnr-result-modal">' +
      '<div class="qnr-result-header">' +
        '<div style="font-size:18px;font-weight:700;color:var(--text,#333);">' + escapeHtml(qnr.title) + '</div>' +
        '<div style="font-size:13px;color:#888;margin-top:4px;">' +
          (qnr.filledByUser ? '我的回答' : getPartnerName() + ' 的回答') + ' · ' +
          (qnr.totalTimeSpent || 0) + 's' +
          (qnr.isOvertime ? ' · ⚠️ 超时' : '') +
        '</div>' +
        '<button class="qnr-close-btn" style="position:absolute;right:16px;top:16px;" id="qnr-result-close">✕</button>' +
      '</div>' +
      '<div class="qnr-result-body">' + answersHTML + '</div>' +
      '<div class="qnr-fill-footer">' +
        '<button class="qnr-btn qnr-btn-cancel" id="qnr-result-close2">关闭</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(overlay);

    var closeBtn = document.getElementById('qnr-result-close');
    if (closeBtn) closeBtn.addEventListener('click', function() { closeResult(); });
    var closeBtn2 = document.getElementById('qnr-result-close2');
    if (closeBtn2) closeBtn2.addEventListener('click', function() { closeResult(); });
  }

  function closeResult() {
    var overlay = document.getElementById('qnr-result-overlay');
    if (overlay) overlay.remove();
  }

  // ========== 聊天消息卡片渲染 ==========
  window.renderQuestionnaireMessage = function(msg) {
    var qnr = msg.questionnaire;
    if (!qnr) return '<div style="padding:10px;color:#999;">问卷消息</div>';

    var isAnswer = msg.isAnswer;
    var statusText = '';
    var statusClass = '';
    if (isAnswer) {
      statusText = '✅ 已完成';
      statusClass = 'completed';
    } else if (qnr.status === 'completed') {
      statusText = '✅ 已完成';
      statusClass = 'completed';
    } else if (qnr.status === 'declined') {
      statusText = '❌ 已拒绝';
      statusClass = 'declined';
    } else {
      statusText = '📋 待填写';
    }

    var qCount = qnr.questions ? qnr.questions.length : 0;
    var totalTime = qnr.totalTime || 0;

    return '<div class="qnr-chat-card ' + statusClass + '" data-action="chat-card" data-id="' + qnr.id + '" data-is-answer="' + (isAnswer ? '1' : '0') + '" style="position:relative;cursor:pointer;">' +
      '<div class="qnr-chat-card-header">' +
        '<div class="qnr-chat-card-icon">📋</div>' +
        '<div class="qnr-chat-card-title">' + escapeHtml(qnr.title) + '</div>' +
        '<div class="qnr-chat-card-meta">' + qCount + ' 题 · 总时长 ' + totalTime + 's' + (isAnswer ? ' · ' + (qnr.totalTimeSpent || 0) + 's 完成' : '') + '</div>' +
      '</div>' +
      '<div class="qnr-chat-card-footer">' +
        '<span>' + (isAnswer ? (qnr.filledByUser ? '我填写的' : getPartnerName() + ' 填写的') : statusText) + '</span>' +
        '<span>' + (isAnswer ? '查看结果 →' : '点击填写 →') + '</span>' +
      '</div>' +
    '</div>';
  };

  async function clickCard(qnrId, isAnswer) {
    qnrList = await loadQuestionnaires();
    var qnr = qnrList.find(function(x) { return x.id === qnrId; });
    if (!qnr) {
      // 可能是刚发送还没保存
      _notify('问卷数据未找到', 'warning');
      return;
    }

    if (isAnswer || qnr.status === 'completed') {
      // 查看结果
      showResult(qnr);
    } else {
      // 填写问卷
      openFillQuestionnaire(qnr, false);
    }
  }

  // ========== 初始化 ==========
  function init() {
    // 确保关键函数暴露到 window（兼容 const 声明的全局函数）
    try {
      if (typeof addMessage === 'function' && typeof window.addMessage === 'undefined') window.addMessage = addMessage;
      if (typeof showNotification === 'function' && typeof window.showNotification === 'undefined') window.showNotification = showNotification;
      if (typeof playSound === 'function' && typeof window.playSound === 'undefined') window.playSound = playSound;
    } catch(e) { console.warn('[QNR] 暴露全局函数失败:', e); }

    // 注册到加号菜单
    addToAttachMenu();

    // 全局事件委托：聊天中的问卷卡片点击
    document.addEventListener('click', function(e) {
      var el = e.target.closest('[data-action="chat-card"]');
      if (!el) return;
      e.preventDefault();
      var id = el.getAttribute('data-id');
      var isAnswer = el.getAttribute('data-is-answer') === '1';
      clickCard(id, isAnswer);
    });

    // 每隔一段时间有概率触发对方邀请
    setInterval(function() {
      if (Math.random() < 0.05) { // 5% 概率
        simulatePartnerInviteUser();
      }
    }, 60000); // 每分钟检查一次
  }

  function addToAttachMenu() {
    // 监听 attach menu 创建
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        m.addedNodes.forEach(function(node) {
          if (node.id === 'chat-attach-menu') {
            var existing = node.querySelector('[data-action="questionnaire"]');
            if (!existing) {
              var btn = document.createElement('button');
              btn.type = 'button';
              btn.setAttribute('data-action', 'questionnaire');
              btn.innerHTML = '<i class="fas fa-clipboard-list"></i><span>创建问卷</span>';
              btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                node.remove();
                openQuestionnaireList();
              });
              node.appendChild(btn);
            }
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ========== 暴露全局 API ==========
  window.QNR = {
    // 编辑器
    openEditor: openQuestionnaireEditor,
    closeEditor: closeQuestionnaireEditor,
    toggleTypeSelector: toggleTypeSelector,
    addQuestion: addQuestion,
    deleteQuestion: deleteQuestion,
    addOption: addOption,
    removeOption: removeOption,
    renderBlankPreview: renderBlankPreview,
    focusBlank: focusBlank,
    removeQaImage: removeQaImage,
    saveQuestionnaire: saveQuestionnaire,
    // 列表
    openList: openQuestionnaireList,
    closeList: closeQuestionnaireList,
    createNew: createNew,
    edit: editQuestionnaire,
    del: deleteQuestionnaire,
    send: sendById,
    // 填写
    openFill: openFillQuestionnaire,
    closeFill: closeFillQuestionnaire,
    fillNext: fillNext,
    fillPrev: fillPrev,
    toggleOption: toggleOption,
    selectQACard: selectQACard,
    cancelFill: cancelFill,
    // 邀请
    acceptInvite: acceptInvite,
    declineInvite: declineInvite,
    closeInvitePopup: closeInvitePopup,
    // 结果
    showResult: showResult,
    closeResult: closeResult,
    // 卡片点击
    clickCard: clickCard,
    // 初始化
    init: init
  };

  // 自动初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
