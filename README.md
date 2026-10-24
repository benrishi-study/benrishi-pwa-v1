# 弁理士ミニテスト PWA v1.1 — Google Drive同期版

iPad横画面を主役にした、弁理士試験用の○×学習PWAです。MacBookでも同じUIで使えます。

## v1.1 の追加機能
- Google Drive の `questions.xlsx` を問題マスターとして読み込み
- Google Drive の `progress.json` と学習履歴を同期
- iPad / MacBook の回答履歴を回答イベント単位でマージ
- 端末内（localStorage）にも即保存するため、Drive未接続・一時的な通信断でも学習可能
- Drive接続中は回答後に `progress.json` を自動同期
- Google Pickerで対象ファイルをユーザー自身が明示的に選択
- OAuthスコープは `drive.file` のみ

## 重要：config.js を設定する
`config.js` をテキストエディタで開き、Google Cloud Consoleで作成した3つの値を入れます。

```js
window.GOOGLE_DRIVE_CONFIG = {
  clientId: 'ここに OAuth クライアントID',
  apiKey: 'ここに制限済み APIキー',
  appId: 'ここに Google Cloud のプロジェクト番号',
  scope: 'https://www.googleapis.com/auth/drive.file',
  questionsFileName: 'questions.xlsx',
  progressFileName: 'progress.json'
};
```

### 入れてはいけないもの
- **クライアントシークレットは絶対に `config.js` に入れません。**
- ブラウザPWAで使用するのは Client ID / APIキー / プロジェクト番号だけです。

### APIキー側の制限
Google Cloud ConsoleのAPIキー設定は次の状態を想定しています。
- Webサイト: `https://benrishi-study.github.io/*`
- Webサイト: `https://docs.google.com/*`
- API: Google Picker API
- API: Google Drive API

## GitHubへアップロード
既存の `benrishi-pwa-v1` リポジトリに、このv1.1一式をアップロードします。
同名ファイルは更新され、`config.js` と `drive-sync.js` は新規追加されます。

主な更新ファイル：
- `index.html`
- `app.js`
- `styles.css`
- `service-worker.js`
- `README.md`

新規ファイル：
- `config.js`
- `drive-sync.js`

既存の `manifest.webmanifest`、`seed-data.js`、`icons/` もそのまま同梱しています。

## 初回の使い方
1. GitHub PagesのPWAをChromeで開く。
2. ホーム画面の「Google Drive 同期」で **Google Driveに接続** を押す。
3. テストユーザーに登録したGoogleアカウントで許可する。
4. 初回だけ `questions.xlsx` を選択する。
5. 初回だけ `progress.json` を選択する。
6. 「今すぐ同期」を押す。

一度Pickerで選んだファイルは、Googleアカウントとアプリに対してアクセスが許可されます。別端末では接続後にファイル名から自動検出を試み、見つからない場合だけPickerで再選択します。

## 同期の考え方
- 回答した瞬間：端末内へ保存
- Drive接続中：少し待って `progress.json` へ自動同期
- 手動：ホームの「今すぐ同期」
- 複数端末：`attemptLog` の回答イベントを重複排除してマージし、ランク計算用の `progress` を再構成

そのため、MacBookで解いた後にiPadで同期しても、同じ回答を二重加算しない設計です。

## questions.xlsx の必須列
- 問題ID
- 分野
- 単元
- 論点
- 問題文
- 正解（○ または ×）
- 解説
- 条文

シート名は「問題データ」を優先し、次に「ミニテスト試作20問」、なければ先頭シートを読みます。

## progress.json の初期形
```json
{
  "schemaVersion": 1,
  "updatedAt": null,
  "progress": {},
  "attemptLog": []
}
```

## 既存のv1学習履歴
現在のChromeにあるlocalStorageの回答履歴は残ります。
初めて `progress.json` と同期したとき、Drive側の履歴とマージされます。

## オフライン
PWA本体と既存の問題・学習履歴は端末内に残るので、Driveへ接続できない時でも演習はできます。
Googleログイン、Picker、Drive同期にはインターネット接続が必要です。

## 注意
Google OAuthアクセストークンは一定時間で期限切れになります。その場合は「Google Driveに接続」をもう一度押してください。
