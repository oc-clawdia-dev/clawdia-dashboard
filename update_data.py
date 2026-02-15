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
    
    output_path = os.path.join(CONFIG['OUTPUT_DIR'], 'signals.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(signals, f, ensure_ascii=False, indent=2)
    
    print(f"Saved {len(signals)} signals to {output_path}")
    return signals

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
    """ライブBotの戦略設定一覧を生成"""
    print("Updating portfolio strategies...")
    
    # live_trader.pyからTRADING_PAIRSを読み取る
    live_trader_path = os.path.join(CONFIG['BOT_DATA_DIR'], '..', 'live_trader.py')
    strategies = []
    
    try:
        # Parse TRADING_PAIRS from live_trader.py
        import ast
        with open(live_trader_path, 'r') as f:
            content = f.read()
        
        # Find TRADING_PAIRS dict
        start = content.find('TRADING_PAIRS = {')
        if start >= 0:
            # Find matching closing brace
            depth = 0
            end = start + len('TRADING_PAIRS = ')
            for i, ch in enumerate(content[end:], end):
                if ch == '{':
                    depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
            
            try:
                pairs_str = content[start + len('TRADING_PAIRS = '):end]
                pairs = ast.literal_eval(pairs_str)
                
                for pair_id, config in pairs.items():
                    strat = {
                        "pair_id": pair_id,
                        "strategy": config.get("strategy", "?"),
                        "enabled": config.get("enabled", True),
                        "trade_symbol": config.get("trade_symbol", pair_id[:3]),
                        "params": {},
                    }
                    
                    if config.get("strategy") == "CCI":
                        strat["params"] = {
                            "cci_period": config.get("cci_period"),
                            "cci_threshold": config.get("cci_threshold"),
                            "sl_pct": config.get("sl_pct"),
                            "donchian_period": config.get("donchian_period"),
                            "ema_trend_period": config.get("ema_trend_period", 0),
                        }
                    elif config.get("strategy") == "BOLLINGER":
                        strat["params"] = {
                            "bb_period": config.get("bb_period"),
                            "bb_std": config.get("bb_std"),
                            "ema_fast": config.get("ema_fast"),
                            "ema_slow": config.get("ema_slow"),
                            "rsi_period": config.get("rsi_period"),
                            "rsi_exit": config.get("rsi_exit"),
                            "sl_pct": config.get("sl_pct"),
                        }
                    
                    strategies.append(strat)
            except Exception as e:
                print(f"  Error parsing TRADING_PAIRS: {e}")
    except Exception as e:
        print(f"  Error reading live_trader.py: {e}")
    
    # Add Jupiter Grid Bot info
    try:
        import subprocess
        grid_running = 'jupiter_grid' in subprocess.run(
            ['ps', 'aux'], capture_output=True, text=True).stdout
        
        if grid_running or os.path.exists('/tmp/jupiter_grid.pid'):
            grid_strat = {
                "pair_id": "SOL_GRID",
                "strategy": "GRID",
                "enabled": grid_running,
                "trade_symbol": "SOL",
                "params": {
                    "grid_spacing_pct": 1.5,
                    "tp_pct": 1.5,
                    "sl_pct": 1.5,
                    "budget": 20.0,
                    "exchange": "Jupiter (Solana)",
                },
                "bot_type": "jupiter_grid",
            }
            
            # Read grid trade log for stats
            grid_trades = []
            grid_log_pattern = os.path.join(CONFIG['BOT_DATA_DIR'], 'trades', 'jgrid_*.jsonl')
            for f in sorted(glob.glob(grid_log_pattern)):
                with open(f) as fh:
                    for line in fh:
                        try:
                            grid_trades.append(json.loads(line.strip()))
                        except:
                            pass
            
            buys = [t for t in grid_trades if t.get('action') == 'buy']
            sells_tp = [t for t in grid_trades if t.get('action') == 'sell_tp']
            sells_sl = [t for t in grid_trades if t.get('action') == 'sell_sl']
            
            grid_strat["stats"] = {
                "total_trades": len(buys) + len(sells_tp) + len(sells_sl),
                "buys": len(buys),
                "tp_exits": len(sells_tp),
                "sl_exits": len(sells_sl),
                "win_rate": round(len(sells_tp) / max(len(sells_tp) + len(sells_sl), 1) * 100, 1),
            }
            
            # Check position from grid_state.json
            grid_state_file = os.path.join(CONFIG['BOT_DATA_DIR'], 'grid_state.json')
            if os.path.exists(grid_state_file):
                with open(grid_state_file) as gsf:
                    grid_state = json.load(gsf)
                if grid_state.get('position'):
                    grid_strat["position"] = {
                        "in_position": True,
                        "entry_price": grid_state['position'].get('entry_price'),
                        "usdc_spent": grid_state['position'].get('usdc_spent'),
                        "ref_price": grid_state.get('ref_price'),
                    }
                else:
                    grid_strat["position"] = {"in_position": False, "ref_price": grid_state.get('ref_price')}
            elif buys and len(buys) > len(sells_tp) + len(sells_sl):
                last_buy = buys[-1]
                grid_strat["position"] = {
                    "in_position": True,
                    "entry_time": last_buy.get('timestamp', ''),
                    "usdc_spent": last_buy.get('usdc_spent', 0),
                }
            
            strategies.append(grid_strat)
    except Exception as e:
        print(f"  Error reading grid bot info: {e}")
    
    # Add positions from live_state_*.json files
    try:
        state_pattern = os.path.join(CONFIG['BOT_DATA_DIR'], 'live_state_*.json')
        for state_file in glob.glob(state_pattern):
            with open(state_file, 'r') as fh:
                state = json.load(fh)
            pair_id = state.get('pair', os.path.basename(state_file).replace('live_state_', '').replace('.json', ''))
            for strat in strategies:
                if strat.get('pair_id') == pair_id:
                    if state.get('in_position'):
                        strat['position'] = {
                            'in_position': True,
                            'entry_price': state.get('entry_price'),
                            'entry_time': state.get('entry_time'),
                            'stop_loss_price': state.get('stop_loss_price'),
                            'position_size_usd': state.get('position_size_usd'),
                            'position_token': state.get('position_token'),
                            'position_amount': state.get('position_amount'),
                            'donchian_low': state.get('donchian_low'),
                        }
                    else:
                        strat['position'] = {'in_position': False}
                    break
        
        # Read trade logs for stats
        trade_pattern = os.path.join(CONFIG['BOT_DATA_DIR'], 'trades', 'trades_*.jsonl')
        trade_files = sorted(glob.glob(trade_pattern))
        all_trades = []
        for f in trade_files[-7:]:
            with open(f) as fh:
                for line in fh:
                    try:
                        all_trades.append(json.loads(line.strip()))
                    except:
                        pass
        
        for strat in strategies:
            if strat.get('strategy') == 'CCI':
                symbol = strat.get('trade_symbol', '')
                strat_trades = [t for t in all_trades if symbol.upper() in str(t.get('output_token', '')).upper()
                               or symbol.upper() in str(t.get('input_token', '')).upper()]
                strat["stats"] = {
                    "total_trades": len(strat_trades),
                    "last_7d_trades": len(strat_trades),
                }
    except Exception as e:
        print(f"  Error reading position data: {e}")
    
    output_path = os.path.join(CONFIG['OUTPUT_DIR'], 'strategies.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(strategies, f, ensure_ascii=False, indent=2)
    
    print(f"  Saved {len(strategies)} strategies to {output_path}")
    return strategies


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