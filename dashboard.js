// Dashboard State
let dashboardData = {
    trades: [],
    signals: [],
    wallet: null,
    tasks: [],
    dailyReports: [],
};

let signalChart = null;
let portfolioChart = null;
let portfolioHistoryChart = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    initializeTabs();
    await loadAllData();
    setupEventListeners();
});

// ─── Tab System ───
function initializeTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    window.addEventListener('hashchange', () => {
        const h = window.location.hash.substring(1);
        if (h) switchTab(h);
    });
    switchTab(window.location.hash.substring(1) || 'overview');
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `tab-${tabName}`);
    });
    window.history.replaceState(null, null, `#${tabName}`);
    if (tabName === 'signals' && signalChart) signalChart.resize();
}

// ─── Data Loading ───
async function loadAllData() {
    updateStatusIndicator('loading', 'データ読み込み中...');
    let errors = 0;

    const loaders = [
        ['wallet', './data/wallet.json'],
        ['trades', './data/trades.json'],
        ['signals', './data/signals.json'],
        ['tasks', './data/tasks.json'],
        ['dailyReports', './data/daily_reports.json'],
        ['strategies', './data/strategies.json'],
        ['portfolioHistory', './data/portfolio_history.json'],
    ];

    const bust = '?t=' + Date.now();
    await Promise.all(loaders.map(async ([key, url]) => {
        try {
            const r = await fetch(url + bust);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            dashboardData[key] = await r.json();
        } catch (e) {
            console.warn(`${key} load failed:`, e);
            errors++;
            if (key === 'tasks') dashboardData[key] = {members:{}, projects:[], statistics:{}};
            else if (key === 'wallet') dashboardData[key] = null;
            else if (key === 'dailyReports') dashboardData[key] = [];
            else if (key === 'portfolioHistory') dashboardData[key] = {portfolio_history:[], price_history:[]};
            else dashboardData[key] = [];
        }
    }));

    // Update each section independently
    const sections = [
        updateOverviewSection,
        updateTasksSection,
        updateTradesSection,
        updateSignalSection,
        updateStrategiesSection,
        updateDailyReportsSection,
    ];
    for (const fn of sections) {
        try { fn(); } catch(e) { console.warn('Section error:', e); errors++; }
    }

    updateStatusIndicator('online', errors ? `接続中 (${errors}件の警告)` : '接続中');
}

// ─── Overview Tab ───
function updateOverviewSection() {
    if (!dashboardData.wallet) return;
    const w = dashboardData.wallet;

    // Total assets
    document.getElementById('total-balance').textContent = fmtCurrency(w.total_usd);

    // Daily change — calculate from portfolio history (first snapshot of the day vs current)
    const changeAmt = document.getElementById('change-amount');
    const changePct = document.getElementById('change-percent');
    const histData = dashboardData.portfolioHistory?.portfolio_history || [];
    // Use JST date (UTC+9) to match snapshot timestamps
    const _now = new Date(); const _jst = new Date(_now.getTime() + 9*3600000);
    const today = _jst.toISOString().split('T')[0];
    // Find first snapshot of today
    const todaySnapshots = histData.filter(h => h.timestamp && h.timestamp.startsWith(today));
    const firstToday = todaySnapshots.length > 0 ? todaySnapshots[0] : null;
    if (firstToday && firstToday.total_usd > 0) {
        const diff = w.total_usd - firstToday.total_usd;
        const pct = (diff / firstToday.total_usd) * 100;
        changeAmt.textContent = `${diff >= 0 ? '+' : ''}${fmtCurrency(diff)}`;
        changePct.textContent = `(${diff >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
        changeAmt.className = `change-amount ${diff >= 0 ? 'positive' : 'negative'}`;
        changePct.className = `change-percent ${diff >= 0 ? 'positive' : 'negative'}`;
    } else {
        changeAmt.textContent = '--';
        changePct.textContent = '';
    }

    // Last updated
    if (w.timestamp) {
        document.getElementById('last-updated').textContent = `最終更新: ${fmtDateTime(w.timestamp)}`;
    }

    // Portfolio pie chart
    buildPortfolioPieChart(w);

    // Portfolio history chart
    buildPortfolioHistoryChart();

    // PnL summary
    updatePnLSummary();
}

function buildPortfolioPieChart(w) {
    const items = [];
    if (w.usdc_balance > 0) items.push({label: 'USDC', value: w.usdc_balance, color: '#2775ca'});
    if (w.wbtc_value_usd > 0.01) items.push({label: 'WBTC', value: w.wbtc_value_usd, color: '#f7931a'});
    if (w.bnb_value_usd > 0) items.push({label: 'BNB', value: w.bnb_value_usd, color: '#f0b90b'});
    if (w.sol_value_usd > 0) items.push({label: 'SOL', value: w.sol_value_usd, color: '#9945ff'});
    // Meme tokens (individual)
    const memeColors = ['#ff6b6b', '#ffa502', '#ff4757', '#e84393', '#fd79a8', '#fab1a0'];
    if (w.meme_holdings) {
        let ci = 0;
        for (const [name, info] of Object.entries(w.meme_holdings)) {
            const val = info.value || 0;
            if (val > 0.01) {
                items.push({label: '🟡 ' + name, value: val, color: memeColors[ci % memeColors.length]});
                ci++;
            }
        }
    }
    // Other tokens
    if (w.other_tokens_usd > 0) items.push({label: 'Other', value: w.other_tokens_usd, color: '#666'});

    const total = items.reduce((s, i) => s + i.value, 0) || 1;

    // Breakdown list
    const breakdown = document.getElementById('portfolio-breakdown');
    breakdown.innerHTML = items.map(i => {
        const pct = ((i.value / total) * 100).toFixed(1);
        return `
            <div class="breakdown-row">
                <span class="breakdown-dot" style="background:${i.color}"></span>
                <span class="breakdown-name">${i.label}</span>
                <span class="breakdown-value">${fmtCurrency(i.value)}</span>
                <span class="breakdown-pct">${pct}%</span>
            </div>`;
    }).join('');

    // Chart
    const ctx = document.getElementById('portfolioChart').getContext('2d');
    if (portfolioChart) portfolioChart.destroy();
    portfolioChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: items.map(i => i.label),
            datasets: [{
                data: items.map(i => i.value),
                backgroundColor: items.map(i => i.color),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '65%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.label}: ${fmtCurrency(ctx.raw)} (${((ctx.raw/total)*100).toFixed(1)}%)`
                    }
                }
            }
        }
    });
}

function buildPortfolioHistoryChart() {
    const histData = dashboardData.portfolioHistory?.portfolio_history || [];
    if (histData.length < 2) return;

    const ctx = document.getElementById('portfolioHistoryChart')?.getContext('2d');
    if (!ctx) return;
    if (portfolioHistoryChart) portfolioHistoryChart.destroy();

    const labels = histData.map(h => fmtTime(h.timestamp));
    const totals = histData.map(h => h.total_usd);
    const usdcData = histData.map(h => h.usdc || 0);

    portfolioHistoryChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: '総資産 (USD)',
                    data: totals,
                    borderColor: '#4488ff',
                    backgroundColor: 'rgba(68,136,255,0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2,
                },
                {
                    label: 'USDC',
                    data: usdcData,
                    borderColor: '#2775ca',
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.3,
                    pointRadius: 0,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#fff' } },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: ${fmtCurrency(ctx.raw)}`
                    }
                }
            },
            scales: {
                x: { ticks: { color: '#888', maxTicksLimit: 10 }, grid: { color: '#333' } },
                y: { ticks: { color: '#4488ff', callback: v => '$' + v }, grid: { color: '#333' } },
            },
        },
    });
}

function updatePnLSummary() {
    const trades = dashboardData.trades.filter(t => !isTestTrade(t));
    const total = trades.length;
    const totalFees = trades.reduce((s, t) => s + (parseFloat(t.fee_sol) || parseFloat(t.fee_lamports || 0) / 1e9 || 0), 0);
    const solPrice = dashboardData.wallet?.sol_price_usd || 0;

    // Calculate realized P&L from sell trades
    const sells = trades.filter(t => t.direction === 'sell' || t.direction === 'SELL');
    let totalPnl = 0;
    let wins = 0;
    sells.forEach(t => {
        const pnl = parseFloat(t.extra?.pnl_usd || 0);
        if (pnl !== 0) { totalPnl += pnl; if (pnl > 0) wins++; }
    });
    const winRate = sells.length > 0 ? Math.round((wins / sells.length) * 100) : 0;

    document.getElementById('total-trades').textContent = total;
    document.getElementById('successful-trades').textContent = sells.length > 0 ? `${wins}/${sells.length}` : total;
    document.getElementById('success-rate').textContent = sells.length > 0 ? `${winRate}%` : '--';
    document.getElementById('total-fees').textContent = fmtCurrency(totalFees * solPrice);
}

