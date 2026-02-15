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
        
        # サマリー作成
        summary = {
            'last_updated': datetime.now().isoformat(),
            'trades_count': len(trades),
            'signals_count': len(signals),
            'wallet_total_usd': wallet.get('total_usd', 0)
        }
        
        summary_path = os.path.join(CONFIG['OUTPUT_DIR'], 'summary.json')
        with open(summary_path, 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        
        print(f"\n✅ Update completed successfully!")
        print(f"📊 {summary['trades_count']} trades, {summary['signals_count']} signals")
        print(f"💰 Portfolio: ${summary['wallet_total_usd']:.2f}")
        
    except Exception as e:
        print(f"\n❌ Update failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()