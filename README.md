# 🤖 Clawdia Trading Dashboard v2

ローカルファイルベースの静的ダッシュボード（Google Sheets連携廃止版）

## 🚀 クイックスタート

### 1. データ更新
```bash
cd dashboard
python3 update_data.py
```

### 2. ダッシュボード起動
```bash
python3 -m http.server 8080
```

ブラウザで http://localhost:8080 を開く

## 📁 ファイル構成

```
dashboard/
├── index.html          # メインHTML
├── dashboard.js        # メインJavaScript
├── styles.css          # CSS（ダークテーマ・モバイルファースト）
├── update_data.py      # データ更新スクリプト
├── data/               # 生成されたJSONデータ（gitignore済み）
│   ├── trades.json     # トレード履歴
│   ├── signals.json    # シグナル履歴
│   ├── wallet.json     # ウォレット残高・価格情報
│   └── summary.json    # サマリー
└── .gitignore          # dataフォルダ除外
```

## 🔧 機能

### ポートフォリオ概要
- 総資産（USD換算）
- SOL残高・USDC残高  
- 現在のSOL価格

### トレード履歴
- 全トレード一覧テーブル
- フィルタ機能：
  - 期間フィルタ（日付範囲）
  - トークンフィルタ
  - ステータスフィルタ（成功/失敗）
- CSVエクスポート

### 損益サマリー
- 総トレード数・成功率
- 手数料合計

### シグナル分析
- CCI値・BTC価格のチャート表示
- 期間切り替え（1日/7日/30日）
- 現在のポジション状態

## 🔄 データソース

- **トレードログ**: `../bot/data/trades/trades_YYYY-MM-DD.jsonl`
- **シグナルログ**: `../bot/data/signal_logs/signals_YYYY-MM-DD.jsonl`
- **ウォレット残高**: Solana RPC API
- **価格情報**: CoinGecko API

## ⚡ 自動化

定期実行でデータを更新：
```bash
# crontabに追加
*/15 * * * * cd /path/to/dashboard && python3 update_data.py
```

## 📱 デザイン

- **ダークテーマ**（既存スタイル踏襲）
- **モバイルファースト**（レスポンシブ）
- **日本語UI**
- Chart.js を使用

## 🗑️ 削除されたファイル

- `demo.html`, `demo-dashboard.js` (デモ用)
- `netlify/` フォルダ (Netlify Functions)  
- `netlify.toml`, `package.json` (設定ファイル)

Google Sheets連携コードも全て削除済み。