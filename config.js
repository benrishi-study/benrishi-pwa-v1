// Google Drive 同期設定（v1.1）
// ここに Google Cloud Console で作成した値を入力してください。
// ※クライアントシークレットは絶対に入力しません。
// ※APIキーはブラウザ用です。Google Cloud 側で
//   - Webサイト: https://benrishi-study.github.io/* と https://docs.google.com/*
//   - API: Google Picker API / Google Drive API
//   に制限したキーを使用してください。
window.GOOGLE_DRIVE_CONFIG = {
  clientId: '308118422137-sp3c54klrrpbp27i7juqvul1chhaboe6.apps.googleusercontent.com',
  apiKey: 'AIzaSyBzF8wWPSALJixdzSVBtxhGVQLUufhbawE',
  appId: '308118422137',
  scope: 'https://www.googleapis.com/auth/drive.file',
  questionsFileName: 'questions.xlsx',
  progressFileName: 'progress.json'
};
