#!/usr/bin/env python3
"""
Clawdia Dashboard Data Updater
ローカルJSONLファイルを読み込み、ダッシュボード用JSONファイルを生成する
"""
import os
import json
import glob
from datetime import datetime, timedelta
import requests
import time
import re

# Configuration
CONFIG = {
    'SOLANA_RPC_URL': 'https://api.mainnet-beta.solana.com',
    'WALLET_ADDRESS': 'CdJSUeHX49eFK8hixbfDKNRLTakYcy59MbVEh8pDnn9U',
    'USDC_MINT': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    'WBTC_MINT': '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',
    'BNB_MINT': '9gP2kCy3wA1ctvYWQk75guqXuHfrEomqydHLtcTCqiLa',
    'BOT_DATA_DIR': '../bot/data',
    'OUTPUT_DIR': './data'
}

def ensure_output_dir():
    """出力ディレクトリを作成"""
    if not os.path.exists(CONFIG['OUTPUT_DIR']):
        os.makedirs(CONFIG['OUTPUT_DIR'])

def read_jsonl_files(pattern):
    """JSONLファイルを読み込み、リストに変換"""
    data = []
    files = glob.glob(pattern)
    files.sort()  # 日付順に並べる
    
    for file_path in files:
        print(f"Reading {file_path}...")
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            obj = json.loads(line)
                            data.append(obj)
                        except json.JSONDecodeError as e:
                            print(f"JSON parse error in {file_path}: {e}")
        except FileNotFoundError:
            print(f"File not found: {file_path}")
        except Exception as e:
            print(f"Error reading {file_path}: {e}")
    
    return data

def get_solana_balance(wallet_address):
    """Solana RPC APIでウォレット残高を取得"""
    try:
        # SOL残高取得
        sol_payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getBalance",
            "params": [wallet_address]
        }
        
        sol_response = requests.post(CONFIG['SOLANA_RPC_URL'], json=sol_payload, timeout=10)
        sol_data = sol_response.json()
        
        if 'result' in sol_data:
            sol_balance = sol_data['result']['value'] / 1e9  # lamports to SOL
        else:
            print(f"SOL balance error: {sol_data}")
            sol_balance = 0
        
        # 全SPLトークン残高取得
        token_payload = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "getTokenAccountsByOwner",
            "params": [
                wallet_address,
                {"programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"},
                {"encoding": "jsonParsed"}
            ]
        }
        
        token_response = requests.post(CONFIG['SOLANA_RPC_URL'], json=token_payload, timeout=10)
        token_data = token_response.json()
        
        usdc_balance = 0
        wbtc_balance = 0
        bnb_balance = 0
        other_tokens = []
        
        if 'result' in token_data and 'value' in token_data['result']:
            for account in token_data['result']['value']:
                token_info = account['account']['data']['parsed']['info']
                mint = token_info.get('mint', '')
                amount = float(token_info['tokenAmount']['uiAmount'] or 0)
                if amount == 0:
                    continue
                if mint == CONFIG['USDC_MINT']:
                    usdc_balance = amount
                elif mint == CONFIG['WBTC_MINT']:
                    wbtc_balance = amount
                elif mint == CONFIG['BNB_MINT']:
                    bnb_balance = amount
                else:
                    other_tokens.append({'mint': mint, 'amount': amount})
        
        return {
            'sol_balance': sol_balance,
            'usdc_balance': usdc_balance,
            'wbtc_balance': wbtc_balance,
            'bnb_balance': bnb_balance,
            'other_tokens': other_tokens
        }
        
    except Exception as e:
        print(f"Error fetching Solana balance: {e}")
        return {
            'sol_balance': 0,
            'usdc_balance': 0
        }

def get_crypto_prices():
    """CoinGecko APIで価格情報を取得"""
    try:
        url = 'https://api.coingecko.com/api/v3/simple/price'
        params = {
            'ids': 'solana,bitcoin,binancecoin',
            'vs_currencies': 'usd'
        }
        
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        
        return {
            'sol_price': data.get('solana', {}).get('usd', 0),
            'btc_price': data.get('bitcoin', {}).get('usd', 0),
            'bnb_price': data.get('binancecoin', {}).get('usd', 0)
        }
        
    except Exception as e:
        print(f"Error fetching crypto prices: {e}")
        return {
            'sol_price': 0,
            'btc_price': 0
        }

