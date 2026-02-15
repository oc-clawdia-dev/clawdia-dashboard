// Demo Configuration (no API keys exposed)
const CONFIG = {
    WALLET_ADDRESS: 'CdJSUeHX49eFK8hixbfDKNRLTakYcy59MbVEh8pDnn9U',
    USDC_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    TRADING_LOG_SHEET_ID: '1_08wUlbcDSMVdQN_DN6CzCzMYQQhRHhUtxt0N5MRBM4',
    DAILY_REPORT_SHEET_ID: '1Yquzd8icvINBFFLhMbg1YSfo16Yf1_SIasGEx_w0L00',
    PROJECT_OVERVIEW_DOC_ID: '10NyFE-AdHMxFcDU1Y2godseURs7PFAfMYw_BgTsz5Hg'
};

// Global state
let portfolioChart = null;

// Utility functions
function formatCurrency(amount, currency = 'USD') {
    if (currency === 'USD') {
        return '$' + amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else if (currency === 'SOL') {
        return amount.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + ' SOL';
    }
    return amount.toString();
}

function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('ja-JP', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = `<div class="error">${message}</div>`;
    }
}

// Demo data functions (using public APIs only)
async function fetchSolanaBalance() {
    try {
        const response = await fetch('https://api.mainnet-beta.solana.com', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getBalance',
                params: [CONFIG.WALLET_ADDRESS]
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        return data.result ? data.result.value / 1000000000 : 0;
    } catch (error) {
        console.error('SOL balance error:', error);
        return 2.45; // Demo fallback
    }
}

async function fetchUSDCBalance() {
    try {
        const response = await fetch('https://api.mainnet-beta.solana.com', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTokenAccountsByOwner',
                params: [
                    CONFIG.WALLET_ADDRESS,
                    { mint: CONFIG.USDC_MINT },
                    { encoding: 'jsonParsed' }
                ]
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        if (data.result && data.result.value.length > 0) {
            const balance = data.result.value[0].account.data.parsed.info.tokenAmount.uiAmount;
            return balance || 0;
        }
        return 0;
    } catch (error) {
        console.error('USDC balance error:', error);
        return 1250.00; // Demo fallback
    }
}

async function fetchSOLPrice() {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        return data.solana?.usd || 95.50;
    } catch (error) {
        console.error('SOL price error:', error);
        return 95.50; // Demo fallback
    }
}

// Data loading functions
async function loadPortfolioData() {
    try {
        const [solBalance, usdcBalance, solPrice] = await Promise.all([
            fetchSolanaBalance(),
            fetchUSDCBalance(),
            fetchSOLPrice()
        ]);
        
        const solValueUSD = solBalance * solPrice;
        const totalBalance = solValueUSD + usdcBalance;
        
        document.getElementById('sol-balance').textContent = formatCurrency(solBalance, 'SOL');
        document.getElementById('usdc-balance').textContent = formatCurrency(usdcBalance);
        document.getElementById('total-balance').textContent = formatCurrency(totalBalance);
        
        // Demo P&L (positive example)
        const pnl = 45.67;
        document.getElementById('total-pnl').textContent = formatCurrency(pnl);
        document.getElementById('total-pnl').className = `value ${pnl >= 0 ? 'positive' : 'negative'}`;
        
        // Update portfolio chart
        updatePortfolioChart(solValueUSD, usdcBalance);
        
        updateStatus('connected', 'オンライン (デモモード)');
        
    } catch (error) {
        console.error('Portfolio data error:', error);
        showError('total-balance', '残高データの取得に失敗しました');
    }
}

async function loadTradingHistory() {
    // Demo trading data
    const demoTrades = [
        ['BONK', 'SELL', '2024-02-15 09:30:00', '100', '12.45'],
        ['WIF', 'BUY', '2024-02-15 08:15:00', '200', '-5.23'],
        ['PEPE', 'SELL', '2024-02-14 16:45:00', '150', '23.12'],
        ['MAGA', 'SELL', '2024-02-14 14:20:00', '75', '8.89'],
        ['DOGE', 'BUY', '2024-02-14 11:30:00', '300', '-15.67'],
        ['SHIB', 'SELL', '2024-02-13 19:10:00', '500', '34.56'],
        ['FLOKI', 'SELL', '2024-02-13 15:25:00', '80', '7.23'],
        ['SAMO', 'BUY', '2024-02-13 12:40:00', '120', '-3.45']
    ];
    
    const tradeList = document.getElementById('trade-list');
    tradeList.innerHTML = `
        <div class="trade-header">
            <span style="color: var(--accent-yellow);">⚠️ デモデータ</span>
            <a href="https://docs.google.com/spreadsheets/d/${CONFIG.TRADING_LOG_SHEET_ID}/edit" 
               target="_blank" class="link-button">
                📊 実際のTrading Logを見る
            </a>
        </div>
        ${demoTrades.map(trade => {
            const [symbol, side, date, amount, pnl] = trade;
            const pnlValue = parseFloat(pnl);
            
            return `
                <div class="trade-item">
                    <div>
                        <div class="trade-symbol">${symbol}</div>
                        <div class="trade-side ${side.toLowerCase()}">${side}</div>
                    </div>
                    <div>
                        <div class="trade-pnl ${pnlValue >= 0 ? 'positive' : 'negative'}">${formatCurrency(pnlValue)}</div>
                        <div style="font-size: 12px; color: var(--text-muted)">${formatDate(date)}</div>
                    </div>
                </div>
            `;
        }).join('')}
    `;
}

async function loadBacktestResults() {
    // Demo backtest data
    const mockResults = [
        { strategy: 'RSI Scalping', return: 15.2, winrate: 68 },
        { strategy: 'MA Cross', return: 8.7, winrate: 45 },
        { strategy: 'Bollinger Bands', return: -2.1, winrate: 38 },
        { strategy: 'MACD Signal', return: 12.4, winrate: 52 }
    ];
    
    const backtestGrid = document.getElementById('backtest-grid');
    backtestGrid.innerHTML = `
        <div style="grid-column: 1/-1; color: var(--accent-yellow); font-size: 12px; text-align: center; margin-bottom: 10px;">
            ⚠️ デモデータ - 実際のバックテスト結果とは異なります
        </div>
        ${mockResults.map(result => `
            <div class="backtest-item">
                <div class="backtest-strategy">${result.strategy}</div>
                <div class="backtest-return ${result.return >= 0 ? 'positive' : 'negative'}">
                    ${result.return >= 0 ? '+' : ''}${result.return}%
                </div>
                <div class="backtest-winrate">勝率: ${result.winrate}%</div>
            </div>
        `).join('')}
    `;
}

async function loadDailyReport() {
    const demoReport = `🤖 Clawdia Trading Bot - 日報 (2024-02-15)

✅ システム状況:
- ボット稼働時間: 24時間
- スキャン完了: 2,847件
- アクティブ戦略: 4種類

📊 トレード実績:
- 取引回数: 12回
- 勝率: 66.7%
- 総損益: +$45.67
- 最大利益取引: BONK売り (+$23.12)

🎯 注目銘柄:
- BONK: 大幅上昇、利確完了
- WIF: 一時的調整、買い増し検討
- PEPE: レンジ相場継続

📝 改善点:
- RSI戦略の精度向上
- 損切りタイミングの最適化

明日の予定: 新しいモメンタム戦略のテスト開始`;
    
    document.getElementById('daily-report').innerHTML = `
        <div class="report-content">
            <div style="color: var(--accent-yellow); font-size: 12px; margin-bottom: 10px;">
                ⚠️ デモデータ
            </div>
            <div style="white-space: pre-wrap; line-height: 1.6; margin-bottom: 15px;">${demoReport}</div>
            <div class="report-links">
                <a href="https://docs.google.com/spreadsheets/d/${CONFIG.DAILY_REPORT_SHEET_ID}/edit" 
                   target="_blank" class="link-button">
                    📝 実際の日報を見る
                </a>
                <a href="https://docs.google.com/document/d/${CONFIG.PROJECT_OVERVIEW_DOC_ID}/edit" 
                   target="_blank" class="link-button">
                    📋 Project Overview
                </a>
            </div>
        </div>
    `;
}

// Chart functions
function updatePortfolioChart(solValue, usdcValue) {
    const ctx = document.getElementById('portfolioChart').getContext('2d');
    
    if (portfolioChart) {
        portfolioChart.destroy();
    }
    
    const total = solValue + usdcValue;
    if (total === 0) {
        portfolioChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['No Data'],
                datasets: [{
                    data: [1],
                    backgroundColor: ['#333333'],
                    borderColor: '#333333',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                }
            }
        });
        return;
    }
    
    portfolioChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['SOL', 'USDC'],
            datasets: [{
                data: [solValue, usdcValue],
                backgroundColor: [
                    '#4488ff',
                    '#00ff88'
                ],
                borderColor: '#333333',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#cccccc',
                        font: { size: 12 }
                    }
                }
            }
        }
    });
}

