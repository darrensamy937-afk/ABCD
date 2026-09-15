/**
 * moyu.js - 摸鱼小记功能
 * 功能：记录工作地点、工作时长、摸鱼内容，支持地点库管理
 */

// ==================== 初始化 ====================
window.initMoyu = function () {
    // 绑定顶部按钮入口
    const moyuEntry = document.getElementById('moyu-btn');
    if (moyuEntry) {
        moyuEntry.addEventListener('click', function () {
            window.openMoyuModal();
        });
    }

    // 初始化时间筛选
    window.initMoyuTimeFilter();

    // 绑定关闭按钮
    const closeBtn = document.getElementById('close-moyu-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', function () {
            const modal = document.getElementById('moyu-modal');
            if (modal) {
                if (typeof hideModal === 'function') hideModal(modal);
                else modal.style.display = 'none';
            }
        });
    }

    // 绑定编辑器关闭按钮
    const closeEditorBtn = document.getElementById('close-moyu-editor');
    if (closeEditorBtn) {
        closeEditorBtn.addEventListener('click', function () {
            window.closeMoyuEditor();
        });
    }

    // 绑定保存按钮
    const saveBtn = document.getElementById('save-moyu-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', function () {
            window.saveMoyuRecord();
        });
    }

    // 设置默认日期为今天
    const dateInput = document.getElementById('moyu-date-input');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
};

// ==================== 弹窗管理 ====================
window.openMoyuModal = function () {
    const modal = document.getElementById('moyu-modal');
    if (!modal) return;

    // 清除未读标记
    if (typeof window.clearMoyuUnread === 'function') {
        window.clearMoyuUnread();
    }

    // 显示弹窗
    if (typeof showModal === 'function') {
        showModal(modal);
    } else if (typeof window.homeShowModal === 'function') {
        window.homeShowModal(modal);
    } else {
        modal.style.display = 'flex';
    }

    // 渲染内容
    window.renderMoyuCurrent();
    window.renderMoyuRecords();
    window.renderMoyuLocations();
    window.updateMoyuLocationSelect();

    // 默认显示当前标签页
    window.switchMoyuTab('current');
};

// ==================== 标签页切换 ====================
window.switchMoyuTab = function (tab) {
    const currentPanel = document.getElementById('moyu-current-panel');
    const recordsPanel = document.getElementById('moyu-records-panel');
    const currentTab = document.getElementById('moyu-tab-current');
    const recordsTab = document.getElementById('moyu-tab-records');

    if (!currentPanel || !recordsPanel || !currentTab || !recordsTab) return;

    if (tab === 'current') {
        currentPanel.style.display = 'block';
        recordsPanel.style.display = 'none';
        currentTab.classList.add('active');
        currentTab.style.background = 'rgba(var(--accent-color-rgb), 0.16)';
        currentTab.style.color = 'var(--accent-color)';
        recordsTab.classList.remove('active');
        recordsTab.style.background = 'transparent';
        recordsTab.style.color = 'var(--text-secondary)';
    } else {
        currentPanel.style.display = 'none';
        recordsPanel.style.display = 'block';
        currentTab.classList.remove('active');
        currentTab.style.background = 'transparent';
        currentTab.style.color = 'var(--text-secondary)';
        recordsTab.classList.add('active');
        recordsTab.style.background = 'rgba(var(--accent-color-rgb), 0.16)';
        recordsTab.style.color = 'var(--accent-color)';
    }
};

