/**
 * 健康检测 v1
 * - 加号弹窗增加"健康检测"按钮
 * - 检测对方体温、心跳频率、意识频率、身体各部位状况
 * - 如果检测发现部位不舒服会显示
 * - AI问诊按钮：AI根据检测状况询问症状，对方随机回答是/否
 * - 生成健康检测报告，对方随机回复
 */
(function() {
    'use strict';

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

    // 身体部位定义（每个部位包含3-4个AI问诊问题模板）
    var BODY_PARTS = [
        {
            id: 'head', name: '头部', icon: 'fa-head-side-virus',
            symptoms: ['头晕', '头痛', '头胀', '昏沉'],
            aiQuestions: [
                { q: '你{s}多久了？是一直持续还是间歇性的？', opts: ['是的，一直持续', '不是，间歇性的'] },
                { q: '{s}的时候有没有恶心想吐的感觉？', opts: ['有的，会恶心', '没有，还好'] },
                { q: '最近有没有熬夜或者睡眠不足？', opts: ['是的，睡得很晚', '没有，作息正常'] },
                { q: '有没有感觉到脖子也跟着不舒服？', opts: ['是的，脖子也酸', '没有，脖子没事'] }
            ]
        },
        {
            id: 'eyes', name: '眼部', icon: 'fa-eye',
            symptoms: ['眼干', '眼涩', '眼痒', '视物模糊'],
            aiQuestions: [
                { q: '你{s}多久了？是一直持续还是偶尔出现？', opts: ['一直这样', '偶尔才会'] },
                { q: '最近是不是看手机电脑的时间很长？', opts: ['是的，看很久', '没有，还好'] },
                { q: '有没有怕光或者流泪的情况？', opts: ['有的，怕光流泪', '没有这种情况'] },
                { q: '视力有没有明显下降的感觉？', opts: ['感觉有点模糊', '视力还正常'] }
            ]
        },
        {
            id: 'nose', name: '鼻部', icon: 'fa-head-side-cough',
            symptoms: ['鼻塞', '流涕', '鼻痒', '打喷嚏'],
            aiQuestions: [
                { q: '你{s}多久了？是最近才有的吗？', opts: ['是的，刚出现', '有一段时间了'] },
                { q: '有没有闻到什么特殊气味后会加重？', opts: ['有的，会更严重', '没有特别的'] },
                { q: '早上起床的时候会不会更严重？', opts: ['早上比较严重', '全天都差不多'] },
                { q: '有没有伴随头痛或者面部胀痛？', opts: ['有的，会头痛', '没有，还好'] }
            ]
        },
        {
            id: 'throat', name: '咽喉', icon: 'fa-comment-medical',
            symptoms: ['咽痛', '干咳', '异物感', '声音沙哑'],
            aiQuestions: [
                { q: '你{s}多久了？吞咽的时候会不会更痛？', opts: ['吞咽时更痛', '还好，不太影响'] },
                { q: '有没有发烧或者怕冷的感觉？', opts: ['有点发烧', '没有发烧'] },
                { q: '最近有没有吃辛辣刺激的东西？', opts: ['有的，吃了不少', '没有，吃得清淡'] },
                { q: '说话多了会不会更不舒服？', opts: ['说话多了更难受', '还好，影响不大'] }
            ]
        },
        {
            id: 'chest', name: '胸部', icon: 'fa-heart-pulse',
            symptoms: ['胸闷', '胸痛', '气短', '心悸'],
            aiQuestions: [
                { q: '你{s}多久了？是突然出现的吗？', opts: ['突然出现的', '慢慢出现的'] },
                { q: '运动或者劳累后会不会加重？', opts: ['运动后更严重', '休息时也会'] },
                { q: '有没有感觉到呼吸困难？', opts: ['有点喘不上气', '呼吸还正常'] },
                { q: '最近是不是压力很大或者很焦虑？', opts: ['是的，压力很大', '还好，比较放松'] }
            ]
        },
        {
            id: 'stomach', name: '胃部', icon: 'fa-bowl-food',
            symptoms: ['胃痛', '反酸', '胀气', '恶心'],
            aiQuestions: [
                { q: '你{s}多久了？是饭前还是饭后更明显？', opts: ['饭前更明显', '饭后更严重'] },
                { q: '有没有吃什么特别的东西？', opts: ['吃了凉的/辣的', '饮食跟平时一样'] },
                { q: '有没有想吐或者吐过？', opts: ['有点想吐', '没有想吐'] },
                { q: '最近吃饭规律吗？', opts: ['不太规律', '三餐都正常'] }
            ]
        },
        {
            id: 'abdomen', name: '腹部', icon: 'fa-circle',
            symptoms: ['腹痛', '腹胀', '肠鸣', '不适'],
            aiQuestions: [
                { q: '你{s}多久了？是隐隐作痛还是绞痛？', opts: ['是绞痛，很厉害', '隐隐作痛而已'] },
                { q: '排便有没有异常？比如拉肚子或者便秘？', opts: ['有点拉肚子', '排便还正常'] },
                { q: '有没有吃坏东西的可能？', opts: ['可能吃了不干净的', '应该没有'] },
                { q: '用手按下去会不会更痛？', opts: ['按下去更痛', '按着还好'] }
            ]
        },
        {
            id: 'back', name: '腰背', icon: 'fa-person',
            symptoms: ['腰酸', '背痛', '僵硬', '乏力'],
            aiQuestions: [
                { q: '你{s}多久了？是劳累后出现的吗？', opts: ['累了之后更酸', '没累也会酸'] },
                { q: '弯腰或者转身的时候会不会更痛？', opts: ['动的时候更痛', '不动也会痛'] },
                { q: '最近有没有久坐或者姿势不好？', opts: ['坐了很久', '还好，有起来活动'] },
                { q: '休息一下会不会好一些？', opts: ['休息后会缓解', '休息也没好转'] }
            ]
        },
        {
            id: 'limbs', name: '四肢', icon: 'fa-hand',
            symptoms: ['手脚发麻', '关节酸痛', '无力', '发冷'],
            aiQuestions: [
                { q: '你{s}多久了？是单侧还是双侧都有？', opts: ['两边都这样', '只有一边'] },
                { q: '活动一下会不会有所缓解？', opts: ['活动后好一些', '活动也没用'] },
                { q: '有没有肿胀或者发红的情况？', opts: ['有点肿', '没有肿胀'] },
                { q: '最近有没有剧烈运动或者受伤？', opts: ['有运动过', '没有受伤'] }
            ]
        },
        {
            id: 'skin', name: '皮肤', icon: 'fa-hand-sparkles',
            symptoms: ['干燥', '瘙痒', '起疹', '泛红'],
            aiQuestions: [
                { q: '你{s}多久了？是全身还是局部？', opts: ['局部的', '范围比较大'] },
                { q: '有没有接触什么新的东西或者吃了什么特别的？', opts: ['接触了新东西', '跟平时一样'] },
                { q: '会不会越抓越痒？', opts: ['越抓越痒', '还好，能忍住'] },
                { q: '皮肤有没有发烫或者刺痛的感觉？', opts: ['有点发烫刺痛', '只是{s}而已'] }
            ]
        }
    ];

    // 生成随机体温（35.5-37.8）
    function randomTemp() {
        var base = 36.0 + Math.random() * 1.5;
        // 10%概率偏高
        if (Math.random() < 0.1) base = 37.3 + Math.random() * 0.5;
        return Math.round(base * 10) / 10;
    }

    // 生成随机心跳（50-110）
    function randomHeartRate() {
        var base = 60 + Math.floor(Math.random() * 30);
        if (Math.random() < 0.1) base = 100 + Math.floor(Math.random() * 15);
        return base;
    }

    // 生成意识频率（清醒程度 0-100）
    function randomConsciousness() {
        var base = 75 + Math.floor(Math.random() * 25);
        if (Math.random() < 0.08) base = 50 + Math.floor(Math.random() * 25);
        return base;
    }

    // 检测各部位状况
    function detectBodyParts() {
        var results = [];
        BODY_PARTS.forEach(function(part) {
            // 20%概率有不适
            var hasIssue = Math.random() < 0.2;
            if (hasIssue) {
                var symptom = part.symptoms[Math.floor(Math.random() * part.symptoms.length)];
                var severity = ['轻微', '中度', '明显'][Math.floor(Math.random() * 3)];
                results.push({
                    id: part.id,
                    name: part.name,
                    icon: part.icon,
                    symptom: symptom,
                    severity: severity,
                    hasIssue: true
                });
            } else {
                results.push({
                    id: part.id,
                    name: part.name,
                    icon: part.icon,
                    symptom: '正常',
                    severity: '',
                    hasIssue: false
                });
            }
        });
        return results;
    }

    // AI问诊：根据检测状况生成问题（每个异常部位3-4个问题）
    function generateAIQuestions(detectResult) {
        var questions = [];
        var issues = detectResult.bodyParts.filter(function(p) { return p.hasIssue; });

        issues.forEach(function(issue) {
            // 从 BODY_PARTS 中找到对应部位的问诊问题模板
            var partDef = BODY_PARTS.find(function(p) { return p.id === issue.id; });
            if (partDef && partDef.aiQuestions && partDef.aiQuestions.length > 0) {
                // 根据严重程度决定问题数量：轻微3个，中度及以上4个
                var count = issue.severity === '轻微' ? 3 : 4;
                count = Math.min(count, partDef.aiQuestions.length);
                for (var i = 0; i < count; i++) {
                    var qTemplate = partDef.aiQuestions[i];
                    questions.push({
                        target: issue.name,
                        question: qTemplate.q.replace(/\{s\}/g, issue.symptom),
                        type: 'yes-no',
                        options: qTemplate.opts
                    });
                }
            }
        });

        // 体温异常时加问题
        if (detectResult.temp >= 37.3) {
            questions.push({
                target: '体温',
                question: '你有没有感觉到发冷或者发热？',
                type: 'yes-no',
                options: ['是的，有点', '不是，没有']
            });
            questions.push({
                target: '体温',
                question: '有没有肌肉酸痛或者浑身无力的感觉？',
                type: 'yes-no',
                options: ['有的，浑身酸痛', '没有，还好']
            });
        }

        // 心跳异常时加问题
        if (detectResult.heartRate > 100 || detectResult.heartRate < 55) {
            questions.push({
                target: '心跳',
                question: '你有没有感觉到心慌或者心跳不适？',
                type: 'yes-no',
                options: ['是的，有心慌', '不是，没有']
            });
            questions.push({
                target: '心跳',
                question: '安静休息一会儿后会不会好一些？',
                type: 'yes-no',
                options: ['休息后会缓解', '还是一样']
            });
        }

        return questions;
    }

    // ========== 健康检测弹窗 ==========
    function openHealthModal() {
        var overlay = $('health-detect-overlay');
        if (!overlay) {
            createHealthOverlay();
        }
        overlay = $('health-detect-overlay');
        if (!overlay) return;
        overlay.style.display = 'flex';
        // 重置到检测首页
        $('health-step-detect').style.display = 'block';
        $('health-step-result').style.display = 'none';
        $('health-step-consult').style.display = 'none';
        $('health-step-report').style.display = 'none';
    }

    function closeHealthModal() {
        var overlay = $('health-detect-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    function createHealthOverlay() {
        var overlay = document.createElement('div');
        overlay.id = 'health-detect-overlay';
        overlay.className = 'health-detect-overlay';
        overlay.innerHTML = `
            <div class="health-detect-box">
                <div class="health-detect-header">
                    <button class="health-close-btn" id="health-close-btn"><i class="fas fa-times"></i></button>
                    <span class="health-title"><i class="fas fa-heart-pulse"></i> 健康检测</span>
                </div>
                <div class="health-detect-body">
                    <!-- 步骤1：检测 -->
                    <div class="health-step" id="health-step-detect">
                        <div class="health-detect-section">
                            <div class="health-detect-desc">点击开始检测，获取对方当前的健康数据</div>
                            <button class="health-detect-go-btn" id="health-start-detect">
                                <i class="fas fa-stethoscope"></i> 开始检测
                            </button>
                        </div>
                    </div>

                    <!-- 步骤2：检测结果 -->
                    <div class="health-step" id="health-step-result" style="display:none;">
                        <div class="health-vitals">
                            <div class="health-vital-item">
                                <div class="health-vital-icon"><i class="fas fa-temperature-half"></i></div>
                                <div class="health-vital-label">体温</div>
                                <div class="health-vital-value" id="health-temp"></div>
                            </div>
                            <div class="health-vital-item">
                                <div class="health-vital-icon"><i class="fas fa-heart-pulse"></i></div>
                                <div class="health-vital-label">心跳</div>
                                <div class="health-vital-value" id="health-hr"></div>
                            </div>
                            <div class="health-vital-item">
                                <div class="health-vital-icon"><i class="fas fa-brain"></i></div>
                                <div class="health-vital-label">意识</div>
                                <div class="health-vital-value" id="health-consciousness"></div>
                            </div>
                        </div>
                        <div class="health-body-parts" id="health-body-parts"></div>
                        <div class="health-result-actions">
                            <button class="health-consult-btn" id="health-consult-btn">
                                <i class="fas fa-user-doctor"></i> AI问诊
                            </button>
                            <button class="health-report-btn" id="health-generate-report-btn">
                                <i class="fas fa-file-medical"></i> 生成报告
                            </button>
                        </div>
                    </div>

                    <!-- 步骤3：AI问诊 -->
                    <div class="health-step" id="health-step-consult" style="display:none;">
                        <div class="health-consult-section">
                            <div class="health-consult-desc">AI正在根据检测结果向对方询问症状...</div>
                            <div class="health-consult-questions" id="health-consult-questions"></div>
                            <button class="health-report-btn" id="health-consult-done-btn">
                                <i class="fas fa-file-medical"></i> 生成健康报告
                            </button>
                        </div>
                    </div>

                    <!-- 步骤4：报告 -->
                    <div class="health-step" id="health-step-report" style="display:none;">
                        <div class="health-report-section" id="health-report-content"></div>
                        <div class="health-report-actions">
                            <button class="health-send-report-btn" id="health-send-report-btn">
                                <i class="fas fa-paper-plane"></i> 发送报告给对方
                            </button>
                            <button class="health-restart-btn" id="health-restart-btn">
                                <i class="fas fa-redo"></i> 重新检测
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        $('health-close-btn').onclick = closeHealthModal;
        $('health-start-detect').onclick = runDetection;
        $('health-consult-btn').onclick = startConsultation;
        $('health-generate-report-btn').onclick = function() { generateReport(false); };
        $('health-consult-done-btn').onclick = function() { generateReport(true); };
        $('health-send-report-btn').onclick = sendReportToPartner;
        $('health-restart-btn').onclick = function() {
            $('health-step-detect').style.display = 'block';
            $('health-step-result').style.display = 'none';
            $('health-step-consult').style.display = 'none';
            $('health-step-report').style.display = 'none';
        };
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closeHealthModal();
        });
    }

    var currentDetectResult = null;
    var currentConsultResult = null;

    // ========== 执行检测 ==========
    function runDetection() {
        var detectBtn = $('health-start-detect');
        if (detectBtn) {
            detectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 检测中...';
            detectBtn.disabled = true;
        }

        setTimeout(function() {
            var temp = randomTemp();
            var heartRate = randomHeartRate();
            var consciousness = randomConsciousness();
            var bodyParts = detectBodyParts();

            currentDetectResult = {
                temp: temp,
                heartRate: heartRate,
                consciousness: consciousness,
                bodyParts: bodyParts,
                time: new Date()
            };

            // 渲染结果
            var tempEl = $('health-temp');
            var hrEl = $('health-hr');
            var consEl = $('health-consciousness');
            var bpEl = $('health-body-parts');

            if (tempEl) {
                tempEl.textContent = temp + '°C';
                tempEl.className = 'health-vital-value' + (temp >= 37.3 ? ' abnormal' : '');
            }
            if (hrEl) {
                hrEl.textContent = heartRate + ' bpm';
                hrEl.className = 'health-vital-value' + (heartRate > 100 || heartRate < 55 ? ' abnormal' : '');
            }
            if (consEl) {
                consEl.textContent = consciousness + '%';
                consEl.className = 'health-vital-value' + (consciousness < 60 ? ' abnormal' : '');
            }

            // 渲染身体部位
            if (bpEl) {
                var html = '';
                bodyParts.forEach(function(p) {
                    var cls = p.hasIssue ? 'health-body-part has-issue' : 'health-body-part';
                    html += '<div class="' + cls + '">';
                    html += '<div class="health-bp-icon"><i class="fas ' + p.icon + '"></i></div>';
                    html += '<div class="health-bp-info">';
                    html += '<div class="health-bp-name">' + escapeHtml(p.name) + '</div>';
                    html += '<div class="health-bp-symptom">' + (p.hasIssue ? escapeHtml(p.symptom) + ' (' + escapeHtml(p.severity) + ')' : '正常') + '</div>';
                    html += '</div>';
                    html += '</div>';
                });
                bpEl.innerHTML = html;
            }

            // 切换到结果页
            $('health-step-detect').style.display = 'none';
            $('health-step-result').style.display = 'block';

            if (detectBtn) {
                detectBtn.innerHTML = '<i class="fas fa-stethoscope"></i> 开始检测';
                detectBtn.disabled = false;
            }
        }, 2000);
    }

    // ========== AI问诊 ==========
    function startConsultation() {
        if (!currentDetectResult) return;

        $('health-step-result').style.display = 'none';
        $('health-step-consult').style.display = 'block';

        var questions = generateAIQuestions(currentDetectResult);
        var consultEl = $('health-consult-questions');
        if (!consultEl) return;

        if (questions.length === 0) {
            consultEl.innerHTML = '<div class="health-consult-empty">检测未发现明显异常，无需问诊</div>';
            return;
        }

        var html = '';
        var answers = [];
        questions.forEach(function(q, i) {
            html += '<div class="health-consult-item" data-idx="' + i + '">';
            html += '<div class="health-consult-q-header"><i class="fas fa-robot"></i> AI问诊</div>';
            html += '<div class="health-consult-target">检测项：' + escapeHtml(q.target) + '</div>';
            html += '<div class="health-consult-question">' + escapeHtml(q.question) + '</div>';
            html += '<div class="health-consult-loading" id="consult-loading-' + i + '"><span class="consult-typing">对方正在思考...</span></div>';
            html += '<div class="health-consult-answer" id="consult-answer-' + i + '" style="display:none;"></div>';
            html += '</div>';
        });
        consultEl.innerHTML = html;

        // 逐个模拟对方回答
        currentConsultResult = { questions: questions, answers: [] };
        questions.forEach(function(q, i) {
            var delay = 1500 + i * 2000 + Math.random() * 1000;
            setTimeout(function() {
                // 对方随机选择答案
                var answerIdx = Math.floor(Math.random() * q.options.length);
                var answer = q.options[answerIdx];
                // 第一个选项通常为"是/有/更严重"，标记为肯定回答
                var isPositive = answerIdx === 0;
                currentConsultResult.answers.push({ question: q.question, answer: answer, target: q.target, isPositive: isPositive });

                var loadingEl = $('consult-loading-' + i);
                var answerEl = $('consult-answer-' + i);
                if (loadingEl) loadingEl.style.display = 'none';
                if (answerEl) {
                    answerEl.style.display = 'block';
                    answerEl.innerHTML = '<div class="health-consult-answer-header"><i class="fas fa-user"></i> 对方回复</div>' +
                        '<div class="health-consult-answer-text">' + escapeHtml(answer) + '</div>';
                }
            }, delay);
        });
    }

    // ========== 疾病匹配 ==========
    // 根据异常部位、症状组合及基本体征，推断可能的疾病（最多3个）
    function matchDiseases(result, consultResult) {
        var diseases = [];
        var issues = result.bodyParts.filter(function(p) { return p.hasIssue; });
        var hasFever = result.temp >= 37.3;
        var hasHighFever = result.temp >= 38.5;
        var hasFastHeart = result.heartRate > 100;
        var hasLowConsciousness = result.consciousness < 60;

        // 辅助：判断异常部位是否包含指定关键字（同时匹配部位名与症状）
        function partMatches(keyword) {
            return issues.some(function(i) {
                return (i.name && i.name.indexOf(keyword) !== -1) ||
                       (i.symptom && i.symptom.indexOf(keyword) !== -1);
            });
        }

        // 感冒/流感（发热 + 咳嗽/喉咙不适/头痛）
        if (hasFever) {
            var hasCough = partMatches('喉') || partMatches('咽') || partMatches('咳');
            var hasHeadache = partMatches('头');
            if (hasCough || hasHeadache) {
                diseases.push({
                    name: hasHighFever ? '流行性感冒' : '普通感冒',
                    probability: hasHighFever ? '较高' : '可能',
                    advice: '多休息，多饮水，注意保暖。如持续高烧请就医。'
                });
            }
        }

        // 胃炎/消化不良
        if (partMatches('胃')) {
            diseases.push({
                name: '消化不良/胃炎',
                probability: '可能',
                advice: '清淡饮食，少食多餐，避免辛辣刺激食物。'
            });
        }

        // 心动过速
        if (hasFastHeart) {
            diseases.push({
                name: '心动过速',
                probability: '可能',
                advice: '避免剧烈运动和咖啡因，保持充足睡眠，如持续请做心电图检查。'
            });
        }

        // 视疲劳/结膜炎
        if (partMatches('眼')) {
            diseases.push({
                name: '视疲劳',
                probability: '可能',
                advice: '减少屏幕使用时间，做眼保健操，必要时使用润眼液。'
            });
        }

        // 皮肤过敏/皮炎
        if (partMatches('皮肤')) {
            diseases.push({
                name: '皮肤过敏/皮炎',
                probability: '可能',
                advice: '避免接触过敏原，保持皮肤清洁，可使用抗过敏药膏。'
            });
        }

        // 关节炎
        if (partMatches('关节') || partMatches('四肢')) {
            diseases.push({
                name: '关节炎',
                probability: '可能',
                advice: '注意关节保暖，适当运动，避免长时间保持同一姿势。'
            });
        }

        // 神经衰弱（头痛 + 意识偏低/失眠）
        if (partMatches('头') && hasLowConsciousness) {
            diseases.push({
                name: '神经衰弱',
                probability: '可能',
                advice: '保证充足睡眠，减少压力，适当运动放松。'
            });
        }

        // 急性肠胃炎（腹部不适 + 发热）
        if (partMatches('腹') && hasFever) {
            diseases.push({
                name: '急性肠胃炎',
                probability: '较高',
                advice: '补充水分和电解质，清淡饮食，如严重腹泻请就医。'
            });
        }

        // 慢性咽炎（喉咙不适但无发热）
        if ((partMatches('喉') || partMatches('咽')) && !hasFever) {
            diseases.push({
                name: '慢性咽炎',
                probability: '可能',
                advice: '多喝温水，避免烟酒刺激，可含服润喉片。'
            });
        }

        // 限制最多3个
        return diseases.slice(0, 3);
    }

    // ========== 诊断等级计算 ==========
    // 四个等级：健康、轻微不适、需要关注、建议就医
    function calculateDiagnosisLevel(detectResult, consultResult) {
        var issues = detectResult.bodyParts.filter(function(p) { return p.hasIssue; });
        var tempAbnormal = detectResult.temp >= 37.3;
        var heartAbnormal = detectResult.heartRate > 100 || detectResult.heartRate < 55;
        var consciousnessLow = detectResult.consciousness < 60;

        var severityScore = 0;
        var severeCount = 0;
        var moderateCount = 0;
        var mildCount = 0;

        issues.forEach(function(issue) {
            if (issue.severity === '明显') {
                severityScore += 3;
                severeCount++;
            } else if (issue.severity === '中度') {
                severityScore += 2;
                moderateCount++;
            } else {
                severityScore += 1;
                mildCount++;
            }
        });

        // 体温异常加分
        if (detectResult.temp >= 38.5) {
            severityScore += 4;
        } else if (detectResult.temp >= 37.5) {
            severityScore += 2;
        } else if (tempAbnormal) {
            severityScore += 1;
        }

        // 心跳异常加分
        if (detectResult.heartRate > 120 || detectResult.heartRate < 50) {
            severityScore += 3;
        } else if (heartAbnormal) {
            severityScore += 1;
        }

        // 意识偏低加分
        if (consciousnessLow) {
            severityScore += 3;
        }

        // AI问诊中有肯定回答的也加分（表示症状确实存在且有影响）
        if (consultResult && consultResult.answers) {
            consultResult.answers.forEach(function(a) {
                // 第一个选项通常为"是/有/更严重"，表示症状更明显
                // 通过 isPositive 标记判断是否为肯定回答
                if (a.isPositive) {
                    severityScore += 0.5;
                }
            });
        }

        var level, levelColor, levelIcon, suggestion;

        if (severityScore >= 8 || severeCount >= 2 || detectResult.temp >= 38.5 || consciousnessLow) {
            level = '建议就医';
            levelColor = '#ff4757';
            levelIcon = 'fa-ambulance';
            suggestion = '症状较为明显，建议尽快就医检查，以免延误病情。';
        } else if (severityScore >= 4 || severeCount >= 1 || moderateCount >= 2 || detectResult.temp >= 37.5) {
            level = '需要关注';
            levelColor = '#ff9f43';
            levelIcon = 'fa-triangle-exclamation';
            suggestion = '身体有多处不适，建议密切观察，注意休息，如症状加重请及时就医。';
        } else if (issues.length > 0 || tempAbnormal || heartAbnormal) {
            level = '轻微不适';
            levelColor = '#feca57';
            levelIcon = 'fa-circle-exclamation';
            suggestion = '身体有轻微不适，注意休息和饮食，保持良好作息即可。';
        } else {
            level = '健康';
            levelColor = '#1dd1a1';
            levelIcon = 'fa-circle-check';
            suggestion = '各项指标正常，身体状况良好，继续保持健康的生活方式！';
        }

        // 匹配可能的疾病
        var diseases = matchDiseases(detectResult, consultResult);
        var detailedAdvice;
        if (diseases.length > 0) {
            detailedAdvice = diseases.map(function(d) { return d.name + '：' + d.advice; }).join(' ');
        } else {
            detailedAdvice = '未发现明显疾病，继续保持健康的生活方式。';
        }

        return {
            level: level,
            levelColor: levelColor,
            levelIcon: levelIcon,
            suggestion: suggestion,
            diseases: diseases,
            detailedAdvice: detailedAdvice,
            severityScore: severityScore,
            issueCount: issues.length,
            severeCount: severeCount,
            moderateCount: moderateCount,
            mildCount: mildCount,
            tempAbnormal: tempAbnormal,
            heartAbnormal: heartAbnormal,
            consciousnessLow: consciousnessLow
        };
    }

    // ========== 生成报告 ==========
    function generateReport(hasConsult) {
        if (!currentDetectResult) return;

        var result = currentDetectResult;
        var issues = result.bodyParts.filter(function(p) { return p.hasIssue; });
        var partnerName = getPartnerName();

        // 计算诊断等级
        var diagnosis = calculateDiagnosisLevel(result, hasConsult ? currentConsultResult : null);
        currentDetectResult.diagnosis = diagnosis;

        var reportHtml = '';
        reportHtml += '<div class="health-report-header">';
        reportHtml += '<div class="health-report-title"><i class="fas fa-file-medical"></i> 健康检测报告</div>';
        reportHtml += '<div class="health-report-time">检测时间：' + escapeHtml(result.time.toLocaleString()) + '</div>';
        reportHtml += '</div>';

        // 诊断等级（显著显示）
        reportHtml += '<div class="health-diagnosis-card" style="border-color:' + diagnosis.levelColor + ';">';
        reportHtml += '<div class="health-diagnosis-icon" style="background:' + diagnosis.levelColor + ';">';
        reportHtml += '<i class="fas ' + diagnosis.levelIcon + '"></i>';
        reportHtml += '</div>';
        reportHtml += '<div class="health-diagnosis-info">';
        reportHtml += '<div class="health-diagnosis-label">诊断结果</div>';
        reportHtml += '<div class="health-diagnosis-level" style="color:' + diagnosis.levelColor + ';">' + diagnosis.level + '</div>';
        reportHtml += '<div class="health-diagnosis-suggestion">' + escapeHtml(diagnosis.suggestion) + '</div>';
        reportHtml += '</div>';
        reportHtml += '</div>';

        // 可能疾病
        reportHtml += '<div class="health-report-section-title">可能疾病</div>';
        if (diagnosis.diseases && diagnosis.diseases.length > 0) {
            reportHtml += '<div class="health-report-diseases">';
            diagnosis.diseases.forEach(function(d) {
                reportHtml += '<div class="health-disease-item">';
                reportHtml += '<div class="health-disease-name">' + escapeHtml(d.name) + ' <span class="health-disease-prob">' + escapeHtml(d.probability) + '</span></div>';
                reportHtml += '<div class="health-disease-advice">' + escapeHtml(d.advice) + '</div>';
                reportHtml += '</div>';
            });
            reportHtml += '</div>';
        } else {
            reportHtml += '<div class="health-report-no-disease">未发现明显疾病</div>';
        }

        reportHtml += '<div class="health-report-section-title">基本体征</div>';
        reportHtml += '<div class="health-report-vitals">';
        reportHtml += '<div>体温：' + result.temp + '°C' + (result.temp >= 37.3 ? ' ⚠️偏高' : ' ✅正常') + '</div>';
        reportHtml += '<div>心跳：' + result.heartRate + ' bpm' + (result.heartRate > 100 || result.heartRate < 55 ? ' ⚠️异常' : ' ✅正常') + '</div>';
        reportHtml += '<div>意识：' + result.consciousness + '%' + (result.consciousness < 60 ? ' ⚠️偏低' : ' ✅正常') + '</div>';
        reportHtml += '</div>';

        if (issues.length > 0) {
            reportHtml += '<div class="health-report-section-title">异常部位</div>';
            reportHtml += '<div class="health-report-issues">';
            issues.forEach(function(issue) {
                reportHtml += '<div class="health-report-issue-item">';
                reportHtml += '<i class="fas ' + issue.icon + '"></i> ';
                reportHtml += escapeHtml(issue.name) + '：' + escapeHtml(issue.symptom) + '（' + escapeHtml(issue.severity) + '）';
                reportHtml += '</div>';
            });
            reportHtml += '</div>';
        } else {
            reportHtml += '<div class="health-report-section-title">异常部位</div>';
            reportHtml += '<div class="health-report-no-issues">各部位状况正常 ✅</div>';
        }

        if (hasConsult && currentConsultResult && currentConsultResult.answers.length > 0) {
            reportHtml += '<div class="health-report-section-title">AI问诊记录</div>';
            reportHtml += '<div class="health-report-consult">';
            currentConsultResult.answers.forEach(function(a, i) {
                reportHtml += '<div class="health-report-consult-item">';
                reportHtml += '<div class="health-report-consult-q"><b>问：</b>' + escapeHtml(a.question) + '</div>';
                reportHtml += '<div class="health-report-consult-a"><b>答：</b>' + escapeHtml(a.answer) + '</div>';
                reportHtml += '</div>';
            });
            reportHtml += '</div>';
        }

        // 建议
        reportHtml += '<div class="health-report-section-title">建议</div>';
        reportHtml += '<div class="health-report-suggestions">';
        if (result.temp >= 37.3) {
            reportHtml += '<div>• 体温偏高，建议多喝水、注意休息，如持续发热请就医</div>';
        }
        if (result.heartRate > 100) {
            reportHtml += '<div>• 心跳偏快，建议避免剧烈运动，保持情绪平稳</div>';
        } else if (result.heartRate < 55) {
            reportHtml += '<div>• 心跳偏慢，建议关注是否有头晕乏力等症状</div>';
        }
        issues.forEach(function(issue) {
            reportHtml += '<div>• ' + escapeHtml(issue.name) + '有' + escapeHtml(issue.severity) + '不适（' + escapeHtml(issue.symptom) + '），建议注意观察，如持续请就诊</div>';
        });
        if (result.temp < 37.3 && result.heartRate >= 55 && result.heartRate <= 100 && issues.length === 0) {
            reportHtml += '<div>• 整体状况良好，注意保持健康作息</div>';
        }
        reportHtml += '</div>';

        var reportEl = $('health-report-content');
        if (reportEl) reportEl.innerHTML = reportHtml;

        $('health-step-result').style.display = 'none';
        $('health-step-consult').style.display = 'none';
        $('health-step-report').style.display = 'block';

        // 存储报告文本（用于发送给对方）
        currentDetectResult.reportText = reportHtml;
    }

    // ========== 渲染健康报告卡片HTML（供core.js调用） ==========
    function renderHealthReportCardHTML(msg) {
        if (!msg || !msg.healthReportCard) return '<div style="padding:10px;color:#999;">健康报告</div>';
        var card = msg.healthReportCard;
        var color = card.levelColor || '#1dd1a1';

        var html = '<div class="health-report-card-msg">';
        html += '<div class="health-report-card-header">';
        html += '<div class="health-report-card-icon" style="background:' + color + ';">';
        html += '<i class="fas ' + escapeHtml(card.levelIcon || 'fa-heart-pulse') + '"></i>';
        html += '</div>';
        html += '<div>';
        html += '<div class="health-report-card-title">健康检测报告</div>';
        html += '<div class="health-report-card-level" style="color:' + color + ';">' + escapeHtml(card.level) + '</div>';
        html += '</div>';
        html += '</div>';
        html += '<div class="health-report-card-body">';
        html += '<div class="health-report-card-stats">';
        html += '<div class="health-report-card-stat">';
        html += '<div class="health-report-card-stat-num">' + (card.issueCount || 0) + '</div>';
        html += '<div class="health-report-card-stat-label">异常部位</div>';
        html += '</div>';
        html += '<div class="health-report-card-stat">';
        html += '<div class="health-report-card-stat-num">' + escapeHtml(card.temp || '--') + '</div>';
        html += '<div class="health-report-card-stat-label">体温(°C)</div>';
        html += '</div>';
        html += '<div class="health-report-card-stat">';
        html += '<div class="health-report-card-stat-num">' + escapeHtml(card.heartRate || '--') + '</div>';
        html += '<div class="health-report-card-stat-label">心跳(bpm)</div>';
        html += '</div>';
        html += '</div>';
        html += '<div class="health-report-card-summary">' + escapeHtml(card.suggestion || '') + '</div>';
        if (card.diseases && card.diseases.length > 0) {
            var diseaseNames = card.diseases.map(function(d) { return d.name; }).join('、');
            html += '<div class="health-report-card-diseases"><i class="fas fa-notes-medical"></i> 可能：' + escapeHtml(diseaseNames) + '</div>';
        }
        html += '<button class="health-report-card-btn" onclick="window.HealthApp.openHealthModal(); return false;">';
        html += '<i class="fas fa-file-medical"></i> 查看详情';
        html += '</button>';
        html += '</div>';
        html += '</div>';
        return html;
    }

    // ========== 发送健康报告卡片消息 ==========
    function sendHealthReportCardMessage() {
        if (!currentDetectResult) return;
        var result = currentDetectResult;
        var diagnosis = result.diagnosis || calculateDiagnosisLevel(result, currentConsultResult);
        var issues = result.bodyParts.filter(function(p) { return p.hasIssue; });

        var cardData = {
            level: diagnosis.level,
            levelColor: diagnosis.levelColor,
            levelIcon: diagnosis.levelIcon,
            suggestion: diagnosis.suggestion,
            diseases: diagnosis.diseases || [],
            detailedAdvice: diagnosis.detailedAdvice || '',
            issueCount: issues.length,
            temp: result.temp,
            heartRate: result.heartRate,
            consciousness: result.consciousness,
            issues: issues.map(function(i) { return { name: i.name, symptom: i.symptom, severity: i.severity }; }),
            time: result.time.toLocaleString()
        };

        try {
            if (typeof window.addMessage === 'function') {
                window.addMessage({
                    id: Date.now() + Math.random(),
                    sender: 'user',
                    text: '',
                    timestamp: new Date(),
                    status: 'sent',
                    type: 'health-report-card',
                    healthReportCard: cardData,
                    favorited: false,
                    note: null
                });
            }
        } catch(e) {}
    }

    // ========== 发送报告给对方 ==========
    function sendReportToPartner() {
        var partnerName = getPartnerName();

        // 发送卡片消息
        sendHealthReportCardMessage();

        sendSystemMessage('健康检测报告已发送给 ' + partnerName);

        // 对方随机回复
        var replies = [
            '收到啦，谢谢关心～',
            '好的，我会注意的！',
            '哇这么详细，谢谢你～',
            '我有这么严重吗？哈哈',
            '好的好的，我去看医生',
            '嗯嗯，我会注意休息的',
            '收到，一定按时吃药～',
            '谢谢你的关心，我好多了'
        ];
        var reply = replies[Math.floor(Math.random() * replies.length)];
        setTimeout(function() {
            sendPartnerMessage(reply);
        }, 1500 + Math.random() * 2000);

        closeHealthModal();
    }

    // ========== CSS ==========
    if (!document.getElementById('health-detect-style')) {
        var style = document.createElement('style');
        style.id = 'health-detect-style';
        style.textContent = `
            .health-detect-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.5); z-index: 9999; display: none;
                align-items: center; justify-content: center;
            }
            .health-detect-box {
                background: var(--secondary-bg, #fff); border-radius: 16px;
                width: 90%; max-width: 400px; max-height: 85vh; overflow: hidden;
                display: flex; flex-direction: column;
            }
            .health-detect-header {
                display: flex; align-items: center; gap: 8px; padding: 12px 16px;
                border-bottom: 1px solid var(--border-color, #e0e0e0);
            }
            .health-close-btn {
                background: none; border: none; font-size: 18px; cursor: pointer;
                color: var(--text-secondary, #999);
            }
            .health-title { flex: 1; font-size: 16px; font-weight: 600; color: var(--text-primary, #333); }
            .health-detect-body { padding: 16px; overflow-y: auto; flex: 1; }
            .health-step { display: none; }
            .health-detect-desc { text-align: center; padding: 20px; font-size: 14px; color: var(--text-secondary, #999); }
            .health-detect-go-btn {
                display: block; width: 100%; padding: 14px; margin-top: 12px;
                background: var(--accent-color, #07c160); color: #fff; border: none;
                border-radius: 12px; font-size: 15px; cursor: pointer; display: flex;
                align-items: center; justify-content: center; gap: 8px;
            }
            .health-vitals {
                display: flex; gap: 8px; margin-bottom: 16px;
            }
            .health-vital-item {
                flex: 1; text-align: center; padding: 12px 8px; background: var(--primary-bg, #f5f5f5);
                border-radius: 12px;
            }
            .health-vital-icon { font-size: 18px; color: var(--accent-color, #07c160); margin-bottom: 4px; }
            .health-vital-label { font-size: 11px; color: var(--text-secondary, #999); margin-bottom: 2px; }
            .health-vital-value { font-size: 16px; font-weight: 700; color: var(--text-primary, #333); }
            .health-vital-value.abnormal { color: #ff6b6b; }
            .health-body-parts {
                display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px;
            }
            .health-body-part {
                display: flex; align-items: center; gap: 8px; padding: 8px 10px;
                background: var(--primary-bg, #f5f5f5); border-radius: 10px;
            }
            .health-body-part.has-issue { background: rgba(255,107,107,0.08); }
            .health-bp-icon { font-size: 14px; color: var(--text-secondary, #999); }
            .health-body-part.has-issue .health-bp-icon { color: #ff6b6b; }
            .health-bp-info { flex: 1; min-width: 0; }
            .health-bp-name { font-size: 12px; font-weight: 600; color: var(--text-primary, #333); }
            .health-bp-symptom { font-size: 11px; color: var(--text-secondary, #999); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .health-result-actions { display: flex; gap: 8px; }
            .health-consult-btn, .health-report-btn {
                flex: 1; padding: 10px; border: none; border-radius: 10px; font-size: 13px;
                cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
            }
            .health-consult-btn { background: #667eea; color: #fff; }
            .health-report-btn { background: var(--primary-bg, #f5f5f5); color: var(--text-primary, #333); border: 1px solid var(--border-color, #e0e0e0); }
            .health-consult-desc { text-align: center; padding: 12px; font-size: 13px; color: var(--text-secondary, #999); }
            .health-consult-item {
                padding: 10px; background: var(--primary-bg, #f5f5f5); border-radius: 10px; margin-bottom: 10px;
            }
            .health-consult-q-header { font-size: 12px; color: #667eea; margin-bottom: 4px; }
            .health-consult-target { font-size: 11px; color: var(--text-secondary, #999); }
            .health-consult-question { font-size: 13px; color: var(--text-primary, #333); margin: 4px 0; }
            .consult-typing { font-size: 12px; color: var(--text-secondary, #999); }
            .consult-typing::after { content: '...'; animation: typing-dots 1.4s infinite; }
            @keyframes typing-dots { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }
            .health-consult-answer { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border-color, #e0e0e0); }
            .health-consult-answer-header { font-size: 12px; color: var(--accent-color, #07c160); }
            .health-consult-answer-text { font-size: 13px; color: var(--text-primary, #333); margin-top: 4px; }
            .health-consult-empty { text-align: center; padding: 20px; color: var(--text-secondary, #999); }
            .health-report-header { text-align: center; margin-bottom: 16px; }
            .health-report-title { font-size: 16px; font-weight: 700; color: var(--text-primary, #333); }
            .health-report-time { font-size: 11px; color: var(--text-secondary, #999); margin-top: 4px; }
            .health-report-section-title { font-size: 13px; font-weight: 600; color: var(--text-primary, #333); margin: 12px 0 6px; }
            .health-report-vitals { padding: 10px; background: var(--primary-bg, #f5f5f5); border-radius: 10px; font-size: 13px; line-height: 1.8; }
            .health-report-issues { padding: 10px; background: rgba(255,107,107,0.06); border-radius: 10px; }
            .health-report-issue-item { font-size: 12px; color: var(--text-primary, #333); margin-bottom: 4px; }
            .health-report-no-issues { padding: 10px; background: rgba(7,193,96,0.06); border-radius: 10px; font-size: 13px; color: var(--accent-color, #07c160); }
            /* 可能疾病 */
            .health-report-diseases { padding: 10px; background: rgba(255,159,67,0.06); border-radius: 10px; }
            .health-disease-item { margin-bottom: 8px; }
            .health-disease-item:last-child { margin-bottom: 0; }
            .health-disease-name { font-size: 13px; font-weight: 600; color: var(--text-primary, #333); word-break: break-word; }
            .health-disease-prob { font-size: 11px; color: #ff9f43; margin-left: 6px; }
            .health-disease-advice { font-size: 12px; color: var(--text-secondary, #666); line-height: 1.5; margin-top: 2px; word-break: break-word; }
            .health-report-no-disease { padding: 10px; background: rgba(7,193,96,0.06); border-radius: 10px; font-size: 13px; color: var(--accent-color, #07c160); }
            /* 聊天卡片疾病摘要 */
            .health-report-card-diseases {
                font-size: 12px; color: #ff9f43; padding: 6px 8px;
                background: rgba(255,159,67,0.08); border-radius: 8px;
                margin-bottom: 10px; word-break: break-word;
            }
            .health-report-consult { padding: 10px; background: var(--primary-bg, #f5f5f5); border-radius: 10px; }
            .health-report-consult-item { margin-bottom: 8px; font-size: 12px; }
            .health-report-consult-q { color: var(--text-primary, #333); }
            .health-report-consult-a { color: var(--text-secondary, #999); }
            .health-report-suggestions { padding: 10px; background: rgba(102,126,234,0.06); border-radius: 10px; font-size: 12px; line-height: 1.8; }
            .health-report-actions { display: flex; gap: 8px; margin-top: 16px; }
            .health-send-report-btn {
                flex: 1; padding: 10px; background: var(--accent-color, #07c160); color: #fff;
                border: none; border-radius: 10px; font-size: 13px; cursor: pointer; display: flex;
                align-items: center; justify-content: center; gap: 6px;
            }
            .health-restart-btn {
                padding: 10px 16px; background: var(--primary-bg, #f5f5f5); color: var(--text-primary, #333);
                border: 1px solid var(--border-color, #e0e0e0); border-radius: 10px; font-size: 13px; cursor: pointer;
            }
            /* 诊断卡片 */
            .health-diagnosis-card {
                display: flex; align-items: center; gap: 12px; padding: 14px;
                border: 2px solid #1dd1a1; border-radius: 12px;
                background: rgba(29, 209, 161, 0.06); margin-bottom: 8px;
            }
            .health-diagnosis-icon {
                width: 44px; height: 44px; border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                color: #fff; font-size: 20px; flex-shrink: 0;
            }
            .health-diagnosis-info { flex: 1; min-width: 0; }
            .health-diagnosis-label { font-size: 11px; color: var(--text-secondary, #999); margin-bottom: 2px; }
            .health-diagnosis-level { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
            .health-diagnosis-suggestion { font-size: 12px; color: var(--text-secondary, #666); line-height: 1.5; }

            /* 健康报告卡片消息（聊天中的卡片） */
            .health-report-card-msg {
                width: 260px; max-width: 100%; background: var(--secondary-bg, #fff); border-radius: 12px;
                overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);
            }
            .health-report-card-header {
                padding: 12px 14px; display: flex; align-items: center; gap: 10px;
                border-bottom: 1px solid var(--border-color, #eee);
            }
            .health-report-card-icon {
                width: 36px; height: 36px; border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                color: #fff; font-size: 16px; flex-shrink: 0;
            }
            .health-report-card-title { font-size: 13px; font-weight: 600; color: var(--text-primary, #333); }
            .health-report-card-level { font-size: 18px; font-weight: 700; }
            .health-report-card-body { padding: 10px 14px; min-width: 0; }
            .health-report-card-stats {
                display: flex; justify-content: space-around; margin-bottom: 10px;
                overflow: hidden; min-width: 0;
            }
            .health-report-card-stat { text-align: center; min-width: 0; }
            .health-report-card-stat-num { font-size: 16px; font-weight: 700; color: var(--text-primary, #333); }
            .health-report-card-stat-label { font-size: 10px; color: var(--text-secondary, #999); margin-top: 2px; }
            .health-report-card-summary {
                font-size: 12px; color: var(--text-secondary, #666); line-height: 1.5;
                padding: 8px; background: var(--primary-bg, #f5f5f5); border-radius: 8px;
                margin-bottom: 10px; word-break: break-word;
            }
            .health-report-card-btn {
                width: 100%; padding: 8px; background: var(--accent-color, #07c160);
                color: #fff; border: none; border-radius: 8px; font-size: 13px;
                cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
            }
        `;
        document.head.appendChild(style);
    }

    function init() {}

    window.HealthApp = {
        openHealthModal: openHealthModal,
        closeHealthModal: closeHealthModal,
        renderHealthReportCardHTML: renderHealthReportCardHTML
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 600); });
    } else {
        setTimeout(init, 600);
    }
})();
