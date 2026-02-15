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
    """ウォレットデータを更新"""
    print("Updating wallet data...")
    
    # 残高取得
    balance_data = get_solana_balance(CONFIG['WALLET_ADDRESS'])
    
    # 価格情報取得
    prices = get_crypto_prices()
    
    # 総資産計算（USD換算）
    sol_value_usd = balance_data['sol_balance'] * prices['sol_price']
    wbtc_value_usd = balance_data['wbtc_balance'] * prices['btc_price']
    bnb_value_usd = balance_data['bnb_balance'] * prices['bnb_price']
    total_usd = sol_value_usd + balance_data['usdc_balance'] + wbtc_value_usd + bnb_value_usd
    
    wallet_data = {
        'timestamp': datetime.now().isoformat(),
        'wallet_address': CONFIG['WALLET_ADDRESS'],
        'sol_balance': balance_data['sol_balance'],
        'usdc_balance': balance_data['usdc_balance'],
        'wbtc_balance': balance_data['wbtc_balance'],
        'bnb_balance': balance_data['bnb_balance'],
        'other_tokens': balance_data.get('other_tokens', []),
        'sol_price_usd': prices['sol_price'],
        'btc_price_usd': prices['btc_price'],
        'bnb_price_usd': prices['bnb_price'],
        'sol_value_usd': sol_value_usd,
        'wbtc_value_usd': wbtc_value_usd,
        'bnb_value_usd': bnb_value_usd,
        'total_usd': total_usd
    }
    
    output_path = os.path.join(CONFIG['OUTPUT_DIR'], 'wallet.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(wallet_data, f, ensure_ascii=False, indent=2)
    
    print(f"Saved wallet data to {output_path}")
    print(f"SOL: {balance_data['sol_balance']:.4f} (${sol_value_usd:.2f})")
    print(f"USDC: ${balance_data['usdc_balance']:.2f}")
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