// ==================== 当前面板渲染 ====================
window.renderMoyuCurrent = function () {
    const panel = document.getElementById('moyu-current-panel');
    if (!panel) return;

    // 如果没有当前记录，显示提示
    if (!currentMoyuRecord) {
        panel.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">
                <i class="fas fa-fish" style="font-size: 36px; margin-bottom: 12px; opacity: 0.3;"></i>
                <div style="font-size: 13px;">暂无摸鱼记录</div>
                <div style="font-size: 11px; margin-top: 8px; opacity: 0.7; line-height: 1.6;">
                    系统会根据设置的间隔时间<br>
                    自动随机生成摸鱼记录
                </div>
                <div style="margin-top: 16px; padding: 12px; background: rgba(var(--accent-color-rgb), 0.08); border-radius: 10px; border: 1px dashed rgba(var(--accent-color-rgb), 0.3);">
                    <div style="font-size: 11px; color: var(--text-secondary);">
                        <i class="fas fa-info-circle" style="margin-right: 4px;"></i>
                        请在「设置」→「摸鱼记录」中<br>开启并配置自动生成
                    </div>
                </div>
            </div>
        `;
        return;
    }

    const record = currentMoyuRecord;
    const session = moyuWorkSession;

    // 构建活动列表（分条显示）
    let activitiesHtml = '';
    if (session && session.activities && session.activities.length > 0) {
        activitiesHtml = session.activities.map((act, idx) => {
            const time = new Date(act.time);
            const timeStr = time.getHours().toString().padStart(2, '0') + ':' + time.getMinutes().toString().padStart(2, '0') + ':' + time.getSeconds().toString().padStart(2, '0');
            return `
                <div style="background: var(--primary-bg); border-radius: 8px; padding: 10px 12px; margin-bottom: ${idx < session.activities.length - 1 ? '8px' : '0'}; position: relative;">
                    <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 4px; opacity: 0.7;">
                        <i class="fas fa-clock" style="margin-right: 2px; font-size: 9px;"></i>${timeStr}
                    </div>
                    <div style="font-size: 13px; color: var(--text-primary); line-height: 1.5;">${window.escapeHtml(act.content)}</div>
                </div>
            `;
        }).join('');
    } else if (record.note) {
        // 兼容旧格式（非会话记录）
        activitiesHtml = `
            <div style="background: var(--primary-bg); border-radius: 8px; padding: 10px 12px; position: relative;">
                <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 4px; opacity: 0.7;">
                    <i class="fas fa-clock" style="margin-right: 2px; font-size: 9px;"></i>${record.createdAt ? new Date(record.createdAt).getHours().toString().padStart(2,'0') + ':' + new Date(record.createdAt).getMinutes().toString().padStart(2,'0') : ''}
                </div>
                <div style="font-size: 13px; color: var(--text-primary); line-height: 1.5;">${window.escapeHtml(record.note)}</div>
            </div>
        `;
    }

    // 计算剩余工作时间
    let remainingHtml = '';
    if (session && session.endTime) {
        const now = Date.now();
        const remaining = session.endTime - now;
        if (remaining > 0) {
            const remainMin = Math.floor(remaining / 60000);
            const remainHour = Math.floor(remainMin / 60);
            const remainMinLeft = remainMin % 60;
            const remainStr = remainHour > 0 ? `${remainHour}小时${remainMinLeft}分钟` : `${remainMinLeft}分钟`;
            remainingHtml = `
                <div style="font-size: 11px; color: var(--accent-color); background: rgba(var(--accent-color-rgb), 0.08); padding: 6px 10px; border-radius: 8px; margin-bottom: 12px; text-align: center;">
                    <i class="fas fa-hourglass-half" style="margin-right: 4px;"></i>剩余工作时间 ${remainStr}
                </div>
            `;
        }
    }

    panel.innerHTML = `
        <div style="text-align: center; margin-bottom: 12px;">
            <span style="font-size: 11px; color: var(--text-secondary); background: rgba(var(--accent-color-rgb), 0.1); padding: 4px 10px; border-radius: 10px;">
                <i class="fas fa-clock" style="margin-right: 4px;"></i>当前摸鱼记录
            </span>
        </div>
        <div class="moyu-record-item" style="background: var(--secondary-bg); border-radius: 12px; padding: 14px; border: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-map-marker-alt" style="color: var(--accent-color); font-size: 12px;"></i>
                    <span style="font-weight: 600; font-size: 14px;">${window.escapeHtml(record.location)}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 12px; color: var(--text-secondary); background: rgba(var(--accent-color-rgb), 0.1); padding: 2px 8px; border-radius: 10px;">
                        <i class="fas fa-clock" style="font-size: 10px; margin-right: 2px;"></i>${record.hours}h
                    </span>
                </div>
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">
                <i class="fas fa-calendar" style="margin-right: 4px;"></i>${record.date}
            </div>
            ${remainingHtml}
            <div style="margin-top: 8px;">
                ${activitiesHtml}
            </div>
        </div>
    `;
};

// ==================== 统计渲染 ====================
window.renderMoyuStats = function () {
    const totalCountEl = document.getElementById('moyu-total-count');
    const totalHoursEl = document.getElementById('moyu-total-hours');
    const locationCountEl = document.getElementById('moyu-location-count');

    if (!totalCountEl || !totalHoursEl || !locationCountEl) return;

    // 计算统计数据
    const records = moyuRecords || [];
    const locations = moyuLocations || [];

    const totalCount = records.length;
    const totalHours = records.reduce((sum, r) => sum + (parseFloat(r.hours) || 0), 0);

    totalCountEl.textContent = totalCount;
    totalHoursEl.textContent = totalHours.toFixed(1);
    locationCountEl.textContent = locations.length;
};

// ==================== 记录列表渲染 ====================
window.renderMoyuRecords = function () {
    const listEl = document.getElementById('moyu-records-list');
    if (!listEl) return;

    let records = moyuRecords || [];

    // 应用时间筛选
    const filterType = window.moyuFilterType || 'all';
    const startDate = window.moyuFilterStartDate;
    const endDate = window.moyuFilterEndDate;

    if (filterType !== 'all') {
        const now = new Date();
        let filterStart = null;
        let filterEnd = null;

        switch (filterType) {
            case 'today':
                filterStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                filterEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
                break;
            case 'week':
                filterStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                filterEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                break;
            case 'month':
                filterStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                filterEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                break;
            case 'custom':
                if (startDate && endDate) {
                    filterStart = new Date(startDate);
                    filterEnd = new Date(endDate);
                    filterEnd.setDate(filterEnd.getDate() + 1);
                }
                break;
        }

        if (filterStart && filterEnd) {
            records = records.filter(r => {
                const recordDate = new Date(r.date);
                return recordDate >= filterStart && recordDate < filterEnd;
            });
        }
    }

    if (records.length === 0) {
        listEl.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">
                <i class="fas fa-fish" style="font-size: 36px; margin-bottom: 12px; opacity: 0.3;"></i>
                <div style="font-size: 13px;">该时间段内没有记录~</div>
                <div style="font-size: 11px; margin-top: 4px; opacity: 0.7;">尝试调整时间筛选范围</div>
            </div>
        `;
        return;
    }

    // 按日期倒序排列
    const sortedRecords = [...records].sort((a, b) => new Date(b.date) - new Date(a.date));

    listEl.innerHTML = sortedRecords.map((record, index) => {
        const originalIndex = records.indexOf(record);
        
        // 解析活动列表
        let activities = [];
        if (record.activities && Array.isArray(record.activities)) {
            // 新格式：有 activities 数组
            activities = record.activities;
        } else if (record.note && record.note.includes('• ')) {
            // 中间格式：note 是列表文本
            const lines = record.note.split('\n').filter(line => line.trim().startsWith('• '));
            activities = lines.map((line, idx) => ({
                content: line.replace(/^•\s*/, ''),
                time: record.createdAt ? new Date(record.createdAt).getTime() + idx * 60000 : Date.now()
            }));
        } else if (record.note) {
            // 旧格式：纯文本
            activities = [{
                content: record.note,
                time: record.createdAt ? new Date(record.createdAt).getTime() : Date.now()
            }];
        }

        // 生成活动列表 HTML（默认只显示2条）
        const displayCount = 2;
        const hasMore = activities.length > displayCount;
        const displayedActivities = activities.slice(0, displayCount);
        const hiddenActivities = activities.slice(displayCount);

        const activitiesHtml = displayedActivities.map((act, idx) => {
            const time = new Date(act.time);
            const timeStr = time.getHours().toString().padStart(2, '0') + ':' + time.getMinutes().toString().padStart(2, '0') + ':' + time.getSeconds().toString().padStart(2, '0');
            return `
                <div style="background: var(--primary-bg); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; position: relative;">
                    <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 4px; opacity: 0.7;">
                        <i class="fas fa-clock" style="margin-right: 2px; font-size: 9px;"></i>${timeStr}
                    </div>
                    <div style="font-size: 13px; color: var(--text-primary); line-height: 1.5;">${window.escapeHtml(act.content)}</div>
                </div>
            `;
        }).join('');

        const hiddenActivitiesHtml = hiddenActivities.map((act, idx) => {
            const time = new Date(act.time);
            const timeStr = time.getHours().toString().padStart(2, '0') + ':' + time.getMinutes().toString().padStart(2, '0') + ':' + time.getSeconds().toString().padStart(2, '0');
            return `
                <div style="background: var(--primary-bg); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; position: relative; display: none;" class="hidden-activity-${originalIndex}">
                    <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 4px; opacity: 0.7;">
                        <i class="fas fa-clock" style="margin-right: 2px; font-size: 9px;"></i>${timeStr}
                    </div>
                    <div style="font-size: 13px; color: var(--text-primary); line-height: 1.5;">${window.escapeHtml(act.content)}</div>
                </div>
            `;
        }).join('');

        const expandBtn = hasMore ? `
            <button onclick="window.toggleMoyuRecordExpand(${originalIndex})" id="moyu-expand-btn-${originalIndex}" style="width: 100%; padding: 8px; background: rgba(var(--accent-color-rgb), 0.08); border: 1px dashed rgba(var(--accent-color-rgb), 0.3); border-radius: 8px; color: var(--accent-color); font-size: 12px; cursor: pointer; font-family: var(--font-family); margin-top: 4px;">
                <i class="fas fa-chevron-down" style="margin-right: 4px;"></i>展开更多 (${hiddenActivities.length}条)
            </button>
        ` : '';

        // 查岗记录特殊渲染
        if (record.type === 'checkin') {
            const isPartnerToMe = record.note && record.note.includes('【查岗】问：');
            const isMeToPartner = record.note && record.note.includes('【查岗对方】');
            const icon = isPartnerToMe ? '<i class="fas fa-user-shield" style="color: #ff6b6b;"></i>' : '<i class="fas fa-search" style="color: #4ecdc4;"></i>';
            const title = isPartnerToMe ? '对方查岗' : '我查岗对方';
            return `
                <div class="moyu-record-item" style="background: var(--secondary-bg); border-radius: 12px; padding: 14px; margin-bottom: 10px; border: 1px solid var(--border-color);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            ${icon}
                            <span style="font-weight: 600; font-size: 14px; color: var(--text-primary);">${title}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 12px; color: var(--text-secondary); background: rgba(var(--accent-color-rgb), 0.1); padding: 2px 8px; border-radius: 10px;">
                                <i class="fas fa-shield-alt" style="font-size: 10px; margin-right: 2px;"></i>查岗
                            </span>
                            <button onclick="window.deleteMoyuRecord(${originalIndex})" style="background: none; border: none; color: #ff6b6b; cursor: pointer; padding: 4px; font-size: 12px;" title="删除">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">
                        <i class="fas fa-calendar" style="margin-right: 4px;"></i>${record.date}
                    </div>
                    <div style="background: var(--primary-bg); border-radius: 8px; padding: 10px 12px; border: 1px solid var(--border-color);">
                        <div style="font-size: 13px; color: var(--text-primary); line-height: 1.6; white-space: pre-line;">${window.escapeHtml(record.note || '')}</div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="moyu-record-item" style="background: var(--secondary-bg); border-radius: 12px; padding: 14px; margin-bottom: 10px; border: 1px solid var(--border-color);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-map-marker-alt" style="color: var(--accent-color); font-size: 12px;"></i>
                        <span style="font-weight: 600; font-size: 14px;">${window.escapeHtml(record.location)}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 12px; color: var(--text-secondary); background: rgba(var(--accent-color-rgb), 0.1); padding: 2px 8px; border-radius: 10px;">
                            <i class="fas fa-clock" style="font-size: 10px; margin-right: 2px;"></i>${record.hours}h
                        </span>
                        <button onclick="window.deleteMoyuRecord(${originalIndex})" style="background: none; border: none; color: #ff6b6b; cursor: pointer; padding: 4px; font-size: 12px;" title="删除">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">
                    <i class="fas fa-calendar" style="margin-right: 4px;"></i>${record.date}
                </div>
                <div style="margin-top: 8px;">
                    ${activitiesHtml}
                    ${hiddenActivitiesHtml}
                    ${expandBtn}
                </div>
            </div>
        `;
    }).join('');
};

// 展开/收起记录
window.toggleMoyuRecordExpand = function (index) {
    const hiddenItems = document.querySelectorAll(`.hidden-activity-${index}`);
    const btn = document.getElementById(`moyu-expand-btn-${index}`);

    if (!btn) return;

    const isExpanded = btn.dataset.expanded === 'true';

    if (isExpanded) {
        // 收起
        hiddenItems.forEach(item => item.style.display = 'none');
        btn.innerHTML = `<i class="fas fa-chevron-down" style="margin-right: 4px;"></i>展开更多 (${hiddenItems.length}条)`;
        btn.dataset.expanded = 'false';
    } else {
        // 展开
        hiddenItems.forEach(item => item.style.display = 'block');
        btn.innerHTML = `<i class="fas fa-chevron-up" style="margin-right: 4px;"></i>收起`;
        btn.dataset.expanded = 'true';
    }
};

// ==================== 时间筛选功能 ====================
// 初始化时间筛选
window.initMoyuTimeFilter = function () {
    const presetSelect = document.getElementById('moyu-filter-preset');
    const customRange = document.getElementById('moyu-custom-date-range');
    const startInput = document.getElementById('moyu-filter-start');
    const endInput = document.getElementById('moyu-filter-end');
    const filterInfo = document.getElementById('moyu-filter-info');

    if (!presetSelect) return;

    // 设置默认日期
    const today = new Date().toISOString().split('T')[0];
    if (startInput) startInput.value = today;
    if (endInput) endInput.value = today;

    // 预设选择变化
    presetSelect.addEventListener('change', function () {
        const value = this.value;
        window.moyuFilterType = value;

        if (value === 'custom') {
            customRange.style.display = 'flex';
            filterInfo.textContent = '请选择自定义日期范围';
        } else {
            customRange.style.display = 'none';
            updateFilterInfo(value);
            window.renderMoyuRecords();
        }
    });

    // 自定义日期变化
    if (startInput) {
        startInput.addEventListener('change', function () {
            window.moyuFilterStartDate = this.value;
            if (window.moyuFilterType === 'custom' && window.moyuFilterEndDate) {
                updateFilterInfo('custom');
                window.renderMoyuRecords();
            }
        });
    }

    if (endInput) {
        endInput.addEventListener('change', function () {
            window.moyuFilterEndDate = this.value;
            if (window.moyuFilterType === 'custom' && window.moyuFilterStartDate) {
                updateFilterInfo('custom');
                window.renderMoyuRecords();
            }
        });
    }

    // 初始化筛选状态
    window.moyuFilterType = 'all';
};

// 更新筛选信息显示
function updateFilterInfo(filterType) {
    const filterInfo = document.getElementById('moyu-filter-info');
    if (!filterInfo) return;

    const now = new Date();
    let infoText = '';

    switch (filterType) {
        case 'all':
            infoText = '显示全部记录';
            break;
        case 'today':
            infoText = `今天 (${now.toLocaleDateString('zh-CN')})`;
            break;
        case 'week':
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            infoText = `${weekAgo.toLocaleDateString('zh-CN')} 至 ${now.toLocaleDateString('zh-CN')}`;
            break;
        case 'month':
            const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            infoText = `${monthAgo.toLocaleDateString('zh-CN')} 至 ${now.toLocaleDateString('zh-CN')}`;
            break;
        case 'custom':
            if (window.moyuFilterStartDate && window.moyuFilterEndDate) {
                infoText = `${window.moyuFilterStartDate} 至 ${window.moyuFilterEndDate}`;
            } else {
                infoText = '请选择完整的日期范围';
            }
            break;
    }

    filterInfo.textContent = infoText;
}

// ==================== 地点库渲染 ====================
window.renderMoyuLocations = function () {
    const listEl = document.getElementById('moyu-locations-list');
    if (!listEl) return;

    const locations = moyuLocations || [];

    if (locations.length === 0) {
        listEl.innerHTML = `
            <div style="text-align: center; padding: 30px 20px; color: var(--text-secondary);">
                <i class="fas fa-map-marked-alt" style="font-size: 32px; margin-bottom: 10px; opacity: 0.3;"></i>
                <div style="font-size: 13px;">还没有添加地点~</div>
            </div>
        `;
        return;
    }

    listEl.innerHTML = locations.map((loc, index) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; background: var(--secondary-bg); border-radius: 10px; margin-bottom: 8px; border: 1px solid var(--border-color);">
            <div style="display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-map-pin" style="color: var(--accent-color); font-size: 12px;"></i>
                <span style="font-size: 14px;">${window.escapeHtml(loc)}</span>
            </div>
            <button onclick="window.removeMoyuLocation(${index})" style="background: none; border: none; color: #ff6b6b; cursor: pointer; padding: 4px 8px; font-size: 12px;">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
};

// ==================== 更新地点选择下拉框 ====================
window.updateMoyuLocationSelect = function () {
    const select = document.getElementById('moyu-location-select');
    if (!select) return;

    const locations = moyuLocations || [];
    const currentValue = select.value;

    select.innerHTML = '<option value="">请选择地点...</option>' +
        locations.map(loc => `<option value="${window.escapeHtml(loc)}">${window.escapeHtml(loc)}</option>`).join('');

    // 恢复之前的选择
    if (currentValue && locations.includes(currentValue)) {
        select.value = currentValue;
    }
};

// ==================== 编辑器管理 ====================
window.openMoyuEditor = function () {
    const editor = document.getElementById('moyu-editor-slide');
    if (!editor) return;

    // 重置表单
    document.getElementById('moyu-location-select').value = '';
    document.getElementById('moyu-date-input').value = new Date().toISOString().split('T')[0];
    document.getElementById('moyu-hours-input').value = '';

    // 更新地点选项
    window.updateMoyuLocationSelect();

    // 显示编辑器
    editor.style.transform = 'translateX(0)';
};

window.closeMoyuEditor = function () {
    const editor = document.getElementById('moyu-editor-slide');
    if (editor) {
        editor.style.transform = 'translateX(100%)';
    }
};

// ==================== 随机获取摸鱼内容 ====================
function getRandomMoyuNote() {
    // 从摸鱼活动库中随机获取（由摸鱼管理功能维护）
    const activities = window.moyuActivities || [];
    if (activities.length > 0) {
        return activities[Math.floor(Math.random() * activities.length)];
    }
    
    // 如果没有摸鱼活动库，使用默认内容
    const defaultNotes = [
        '刷了一会儿社交媒体',
        '看了会儿视频',
        '喝了杯咖啡休息一下',
        '和同事聊了会儿天',
        '翻了翻邮件',
        '整理了一下桌面',
        '眯了一会儿',
        '刷了会儿新闻',
        '发了会儿呆',
        '整理文件'
    ];
    return defaultNotes[Math.floor(Math.random() * defaultNotes.length)];
}

// ==================== 保存记录 ====================
window.saveMoyuRecord = function () {
    const location = document.getElementById('moyu-location-select').value.trim();
    const date = document.getElementById('moyu-date-input').value;
    const hours = parseFloat(document.getElementById('moyu-hours-input').value);

    // 验证
    if (!location) {
        if (typeof showNotification === 'function') showNotification('请选择工作地点', 'error');
        else alert('请选择工作地点');
        return;
    }
    if (!date) {
        if (typeof showNotification === 'function') showNotification('请选择日期', 'error');
        else alert('请选择日期');
        return;
    }
    if (!hours || hours <= 0) {
        if (typeof showNotification === 'function') showNotification('请输入有效的工作时长', 'error');
        else alert('请输入有效的工作时长');
        return;
    }

    // 从摸鱼活动库随机抽取一条作为摸鱼内容
    const note = getRandomMoyuNote();

    // 创建记录
    const record = {
        id: Date.now(),
        location: location,
        date: date,
        hours: hours,
        note: note,
        createdAt: new Date().toISOString()
    };

    // 添加到记录数组
    if (!moyuRecords) moyuRecords = [];
    moyuRecords.push(record);

    // 保存数据
    if (typeof throttledSaveData === 'function') throttledSaveData();

    // 关闭编辑器
    window.closeMoyuEditor();

    // 刷新显示
    window.renderMoyuStats();
    window.renderMoyuRecords();

    // 显示成功提示
    if (typeof showNotification === 'function') showNotification('摸鱼记录已保存~', 'success');
};

// ==================== 删除记录 ====================
window.deleteMoyuRecord = function (index) {
    if (!confirm('确定要删除这条记录吗？')) return;

    if (moyuRecords && index >= 0 && index < moyuRecords.length) {
        moyuRecords.splice(index, 1);
        if (typeof throttledSaveData === 'function') throttledSaveData();
        window.renderMoyuStats();
        window.renderMoyuRecords();
        if (typeof showNotification === 'function') showNotification('记录已删除', 'success');
    }
};

// ==================== 地点库管理 ====================
window.addMoyuLocation = function () {
    const input = document.getElementById('moyu-new-location-input');
    if (!input) return;

    const name = input.value.trim();
    if (!name) {
        if (typeof showNotification === 'function') showNotification('请输入地点名称', 'error');
        return;
    }

    // 检查重复
    if (!moyuLocations) moyuLocations = [];
    if (moyuLocations.includes(name)) {
        if (typeof showNotification === 'function') showNotification('该地点已存在', 'error');
        return;
    }

    // 添加地点
    moyuLocations.push(name);
    if (typeof throttledSaveData === 'function') throttledSaveData();

    // 清空输入
    input.value = '';

    // 刷新显示
    window.renderMoyuStats();
    window.renderMoyuLocations();
    window.updateMoyuLocationSelect();

    if (typeof showNotification === 'function') showNotification('地点添加成功', 'success');
};

window.removeMoyuLocation = function (index) {
    if (!confirm('确定要删除这个地点吗？')) return;

    if (moyuLocations && index >= 0 && index < moyuLocations.length) {
        moyuLocations.splice(index, 1);
        if (typeof throttledSaveData === 'function') throttledSaveData();
        window.renderMoyuStats();
        window.renderMoyuLocations();
        window.updateMoyuLocationSelect();
        if (typeof showNotification === 'function') showNotification('地点已删除', 'success');
    }
};

// ==================== 工具函数 ====================
window.escapeHtml = function (str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
};

// ==================== 查岗系统 ====================
// 查岗数据
window.checkinQuestions = window.checkinQuestions || [];
window.checkinRecords = window.checkinRecords || [];
window.currentCheckinQuestion = null;
window.checkinAnswerExtra = {};
window.checkinAnswerImageBase64 = null;

// 查岗设置弹窗
window.openCheckinSettingsModal = function() {
    const modal = document.getElementById('checkin-settings-modal');
    if (!modal) return;
    renderCheckinQuestionList();
    updateCheckinSettingsUI();
    if (typeof showModal === 'function') showModal(modal);
    else modal.style.display = 'flex';
};

window.closeCheckinSettingsModal = function() {
    const modal = document.getElementById('checkin-settings-modal');
    if (modal) {
        if (typeof hideModal === 'function') hideModal(modal);
        else modal.style.display = 'none';
    }
};

// 更新查岗设置UI
function updateCheckinSettingsUI() {
    const partnerActiveToggle = document.getElementById('checkin-partner-active-toggle');
    const notifyToggle = document.getElementById('checkin-notify-toggle');

    if (partnerActiveToggle) partnerActiveToggle.classList.toggle('active', !!settings.checkinPartnerActive);
    if (notifyToggle) notifyToggle.classList.toggle('active', !!settings.checkinNotify);
}

// 渲染查岗问题列表
window.renderCheckinQuestionList = function() {
    const listEl = document.getElementById('checkin-question-list');
    if (!listEl) return;
    const questions = window.checkinQuestions || [];
    if (questions.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-secondary);font-size:12px;">暂无问题，请添加或从心情库导入</div>';
        return;
    }
    listEl.innerHTML = questions.map((q, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--secondary-bg);border-radius:8px;margin-bottom:6px;border:1px solid var(--border-color);">
            <span style="font-size:12px;color:var(--text-primary);flex:1;overflow:hidden;text-overflow:ellipsis;">${window.escapeHtml(q)}</span>
            <button onclick="removeCheckinQuestion(${i})" style="background:none;border:none;color:#ff6b6b;cursor:pointer;padding:2px 6px;font-size:11px;"><i class="fas fa-times"></i></button>
        </div>
    `).join('');
};

// 添加查岗问题
window.addCheckinQuestion = function() {
    const input = document.getElementById('checkin-new-question');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    if (!window.checkinQuestions) window.checkinQuestions = [];
    window.checkinQuestions.push(text);
    input.value = '';
    renderCheckinQuestionList();
    if (typeof throttledSaveData === 'function') throttledSaveData();
    if (typeof showNotification === 'function') showNotification('问题已添加', 'success');
};

// 删除查岗问题
window.removeCheckinQuestion = function(index) {
    if (!window.checkinQuestions || index < 0 || index >= window.checkinQuestions.length) return;
    window.checkinQuestions.splice(index, 1);
    renderCheckinQuestionList();
    if (typeof throttledSaveData === 'function') throttledSaveData();
};

// 从心情库导入问题
window.importMoodToCheckin = function() {
    const moodQuestions = [];
    if (!window.checkinQuestions) window.checkinQuestions = [];
    let added = 0;
    moodQuestions.forEach(q => {
        if (!window.checkinQuestions.includes(q)) {
            window.checkinQuestions.push(q);
            added++;
        }
    });
    renderCheckinQuestionList();
    if (typeof throttledSaveData === 'function') throttledSaveData();
    if (typeof showNotification === 'function') showNotification(`已导入 ${added} 个问题`, 'success');
};

// ==================== 对方主动查岗逻辑 ====================
let checkinTimer = null;

function scheduleNextCheckin() {
    if (checkinTimer) { clearTimeout(checkinTimer); checkinTimer = null; }
    if (!settings.checkinPartnerActive) return;

    const minUnit = settings.checkinMinUnit || 'minutes';
    const maxUnit = settings.checkinMaxUnit || 'minutes';
    const minVal = Math.max(1, parseInt(settings.checkinMinInterval) || 10);
    const maxVal = Math.max(minVal, parseInt(settings.checkinMaxInterval) || 30);
    const minDelay = minUnit === 'hours' ? minVal * 60 * 60 * 1000 : minVal * 60 * 1000;
    const maxDelay = maxUnit === 'hours' ? maxVal * 60 * 60 * 1000 : maxVal * 60 * 1000;
    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    checkinTimer = setTimeout(() => {
        triggerPartnerCheckin();
    }, delay);
}

function triggerPartnerCheckin() {
    const questions = window.checkinQuestions || [];
    if (questions.length === 0) {
        if (typeof showNotification === 'function') {
            showNotification('暂无查岗问题，请到自定义回复库 → 摸鱼管理 → 查岗问题库中添加', 'warning');
        }
        scheduleNextCheckin();
        return;
    }
    const question = questions[Math.floor(Math.random() * questions.length)];
    window.currentCheckinQuestion = question;

    if (settings.checkinNotify !== false) {
        const modal = document.getElementById('checkin-question-modal');
        const textEl = document.getElementById('checkin-question-text');
        if (textEl) textEl.textContent = question;
        if (modal) {
            if (typeof showModal === 'function') showModal(modal);
            else modal.style.display = 'flex';
        }
    }
    scheduleNextCheckin();
}

// ==================== 用户回答查岗 ====================
window.openCheckinAnswerModal = function() {
    const questionModal = document.getElementById('checkin-question-modal');
    if (questionModal) {
        if (typeof hideModal === 'function') hideModal(questionModal);
        else questionModal.style.display = 'none';
    }
    const modal = document.getElementById('checkin-answer-modal');
    const displayEl = document.getElementById('checkin-answer-question-display');
    if (displayEl) displayEl.textContent = window.currentCheckinQuestion || '';
    const textArea = document.getElementById('checkin-answer-text');
    if (textArea) textArea.value = '';
    window.checkinAnswerExtra = {};
    window.checkinAnswerImageBase64 = null;
    const extraEl = document.getElementById('checkin-answer-extra');
    if (extraEl) extraEl.innerHTML = '';
    const imgPreview = document.getElementById('checkin-answer-image-preview');
    if (imgPreview) imgPreview.style.display = 'none';

    if (modal) {
        if (typeof showModal === 'function') showModal(modal);
        else modal.style.display = 'flex';
    }
};

window.closeCheckinAnswerModal = function() {
    const modal = document.getElementById('checkin-answer-modal');
    if (modal) {
        if (typeof hideModal === 'function') hideModal(modal);
        else modal.style.display = 'none';
    }
};

window.addCheckinLocation = function() {
    const locations = (typeof moyuLocations !== 'undefined' ? moyuLocations : []) || (window.moyuLocations || []);
    const loc = locations.length > 0 ? locations[Math.floor(Math.random() * locations.length)] : '空白';
    window.checkinAnswerExtra.location = loc;
    updateCheckinExtraDisplay();
};

window.addCheckinTime = function() {
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    window.checkinAnswerExtra.time = timeStr;
    updateCheckinExtraDisplay();
};

window.addCheckinPhoneStatus = function() {
    const battery = Math.floor(Math.random() * 60) + 20;
    const statuses = ['亮屏使用中', '待机中', '充电中'];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    window.checkinAnswerExtra.phoneStatus = `电量 ${battery}%，${status}`;
    updateCheckinExtraDisplay();
};

function updateCheckinExtraDisplay() {
    const extraEl = document.getElementById('checkin-answer-extra');
    if (!extraEl) return;
    const parts = [];
    if (window.checkinAnswerExtra.location) parts.push(`📍 ${window.checkinAnswerExtra.location}`);
    if (window.checkinAnswerExtra.time) parts.push(`🕐 ${window.checkinAnswerExtra.time}`);
    if (window.checkinAnswerExtra.phoneStatus) parts.push(`📱 ${window.checkinAnswerExtra.phoneStatus}`);
    extraEl.innerHTML = parts.map(p => `<div>${p}</div>`).join('');
}

window.handleCheckinImage = function(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        window.checkinAnswerImageBase64 = e.target.result;
        const img = document.getElementById('checkin-answer-img');
        const preview = document.getElementById('checkin-answer-image-preview');
        if (img) img.src = e.target.result;
        if (preview) preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
};

window.submitCheckinAnswer = function() {
    const textArea = document.getElementById('checkin-answer-text');
    const answerText = textArea ? textArea.value.trim() : '';
    const question = window.currentCheckinQuestion || '';

    let fullAnswer = answerText;
    const extras = [];
    if (window.checkinAnswerExtra.location) extras.push(`地点：${window.checkinAnswerExtra.location}`);
    if (window.checkinAnswerExtra.time) extras.push(`时间：${window.checkinAnswerExtra.time}`);
    if (window.checkinAnswerExtra.phoneStatus) extras.push(`手机：${window.checkinAnswerExtra.phoneStatus}`);
    if (extras.length > 0) {
        fullAnswer += '\n' + extras.join(' | ');
    }

    const record = {
        id: Date.now().toString(),
        type: 'checkin',
        direction: 'partner-to-me',
        question: question,
        answer: fullAnswer,
        image: window.checkinAnswerImageBase64 || null,
        date: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        location: window.checkinAnswerExtra.location || ''
    };
    if (!window.checkinRecords) window.checkinRecords = [];
    window.checkinRecords.push(record);

    if (!window.moyuRecords) window.moyuRecords = [];
    window.moyuRecords.push({
        id: record.id,
        location: window.checkinAnswerExtra.location || '查岗记录',
        date: record.date,
        hours: 0,
        note: `【查岗】问：${question}\n答：${fullAnswer}`,
        createdAt: record.createdAt,
        type: 'checkin'
    });

    closeCheckinAnswerModal();
    if (typeof throttledSaveData === 'function') throttledSaveData();
    if (typeof showNotification === 'function') showNotification('回答已发送给对方', 'success');

    setTimeout(() => {
        if (typeof showNotification === 'function') showNotification('对方已收到你的查岗回复', 'info');
    }, 1500);
};

// ==================== 用户查岗对方 ====================
window.openCheckinToPartnerModal = function() {
    const modal = document.getElementById('checkin-to-partner-modal');
    const qInput = document.getElementById('checkin-to-partner-question');
    const optList = document.getElementById('checkin-to-partner-options-list');
    if (qInput) qInput.value = '';
    if (optList) optList.innerHTML = '';
    if (modal) {
        if (typeof showModal === 'function') showModal(modal);
        else modal.style.display = 'flex';
    }
};

window.closeCheckinToPartnerModal = function() {
    const modal = document.getElementById('checkin-to-partner-modal');
    if (modal) {
        if (typeof hideModal === 'function') hideModal(modal);
        else modal.style.display = 'none';
    }
};

window.addCheckinPartnerOption = function() {
    const input = document.getElementById('checkin-to-partner-option-input');
    const list = document.getElementById('checkin-to-partner-options-list');
    if (!input || !list) return;
    const val = input.value.trim();
    if (!val) return;
    const item = document.createElement('div');
    item.className = 'checkin-option-item';
    item.setAttribute('data-value', val);
    item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--primary-bg);';
    item.innerHTML = '<span style="font-size:13px;color:var(--text-primary);">' + window.escapeHtml(val) + '</span><button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:14px;padding:0 2px;"><i class="fas fa-times"></i></button>';
    list.appendChild(item);
    input.value = '';
    input.focus();
};

window.submitCheckinToPartner = function() {
    const qInput = document.getElementById('checkin-to-partner-question');
    const question = qInput ? qInput.value.trim() : '';
    const optListEl = document.getElementById('checkin-to-partner-options-list');
    const optItems = optListEl ? optListEl.querySelectorAll('.checkin-option-item') : [];
    const options = Array.from(optItems).map(el => el.getAttribute('data-value') || el.textContent.trim()).filter(Boolean);

    if (!question) {
        if (typeof showNotification === 'function') showNotification('请输入查岗问题', 'warning');
        return;
    }
    if (options.length === 0) {
        if (typeof showNotification === 'function') showNotification('请至少添加一个选项', 'warning');
        return;
    }

    closeCheckinToPartnerModal();

    const replyModal = document.getElementById('checkin-partner-reply-modal');
    const contentEl = document.getElementById('checkin-partner-reply-content');
    const textEl = document.getElementById('checkin-partner-reply-text');
    const extraEl = document.getElementById('checkin-partner-reply-extra');

    if (contentEl) contentEl.style.display = 'none';
    if (replyModal) {
        if (typeof showModal === 'function') showModal(replyModal);
        else replyModal.style.display = 'flex';
    }

    setTimeout(() => {
        const selectedOption = options[Math.floor(Math.random() * options.length)];

        const extras = [];
        const wantPhone = document.getElementById('checkin-phone-status');
        const wantLocation = document.getElementById('checkin-location');
        const wantMood = document.getElementById('checkin-mood');

        if (wantPhone && wantPhone.checked) {
            const battery = Math.floor(Math.random() * 60) + 20;
            const phoneStatuses = ['正在回信', '在聊天界面', '刚刚发了朋友圈', '亮屏使用中', '待机中'];
            const pStatus = phoneStatuses[Math.floor(Math.random() * phoneStatuses.length)];
            const now = new Date();
            const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
            extras.push(`📱 手机状态：电量 ${battery}%，${pStatus}（${timeStr}）`);
        }

        if (wantLocation && wantLocation.checked) {
            const locations = (typeof moyuLocations !== 'undefined' ? moyuLocations : []) || (window.moyuLocations || []);
            const loc = locations.length > 0 ? locations[Math.floor(Math.random() * locations.length)] : null;
            extras.push(loc ? `📍 定位：${loc}` : `📍 定位：空白`);
        }

        if (wantMood && wantMood.checked) {
            const moods = window.moodLibrary || [];
            const mood = moods.length > 0 ? moods[Math.floor(Math.random() * moods.length)] : null;
            extras.push(mood ? `💭 心情：${mood}` : `💭 心情：空白`);
        }

        if (textEl) {
            textEl.innerHTML = `<div style="margin-bottom:8px;font-weight:600;">问题：${window.escapeHtml(question)}</div><div>回答：${window.escapeHtml(selectedOption)}</div>`;
        }
        if (extraEl) {
            const extraCards = extras.map(e => {
                let icon = '';
                let title = '';
                let content = e;
                if (e.includes('手机状态')) {
                    icon = '📱';
                    title = '手机状态';
                    content = e.replace('📱 手机状态：', '');
                } else if (e.includes('定位')) {
                    icon = '📍';
                    title = '定位';
                    content = e.replace('📍 定位：', '');
                } else if (e.includes('心情')) {
                    icon = '💭';
                    title = '心情';
                    content = e.replace('💭 心情：', '');
                }
                return `
                    <div style="background:var(--primary-bg);border:1px solid var(--border-color);border-radius:10px;padding:12px;margin-bottom:8px;">
                        <div style="font-size:11px;font-weight:600;color:var(--accent-color);margin-bottom:4px;display:flex;align-items:center;gap:4px;">
                            <span>${icon}</span><span>${title}</span>
                        </div>
                        <div style="font-size:13px;color:var(--text-primary);">${window.escapeHtml(content)}</div>
                    </div>
                `;
            }).join('');
            extraEl.innerHTML = extraCards;
        }
        if (contentEl) contentEl.style.display = 'block';

        const record = {
            id: Date.now().toString(),
            type: 'checkin',
            direction: 'me-to-partner',
            question: question,
            answer: selectedOption,
            extras: extras,
            date: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString()
        };
        if (!window.checkinRecords) window.checkinRecords = [];
        window.checkinRecords.push(record);

        if (!window.moyuRecords) window.moyuRecords = [];
        window.moyuRecords.push({
            id: record.id,
            location: record.extras.find(e => e.includes('定位'))?.replace('📍 定位：', '') || '查岗记录',
            date: record.date,
            hours: 0,
            note: `【查岗对方】问：${question}\n答：${selectedOption}\n${extras.join('\n')}`,
            createdAt: record.createdAt,
            type: 'checkin'
        });

        if (typeof throttledSaveData === 'function') throttledSaveData();
    }, 10000);
};

window.closeCheckinPartnerReplyModal = function() {
    const modal = document.getElementById('checkin-partner-reply-modal');
    if (modal) {
        if (typeof hideModal === 'function') hideModal(modal);
        else modal.style.display = 'none';
    }
};

// ==================== 查岗设置初始化与定时器 ====================
document.addEventListener('DOMContentLoaded', function() {
    const partnerActiveToggle = document.getElementById('checkin-partner-active-toggle');
    const notifyToggle = document.getElementById('checkin-notify-toggle');

    if (partnerActiveToggle) {
        partnerActiveToggle.addEventListener('click', () => {
            settings.checkinPartnerActive = !settings.checkinPartnerActive;
            partnerActiveToggle.classList.toggle('active', !!settings.checkinPartnerActive);
            if (typeof throttledSaveData === 'function') throttledSaveData();
            if (typeof showNotification === 'function') showNotification(`对方主动查岗已${settings.checkinPartnerActive ? '开启' : '关闭'}`, 'success');
            scheduleNextCheckin();
        });
    }

    if (notifyToggle) {
        notifyToggle.addEventListener('click', () => {
            settings.checkinNotify = !settings.checkinNotify;
            notifyToggle.classList.toggle('active', settings.checkinNotify !== false);
            if (typeof throttledSaveData === 'function') throttledSaveData();
        });
    }

    setTimeout(scheduleNextCheckin, 5000);
});