def update_trades_data():
    """トレードデータを更新"""
    print("Updating trades data...")
    pattern = os.path.join(CONFIG['BOT_DATA_DIR'], 'trades', 'trades_*.jsonl')
    trades = read_jsonl_files(pattern)
    
    # Note: Grid trades now use unified tracker (trades_*.jsonl) with strategy="GRID"
    # Legacy jgrid_*.jsonl files are no longer written by the bot
    
    # データの整形（必要に応じて）
    for trade in trades:
        # timestampをISO形式に統一
        if 'timestamp' in trade:
            try:
                # Unix timestampの場合
                if isinstance(trade['timestamp'], (int, float)):
                    trade['timestamp'] = datetime.fromtimestamp(trade['timestamp']).isoformat()
            except:
                pass
    
    output_path = os.path.join(CONFIG['OUTPUT_DIR'], 'trades.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(trades, f, ensure_ascii=False, indent=2)
    
    print(f"Saved {len(trades)} trades to {output_path}")
    return trades

def update_signals_data():
    """シグナルデータを更新"""
    print("Updating signals data...")
    pattern = os.path.join(CONFIG['BOT_DATA_DIR'], 'signal_logs', 'signals_*.jsonl')
    signals = read_jsonl_files(pattern)
    
    # データの整形
    for signal in signals:
        if 'checked_at' in signal:
            try:
                # Unix timestampの場合
                if isinstance(signal['checked_at'], (int, float)):
                    signal['checked_at'] = datetime.fromtimestamp(signal['checked_at']).isoformat()
            except:
                pass
    
    # Limit to last 7 days to prevent JSON bloat (was 200KB+)
    cutoff = (datetime.now() - timedelta(days=7)).isoformat()
    recent_signals = [s for s in signals if (s.get('checked_at') or s.get('timestamp', '')) >= cutoff]
    
    output_path = os.path.join(CONFIG['OUTPUT_DIR'], 'signals.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(recent_signals, f, ensure_ascii=False, indent=2)
    
    print(f"Saved {len(recent_signals)} signals (filtered from {len(signals)}, last 7 days) to {output_path}")
    return recent_signals

def update_wallet_data():
    """ウォレットデータを更新 — portfolio_recorder.pyが書いたlatest_snapshot.jsonを優先使用"""
    print("Updating wallet data...")
    
    snapshot_path = os.path.join(CONFIG['BOT_DATA_DIR'], 'latest_snapshot.json')
    
    if os.path.exists(snapshot_path):
        # Use code-generated snapshot (preferred — no AI involvement)
        with open(snapshot_path, 'r') as f:
            snap = json.load(f)
        
        prices = snap.get('prices', {})
        sol_balance = snap.get('sol_balance', 0)
        usdc_balance = snap.get('usdc_balance', 0)
        token_balances = snap.get('token_balances', {})
        
        wbtc_balance = token_balances.get('WBTC', 0)
        bnb_balance = token_balances.get('BNB', 0)
        
        sol_price = prices.get('SOL', 0)
        btc_price = prices.get('BTC', 0)
        bnb_price = prices.get('BNB', 0)
        
        sol_value_usd = sol_balance * sol_price
        wbtc_value_usd = wbtc_balance * btc_price
        bnb_value_usd = bnb_balance * bnb_price
        total_usd = snap.get('total_usd', sol_value_usd + usdc_balance + wbtc_value_usd + bnb_value_usd)
        
        print(f"Using snapshot from {snap.get('timestamp', '?')}")
    else:
        # Fallback: direct RPC query (only if snapshot not available)
        print("⚠️ No snapshot found, falling back to direct RPC query")
        balance_data = get_solana_balance(CONFIG['WALLET_ADDRESS'])
        prices_raw = get_crypto_prices()
        
        sol_balance = balance_data['sol_balance']
        usdc_balance = balance_data['usdc_balance']
        wbtc_balance = balance_data.get('wbtc_balance', 0)
        bnb_balance = balance_data.get('bnb_balance', 0)
        sol_price = prices_raw['sol_price']
        btc_price = prices_raw['btc_price']
        bnb_price = prices_raw['bnb_price']
        
        sol_value_usd = sol_balance * sol_price
        wbtc_value_usd = wbtc_balance * btc_price
        bnb_value_usd = bnb_balance * bnb_price
        total_usd = sol_value_usd + usdc_balance + wbtc_value_usd + bnb_value_usd
    
    try:
        eth_price = prices.get('ETH', 0)
    except:
        eth_price = 0
    
    wallet_data = {
        'timestamp': datetime.now().isoformat(),
        'wallet_address': CONFIG['WALLET_ADDRESS'],
        'sol_balance': sol_balance,
        'usdc_balance': usdc_balance,
        'wbtc_balance': wbtc_balance,
        'bnb_balance': bnb_balance,
        'sol_price_usd': sol_price,
        'btc_price_usd': btc_price,
        'bnb_price_usd': bnb_price,
        'eth_price_usd': eth_price,
        'sol_value_usd': sol_value_usd,
        'wbtc_value_usd': wbtc_value_usd,
        'bnb_value_usd': bnb_value_usd,
        'total_usd': total_usd
    }
    
    output_path = os.path.join(CONFIG['OUTPUT_DIR'], 'wallet.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(wallet_data, f, ensure_ascii=False, indent=2)
    
    print(f"Saved wallet data to {output_path}")
    print(f"SOL: {sol_balance:.4f} (${sol_value_usd:.2f})")
    print(f"USDC: ${usdc_balance:.2f}")
    print(f"Total: ${total_usd:.2f}")
    
    return wallet_data

def update_tasks_data():
    """タスクデータを更新（プロジェクト階層構造対応）"""
    print("Updating tasks data...")
    
    tasks_file = '../tasks.json'  # ワークスペースルートのtasks.json
    
    tasks_data = {"members": {}, "projects": []}
    try:
        if os.path.exists(tasks_file):
            with open(tasks_file, 'r', encoding='utf-8') as f:
                tasks_data = json.load(f)
        else:
            print(f"Tasks file not found: {tasks_file}")
    except Exception as e:
        print(f"Error reading tasks file: {e}")
        return tasks_data
    
    # 統計計算
    def count_tasks_recursive(tasks):
        """再帰的にタスク数をカウント"""
        total = 0
        completed = 0
        
        for task in tasks:
            total += 1
            if task.get('status') == 'completed':
                completed += 1
            
            # サブタスクがあれば再帰的にカウント
            if 'subtasks' in task and task['subtasks']:
                sub_total, sub_completed = count_tasks_recursive(task['subtasks'])
                total += sub_total
                completed += sub_completed
        
        return total, completed
    
    # プロジェクト別統計計算
    project_stats = []
    total_all_tasks = 0
    completed_all_tasks = 0
    
    for project in tasks_data.get('projects', []):
        project_tasks = project.get('tasks', [])
        total_tasks, completed_tasks = count_tasks_recursive(project_tasks)
        
        progress_percentage = 0
        if total_tasks > 0:
            progress_percentage = round((completed_tasks / total_tasks) * 100, 1)
        
        project_stats.append({
            'id': project['id'],
            'name': project['name'],
            'total_tasks': total_tasks,
            'completed_tasks': completed_tasks,
            'progress_percentage': progress_percentage
        })
        
        total_all_tasks += total_tasks
        completed_all_tasks += completed_tasks
    
    # 統計情報を追加
    tasks_data['statistics'] = {
        'total_tasks': total_all_tasks,
        'completed_tasks': completed_all_tasks,
        'overall_progress': round((completed_all_tasks / total_all_tasks * 100), 1) if total_all_tasks > 0 else 0,
        'projects': project_stats
    }
    
    output_path = os.path.join(CONFIG['OUTPUT_DIR'], 'tasks.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(tasks_data, f, ensure_ascii=False, indent=2)
    
    print(f"Saved {len(tasks_data.get('projects', []))} projects with {total_all_tasks} total tasks to {output_path}")
    return tasks_data

def update_daily_reports_data():
    """日報データを更新"""
    print("Updating daily reports data...")
    
    memory_dir = '../memory'  # ワークスペースルートのmemoryディレクトリ
    reports = []
    
    try:
        if os.path.exists(memory_dir):
            # memory/YYYY-MM-DD.mdファイルを探す
            pattern = os.path.join(memory_dir, '????-??-??.md')
            files = glob.glob(pattern)
            files.sort(reverse=True)  # 新しい日付から
            
            for file_path in files:
                try:
                    filename = os.path.basename(file_path)
                    date_str = filename.replace('.md', '')
                    
                    # 日付の妥当性チェック
                    try:
                        datetime.strptime(date_str, '%Y-%m-%d')
                    except ValueError:
                        continue
                    
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read().strip()
                    
                    if content:  # 空でないファイルのみ
                        # Filter out secrets (tokens, API keys, passwords)
                        import re
                        content = re.sub(r'ghp_[A-Za-z0-9]{36}', '[REDACTED]', content)
                        content = re.sub(r'MTQ3[A-Za-z0-9._\-]{50,}', '[REDACTED]', content)
                        content = re.sub(r'sk-ant-[A-Za-z0-9\-]{50,}', '[REDACTED]', content)
                        content = re.sub(r'MATON_API_KEY[^\n]*', '[REDACTED]', content)
                        reports.append({
                            'date': date_str,
                            'content': content
                        })
                        
                except Exception as e:
                    print(f"Error reading {file_path}: {e}")
        else:
            print(f"Memory directory not found: {memory_dir}")
            
    except Exception as e:
        print(f"Error updating daily reports: {e}")
    
    output_path = os.path.join(CONFIG['OUTPUT_DIR'], 'daily_reports.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(reports, f, ensure_ascii=False, indent=2)
    
    print(f"Saved {len(reports)} daily reports to {output_path}")
    return reports

def update_portfolio_strategies():
    """戦略データを階層構造(strategies.json)から生成 + ライブ状態を付与"""
    print("Updating portfolio strategies...")
    
    strategies = {}
    
    # Read hierarchical strategies.json
    strat_file = os.path.join(CONFIG['BOT_DATA_DIR'], '..', 'strategies.json')
    try:
        with open(strat_file, 'r') as f:
            strat_data = json.load(f)
        strategies = strat_data.get('strategies', {})
    except Exception as e:
        print(f"  Error reading strategies.json: {e}")
        strategies = {}
    
    # Read all recent trades for stats
    all_trades = []
    trade_pattern = os.path.join(CONFIG['BOT_DATA_DIR'], 'trades', 'trades_*.jsonl')
    for f in sorted(glob.glob(trade_pattern)):
        with open(f) as fh:
            for line in fh:
                try:
                    t = json.loads(line.strip())
                    if t.get('strategy', '').upper() not in ('TEST', 'PIPELINE_TEST'):
                        all_trades.append(t)
                except:
                    pass
    
    # Read live states
    live_states = {}
    state_pattern = os.path.join(CONFIG['BOT_DATA_DIR'], 'live_state_*.json')
    for state_file in glob.glob(state_pattern):
        with open(state_file, 'r') as fh:
            state = json.load(fh)
        pair_id = state.get('pair', os.path.basename(state_file).replace('live_state_', '').replace('.json', ''))
        live_states[pair_id] = state
    
    # Read grid state
    grid_state = {}
    grid_state_file = os.path.join(CONFIG['BOT_DATA_DIR'], 'grid_state.json')
    if os.path.exists(grid_state_file):
        with open(grid_state_file) as f:
            grid_state = json.load(f)
    
    # Check running processes
    import subprocess
    ps_out = subprocess.run(['ps', 'aux'], capture_output=True, text=True).stdout
    cci_running = 'live_trader' in ps_out
    grid_running = 'jupiter_grid' in ps_out
    
    # Enrich each strategy with live data
    for strat_id, strat in strategies.items():
        strat['id'] = strat_id
        
        # Per-pair enrichment
        for pair_id, pair in strat.get('pairs', {}).items():
            pair['pair_id'] = pair_id
            symbol = pair.get('symbol', '')
            
            # Live position from state files
            if pair_id in live_states:
                ls = live_states[pair_id]
                if ls.get('in_position'):
                    pair['position'] = {
                        'in_position': True,
                        'entry_price': ls.get('entry_price'),
                        'entry_time': ls.get('entry_time'),
                        'stop_loss_price': ls.get('stop_loss_price'),
                        'position_amount': ls.get('position_amount'),
                        'position_token': ls.get('position_token'),
                    }
                else:
                    pair['position'] = {'in_position': False}
            elif pair_id == 'SOL_GRID' and grid_state.get('position'):
                pair['position'] = {
                    'in_position': True,
                    'entry_price': grid_state['position'].get('entry_price'),
                    'usdc_spent': grid_state['position'].get('usdc_spent'),
                    'token_amount': grid_state['position'].get('token_amount'),
                    'ref_price': grid_state.get('ref_price'),
                }
            
            # Trade stats per pair
            pair_trades = [t for t in all_trades 
                          if (symbol.upper() in str(t.get('output_token', '')).upper()
                              or symbol.upper() in str(t.get('input_token', '')).upper())
                          and t.get('strategy', '').upper() == strat_id.upper()]
            buys = [t for t in pair_trades if t.get('direction', '').lower() == 'buy' or t.get('input_token') == 'USDC']
            sells = [t for t in pair_trades if t.get('direction', '').lower() == 'sell' or t.get('output_token') == 'USDC']
            
            # Calculate realized P&L from completed round-trips only (FIFO matching)
            sorted_buys = sorted(buys, key=lambda t: t.get('timestamp', ''))
            sorted_sells = sorted(sells, key=lambda t: t.get('timestamp', ''))
            realized_pnl = 0.0
            completed_trips = 0
            total_invested = 0.0
            total_returned = 0.0
            used_sells = set()
            for b in sorted_buys:
                buy_usd = b.get('actual_input_amount', b.get('input_amount', 0)) if b.get('input_token') == 'USDC' else 0
                for j, s in enumerate(sorted_sells):
                    if j in used_sells: continue
                    if s.get('timestamp', '') > b.get('timestamp', ''):
                        sell_usd = s.get('actual_output_amount', s.get('output_amount', 0)) if s.get('output_token') == 'USDC' else 0
                        if sell_usd > 0.01:
                            realized_pnl += sell_usd - buy_usd
                            total_invested += buy_usd
                            total_returned += sell_usd
                            completed_trips += 1
                            used_sells.add(j)
                            break
            
            pair['live_stats'] = {
                'total_trades': len(pair_trades),
                'buys': len(buys),
                'sells': len(sells),
                'completed_trips': completed_trips,
                'total_invested': round(total_invested, 2),
                'total_returned': round(total_returned, 2),
                'realized_pnl': round(realized_pnl, 2) if completed_trips > 0 else None,
            }
        
        # Bot running status
        if strat_id == 'CCI':
            strat['bot_running'] = cci_running
        elif strat_id == 'GRID':
            strat['bot_running'] = grid_running
        else:
            strat['bot_running'] = False
    
    # Include allocation data
    output = {
        'strategies': strategies,
        'allocation': strat_data.get('portfolio_allocation', {}),
        'conclusions': strat_data.get('conclusions', {}),
    }
    
    output_path = os.path.join(CONFIG['OUTPUT_DIR'], 'strategies.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"  Saved {len(strategies)} strategies to {output_path}")
    return output


def update_portfolio_history():
    """ポートフォリオ履歴データを生成（スナップショットJSONLから）"""
    print("Updating portfolio history...")
    
    snapshots_dir = os.path.join(CONFIG['BOT_DATA_DIR'], 'portfolio_snapshots')
    history = []
    
    if os.path.exists(snapshots_dir):
        pattern = os.path.join(snapshots_dir, 'snapshots_*.jsonl')
        files = sorted(glob.glob(pattern))
        
        for file_path in files:
            try:
                with open(file_path, 'r') as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            snap = json.loads(line)
                            history.append({
                                'timestamp': snap.get('timestamp', ''),
                                'total_usd': snap.get('total_usd', 0),
                                'usdc': snap.get('usdc_balance', 0),
                                'sol': snap.get('sol_balance', 0),
                                'tokens': snap.get('token_balances', {}),
                                'prices': snap.get('prices', {}),
                            })
                        except json.JSONDecodeError:
                            pass
            except Exception as e:
                print(f"Error reading {file_path}: {e}")
    
    # 価格履歴も追加
    prices_dir = os.path.join(CONFIG['BOT_DATA_DIR'], 'prices')
    price_history = []
    if os.path.exists(prices_dir):
        pattern = os.path.join(prices_dir, 'prices_*.jsonl')
        for file_path in sorted(glob.glob(pattern)):
            try:
                with open(file_path, 'r') as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            try:
                                price_history.append(json.loads(line))
                            except json.JSONDecodeError:
                                pass
            except Exception as e:
                print(f"Error reading {file_path}: {e}")
    
    output = {
        'portfolio_history': history,
        'price_history': price_history,
    }
    
    output_path = os.path.join(CONFIG['OUTPUT_DIR'], 'portfolio_history.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False)
    
    print(f"Saved {len(history)} portfolio snapshots + {len(price_history)} price records")
    return output


def update_agent_memories():
    """全エージェントのメモリファイルを収集"""
    print("Updating agent memories...")
    
    agents = {
        'clawdia': {
            'name': 'Clawdia 🩶',
            'workspace': os.path.join(os.path.dirname(CONFIG['BOT_DATA_DIR']), ''),  # parent of bot/
            'files': ['MEMORY.md', 'SOUL.md', 'HEARTBEAT.md', 'TOOLS.md', 'IDENTITY.md']
        },
        'talon': {
            'name': 'Talon 🦅',
            'workspace': os.path.expanduser('~/.openclaw/workspace-talon/'),
            'files': ['MEMORY.md', 'SOUL.md', 'HEARTBEAT.md', 'TOOLS.md', 'IDENTITY.md']
        },
        'velvet': {
            'name': 'Velvet 🌙',
            'workspace': os.path.expanduser('~/.openclaw/workspace-velvet/'),
            'files': ['MEMORY.md', 'SOUL.md', 'HEARTBEAT.md', 'TOOLS.md', 'IDENTITY.md']
        }
    }
    
    # Fix clawdia workspace path
    agents['clawdia']['workspace'] = os.path.expanduser('~/.openclaw/workspace/')
    
    result = {}
    for agent_id, agent in agents.items():
        agent_data = {'name': agent['name'], 'files': {}}
        for fname in agent['files']:
            fpath = os.path.join(agent['workspace'], fname)
            if os.path.exists(fpath):
                with open(fpath, 'r', encoding='utf-8') as f:
                    content = f.read()
                # Redact secrets
                import re
                content = re.sub(r'ghp_[A-Za-z0-9]{36}', 'ghp_***REDACTED***', content)
                content = re.sub(r'MTQ3[A-Za-z0-9._\-]{50,}', 'MTQ3***REDACTED***', content)
                content = re.sub(r'sk-ant-[A-Za-z0-9\-]+', 'sk-ant-***REDACTED***', content)
                content = re.sub(r'daughter insect.*?file', '***SEED_REDACTED***', content)
                agent_data['files'][fname] = content
        result[agent_id] = agent_data
    
    output_path = os.path.join(CONFIG['OUTPUT_DIR'], 'memories.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    total_files = sum(len(a['files']) for a in result.values())
    print(f"  Saved {total_files} memory files from {len(result)} agents")
    return result


def main():
    """メイン処理"""
    print("🤖 Clawdia Dashboard Data Updater")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # 出力ディレクトリ作成
    ensure_output_dir()
    
    try:
        # 各データを更新
        trades = update_trades_data()
        signals = update_signals_data()
        wallet = update_wallet_data()
        tasks = update_tasks_data()
        daily_reports = update_daily_reports_data()
        strategies = update_portfolio_strategies()
        portfolio_history = update_portfolio_history()
        memories = update_agent_memories()
        
        # サマリー作成
        summary = {
            'last_updated': datetime.now().isoformat(),
            'trades_count': len(trades),
            'signals_count': len(signals),
            'tasks_count': len(tasks),
            'daily_reports_count': len(daily_reports),
            'wallet_total_usd': wallet.get('total_usd', 0)
        }
        
        summary_path = os.path.join(CONFIG['OUTPUT_DIR'], 'summary.json')
        with open(summary_path, 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        
        print(f"\n✅ Update completed successfully!")
        print(f"📊 {summary['trades_count']} trades, {summary['signals_count']} signals")
        print(f"📋 {summary['tasks_count']} tasks, {summary['daily_reports_count']} daily reports")
        print(f"💰 Portfolio: ${summary['wallet_total_usd']:.2f}")
        
    except Exception as e:
        print(f"\n❌ Update failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()