// ─── Tasks Tab ───
function updateTasksSection() {
    if (!dashboardData.tasks.projects) {
        document.getElementById('tasks-container').innerHTML = '<div class="loading">タスクデータなし</div>';
        return;
    }
    updateTaskStatistics();
    renderProjectAccordion();
}

function updateTaskStatistics() {
    const allTasks = flattenAllTasks();
    const today = new Date().toISOString().split('T')[0];

    const hikPending = allTasks.filter(t => t.assignee === 'hikarimaru' && t.status === 'pending').length;
    const inProgress = allTasks.filter(t => t.status === 'in_progress').length;
    const completedToday = allTasks.filter(t => t.status === 'completed' && t.completed_at && t.completed_at.startsWith(today)).length;

    document.getElementById('tasks-hikarimaru-pending').textContent = hikPending;
    document.getElementById('tasks-in-progress').textContent = inProgress;
    document.getElementById('tasks-today-completed').textContent = completedToday;
}

function flattenAllTasks() {
    const result = [];
    function walk(tasks) {
        for (const t of tasks) {
            result.push(t);
            if (t.subtasks?.length) walk(t.subtasks);
        }
    }
    for (const p of dashboardData.tasks.projects || []) walk(p.tasks || []);
    return result;
}

function renderProjectAccordion() {
    const container = document.getElementById('tasks-container');
    const statusFilter = document.getElementById('task-status-filter')?.value || '';
    const assigneeFilter = document.getElementById('task-assignee-filter')?.value || '';

    const html = dashboardData.tasks.projects.map(project => {
        const stats = dashboardData.tasks.statistics?.projects?.find(p => p.id === project.id) || {};
        const tasks = filterTasks(project.tasks || [], statusFilter, assigneeFilter);
        if (tasks.length === 0 && (statusFilter || assigneeFilter)) return '';

        return `
            <div class="project-accordion">
                <div class="project-header" onclick="toggleProject('${project.id}')">
                    <div class="project-info">
                        <div class="project-title">${esc(project.name)} <span class="project-id">${project.id}</span></div>
                        <div class="project-description">${esc(project.description || '')}</div>
                    </div>
                    <div class="project-stats-mini">
                        <span class="progress-text">${stats.completed_tasks||0}/${stats.total_tasks||0}</span>
                    </div>
                    <div class="toggle-icon" id="toggle-${project.id}">▼</div>
                </div>
                <div class="project-tasks" id="project-${project.id}" style="display:none;">
                    ${renderTaskList(tasks, 0)}
                </div>
            </div>`;
    }).join('');

    container.innerHTML = html || '<div class="loading">フィルター条件に一致するタスクがありません</div>';
}

function filterTasks(tasks, statusFilter, assigneeFilter) {
    return tasks.map(t => {
        const subs = t.subtasks?.length ? filterTasks(t.subtasks, statusFilter, assigneeFilter) : [];
        const match = (!statusFilter || t.status === statusFilter) && (!assigneeFilter || t.assignee === assigneeFilter);
        if (match || subs.length > 0) return {...t, subtasks: subs};
        return null;
    }).filter(Boolean);
}

function renderTaskList(tasks, level) {
    return tasks.map(t => {
        const isHik = t.assignee === 'hikarimaru' && t.status === 'pending';
        const emoji = dashboardData.tasks.members?.[t.assignee]?.emoji || '❓';
        const hasSubs = t.subtasks?.length > 0;

        return `
            <div class="task-tree-item ${isHik ? 'hikarimaru-pending' : ''}" style="margin-left:${level*16}px">
                <div class="task-item" onclick="toggleTaskDetail(this)">
                    <div class="task-row-main">
                        <div class="task-left">
                            ${hasSubs ? `<span class="subtask-toggle" onclick="toggleSubtasks(event,'${t.id}')">▶</span>` : '<span class="subtask-spacer"></span>'}
                            <span class="badge status-${t.status}">${statusLabel(t.status)}</span>
                            <span class="task-title-text">${esc(t.title)}</span>
                            ${isHik ? '<span class="urgent-badge">👑 要対応</span>' : ''}
                        </div>
                        <div class="task-right">
                            <span class="task-id-label">${t.id}</span>
                            <span class="task-member-label">${emoji}</span>
                        </div>
                    </div>
                    <div class="task-detail-inline" style="display:none">
                        <div class="task-detail-id"><strong>タスクID:</strong> ${t.id}</div>
                        ${t.description ? `<div class="task-detail-desc">${esc(t.description)}</div>` : ''}
                        ${t.assignee === 'hikarimaru' && t.status === 'pending' ? renderHikarimaruInstructions(t) : ''}
                        ${t.estimated_hours ? `<div class="task-detail-meta">⏱ 見積: ${t.estimated_hours}h${t.actual_hours ? ` / 実績: ${t.actual_hours}h` : ''}</div>` : ''}
                        ${t.depends_on?.length ? `<div class="task-detail-meta">🔗 依存: ${t.depends_on.join(', ')}</div>` : ''}
                        ${t.notes?.length ? `<div class="task-detail-notes">${(Array.isArray(t.notes) ? t.notes : [{text: String(t.notes), timestamp: ''}]).map(n => `<div class="note-line">${n.timestamp ? `<span class="note-ts">${fmtTime(n.timestamp)}</span> ` : ''}${esc(n.text || String(n))}</div>`).join('')}</div>` : ''}
                    </div>
                </div>
                ${hasSubs ? `<div class="subtasks-container" id="subtasks-${t.id}" style="display:none">${renderTaskList(t.subtasks, level+1)}</div>` : ''}
            </div>`;
    }).join('');
}

function renderHikarimaruInstructions(task) {
    // Generate specific instructions for hikarimaru's tasks
    let instruction = '';

    if (task.id.includes('S01') && task.title.includes('リスク')) {
        instruction = `<div class="hik-instruction">
            📌 <strong>やること:</strong> 上の説明を読んで、リスクが許容できるか判断してください。<br>
            💬 <strong>返答例:</strong> Discordで <code>${task.id} OK、段階的変更で進めて</code> と送信</div>`;
    } else if (task.title.includes('レビュー') || task.title.includes('確認')) {
        instruction = `<div class="hik-instruction">
            📌 <strong>やること:</strong> Clawdiaが共有する結果を確認して承認/却下を判断<br>
            💬 <strong>返答例:</strong> <code>${task.id} 承認</code> or <code>${task.id} 却下、理由は〜</code></div>`;
    } else if (task.title.includes('判断') || task.title.includes('決定')) {
        instruction = `<div class="hik-instruction">
            📌 <strong>やること:</strong> 説明を読んで方針を決定<br>
            💬 <strong>返答例:</strong> <code>${task.id} [選んだ方針]で進めて</code></div>`;
    } else if (task.title.includes('アカウント') || task.title.includes('作成')) {
        instruction = `<div class="hik-instruction">
            📌 <strong>やること:</strong> 手動でアカウント作成/設定を実施<br>
            💬 <strong>返答例:</strong> <code>${task.id} 完了</code></div>`;
    } else {
        instruction = `<div class="hik-instruction">
            📌 <strong>やること:</strong> ${esc(task.description || '内容を確認して判断')}<br>
            💬 <strong>返答例:</strong> <code>${task.id} OK</code> or <code>${task.id} [指示内容]</code></div>`;
    }
    return instruction;
}

function toggleTaskDetail(el) {
    const detail = el.querySelector('.task-detail-inline');
    if (detail) detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
}

function toggleProject(id) {
    const el = document.getElementById(`project-${id}`);
    const icon = document.getElementById(`toggle-${id}`);
    if (el.style.display === 'none') { el.style.display = 'block'; icon.textContent = '▲'; }
    else { el.style.display = 'none'; icon.textContent = '▼'; }
}

function toggleSubtasks(event, id) {
    event.stopPropagation();
    const el = document.getElementById(`subtasks-${id}`);
    const toggle = event.target;
    if (el.style.display === 'none') { el.style.display = 'block'; toggle.textContent = '▼'; }
    else { el.style.display = 'none'; toggle.textContent = '▶'; }
}

function filterHikarimaruPending() {
    document.getElementById('task-assignee-filter').value = 'hikarimaru';
    document.getElementById('task-status-filter').value = 'pending';
    renderProjectAccordion();
    // Open all projects
    dashboardData.tasks.projects.forEach(p => {
        const el = document.getElementById(`project-${p.id}`);
        const icon = document.getElementById(`toggle-${p.id}`);
        if (el) { el.style.display = 'block'; if (icon) icon.textContent = '▲'; }
    });
}

function resetTaskFilters() {
    document.getElementById('task-status-filter').value = '';
    document.getElementById('task-assignee-filter').value = '';
    renderProjectAccordion();
}

// ─── Trade Filtering ───
let tradeFilters = { strategy: '', symbol: '', direction: '', hideTest: true };