// Status functions
function updateStatus(status, text) {
    const indicator = document.querySelector('.status-dot');
    const statusText = document.getElementById('status-text');
    const lastUpdate = document.getElementById('last-update');
    
    indicator.className = status === 'connected' ? 'status-dot connected' : 'status-dot';
    statusText.textContent = text;
    lastUpdate.textContent = new Date().toLocaleTimeString('ja-JP', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

function updateSystemStatus() {
    document.getElementById('bot-status').textContent = '稼働中 (デモ)';
    document.getElementById('bot-status').className = 'value positive';
    document.getElementById('scan-progress').textContent = '87/100';
}

// Initialize dashboard
async function initDashboard() {
    updateStatus('connecting', '接続中...');
    
    // Show demo notice
    const demoNotice = document.createElement('div');
    demoNotice.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: linear-gradient(45deg, #ff6b35, #f7931e);
        color: white;
        padding: 8px;
        text-align: center;
        font-size: 12px;
        font-weight: bold;
        z-index: 1000;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;
    demoNotice.innerHTML = '⚠️ デモモード - 一部データは模擬データです | <a href="https://github.com/oc-clawdia/clawdia-dashboard" target="_blank" style="color: white; text-decoration: underline;">GitHubで完全版を見る</a>';
    document.body.insertBefore(demoNotice, document.body.firstChild);
    
    // Adjust main content margin
    document.querySelector('.container').style.marginTop = '40px';
    
    try {
        await Promise.allSettled([
            loadPortfolioData(),
            loadTradingHistory(),
            loadBacktestResults(),
            loadDailyReport()
        ]);
        
        updateSystemStatus();
        
    } catch (error) {
        console.error('Dashboard initialization error:', error);
        updateStatus('error', 'エラー');
    }
}

// Auto refresh every 5 minutes
setInterval(() => {
    loadPortfolioData();
    updateSystemStatus();
}, 5 * 60 * 1000);

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initDashboard);