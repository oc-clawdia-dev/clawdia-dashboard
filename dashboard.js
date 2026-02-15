// Dashboard State
let dashboardData = {
    trades: [],
    signals: [],
    wallet: null,
    tasks: [],
    dailyReports: [],
    filteredTrades: []
};

let signalChart = null;
let selectedTask = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🤖 Clawdia Dashboard V3 starting...');
    
    // Initialize tabs
    initializeTabs();
    
    // Set default date range (last 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    document.getElementById('date-from').value = formatDateForInput(thirtyDaysAgo);
    document.getElementById('date-to').value = formatDateForInput(today);
    
    // Load data and update UI
    await loadAllData();
    
    // Setup event listeners
    setupEventListeners();
    
    console.log('✅ Dashboard V3 initialized');
});

// Tab System
function initializeTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');
    
    // Handle tab clicks
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    
    // Handle URL hash changes
    window.addEventListener('hashchange', handleHashChange);
    
    // Initialize from URL hash or default to overview
    const hash = window.location.hash.substring(1);
    switchTab(hash || 'overview');
}

function switchTab(tabName) {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');
    
    // Update active tab button
    tabBtns.forEach(btn => {
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Update active tab panel
    tabPanels.forEach(panel => {
        if (panel.id === `tab-${tabName}`) {
            panel.classList.add('active');
        } else {
            panel.classList.remove('active');
        }
    });
    
    // Update URL hash
    window.history.replaceState(null, null, `#${tabName}`);
    
    // Tab-specific initialization
    if (tabName === 'signals' && signalChart) {
        signalChart.resize();
    }
}

function handleHashChange() {
    const hash = window.location.hash.substring(1);
    if (hash) switchTab(hash);
}

// Data loading functions
async function loadAllData() {
    updateStatusIndicator('loading', 'データ読み込み中...');
    
    try {
        // Load all data sources
        await Promise.all([
            loadWalletData(),
            loadTradesData(),
            loadSignalsData(),
            loadTasksData(),
            loadDailyReportsData()
        ]);
        
        // Update UI with loaded data
        updatePortfolioSection();
        updateTasksSection();
        updateDailyReportsSection();
        updatePnLSummary();
        applyFilters();
        updateSignalStatus();
        setupSignalChart();
        
        updateStatusIndicator('online', '接続中');
        
    } catch (error) {
        console.error('Data loading error:', error);
        updateStatusIndicator('offline', 'データ読み込みエラー');
        showError('trade-table-body', 'データの読み込みに失敗しました');
    }
}

async function loadWalletData() {
    try {
        const response = await fetch('./data/wallet.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        dashboardData.wallet = await response.json();
        console.log('✅ Wallet data loaded:', dashboardData.wallet);
    } catch (error) {
        console.error('Failed to load wallet data:', error);
        dashboardData.wallet = null;
    }
}

async function loadTradesData() {
    try {
        const response = await fetch('./data/trades.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        dashboardData.trades = await response.json();
        console.log(`✅ ${dashboardData.trades.length} trades loaded`);
        
        // Populate token filter dropdown
        populateTokenFilter();
        
    } catch (error) {
        console.error('Failed to load trades data:', error);
        dashboardData.trades = [];
    }
}

async function loadSignalsData() {
    try {
        const response = await fetch('./data/signals.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        dashboardData.signals = await response.json();
        console.log(`✅ ${dashboardData.signals.length} signals loaded`);
    } catch (error) {
        console.error('Failed to load signals data:', error);
        dashboardData.signals = [];
    }
}

async function loadTasksData() {
    try {
        const response = await fetch('../tasks.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        dashboardData.tasks = await response.json();
        console.log(`✅ ${dashboardData.tasks.length} tasks loaded`);
    } catch (error) {
        console.error('Failed to load tasks data:', error);
        dashboardData.tasks = [];
    }
}

async function loadDailyReportsData() {
    try {
        const response = await fetch('./data/daily_reports.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        dashboardData.dailyReports = await response.json();
        console.log(`✅ ${dashboardData.dailyReports.length} daily reports loaded`);
    } catch (error) {
        console.error('Failed to load daily reports data:', error);
        dashboardData.dailyReports = [];
    }
}

// Portfolio Section Update
function updatePortfolioSection() {
    if (!dashboardData.wallet) {
        console.warn('⚠️ No wallet data available');
        return;
    }

    const wallet = dashboardData.wallet;
    
    // Update balance values
    document.getElementById('total-balance').textContent = formatCurrency(wallet.total_balance_usd);
    document.getElementById('sol-balance').textContent = `${formatNumber(wallet.sol_balance)} SOL`;
    document.getElementById('usdc-balance').textContent = formatCurrency(wallet.usdc_balance);
    document.getElementById('wbtc-balance').textContent = `${formatNumber(wallet.wbtc_balance, 6)} WBTC`;
    document.getElementById('sol-price').textContent = formatCurrency(wallet.sol_price_usd);
    
    // Handle BNB balance (hide if 0)
    const bnbItem = document.getElementById('bnb-item');
    const bnbBalance = document.getElementById('bnb-balance');
    if (wallet.bnb_balance > 0) {
        bnbBalance.textContent = `${formatNumber(wallet.bnb_balance, 4)} BNB`;
        bnbItem.style.display = 'block';
    } else {
        bnbItem.style.display = 'none';
    }
    
    // Update last updated timestamp
    if (wallet.last_updated) {
        document.getElementById('last-updated').textContent = 
            `最終更新: ${formatDateTime(wallet.last_updated)}`;
    }
}

// Signal Status Update (fixing BTC price source)
function updateSignalStatus() {
    if (!dashboardData.wallet || dashboardData.signals.length === 0) {
        document.getElementById('signal-status').innerHTML = '<div class="loading">データ不足</div>';
        return;
    }
    
    // Get latest signal
    const latestSignal = dashboardData.signals[dashboardData.signals.length - 1];
    
    // Use wallet.json for BTC price (more reliable than signals.json)
    const btcPrice = dashboardData.wallet.btc_price_usd || 0;
    const position = dashboardData.wallet.wbtc_balance > 0 ? 'IN' : 'OUT';
    
    const html = `
        <div class="signal-grid">
            <div class="signal-item">
                <div class="value">${formatCurrency(btcPrice)}</div>
                <div class="label">BTC価格 (USD)</div>
            </div>
            <div class="signal-item">
                <div class="value ${position === 'IN' ? 'positive' : 'negative'}">${position}</div>
                <div class="label">ポジション</div>
            </div>
            <div class="signal-item">
                <div class="value">${latestSignal.ema_200 ? '✅' : '❌'}</div>
                <div class="label">EMA200</div>
            </div>
            <div class="signal-item">
                <div class="value">${latestSignal.cci_signal || '-'}</div>
                <div class="label">CCI</div>
            </div>
            <div class="signal-item">
                <div class="value">${latestSignal.trend || 'NEUTRAL'}</div>
                <div class="label">トレンド</div>
            </div>
            <div class="signal-item">
                <div class="value">${formatDateTime(latestSignal.timestamp)}</div>
                <div class="label">最終更新</div>
            </div>
        </div>
    `;
    
    document.getElementById('signal-status').innerHTML = html;
}

// Tasks Section Update with Enhanced Features
function updateTasksSection() {
    if (dashboardData.tasks.length === 0) {
        document.getElementById('tasks-container').innerHTML = '<div class="loading">タスクデータがありません</div>';
        return;
    }
    
    // Update task statistics
    updateTaskStatistics();
    
    // Render task list
    renderTaskList();
}

function updateTaskStatistics() {
    const tasks = dashboardData.tasks;
    const today = new Date().toISOString().split('T')[0];
    
    // Calculate statistics
    const completedToday = tasks.filter(task => 
        task.status === 'completed' && 
        task.completed_at && 
        task.completed_at.startsWith(today)
    ).length;
    
    // Estimation accuracy
    const completedWithEstimates = tasks.filter(task => 
        task.status === 'completed' && 
        task.estimated_hours && 
        task.actual_hours
    );
    
    let estimationAccuracy = 0;
    if (completedWithEstimates.length > 0) {
        const accuracySum = completedWithEstimates.reduce((acc, task) => {
            const accuracy = Math.min(task.actual_hours / task.estimated_hours, 2); // Cap at 200%
            return acc + accuracy;
        }, 0);
        estimationAccuracy = Math.round((accuracySum / completedWithEstimates.length) * 100);
    }
    
    // Progress by assignee
    const assignees = ['clawdia', 'talon', 'velvet'];
    const progressData = {};
    
    assignees.forEach(assignee => {
        const assigneeTasks = tasks.filter(task => task.assignee === assignee);
        const completed = assigneeTasks.filter(task => task.status === 'completed').length;
        progressData[assignee] = assigneeTasks.length > 0 ? 
            Math.round((completed / assigneeTasks.length) * 100) : 0;
    });
    
    // Update DOM
    document.getElementById('tasks-today-completed').textContent = completedToday;
    document.getElementById('tasks-estimation-accuracy').textContent = `${estimationAccuracy}%`;
    document.getElementById('tasks-clawdia-progress').textContent = `${progressData.clawdia}%`;
    document.getElementById('tasks-talon-progress').textContent = `${progressData.talon}%`;
    document.getElementById('tasks-velvet-progress').textContent = `${progressData.velvet}%`;
}

function renderTaskList() {
    const container = document.getElementById('tasks-container');
    
    if (dashboardData.tasks.length === 0) {
        container.innerHTML = '<div class="no-data">タスクがありません</div>';
        return;
    }
    
    // Apply filters
    const filteredTasks = getFilteredTasks();
    
    const html = filteredTasks.map(task => `
        <div class="task-item ${selectedTask && selectedTask.id === task.id ? 'selected' : ''}" 
             onclick="selectTask('${task.id}')">
            <div class="task-header">
                <div class="task-info">
                    <div class="task-title">${escapeHtml(task.title)}</div>
                    <div class="task-meta">
                        <span class="task-id">${task.id}</span>
                        <span class="task-time">${formatDateTime(task.created_at)}</span>
                    </div>
                </div>
                <div class="task-badges">
                    <span class="badge status-${task.status}">${getStatusDisplay(task.status)}</span>
                    <span class="badge priority-${task.priority}">${getPriorityDisplay(task.priority)}</span>
                    <span class="badge assignee-badge">${getAssigneeDisplay(task.assignee)}</span>
                </div>
            </div>
            <div class="task-description">${escapeHtml(task.description || '')}</div>
            ${task.estimated_hours ? `
                <div class="task-estimate">
                    見積: ${task.estimated_hours}h
                    ${task.actual_hours ? ` / 実績: ${task.actual_hours}h` : ''}
                </div>
            ` : ''}
        </div>
    `).join('');
    
    container.innerHTML = html;
}

function getFilteredTasks() {
    let filtered = [...dashboardData.tasks];
    
    // Apply status filter
    const statusFilter = document.getElementById('task-status-filter').value;
    if (statusFilter) {
        filtered = filtered.filter(task => task.status === statusFilter);
    }
    
    // Apply assignee filter
    const assigneeFilter = document.getElementById('task-assignee-filter').value;
    if (assigneeFilter) {
        filtered = filtered.filter(task => task.assignee === assigneeFilter);
    }
    
    // Apply priority filter
    const priorityFilter = document.getElementById('task-priority-filter').value;
    if (priorityFilter) {
        filtered = filtered.filter(task => task.priority === priorityFilter);
    }
    
    // Sort by created_at desc
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    return filtered;
}

function selectTask(taskId) {
    const task = dashboardData.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    selectedTask = task;
    
    // Update task list selection
    renderTaskList();
    
    // Show task details
    showTaskDetails(task);
}

function showTaskDetails(task) {
    const container = document.getElementById('task-detail-container');
    
    // Update header
    document.getElementById('task-detail-title').textContent = task.title;
    
    // Update badges
    document.getElementById('task-detail-status-badge').textContent = getStatusDisplay(task.status);
    document.getElementById('task-detail-status-badge').className = `badge status-${task.status}`;
    
    document.getElementById('task-detail-priority-badge').textContent = getPriorityDisplay(task.priority);
    document.getElementById('task-detail-priority-badge').className = `badge priority-${task.priority}`;
    
    document.getElementById('task-detail-assignee-badge').textContent = getAssigneeDisplay(task.assignee);
    
    // Update timeline
    document.getElementById('task-detail-created').textContent = formatDateTime(task.created_at);
    document.getElementById('task-detail-started').textContent = 
        task.started_at ? formatDateTime(task.started_at) : '-';
    document.getElementById('task-detail-completed').textContent = 
        task.completed_at ? formatDateTime(task.completed_at) : '-';
    
    // Update timeline dots
    const createdDot = document.querySelector('.timeline-dot.created');
    const startedDot = document.querySelector('.timeline-dot.started');
    const completedDot = document.querySelector('.timeline-dot.completed');
    
    // Reset classes
    [createdDot, startedDot, completedDot].forEach(dot => {
        dot.classList.remove('active', 'completed');
    });
    
    // Update timeline state
    createdDot.classList.add('completed');
    if (task.started_at) {
        startedDot.classList.add('completed');
    }
    if (task.completed_at) {
        completedDot.classList.add('completed');
    }
    
    // Update hours visualization
    const estimated = task.estimated_hours || 0;
    const actual = task.actual_hours || 0;
    
    document.getElementById('task-detail-estimated').textContent = `${estimated}h`;
    document.getElementById('task-detail-actual').textContent = `${actual}h`;
    
    const hoursBar = document.getElementById('task-detail-hours-bar');
    if (estimated > 0) {
        const percentage = Math.min((actual / estimated) * 100, 200); // Cap at 200%
        hoursBar.style.width = `${percentage}%`;
        
        // Color based on efficiency
        if (percentage <= 100) {
            hoursBar.style.background = 'linear-gradient(90deg, var(--accent-green), var(--accent-blue))';
        } else {
            hoursBar.style.background = 'linear-gradient(90deg, var(--accent-yellow), var(--accent-red))';
        }
    } else {
        hoursBar.style.width = '0%';
    }
    
    // Update description
    document.getElementById('task-detail-description-text').textContent = task.description || '説明がありません';
    
    // Update notes
    const notesList = document.getElementById('task-detail-notes-list');
    if (task.notes && task.notes.length > 0) {
        const notesHtml = task.notes.map(note => `
            <div class="task-note-item">
                <div class="task-note-timestamp">${formatTime(note.timestamp)}</div>
                <div class="task-note-text">${escapeHtml(note.text)}</div>
            </div>
        `).join('');
        notesList.innerHTML = notesHtml;
    } else {
        notesList.innerHTML = '<div class="no-data">作業ノートがありません</div>';
    }
    
    // Show container
    container.classList.remove('hidden');
    
    // Scroll into view
    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeTaskDetails() {
    document.getElementById('task-detail-container').classList.add('hidden');
    selectedTask = null;
    renderTaskList();
}

// P&L Summary Update (fixing success count)
function updatePnLSummary() {
    if (dashboardData.trades.length === 0) {
        document.getElementById('total-trades').textContent = '0';
        document.getElementById('successful-trades').textContent = '0';
        document.getElementById('success-rate').textContent = '0%';
        document.getElementById('total-fees').textContent = '0 SOL';
        return;
    }
    
    const trades = dashboardData.trades;
    const totalTrades = trades.length;
    
    // Fix: Count status === 'Success' (not lowercase)
    const successfulTrades = trades.filter(trade => trade.status === 'Success').length;
    const successRate = totalTrades > 0 ? Math.round((successfulTrades / totalTrades) * 100) : 0;
    
    // Calculate total fees
    const totalFees = trades.reduce((sum, trade) => {
        return sum + (parseFloat(trade.fee_amount) || 0);
    }, 0);
    
    // Update DOM
    document.getElementById('total-trades').textContent = totalTrades;
    document.getElementById('successful-trades').textContent = successfulTrades;
    document.getElementById('success-rate').textContent = `${successRate}%`;
    document.getElementById('total-fees').textContent = `${formatNumber(totalFees, 4)} SOL`;
}

// Daily Reports Section Update
function updateDailyReportsSection() {
    const container = document.getElementById('daily-reports-container');
    
    if (dashboardData.dailyReports.length === 0) {
        container.innerHTML = '<div class="loading">日報データがありません</div>';
        return;
    }
    
    const html = dashboardData.dailyReports.slice(0, 10).map(report => `
        <div class="report-item">
            <div class="report-header" onclick="toggleReport('${report.date}')">
                <div class="report-date">${formatDate(report.date)}</div>
                <div class="report-summary">
                    ${report.trades_count || 0}件のトレード
                    ${report.pnl ? ` • P&L: <span class="pnl ${report.pnl >= 0 ? 'positive' : 'negative'}">${report.pnl >= 0 ? '+' : ''}${formatCurrency(report.pnl)}</span>` : ''}
                </div>
                <div class="toggle-icon">▼</div>
            </div>
            <div class="report-content" id="report-${report.date}">
                ${report.content || '詳細情報なし'}
            </div>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

// Filter and Export Functions
function populateTokenFilter() {
    const tokenSelect = document.getElementById('token-filter');
    const tokens = [...new Set(dashboardData.trades.map(trade => trade.token_symbol).filter(Boolean))];
    
    // Clear existing options except "All"
    const allOption = tokenSelect.querySelector('option[value=""]');
    tokenSelect.innerHTML = '';
    tokenSelect.appendChild(allOption);
    
    // Add token options
    tokens.sort().forEach(token => {
        const option = document.createElement('option');
        option.value = token;
        option.textContent = token;
        tokenSelect.appendChild(option);
    });
}

function applyFilters() {
    const fromDate = document.getElementById('date-from').value;
    const toDate = document.getElementById('date-to').value;
    const token = document.getElementById('token-filter').value;
    const status = document.getElementById('status-filter').value;
    
    let filtered = [...dashboardData.trades];
    
    // Apply date filters
    if (fromDate) {
        filtered = filtered.filter(trade => trade.timestamp >= fromDate);
    }
    if (toDate) {
        filtered = filtered.filter(trade => trade.timestamp <= toDate + 'T23:59:59');
    }
    
    // Apply token filter
    if (token) {
        filtered = filtered.filter(trade => trade.token_symbol === token);
    }
    
    // Apply status filter (fix case sensitivity)
    if (status) {
        if (status === 'Success') {
            filtered = filtered.filter(trade => trade.status === 'Success');
        } else {
            filtered = filtered.filter(trade => trade.status !== 'Success');
        }
    }
    
    dashboardData.filteredTrades = filtered;
    updateTradeTable();
}

function resetFilters() {
    document.getElementById('date-from').value = '';
    document.getElementById('date-to').value = '';
    document.getElementById('token-filter').value = '';
    document.getElementById('status-filter').value = '';
    
    dashboardData.filteredTrades = [...dashboardData.trades];
    updateTradeTable();
}

function exportCSV() {
    if (dashboardData.filteredTrades.length === 0) {
        alert('エクスポートするデータがありません');
        return;
    }
    
    const headers = ['日時', 'トークン', 'ペア', 'タイプ', 'ステータス', '数量', '手数料'];
    const rows = dashboardData.filteredTrades.map(trade => [
        trade.timestamp,
        trade.token_symbol || '',
        trade.pair || '',
        trade.type || '',
        trade.status || '',
        trade.amount || '',
        trade.fee_amount || ''
    ]);
    
    const csvContent = [headers, ...rows].map(row => 
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `trades_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}

function updateTradeTable() {
    const tbody = document.getElementById('trade-table-body');
    
    if (dashboardData.filteredTrades.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="no-data">フィルター条件に一致するトレードがありません</td></tr>';
        return;
    }
    
    const html = dashboardData.filteredTrades.slice(0, 100).map(trade => `
        <tr class="trade-row ${trade.status === 'Success' ? 'success' : 'failed'}">
            <td class="trade-timestamp">${formatDateTime(trade.timestamp)}</td>
            <td class="trade-pair">${escapeHtml(trade.pair || trade.token_symbol || '-')}</td>
            <td class="trade-type">${escapeHtml(trade.type || '-')}</td>
            <td class="trade-amount">${trade.amount ? formatNumber(trade.amount, 4) : '-'}</td>
            <td class="trade-status">
                <span class="status-badge ${trade.status === 'Success' ? 'success' : 'failed'}">
                    ${trade.status === 'Success' ? '成功' : '失敗'}
                </span>
            </td>
        </tr>
    `).join('');
    
    tbody.innerHTML = html;
}

// Signal Chart Setup
function setupSignalChart() {
    const ctx = document.getElementById('signalChart').getContext('2d');
    
    if (signalChart) {
        signalChart.destroy();
    }
    
    // Prepare chart data
    const chartData = prepareChartData('1d'); // Default to 1 day
    
    signalChart = new Chart(ctx, {
        type: 'line',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#ffffff'
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#888888' },
                    grid: { color: '#333333' }
                },
                y: {
                    ticks: { color: '#888888' },
                    grid: { color: '#333333' }
                }
            }
        }
    });
}

function prepareChartData(period) {
    if (dashboardData.signals.length === 0) {
        return {
            labels: [],
            datasets: [{
                label: 'BTC価格',
                data: [],
                borderColor: '#4488ff',
                backgroundColor: 'rgba(68, 136, 255, 0.1)',
                fill: true
            }]
        };
    }
    
    // Filter signals based on period
    const now = new Date();
    let cutoffDate;
    
    switch (period) {
        case '1d':
            cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
        case '7d':
            cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case '30d':
            cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        default:
            cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    
    const filteredSignals = dashboardData.signals.filter(signal => 
        new Date(signal.timestamp) >= cutoffDate
    );
    
    return {
        labels: filteredSignals.map(signal => formatTime(signal.timestamp)),
        datasets: [{
            label: 'BTC価格',
            data: filteredSignals.map(signal => signal.btc_price || 0),
            borderColor: '#4488ff',
            backgroundColor: 'rgba(68, 136, 255, 0.1)',
            fill: true
        }]
    };
}

// Event Listeners Setup
function setupEventListeners() {
    // Filter controls
    document.getElementById('apply-filter').addEventListener('click', applyFilters);
    document.getElementById('reset-filter').addEventListener('click', resetFilters);
    document.getElementById('export-csv').addEventListener('click', exportCSV);
    
    // Task filters
    document.getElementById('task-status-filter').addEventListener('change', renderTaskList);
    document.getElementById('task-assignee-filter').addEventListener('change', renderTaskList);
    document.getElementById('task-priority-filter').addEventListener('change', renderTaskList);
    
    // Show completed only button
    document.getElementById('show-completed-only').addEventListener('click', () => {
        document.getElementById('task-status-filter').value = 'completed';
        renderTaskList();
    });
    
    // Task detail close button
    document.getElementById('task-detail-close').addEventListener('click', closeTaskDetails);
    
    // Chart controls
    document.getElementById('chart-1d').addEventListener('click', () => updateChart('1d'));
    document.getElementById('chart-7d').addEventListener('click', () => updateChart('7d'));
    document.getElementById('chart-30d').addEventListener('click', () => updateChart('30d'));
}

function updateChart(period) {
    // Update active button
    document.querySelectorAll('.chart-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`chart-${period}`).classList.add('active');
    
    // Update chart data
    const chartData = prepareChartData(period);
    signalChart.data = chartData;
    signalChart.update();
}

// Utility Functions
function updateStatusIndicator(status, message) {
    const indicator = document.getElementById('status-indicator');
    const dot = indicator.querySelector('.status-dot');
    const text = document.getElementById('status-text');
    
    // Remove existing status classes
    dot.classList.remove('online', 'loading', 'offline');
    
    // Add new status class
    dot.classList.add(status);
    text.textContent = message;
}

function showError(containerId, message) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<div class="error">${message}</div>`;
    }
}

function toggleReport(date) {
    const content = document.getElementById(`report-${date}`);
    const icon = content.parentElement.querySelector('.toggle-icon');
    
    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        icon.textContent = '▼';
    } else {
        content.classList.add('expanded');
        icon.textContent = '▲';
    }
}

// Helper Functions
function getStatusDisplay(status) {
    const statusMap = {
        'pending': '未着手',
        'in_progress': '進行中', 
        'completed': '完了',
        'blocked': 'ブロック'
    };
    return statusMap[status] || status;
}

function getPriorityDisplay(priority) {
    const priorityMap = {
        'high': '高',
        'medium': '中',
        'low': '低'
    };
    return priorityMap[priority] || priority;
}

function getAssigneeDisplay(assignee) {
    const assigneeMap = {
        'clawdia': 'Clawdia',
        'talon': 'Talon',
        'velvet': 'Velvet'
    };
    return assigneeMap[assignee] || assignee;
}

function formatDateTime(dateString) {
    if (!dateString) return '-';
    
    try {
        const date = new Date(dateString);
        return date.toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return dateString;
    }
}

function formatTime(dateString) {
    if (!dateString) return '-';
    
    try {
        const date = new Date(dateString);
        return date.toLocaleString('ja-JP', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return dateString;
    }
}

function formatDate(dateString) {
    if (!dateString) return '-';
    
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    } catch (e) {
        return dateString;
    }
}

function formatDateForInput(date) {
    return date.toISOString().split('T')[0];
}

function formatCurrency(value, decimals = 2) {
    if (value === null || value === undefined || isNaN(value)) return '$0.00';
    
    const num = parseFloat(value);
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function formatNumber(value, decimals = 2) {
    if (value === null || value === undefined || isNaN(value)) return '0';
    
    const num = parseFloat(value);
    return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}