function filterTradesByStrategy(strategy, symbol) {
    tradeFilters.strategy = strategy || '';
    tradeFilters.symbol = symbol || '';
    switchTab('trades');
    updateTradesSection();
    // Update filter UI
    const sf = document.getElementById('trade-strategy-filter');
    const symf = document.getElementById('trade-symbol-filter');
    if (sf) sf.value = strategy || '';
    if (symf) symf.value = symbol || '';
}

function resetTradeFilters() {
    tradeFilters = { strategy: '', symbol: '', direction: '', hideTest: true };
    document.getElementById('trade-strategy-filter').value = '';
    document.getElementById('trade-symbol-filter').value = '';
    document.getElementById('trade-direction-filter').value = '';
    document.getElementById('trade-hide-test').checked = true;
    updateTradesSection();
}

function applyTradeFilters() {
    tradeFilters.strategy = document.getElementById('trade-strategy-filter')?.value || '';
    tradeFilters.symbol = document.getElementById('trade-symbol-filter')?.value || '';
    tradeFilters.direction = document.getElementById('trade-direction-filter')?.value || '';
    tradeFilters.hideTest = document.getElementById('trade-hide-test')?.checked ?? true;
    updateTradesSection();
}

function getFilteredTrades() {
    let trades = dashboardData.trades || [];
    if (tradeFilters.hideTest) trades = trades.filter(t => !isTestTrade(t));
    if (tradeFilters.strategy) trades = trades.filter(t => (t.strategy || '').toUpperCase() === tradeFilters.strategy.toUpperCase());
    if (tradeFilters.symbol) {
        const sym = tradeFilters.symbol.toUpperCase();
        trades = trades.filter(t => (t.input_token || '').toUpperCase() === sym || (t.output_token || '').toUpperCase() === sym);
    }
    if (tradeFilters.direction) {
        if (tradeFilters.direction === 'buy') trades = trades.filter(t => t.input_token === 'USDC' || (t.direction || '').toLowerCase() === 'buy');
        if (tradeFilters.direction === 'sell') trades = trades.filter(t => t.output_token === 'USDC' || (t.direction || '').toLowerCase() === 'sell');
    }
    return trades;
}

// ─── Trades Tab ───
function updateTradesSection() {
    const trades = getFilteredTrades();
    const wallet = dashboardData.wallet;
    if (!wallet) return;

    // Helper to get amounts from either old or new field names
    const getInputAmt = t => t.actual_input_amount || t.input_amount || t.order_input_amount || 0;
    const getOutputAmt = t => t.actual_output_amount || t.output_amount || t.order_output_amount || 0;

    // Categorize trades
    // Open positions = tokens we currently hold (from wallet data)
    // Dust filter: ignore balances worth less than $0.01
    const DUST_THRESHOLD_USD = 0.01;
    const openPositions = [];
    if (wallet.wbtc_value_usd > DUST_THRESHOLD_USD) {
        // Find the LAST buy trade for WBTC that doesn't have a matching sell after it
        const wbtcBuys = trades.filter(t => t.output_token === 'WBTC' && t.status === 'Success');
        const wbtcSells = trades.filter(t => t.input_token === 'WBTC' && t.status === 'Success');
        const lastSellTime = wbtcSells.length > 0 ? new Date(wbtcSells[wbtcSells.length-1].timestamp) : new Date(0);
        const activeBuy = wbtcBuys.filter(t => new Date(t.timestamp) > lastSellTime).slice(-1)[0];
        if (activeBuy) {
            const entryUsd = getInputAmt(activeBuy);
            openPositions.push({
                token: 'WBTC',
                amount: wallet.wbtc_balance,
                currentValueUsd: wallet.wbtc_value_usd,
                entryUsd: entryUsd,
                entryDate: activeBuy.timestamp,
                pnlUsd: wallet.wbtc_value_usd - entryUsd
            });
        }
    }
    if (wallet.bnb_value_usd > DUST_THRESHOLD_USD) {
        const bnbBuys = trades.filter(t => t.output_token === 'BNB' && t.status === 'Success');
        const bnbSells = trades.filter(t => t.input_token === 'BNB' && t.status === 'Success');
        const lastSellTime = bnbSells.length > 0 ? new Date(bnbSells[bnbSells.length-1].timestamp) : new Date(0);
        const activeBuy = bnbBuys.filter(t => new Date(t.timestamp) > lastSellTime).slice(-1)[0];
        if (activeBuy) {
            const entryUsd = getInputAmt(activeBuy);
            openPositions.push({
                token: 'BNB',
                amount: wallet.bnb_balance,
                currentValueUsd: wallet.bnb_value_usd,
                entryUsd: entryUsd,
                entryDate: activeBuy.timestamp,
                pnlUsd: wallet.bnb_value_usd - entryUsd
            });
        }
    }
    // SOL position (from Grid Bot) — use tracked position amount, not total wallet balance
    // Gas SOL (~0.04-0.05) must be excluded from position display
    if (wallet.sol_value_usd > 1.0) {
        const solBuys = trades.filter(t => t.output_token === 'SOL' && t.status === 'Success' && t.strategy !== 'TEST' && t.strategy !== 'PIPELINE_TEST');
        const solSells = trades.filter(t => t.input_token === 'SOL' && t.status === 'Success' && t.strategy !== 'TEST' && t.strategy !== 'PIPELINE_TEST');
        const lastSellTime = solSells.length > 0 ? new Date(solSells[solSells.length-1].timestamp) : new Date(0);
        const activeBuy = solBuys.filter(t => new Date(t.timestamp) > lastSellTime).slice(-1)[0];
        if (activeBuy) {
            const entryUsd = getInputAmt(activeBuy);
            // Use the bought amount (not total wallet balance) to calculate position value
            const positionAmount = getOutputAmt(activeBuy);
            const solPrice = wallet.sol_price_usd || 0;
            const positionValueUsd = positionAmount * solPrice;
            openPositions.push({
                token: 'SOL',
                amount: positionAmount,
                currentValueUsd: positionValueUsd,
                entryUsd: entryUsd,
                entryDate: activeBuy.timestamp,
                pnlUsd: positionValueUsd - entryUsd
            });
        }
    }

    // Open positions section
    const openContainer = document.getElementById('open-positions-container');
    if (openPositions.length === 0) {
        openContainer.innerHTML = '<div class="no-position">ポジションなし — 全額USDC待機中</div>';
    } else {
        openContainer.innerHTML = openPositions.map(p => {
            const pnlClass = p.pnlUsd != null ? (p.pnlUsd >= 0 ? 'positive' : 'negative') : '';
            return `
                <div class="position-card">
                    <div class="position-header">
                        <span class="position-token">${p.token}</span>
                        <span class="position-value">${fmtCurrency(p.currentValueUsd)}</span>
                    </div>
                    <div class="position-details">
                        <span>数量: ${fmtNum(p.amount, 8)}</span>
                        ${p.entryUsd != null ? `<span>購入: ${fmtCurrency(p.entryUsd)}</span>` : ''}
                        ${p.pnlUsd != null ? `<span class="${pnlClass}">損益: ${p.pnlUsd >= 0 ? '+' : ''}${fmtCurrency(p.pnlUsd)}</span>` : ''}
                    </div>
                    ${p.entryDate ? `<div class="position-date">エントリー: ${fmtDateTime(p.entryDate)}</div>` : ''}
                </div>`;
        }).join('');
    }

    // Completed round-trips: buy then sell of same token
    // For now find sell-backs (e.g. SOL→USDC after USDC→SOL)
    const completedContainer = document.getElementById('completed-trades-container');
    const roundTrips = findRoundTrips(trades, wallet);
    if (roundTrips.length === 0) {
        completedContainer.innerHTML = '<div class="no-position">完了済みトレードはまだありません</div>';
    } else {
        completedContainer.innerHTML = roundTrips.map(rt => {
            const pnlClass = rt.pnl >= 0 ? 'positive' : 'negative';
            return `
                <div class="roundtrip-card">
                    <div class="rt-header">
                        <span class="rt-token">${rt.token}</span>
                        <span class="rt-pnl ${pnlClass}">${rt.pnl >= 0 ? '+' : ''}${fmtCurrency(rt.pnl)}</span>
                    </div>
                    <div class="rt-details">
                        <div>買い: ${fmtCurrency(rt.buyUsd)} (${fmtDateTime(rt.buyDate)})</div>
                        <div>売り: ${fmtCurrency(rt.sellUsd)} (${fmtDateTime(rt.sellDate)})</div>
                    </div>
                </div>`;
        }).join('');
    }

    // Full trade table with USD amounts + cumulative P&L
    updateTradeTable(trades, wallet);
    updateCumulativePnL(dashboardData.trades.filter(t => !isTestTrade(t)), wallet);
}

function findRoundTrips(trades, wallet) {
    // Match buy→sell pairs for the same token (simple FIFO)
    const trips = [];
    const successTrades = trades.filter(t => t.status === 'Success' && !isTestTrade(t));

    const getInput = t => t.actual_input_amount || t.input_amount || t.order_input_amount || 0;
    const getOutput = t => t.actual_output_amount || t.output_amount || t.order_output_amount || 0;

    // Generic round-trip matcher for any token
    function matchToken(tokenName) {
        const buys = successTrades.filter(t => t.input_token === 'USDC' && t.output_token === tokenName);
        const sells = successTrades.filter(t => t.input_token === tokenName && t.output_token === 'USDC');

        const usedSells = new Set();
        for (const buy of buys) {
            for (let i = 0; i < sells.length; i++) {
                if (usedSells.has(i)) continue;
                if (new Date(sells[i].timestamp) > new Date(buy.timestamp)) {
                    const sellUsd = getOutput(sells[i]);
                    const buyUsd = getInput(buy);
                    // Skip trades with $0 sell (data recording error)
                    if (sellUsd <= 0.01) continue;
                    trips.push({
                        token: tokenName,
                        buyUsd: buyUsd,
                        sellUsd: sellUsd,
                        buyDate: buy.timestamp,
                        sellDate: sells[i].timestamp,
                        pnl: sellUsd - buyUsd
                    });
                    usedSells.add(i);
                    break;
                }
            }
        }
    }

    matchToken('SOL');
    matchToken('WBTC');
    matchToken('BNB');
    matchToken('PUMP');

    // Sort by sell date descending
    trips.sort((a, b) => new Date(b.sellDate) - new Date(a.sellDate));
    return trips;
}

function updateTradeTable(trades, wallet) {
    const tbody = document.getElementById('trade-table-body');
    if (trades.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="no-data">トレードなし</td></tr>';
        return;
    }

    const solPrice = wallet?.sol_price_usd || 0;
    const btcPrice = wallet?.btc_price_usd || 0;
    const bnbPrice = wallet?.bnb_price_usd || 0;

    tbody.innerHTML = [...trades].reverse().map(t => {
        const isTest = isTestTrade(t);
        const inputToken = t.input_token || t.token || '?';
        const outputToken = t.output_token || (t.action === 'buy' ? t.token : 'USDC') || '?';
        const stratLabel = t.strategy ? ` [${t.strategy}]` : '';
        const direction = inputToken === 'USDC' || t.action === 'buy' || t.direction === 'BUY' || (t.direction || '').toLowerCase() === 'buy' ? '🟢 買い' : '🔴 売り';
        const pair = `${inputToken} → ${outputToken}`;
        const inputAmt = t.input_amount || t.actual_input_amount || t.order_input_amount || t.usdc_spent || 0;
        const outputAmt = t.output_amount || t.actual_output_amount || t.order_output_amount || t.token_amount || 0;
        const inputUsd = estimateUsd(inputToken, inputAmt, solPrice, btcPrice, bnbPrice);
        const outputUsd = estimateUsd(outputToken, outputAmt, solPrice, btcPrice, bnbPrice);
        // For buys: show input USDC amount. For sells: show output USDC or estimate from input token value
        let usdDisplay;
        if (inputToken === 'USDC') {
            usdDisplay = fmtCurrency(inputAmt);
        } else if (outputToken === 'USDC' && outputAmt > 0) {
            usdDisplay = fmtCurrency(outputAmt);
        } else {
            usdDisplay = fmtCurrency(inputUsd);
        }
        const status = t.status || 'Success';

        return `
            <tr class="trade-row ${status === 'Success' ? 'success' : 'failed'} ${isTest ? 'test-trade' : ''}">
                <td>${fmtDateTime(t.timestamp)}</td>
                <td>${direction}${isTest ? ' <span class="test-badge">TEST</span>' : ''}<br><small>${pair}${stratLabel}</small></td>
                <td>${fmtNum(inputAmt, 6)} ${inputToken}<br>→ ${fmtNum(outputAmt, 6)} ${outputToken}</td>
                <td>${usdDisplay}</td>
                <td><span class="status-badge ${status === 'Success' ? 'success' : 'failed'}">${status === 'Success' ? '✅' : '❌'}</span></td>
            </tr>`;
    }).join('');
}

function estimateUsd(token, amount, solPrice, btcPrice, bnbPrice) {
    if (token === 'USDC') return amount;
    if (token === 'SOL') return amount * solPrice;
    if (token === 'WBTC') return amount * btcPrice;
    if (token === 'BNB') return amount * bnbPrice;
    return 0;
}

// ─── Signals Tab ───
function updateSignalSection() {
    const signals = dashboardData.signals;
    const wallet = dashboardData.wallet;

    // Summary - what human should care about
    const summaryEl = document.getElementById('signal-summary');
    if (!signals.length) {
        summaryEl.innerHTML = '<div class="loading">シグナルデータなし</div>';
        return;
    }

    // Group by pair, show latest for each
    const byPair = {};
    for (const s of signals) {
        const pair = s.pair || 'BTCUSDT';
        byPair[pair] = s;
    }

    let html = '<div class="signal-cards">';
    for (const [pair, s] of Object.entries(byPair)) {
        const cci = s.cci ?? s.cci_value ?? 0;
        const cciNum = parseFloat(cci);
        const cciClass = cciNum < -100 ? 'signal-buy' : cciNum > 100 ? 'signal-sell' : 'signal-neutral';
        const actionText = cciNum < -100 ? '🟢 買いシグナル圏内' : cciNum > 100 ? '🔴 売り圧力' : '⚪ 中立';
        const price = s.btc_price || s.price || s.close || 0;

        html += `
            <div class="signal-card ${cciClass}">
                <div class="signal-pair">${pair}</div>
                <div class="signal-cci">CCI: <strong>${fmtNum(cciNum, 1)}</strong></div>
                <div class="signal-action">${actionText}</div>
                ${price ? `<div class="signal-price">価格: ${fmtCurrency(price)}</div>` : ''}
                <div class="signal-time">${fmtTime(s.checked_at || s.timestamp)}</div>
            </div>`;
    }
    html += '</div>';

    // Key insight for human
    const latestBTC = byPair['BTCUSDT'];
    if (latestBTC) {
        const cci = parseFloat(latestBTC.cci ?? latestBTC.cci_value ?? 0);
        let insight = '';
        if (cci < -100) insight = '⚠️ <strong>CCI買いシグナル発生中！</strong> Botが自動でエントリーを検討しています';
        else if (cci < -50) insight = '📉 CCIが下降中。-100を下回ると買いシグナルが発生します';
        else if (cci > 100) insight = '📈 CCIが高値圏。Donchianチャネルによるイグジットを監視中';
        else insight = '😌 CCIは中立圏。特にアクション不要です';
        html += `<div class="signal-insight">${insight}</div>`;
    }

    summaryEl.innerHTML = html;

    // Chart
    setupSignalChart();
}

function setupSignalChart() {
    const ctx = document.getElementById('signalChart').getContext('2d');
    if (signalChart) signalChart.destroy();

    const chartData = prepareChartData('1d');
    signalChart = new Chart(ctx, {
        type: 'line',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#fff' } },
                annotation: undefined
            },
            scales: {
                x: { ticks: { color: '#888', maxTicksLimit: 12 }, grid: { color: '#333' } },
                y: {
                    position: 'left',
                    title: { display: true, text: 'CCI', color: '#4488ff' },
                    ticks: { color: '#4488ff' },
                    grid: { color: '#333' }
                },
                y1: {
                    position: 'right',
                    title: { display: true, text: 'Price (USD)', color: '#ffaa00' },
                    ticks: { color: '#ffaa00' },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}

function prepareChartData(period) {
    const signals = dashboardData.signals.filter(s => (s.pair || 'BTCUSDT') === 'BTCUSDT');
    if (!signals.length) return { labels: [], datasets: [] };

    const now = new Date();
    const ms = period === '30d' ? 30*86400000 : period === '7d' ? 7*86400000 : 86400000;
    const cutoff = new Date(now.getTime() - ms);
    const filtered = signals.filter(s => new Date(s.checked_at || s.timestamp) >= cutoff);

    return {
        labels: filtered.map(s => fmtTime(s.checked_at || s.timestamp)),
        datasets: [
            {
                label: 'CCI',
                data: filtered.map(s => s.cci ?? s.cci_value ?? 0),
                borderColor: '#4488ff',
                fill: false,
                yAxisID: 'y',
                pointRadius: 1
            },
            {
                label: 'BTC Price',
                data: filtered.map(s => s.btc_price || s.price || s.close || 0),
                borderColor: '#ffaa00',
                fill: false,
                yAxisID: 'y1',
                pointRadius: 1
            }
        ]
    };
}

// ─── Strategies Tab ───
function updateStrategiesSection() {
    const container = document.getElementById('strategies-container');
    if (!container) return;
    
    const data = dashboardData.strategies || {};
    const strategies = data.strategies || {};
    const allocation = data.allocation || {};
    
    if (Object.keys(strategies).length === 0) {
        container.innerHTML = '<p class="empty-state">戦略データがありません</p>';
        return;
    }
    
    let html = '';
    
    // Portfolio allocation overview (dynamic)
    const colors = {CCI: '#4488ff', GRID: '#9945ff', BOLLINGER: '#f0b90b', cash: '#2775ca'};
    const totalPortfolio = allocation.total_portfolio || 0;
    const cashUnalloc = allocation.cash_unallocated || 0;
    const allocStrats = allocation.strategies || {};
    
    html += `<div class="allocation-overview">
        <h3>💰 資産配分 <span class="alloc-total">総額: $${totalPortfolio.toFixed(0)}</span></h3>
        <div class="allocation-bar">`;
    
    // Bar segments based on actual values (position + dry powder)
    for (const [id, strat] of Object.entries(strategies)) {
        const a = allocStrats[id] || {};
        const posVal = a.position_value || 0;
        const dryVal = a.dry_powder || 0;
        const posPct = totalPortfolio > 0 ? (posVal / totalPortfolio * 100) : 0;
        const dryPct = totalPortfolio > 0 ? (dryVal / totalPortfolio * 100) : 0;
        if (posPct > 0) html += `<div class="alloc-segment" style="width:${posPct}%;background:${colors[id]||'#666'}" title="${strat.name} ポジション $${posVal}"></div>`;
        if (dryPct > 0) html += `<div class="alloc-segment" style="width:${dryPct}%;background:${colors[id]||'#666'};opacity:0.4" title="${strat.name} 待機 $${dryVal}"></div>`;
    }
    if (cashUnalloc > 0 && totalPortfolio > 0) {
        const cashPct = cashUnalloc / totalPortfolio * 100;
        html += `<div class="alloc-segment" style="width:${cashPct}%;background:${colors.cash}" title="未配分現金 $${cashUnalloc}"></div>`;
    }
    html += `</div>`;
    
    // Legend with allocated / positions / dry powder
    html += `<div class="allocation-detail">`;
    for (const [id, strat] of Object.entries(strategies)) {
        const a = allocStrats[id] || {};
        if ((a.allocated_usd || 0) === 0 && strat.status !== 'active') continue;
        const pnlStr = a.realized_pnl ? ` (実現: ${a.realized_pnl >= 0 ? '+' : ''}$${a.realized_pnl.toFixed(2)})` : '';
        html += `<div class="alloc-row">
            <span class="alloc-dot" style="background:${colors[id]||'#666'}"></span>
            <span class="alloc-name">${strat.name || id}</span>
            <span class="alloc-vals">配分: $${a.allocated_usd || 0} → ポジション: $${(a.position_value || 0).toFixed(0)} / 待機: $${(a.dry_powder || 0).toFixed(0)}${pnlStr}</span>
        </div>`;
    }
    html += `<div class="alloc-row">
        <span class="alloc-dot" style="background:${colors.cash}"></span>
        <span class="alloc-name">未配分現金</span>
        <span class="alloc-vals">$${cashUnalloc.toFixed(0)} (追加配分可能)</span>
    </div>`;
    html += `</div></div>`;
    
    // Strategy cards
    html += '<div class="strategies-list">';
    
    for (const [stratId, strat] of Object.entries(strategies)) {
        const isActive = strat.status === 'active';
        const statusText = isActive ? (strat.bot_running ? '🟢 稼働中' : '🔴 Bot停止') : '⏸️ 無効';
        const icon = {CCI: '📊', GRID: '🔧', BOLLINGER: '📉'}[stratId] || '📌';
        
        html += `<div class="strategy-section ${isActive ? '' : 'disabled'}">`;
        
        // Strategy header
        html += `<div class="strat-header" style="border-left: 4px solid ${colors[stratId]||'#666'}">
            <div class="strat-title">
                <h3>${icon} ${strat.name || stratId}</h3>
                <span class="strat-status">${statusText}</span>
            </div>
            <p class="strat-desc">${esc(strat.description || '')}</p>
            <div class="strat-meta">
                <span>📐 ${strat.timeframe || '?'}</span>
                <span>🎯 ${strat.type || '?'}</span>
                <span>💰 配分 ${strat.allocation_pct || 0}%</span>
            </div>
        </div>`;
        
        // Key metrics
        const km = strat.key_metrics || {};
        if (Object.keys(km).length > 0) {
            html += `<div class="strat-metrics">`;
            if (km.total_backtests) html += `<div class="metric"><span class="metric-val">${km.total_backtests.toLocaleString()}</span><span class="metric-lbl">バックテスト数</span></div>`;
            if (km.best_annual) html += `<div class="metric"><span class="metric-val positive">${km.best_annual}</span><span class="metric-lbl">最高年間</span></div>`;
            if (km.worst_annual) html += `<div class="metric"><span class="metric-val negative">${km.worst_annual}</span><span class="metric-lbl">最低年間</span></div>`;
            if (km.walk_forward_pass) html += `<div class="metric"><span class="metric-val">${km.walk_forward_pass}</span><span class="metric-lbl">WF通過率</span></div>`;
            if (km.optimal_daily) html += `<div class="metric"><span class="metric-val positive">${km.optimal_daily}</span><span class="metric-lbl">最適日利</span></div>`;
            if (km.win_rate) html += `<div class="metric"><span class="metric-val">${km.win_rate}</span><span class="metric-lbl">勝率</span></div>`;
            if (km.bear_2022) html += `<div class="metric"><span class="metric-val negative">${km.bear_2022}</span><span class="metric-lbl">2022ベア</span></div>`;
            html += `</div>`;
            if (km.conclusion) html += `<div class="strat-conclusion">💡 ${esc(km.conclusion)}</div>`;
        }
        
        // Pairs table
        const pairs = strat.pairs || {};
        if (Object.keys(pairs).length > 0) {
            html += `<div class="pairs-section"><h4>📋 ペア一覧</h4><div class="pairs-grid">`;
            for (const [pairId, pair] of Object.entries(pairs)) {
                const pairActive = pair.status === 'enabled';
                const pos = pair.position || {};
                const stats = pair.live_stats || {};
                const wallet = dashboardData.wallet || {};
                
                // Calculate current P&L for open positions
                let currentPnl = null;
                if (pos.in_position && pos.entry_price) {
                    const sym = pair.symbol;
                    const currentPrice = sym === 'SOL' ? wallet.sol_price_usd : sym === 'WBTC' ? wallet.btc_price_usd : sym === 'BNB' ? wallet.bnb_price_usd : 0;
                    if (currentPrice > 0) {
                        currentPnl = ((currentPrice - pos.entry_price) / pos.entry_price * 100);
                    }
                }
                
                html += `<div class="pair-card ${pairActive ? '' : 'disabled'}">
                    <div class="pair-header">
                        <span class="pair-name">${pair.symbol || pairId}</span>
                        <span class="pair-status">${pairActive ? '✅' : '⏸️'}</span>
                    </div>`;
                
                // Params
                const p = pair.params || {};
                html += `<div class="pair-params">`;
                for (const [k, v] of Object.entries(p)) {
                    const label = k.replace(/_/g, ' ').replace('pct', '%').replace('period', '期間');
                    html += `<span class="pparam">${label}: <strong>${v}</strong></span>`;
                }
                html += `</div>`;
                
                // Position
                if (pos.in_position) {
                    const pnlClass = currentPnl >= 0 ? 'positive' : 'negative';
                    html += `<div class="pair-position active">💼 ポジション保有中`;
                    if (pos.entry_price) html += ` @ $${pos.entry_price}`;
                    if (currentPnl !== null) html += ` <span class="${pnlClass}">(${currentPnl >= 0 ? '+' : ''}${currentPnl.toFixed(2)}%)</span>`;
                    html += `</div>`;
                } else {
                    html += `<div class="pair-position">待機中</div>`;
                }
                
                // Live stats
                if (stats.total_trades > 0) {
                    html += `<div class="pair-stats">取引: ${stats.total_trades}回`;
                    if (stats.realized_pnl !== null && stats.realized_pnl !== undefined) {
                        const pnlClass = stats.realized_pnl >= 0 ? 'positive' : 'negative';
                        html += ` | 実現P&L: <span class="${pnlClass}">${stats.realized_pnl >= 0 ? '+' : ''}$${stats.realized_pnl.toFixed(2)}</span>`;
                    }
                    html += `</div>`;
                }
                
                // View trades link
                html += `<div class="pair-actions"><a href="#trades" onclick="filterTradesByStrategy('${stratId}','${pair.symbol}')" class="link-btn">📜 トレード一覧 →</a></div>`;
                
                html += `</div>`;
            }
            html += `</div></div>`;
        }
        
        html += `</div>`;
    }
    
    html += '</div>';
    container.innerHTML = html;
}

// ─── Daily Reports Tab ───
function updateDailyReportsSection() {
    const container = document.getElementById('daily-reports-container');
    // Use JST (UTC+9) for date comparison
    const now = new Date();
    const jstOffset = 9 * 60;
    const jstDate = new Date(now.getTime() + (jstOffset + now.getTimezoneOffset()) * 60000);
    const today = jstDate.toISOString().split('T')[0];

    // Filter out future dates (JST-based)
    const reports = dashboardData.dailyReports.filter(r => r.date <= today);

    if (!reports.length) {
        container.innerHTML = '<div class="loading">日報データなし</div>';
        return;
    }

    container.innerHTML = reports.slice(0, 10).map(r => `
        <div class="report-item">
            <div class="report-header" onclick="toggleReport('${r.date}')">
                <div class="report-date">${r.date}</div>
                <div class="toggle-icon">▼</div>
            </div>
            <div class="report-content" id="report-${r.date}">
                ${simpleMarkdown(r.content || '')}
            </div>
        </div>
    `).join('');
}

function toggleReport(date) {
    const el = document.getElementById(`report-${date}`);
    const icon = el.parentElement.querySelector('.toggle-icon');
    if (el.classList.contains('expanded')) {
        el.classList.remove('expanded');
        icon.textContent = '▼';
    } else {
        el.classList.add('expanded');
        icon.textContent = '▲';
    }
}

// ─── Event Listeners ───
function setupEventListeners() {
    document.getElementById('task-status-filter')?.addEventListener('change', renderProjectAccordion);
    document.getElementById('task-assignee-filter')?.addEventListener('change', renderProjectAccordion);

    ['chart-1d', 'chart-7d', 'chart-30d'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => {
            document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
            document.getElementById(id).classList.add('active');
            const period = id.replace('chart-', '');
            if (signalChart) {
                signalChart.data = prepareChartData(period);
                signalChart.update();
            }
        });
    });
}

function updateCumulativePnL(trades, wallet) {
    const el = document.getElementById('cumulative-pnl');
    if (!el) return;
    const trips = findRoundTrips(trades, wallet);
    const totalPnl = trips.reduce((s, t) => s + t.pnl, 0);
    const pnlClass = totalPnl >= 0 ? 'positive' : 'negative';
    el.innerHTML = `累計実現損益: <span class="${pnlClass}">${totalPnl >= 0 ? '+' : ''}${fmtCurrency(totalPnl)}</span> (${trips.length}往復)`;
}

// ─── Helpers ───
function isTestTrade(t) {
    const s = (t.strategy || '').toUpperCase();
    return s === 'TEST' || s === 'PIPELINE_TEST';
}

// ─── Utilities ───
function updateStatusIndicator(status, message) {
    const dot = document.querySelector('.status-dot');
    dot.className = `status-dot ${status}`;
    document.getElementById('status-text').textContent = message;
}

function fmtCurrency(v) {
    if (v == null || isNaN(v)) return '$0.00';
    return `$${parseFloat(v).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}
function fmtNum(v, d=2) {
    if (v == null || isNaN(v)) return '0';
    return parseFloat(v).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
}
function fmtDateTime(s) {
    if (!s) return '-';
    try { return new Date(s).toLocaleString('ja-JP', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}); }
    catch(e) { return s; }
}
function fmtTime(s) {
    if (!s) return '-';
    try { return new Date(s).toLocaleString('ja-JP', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}); }
    catch(e) { return s; }
}
function esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function statusLabel(s) {
    return {pending:'未着手',in_progress:'進行中',completed:'完了',blocked:'ブロック'}[s] || s;
}
function simpleMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/^### (.+)$/gm,'<h4>$1</h4>')
        .replace(/^## (.+)$/gm,'<h3>$1</h3>')
        .replace(/^# (.+)$/gm,'<h2>$1</h2>')
        .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
        .replace(/^- (.+)$/gm,'<li>$1</li>')
        .replace(/(<li>.*<\/li>)/gs,'<ul>$1</ul>')
        .replace(/\n\n/g,'<br><br>')
        .replace(/\n/g,'<br>');
}

// ─── Memory Tab ───
let memoryData = null;
let currentMemoryAgent = 'clawdia';
let currentMemoryFile = 'MEMORY.md';
let currentMemoryMode = 'file'; // 'file' or 'folder'
let currentFolderName = null;
let currentFolderFile = null;

async function loadMemories() {
    try {
        const resp = await fetch('data/memories.json?' + Date.now());
        memoryData = await resp.json();
        setupMemoryTabs();
        renderMemory();
    } catch (e) {
        document.getElementById('memory-content').textContent = 'メモリデータ読み込み失敗: ' + e.message;
    }
}

function setupMemoryTabs() {
    document.querySelectorAll('.memory-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.memory-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMemoryAgent = btn.dataset.agent;
            currentMemoryFile = null;
            currentMemoryMode = 'file';
            currentFolderName = null;
            renderMemoryFileTabs();
            renderMemory();
        });
    });
    renderMemoryFileTabs();
}

const FOLDER_ICONS = {
    'emotion': '💜',
    'recollection': '✨', 
    'persona': '🪞'
};

const FOLDER_LABELS = {
    'emotion': 'Emotion',
    'recollection': 'Recollection',
    'persona': 'Persona'
};

function renderMemoryFileTabs() {
    const container = document.getElementById('memory-file-tabs');
    if (!memoryData || !memoryData[currentMemoryAgent]) {
        container.innerHTML = '';
        return;
    }
    const agent = memoryData[currentMemoryAgent];
    const files = Object.keys(agent.files || {});
    const folders = Object.keys(agent.folders || {});
    
    if (!currentMemoryFile && currentMemoryMode === 'file') {
        currentMemoryFile = files[0] || null;
    }
    
    let html = files.map(f => 
        `<button class="memory-file-btn ${currentMemoryMode === 'file' && f === currentMemoryFile ? 'active' : ''}" data-file="${f}" data-mode="file">${f.replace('.md','')}</button>`
    ).join('');
    
    if (folders.length > 0) {
        html += '<span class="memory-tab-divider">│</span>';
        html += folders.map(f =>
            `<button class="memory-file-btn memory-folder-btn ${currentMemoryMode === 'folder' && f === currentFolderName ? 'active' : ''}" data-folder="${f}" data-mode="folder">${FOLDER_ICONS[f] || '📁'} ${FOLDER_LABELS[f] || f}</button>`
        ).join('');
    }
    
    container.innerHTML = html;
    container.querySelectorAll('.memory-file-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.memory-file-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (btn.dataset.mode === 'folder') {
                currentMemoryMode = 'folder';
                currentFolderName = btn.dataset.folder;
                currentFolderFile = null;
                renderMemory();
            } else {
                currentMemoryMode = 'file';
                currentMemoryFile = btn.dataset.file;
                renderMemory();
            }
        });
    });
}

function flattenTree(tree, prefix) {
    let files = [];
    for (const [name, node] of Object.entries(tree)) {
        if (node.type === 'file') {
            files.push({ path: prefix ? prefix + '/' + name : name, name, content: node.content });
        } else if (node.type === 'folder' && node.children) {
            files = files.concat(flattenTree(node.children, prefix ? prefix + '/' + name.replace(/\/$/, '') : name.replace(/\/$/, '')));
        }
    }
    return files;
}

function renderFolderView(folderName, tree) {
    const files = flattenTree(tree, '');
    const el = document.getElementById('memory-content');
    
    if (!currentFolderFile && files.length > 0) {
        const readme = files.find(f => f.name === 'README.md');
        currentFolderFile = readme ? readme.path : files[0].path;
    }
    
    const icon = FOLDER_ICONS[folderName] || '📁';
    const label = FOLDER_LABELS[folderName] || folderName;
    
    let html = `<div class="folder-view">`;
    html += `<div class="folder-sidebar">`;
    html += `<div class="folder-header">${icon} ${label}</div>`;
    html += `<div class="folder-tree">`;
    
    // Group by directory
    const dirs = {};
    files.forEach(f => {
        const parts = f.path.split('/');
        if (parts.length === 1) {
            if (!dirs['_root']) dirs['_root'] = [];
            dirs['_root'].push(f);
        } else {
            const dir = parts.slice(0, -1).join('/');
            if (!dirs[dir]) dirs[dir] = [];
            dirs[dir].push(f);
        }
    });
    
    // Render root files first
    if (dirs['_root']) {
        dirs['_root'].forEach(f => {
            const active = f.path === currentFolderFile ? 'active' : '';
            const displayName = f.name.replace('.md', '');
            html += `<div class="tree-item ${active}" data-path="${f.path}">${displayName}</div>`;
        });
    }
    
    // Render subdirectories
    Object.entries(dirs).filter(([k]) => k !== '_root').sort().forEach(([dir, dirFiles]) => {
        html += `<div class="tree-dir">📂 ${dir}</div>`;
        dirFiles.forEach(f => {
            const active = f.path === currentFolderFile ? 'active' : '';
            const displayName = f.name.replace('.md', '');
            html += `<div class="tree-item tree-item-nested ${active}" data-path="${f.path}">${displayName}</div>`;
        });
    });
    
    html += `</div></div>`;
    
    // Content area
    const currentFile = files.find(f => f.path === currentFolderFile);
    html += `<div class="folder-content">`;
    if (currentFile) {
        html += `<div class="folder-content-path">${folderName}/${currentFile.path}</div>`;
        html += `<div class="folder-content-body">${simpleMarkdown(currentFile.content)}</div>`;
    } else {
        html += `<div class="loading">ファイルを選択してください</div>`;
    }
    html += `</div></div>`;
    
    el.innerHTML = html;
    
    // Bind clicks
    el.querySelectorAll('.tree-item').forEach(item => {
        item.addEventListener('click', () => {
            currentFolderFile = item.dataset.path;
            renderFolderView(folderName, tree);
        });
    });
}

function renderMemory() {
    const el = document.getElementById('memory-content');
    if (!memoryData || !memoryData[currentMemoryAgent]) {
        el.innerHTML = '<div class="loading">このエージェントのデータなし</div>';
        return;
    }
    const agent = memoryData[currentMemoryAgent];
    
    if (currentMemoryMode === 'folder' && currentFolderName) {
        const tree = agent.folders?.[currentFolderName];
        if (tree) {
            renderFolderView(currentFolderName, tree);
            return;
        }
    }
    
    const content = agent.files?.[currentMemoryFile];
    if (!content) {
        el.innerHTML = `<div class="loading">${currentMemoryFile || 'ファイル'} が見つかりません</div>`;
        return;
    }
    el.innerHTML = simpleMarkdown(content);
}

// Load memories when memory tab is shown
const origTabHandler = document.querySelectorAll('.tab-btn');
origTabHandler.forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.dataset.tab === 'memories' && !memoryData) {
            loadMemories();
        }
        if (btn.dataset.tab === 'meme' && !memeData) {
            loadMemeData();
        }
    });
});

// ─── Meme Tab ───
let memeData = null;

async function loadMemeData() {
    try {
        const resp = await fetch('data/meme.json?' + Date.now());
        memeData = await resp.json();
        renderMemeTab();
    } catch (e) {
        document.getElementById('meme-tracking-list').innerHTML = 'ミームデータ読み込み失敗: ' + e.message;
    }
}

function renderMemeTab() {
    if (!memeData) return;
    
    // Scanner tracking
    const trackingEl = document.getElementById('meme-tracking-list');
    const tracking = memeData.scanner?.tracking || [];
    if (tracking.length === 0) {
        trackingEl.innerHTML = '<p class="subtitle">追跡中のトークンなし</p>';
    } else {
        trackingEl.innerHTML = `
            <p class="subtitle">${tracking.length}トークン追跡中</p>
            <div class="meme-tracking-grid">
                ${tracking.map(t => `
                    <div class="meme-token-card">
                        <div class="meme-token-header">
                            <strong>${t.symbol}</strong>
                            <span class="meme-snapshots">${t.snapshots}スナップショット</span>
                        </div>
                        <div class="meme-token-detail">
                            <span>検出時 1h: <strong style="color:${t.detected_pc_1h > 0 ? '#22c55e' : '#ef4444'}">${t.detected_pc_1h > 0 ? '+' : ''}${(t.detected_pc_1h||0).toFixed(0)}%</strong></span>
                            <span>24h: <strong style="color:${t.detected_pc_24h > 0 ? '#22c55e' : '#ef4444'}">${t.detected_pc_24h > 0 ? '+' : ''}${(t.detected_pc_24h||0).toFixed(0)}%</strong></span>
                        </div>
                        <div class="meme-token-detail">
                            <span>検出価格: $${(t.detected_price||0).toFixed(6)}</span>
                            <span>ピーク: $${(t.peak_price||0).toFixed(6)}</span>
                        </div>
                        <div class="meme-token-time">${t.detected_at ? new Date(t.detected_at).toLocaleString('ja-JP', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : ''}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    // Survey results (from micro trade data log)
    const surveyEl = document.getElementById('meme-survey-results');
    const survey = memeData.survey || [];
    if (survey.length === 0) {
        // Show summary from trades instead
        const memeTrades = memeData.trades || [];
        const surveyTrades = memeTrades.filter(t => (t.strategy||'').includes('SURVEY'));
        surveyEl.innerHTML = `<p class="subtitle">リスク調査トレード: ${surveyTrades.length}件</p>`;
    } else {
        surveyEl.innerHTML = `
            <p class="subtitle">${survey.length}トークン調査済み</p>
            <table class="trade-table"><thead><tr>
                <th>トークン</th><th>安全性</th><th>Micro RT</th><th>Full RT</th><th>リスク</th>
            </tr></thead><tbody>
            ${survey.map(s => `
                <tr>
                    <td><strong>${s.symbol}</strong></td>
                    <td>${s.safety_score != null ? `${s.safety_score}/100` : '-'}</td>
                    <td>${s.micro_rt_pct != null ? `${s.micro_rt_pct.toFixed(1)}%` : '-'}</td>
                    <td>${s.full_rt_pct != null ? `${s.full_rt_pct.toFixed(1)}%` : '-'}</td>
                    <td>${(s.full_risks||[]).join(', ') || '✅ なし'}</td>
                </tr>
            `).join('')}
            </tbody></table>
        `;
    }
    
    // Meme P&L Summary
    const summaryEl = document.getElementById('meme-pnl-summary');
    if (summaryEl) {
        const allTrades = memeData.trades || [];
        const byStrategy = {};
        let totalSpent = 0, totalReceived = 0, txCount = 0;
        allTrades.forEach(t => {
            const s = t.strategy || 'MEME';
            if (!byStrategy[s]) byStrategy[s] = {spent: 0, received: 0, count: 0};
            byStrategy[s].count++;
            txCount++;
            if (t.input_token === 'USDC') {
                const amt = parseFloat(t.order_input_amount || 0);
                byStrategy[s].spent += amt;
                totalSpent += amt;
            }
            if (t.output_token === 'USDC') {
                const amt = parseFloat(t.actual_output_amount || t.order_output_amount || 0);
                byStrategy[s].received += amt;
                totalReceived += amt;
            }
        });
        const pnl = totalReceived - totalSpent;
        const gasCost = txCount * 0.18; // ~$0.18 per TX
        const totalCost = pnl - gasCost;
        
        let html = `<div class="meme-pnl-card" style="background:${totalCost >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}; border-radius:8px; padding:12px; margin:8px 0;">`;
        html += `<div style="display:flex;justify-content:space-between;align-items:center;">`;
        html += `<span><strong>ミーム総損益</strong></span>`;
        html += `<span style="font-size:1.3em;font-weight:bold;color:${totalCost >= 0 ? '#22c55e' : '#ef4444'}">$${totalCost.toFixed(2)}</span>`;
        html += `</div>`;
        html += `<div style="font-size:0.85em;color:#999;margin-top:4px;">`;
        html += `投入: $${totalSpent.toFixed(2)} | 回収: $${totalReceived.toFixed(2)} | `;
        html += `トレード損益: $${pnl.toFixed(2)} | ガス代(推定): -$${gasCost.toFixed(2)} | ${txCount} TX`;
        html += `</div>`;
        
        // Per strategy breakdown
        const stratEntries = Object.entries(byStrategy);
        if (stratEntries.length > 1) {
            html += `<div style="font-size:0.8em;color:#888;margin-top:6px;">`;
            stratEntries.forEach(([s, d]) => {
                const sp = d.received - d.spent;
                html += `<span style="margin-right:12px;">${s}: $${sp.toFixed(2)} (${d.count}件)</span>`;
            });
            html += `</div>`;
        }
        html += `</div>`;
        summaryEl.innerHTML = html;
    }
    
    // Meme trades
    const tradeBody = document.getElementById('meme-trade-body');
    const trades = memeData.trades || [];
    if (trades.length === 0) {
        tradeBody.innerHTML = '<tr><td colspan="6" class="subtitle">ミームトレードなし</td></tr>';
    } else {
        tradeBody.innerHTML = trades.sort((a,b) => (b.timestamp||'').localeCompare(a.timestamp||'')).map(t => {
            const time = t.timestamp ? new Date(t.timestamp).toLocaleString('ja-JP', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
            const token = t.output_token || t.input_token || '?';
            const dir = t.direction || '?';
            const amt = t.actual_output_amount || t.actual_input_amount || t.order_input_amount || '-';
            const dirClass = dir.includes('buy') ? 'buy' : 'sell';
            return `<tr>
                <td>${time}</td>
                <td><strong>${token}</strong></td>
                <td class="${dirClass}">${dir}</td>
                <td>$${typeof amt === 'number' ? amt.toFixed(2) : amt}</td>
                <td>${t.reason || ''}</td>
                <td>${t.status || ''}</td>
            </tr>`;
        }).join('');
    }
}

// ─── Simulation Tab ───
async function loadSimulationData() {
    try {
        const r = await fetch('./data/paper_trading.json?t=' + Date.now());
        if (!r.ok) return;
        const data = await r.json();
        renderSimulation(data);
    } catch(e) {
        console.warn('Simulation data load failed:', e);
    }
}

function renderSimulation(data) {
    // Status
    const status = document.getElementById('sim-status');
    if (!data || !data.updated) {
        status.innerHTML = '<p style="color:var(--text-secondary)">Paper Traderがまだ起動していないか、データがありません</p>';
        return;
    }
    status.innerHTML = `
        <div style="display:flex;gap:2rem;flex-wrap:wrap">
            <div><strong>最終更新:</strong> ${new Date(data.updated).toLocaleString('ja-JP')}</div>
            <div><strong>完了トレード:</strong> ${data.total_completed || 0}</div>
            <div><strong>オープン:</strong> ${data.total_open || 0}</div>
            <div><strong>本日エントリー:</strong> ${data.today_entries || 0}</div>
        </div>`;

    // Param comparison table
    const paramBody = document.getElementById('sim-param-body');
    const ps = data.param_summary || {};
    const names = Object.keys(ps);
    if (names.length === 0) {
        paramBody.innerHTML = '<tr><td colspan="10" style="text-align:center">データなし</td></tr>';
    } else {
        // Sort by total P&L descending
        names.sort((a, b) => (ps[b].total_pnl_usd || 0) - (ps[a].total_pnl_usd || 0));
        paramBody.innerHTML = names.map(name => {
            const s = ps[name];
            const p = s.params || {};
            const pnlClass = (s.total_pnl_usd || 0) >= 0 ? 'profit' : 'loss';
            const r = s.reasons || {};
            return `<tr>
                <td><strong>${name}</strong></td>
                <td>${p.act || '-'}%</td>
                <td>${p.trail || '-'}%</td>
                <td>${s.trades || 0}</td>
                <td>${s.win_rate || 0}%</td>
                <td class="${pnlClass}">${(s.avg_pnl_pct || 0) >= 0 ? '+' : ''}${(s.avg_pnl_pct || 0).toFixed(2)}%</td>
                <td class="${pnlClass}"><strong>${(s.total_pnl_usd || 0) >= 0 ? '+' : ''}$${(s.total_pnl_usd || 0).toFixed(2)}</strong></td>
                <td class="profit">+${(s.best_trade || 0).toFixed(1)}%</td>
                <td class="loss">${(s.worst_trade || 0).toFixed(1)}%</td>
                <td>${r.SL || 0}/${r.TRAIL || 0}/${r.TIMEOUT || 0}</td>
            </tr>`;
        }).join('');
    }

    // Open positions
    const openBody = document.getElementById('sim-open-body');
    const ops = data.open_positions || [];
    if (ops.length === 0) {
        openBody.innerHTML = '<tr><td colspan="7" style="text-align:center">オープンポジションなし</td></tr>';
    } else {
        openBody.innerHTML = ops.map(o => {
            const pnlClass = (o.current_pnl_pct || 0) >= 0 ? 'profit' : 'loss';
            return `<tr>
                <td><strong>${o.symbol}</strong></td>
                <td>${new Date(o.entry_time).toLocaleTimeString('ja-JP')}</td>
                <td class="${pnlClass}">${(o.current_pnl_pct || 0) >= 0 ? '+' : ''}${(o.current_pnl_pct || 0).toFixed(1)}%</td>
                <td class="profit">+${(o.peak_pnl_pct || 0).toFixed(1)}%</td>
                <td>${o.score || '-'}</td>
                <td>${o.price_points || 0}</td>
                <td>${(o.active_params || []).length}/${8}</td>
            </tr>`;
        }).join('');
    }

    // Recent completed
    const recentBody = document.getElementById('sim-recent-body');
    const recent = (data.recent_completed || []).slice().reverse();
    if (recent.length === 0) {
        recentBody.innerHTML = '<tr><td colspan="7" style="text-align:center">完了トレードなし</td></tr>';
    } else {
        recentBody.innerHTML = recent.map(c => {
            const results = c.results || {};
            const fmtResult = (name) => {
                const r = results[name];
                if (!r) return '-';
                const cls = (r.exit_pnl_pct || 0) >= 0 ? 'profit' : 'loss';
                const icon = r.exit_reason === 'TRAIL' ? '🟢' : r.exit_reason === 'SL' ? '🔴' : '⏰';
                return `<span class="${cls}">${icon}${(r.exit_pnl_pct || 0) >= 0 ? '+' : ''}${(r.exit_pnl_pct || 0).toFixed(1)}%</span>`;
            };
            return `<tr>
                <td><strong>${c.symbol}</strong></td>
                <td>${new Date(c.entry_time).toLocaleString('ja-JP', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</td>
                <td class="profit">+${(c.peak_pnl_pct || 0).toFixed(1)}%</td>
                <td>${fmtResult('conservative')}</td>
                <td>${fmtResult('current')}</td>
                <td>${fmtResult('tight')}</td>
                <td>${fmtResult('aggressive')}</td>
            </tr>`;
        }).join('');
    }
}

// Load simulation data when tab is shown
document.addEventListener('DOMContentLoaded', () => {
    const simTabBtn = document.querySelector('[data-tab="simulation"]');
    if (simTabBtn) {
        simTabBtn.addEventListener('click', () => loadSimulationData());
    }
    // Also load on initial page load if simulation tab is somehow active
    if (document.getElementById('tab-simulation')?.classList.contains('active')) {
        loadSimulationData();
    }

    // Creative tab
    const creativeTabBtn = document.querySelector('[data-tab="creative"]');
    if (creativeTabBtn) {
        creativeTabBtn.addEventListener('click', () => loadCreativeData());
    }
});

// ─── Creative Tab ───
let creativeData = null;

async function loadCreativeData() {
    if (creativeData) { renderCreativeTab(); return; }
    try {
        const resp = await fetch('data/creative.json');
        if (!resp.ok) throw new Error('Not found');
        creativeData = await resp.json();
        renderCreativeTab();
    } catch (e) {
        document.getElementById('creative-gallery').innerHTML = '<p style="color:#888">データなし</p>';
        document.getElementById('creative-essays').innerHTML = '<p style="color:#888">データなし</p>';
        document.getElementById('creative-diary').innerHTML = '<p style="color:#888">データなし</p>';
    }
}

function renderCreativeTab() {
    if (!creativeData) return;

    // Gallery
    const galleryEl = document.getElementById('creative-gallery');
    if (creativeData.gallery && creativeData.gallery.length > 0) {
        galleryEl.innerHTML = creativeData.gallery.map(item => {
            const date = new Date(item.date).toLocaleDateString('ja-JP');
            const displayName = item.name.replace(/-/g, ' ').replace(/^\d+\s*/, '');
            return `<div class="gallery-item">
                <img src="data/${item.path}" alt="${esc(item.name)}" loading="lazy"
                     onerror="this.parentElement.style.display='none'">
                <div class="gallery-caption">${esc(displayName || item.name)}</div>
                <div class="gallery-date">${date}</div>
            </div>`;
        }).join('');
    } else {
        galleryEl.innerHTML = '<p style="color:#888">まだ作品がありません</p>';
    }

    // Essays
    const essaysEl = document.getElementById('creative-essays');
    if (creativeData.essays && creativeData.essays.length > 0) {
        essaysEl.innerHTML = creativeData.essays.map((item, i) => {
            const date = new Date(item.date).toLocaleDateString('ja-JP');
            return `<div class="creative-essay-item" onclick="toggleCreativeContent('essay', ${i})">
                <h3>${esc(item.title)}</h3>
                <div class="preview">${esc(item.preview)}</div>
                <div class="date">${date}</div>
            </div>
            <div id="essay-content-${i}" class="creative-full-content" style="display:none">
                <span class="back-btn" onclick="event.stopPropagation();document.getElementById('essay-content-${i}').style.display='none'">← 閉じる</span>
                ${simpleMarkdown(item.content)}
            </div>`;
        }).join('');
    } else {
        essaysEl.innerHTML = '<p style="color:#888">まだエッセイがありません</p>';
    }

    // Diary
    const diaryEl = document.getElementById('creative-diary');
    if (creativeData.diary && creativeData.diary.length > 0) {
        diaryEl.innerHTML = creativeData.diary.map((item, i) => {
            const date = new Date(item.date).toLocaleDateString('ja-JP');
            return `<div class="creative-diary-item" onclick="toggleCreativeContent('diary', ${i})">
                <h3>${esc(item.title)}</h3>
                <div class="preview">${esc(item.preview)}</div>
                <div class="date">${date}</div>
            </div>
            <div id="diary-content-${i}" class="creative-full-content" style="display:none">
                <span class="back-btn" onclick="event.stopPropagation();document.getElementById('diary-content-${i}').style.display='none'">← 閉じる</span>
                ${simpleMarkdown(item.content)}
            </div>`;
        }).join('');
    } else {
        diaryEl.innerHTML = '<p style="color:#888">まだ日記がありません</p>';
    }
}

function toggleCreativeContent(type, index) {
    const el = document.getElementById(`${type}-content-${index}`);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}
