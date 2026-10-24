(() => {
  'use strict';

  const CONFIG = window.GOOGLE_DRIVE_CONFIG || {};
  const STORAGE_KEY = 'benrishi-drive-files-v1';
  const MAX_ATTEMPTS = 5000;
  const DRIVE_API = 'https://www.googleapis.com/drive/v3';
  const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

  let accessToken = null;
  let tokenExpiresAt = 0;
  let tokenClient = null;
  let pickerReadyPromise = null;
  let syncTimer = null;
  let busy = false;

  const byId = id => document.getElementById(id);
  const clone = value => JSON.parse(JSON.stringify(value));

  function loadSelection() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }
  function saveSelection(value) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }
  let selected = loadSelection();

  function toast(message) {
    if (window.BenrishiApp?.toast) window.BenrishiApp.toast(message);
    else console.log(message);
  }

  function configReady() {
    return Boolean(
      CONFIG.clientId && !String(CONFIG.clientId).startsWith('PASTE_') &&
      CONFIG.apiKey && !String(CONFIG.apiKey).startsWith('PASTE_') &&
      CONFIG.appId && !String(CONFIG.appId).startsWith('PASTE_')
    );
  }

  function tokenValid() {
    return Boolean(accessToken && Date.now() < tokenExpiresAt - 60_000);
  }

  function setBusy(value) {
    busy = value;
    ['drive-connect','pick-questions','pick-progress','sync-drive'].forEach(id => {
      const el = byId(id);
      if (el) el.disabled = value || (id !== 'drive-connect' && !accessToken);
    });
  }

  function renderStatus(message = '') {
    const configured = configReady();
    const connected = tokenValid();
    const status = byId('drive-status');
    const qStatus = byId('drive-questions-status');
    const pStatus = byId('drive-progress-status');
    const connectBtn = byId('drive-connect');
    const syncBtn = byId('sync-drive');
    const qBtn = byId('pick-questions');
    const pBtn = byId('pick-progress');

    if (!configured) {
      status.textContent = 'config.js に Client ID / APIキー / App ID を設定してください。';
      status.className = 'drive-status warning';
    } else if (connected) {
      status.textContent = message || 'Google Driveに接続済みです。';
      status.className = 'drive-status connected';
    } else {
      status.textContent = message || '未接続です。最初にGoogle Driveへ接続してください。';
      status.className = 'drive-status';
    }

    qStatus.textContent = `${CONFIG.questionsFileName || 'questions.xlsx'}：${selected.questions?.name || '未選択'}`;
    pStatus.textContent = `${CONFIG.progressFileName || 'progress.json'}：${selected.progress?.name || '未選択'}`;
    qStatus.classList.toggle('ready', Boolean(selected.questions?.id));
    pStatus.classList.toggle('ready', Boolean(selected.progress?.id));

    if (connectBtn) connectBtn.textContent = connected ? '再接続 / アカウント変更' : 'Google Driveに接続';
    const disabled = !configured || !connected || busy;
    if (qBtn) qBtn.disabled = disabled;
    if (pBtn) pBtn.disabled = disabled;
    if (syncBtn) syncBtn.disabled = disabled || !selected.questions?.id || !selected.progress?.id;
  }

  function waitFor(test, timeout = 12_000, interval = 80) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        try { if (test()) return resolve(); } catch (_) {}
        if (Date.now() - started > timeout) return reject(new Error('Googleライブラリの読み込みがタイムアウトしました。'));
        setTimeout(tick, interval);
      };
      tick();
    });
  }

  async function ensureAuthLibrary() {
    await waitFor(() => window.google?.accounts?.oauth2);
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.clientId,
        scope: CONFIG.scope || 'https://www.googleapis.com/auth/drive.file',
        callback: () => {}
      });
    }
  }

  async function ensurePickerLibrary() {
    if (window.google?.picker?.PickerBuilder) return;
    if (!pickerReadyPromise) {
      pickerReadyPromise = (async () => {
        await waitFor(() => window.gapi?.load);
        await new Promise((resolve, reject) => {
          gapi.load('picker', {
            callback: resolve,
            onerror: () => reject(new Error('Google Picker APIの読み込みに失敗しました。')),
            timeout: 12_000,
            ontimeout: () => reject(new Error('Google Picker APIの読み込みがタイムアウトしました。'))
          });
        });
      })().catch(err => { pickerReadyPromise = null; throw err; });
    }
    return pickerReadyPromise;
  }

  async function authorize({ forceConsent = false } = {}) {
    if (!configReady()) throw new Error('config.js のGoogle設定が未入力です。');
    if (tokenValid() && !forceConsent) return accessToken;
    await ensureAuthLibrary();
    return new Promise((resolve, reject) => {
      tokenClient.callback = response => {
        if (response?.error) return reject(new Error(response.error_description || response.error));
        accessToken = response.access_token;
        tokenExpiresAt = Date.now() + (Number(response.expires_in || 3600) * 1000);
        renderStatus('Google Driveに接続済みです。');
        resolve(accessToken);
      };
      tokenClient.requestAccessToken({ prompt: forceConsent || !accessToken ? 'consent' : '' });
    });
  }

  async function authFetch(url, options = {}) {
    if (!tokenValid()) throw new Error('Google Driveの接続期限が切れました。「Google Driveに接続」を押してください。');
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${accessToken}`);
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
      accessToken = null;
      tokenExpiresAt = 0;
      renderStatus('接続期限が切れました。再接続してください。');
      throw new Error('Google Driveの接続期限が切れました。');
    }
    if (!response.ok) {
      let detail = '';
      try { detail = await response.text(); } catch (_) {}
      throw new Error(`Google Drive API エラー ${response.status}${detail ? `: ${detail.slice(0,180)}` : ''}`);
    }
    return response;
  }

  async function getFileMetadata(fileId) {
    const fields = encodeURIComponent('id,name,mimeType,modifiedTime,size');
    const response = await authFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=${fields}`);
    return response.json();
  }

  async function downloadFile(fileId) {
    return authFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`);
  }

  async function updateJsonFile(fileId, payload) {
    return authFetch(`${DRIVE_UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(payload, null, 2)
    });
  }

  async function discoverAccessibleFiles() {
    const missing = [];
    if (!selected.questions?.id) missing.push(['questions', CONFIG.questionsFileName || 'questions.xlsx']);
    if (!selected.progress?.id) missing.push(['progress', CONFIG.progressFileName || 'progress.json']);
    for (const [kind, name] of missing) {
      const safeName = String(name).replace(/'/g, "\\'");
      const params = new URLSearchParams({
        q: `name='${safeName}' and trashed=false`,
        pageSize: '10',
        spaces: 'drive',
        orderBy: 'modifiedTime desc',
        fields: 'files(id,name,mimeType,modifiedTime)'
      });
      try {
        const response = await authFetch(`${DRIVE_API}/files?${params.toString()}`);
        const data = await response.json();
        if (data.files?.length) {
          const file = data.files[0];
          selected[kind] = { id: file.id, name: file.name };
        }
      } catch (err) {
        console.warn('auto discovery skipped', err);
      }
    }
    saveSelection(selected);
    renderStatus();
  }

  function pickerName(doc) {
    return doc[google.picker.Document.NAME] || doc.name || '';
  }
  function pickerId(doc) {
    return doc[google.picker.Document.ID] || doc.id || '';
  }

  async function pickFile(kind) {
    await authorize();
    await ensurePickerLibrary();
    const expected = kind === 'questions'
      ? (CONFIG.questionsFileName || 'questions.xlsx')
      : (CONFIG.progressFileName || 'progress.json');

    return new Promise((resolve, reject) => {
      const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setMode(google.picker.DocsViewMode.LIST);
      const picker = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .setDeveloperKey(CONFIG.apiKey)
        .setAppId(String(CONFIG.appId))
        .setOrigin(window.location.origin)
        .setMaxItems(1)
        .setTitle(`${expected} を選択`)
        .setCallback(async data => {
          const action = data[google.picker.Response.ACTION];
          if (action === google.picker.Action.CANCEL) return resolve(null);
          if (action !== google.picker.Action.PICKED) return;
          const doc = data[google.picker.Response.DOCUMENTS]?.[0];
          if (!doc) return reject(new Error('ファイル情報を取得できませんでした。'));
          const id = pickerId(doc);
          const name = pickerName(doc);
          if (name !== expected) {
            toast(`${expected} を選択してください（選択: ${name || '不明'}）。`);
            return resolve(null);
          }
          selected[kind] = { id, name };
          saveSelection(selected);
          renderStatus();
          resolve(selected[kind]);
        })
        .build();
      picker.setVisible(true);
    });
  }

  async function loadQuestionsFromDrive() {
    if (!selected.questions?.id) throw new Error('questions.xlsx が未選択です。');
    const meta = await getFileMetadata(selected.questions.id);
    selected.questions.name = meta.name;
    saveSelection(selected);
    const response = await downloadFile(selected.questions.id);
    const buffer = await response.arrayBuffer();
    const parsed = window.BenrishiApp.parseQuestionWorkbook(buffer);
    if (!parsed.bank.length) throw new Error('questions.xlsx に有効な問題がありません。');
    window.BenrishiApp.replaceQuestionBank(parsed.bank);
    renderStatus(`Driveから問題 ${parsed.bank.length}問を読み込みました。`);
    return parsed.bank.length;
  }

  function attemptKey(a = {}) {
    return a.uid || `${a.id || ''}|${a.at || ''}|${a.correct === true ? '1' : '0'}`;
  }

  function normalizeAttempt(a = {}) {
    return {
      uid: attemptKey(a),
      id: String(a.id || ''),
      correct: a.correct === true,
      at: String(a.at || new Date(0).toISOString()),
      day: String(a.day || String(a.at || '').slice(0,10))
    };
  }

  function mergeAttempts(local = [], remote = []) {
    const map = new Map();
    [...remote, ...local].forEach(raw => {
      if (!raw?.id) return;
      const a = normalizeAttempt(raw);
      map.set(a.uid, a);
    });
    return [...map.values()]
      .sort((a,b) => String(a.at).localeCompare(String(b.at)))
      .slice(-MAX_ATTEMPTS);
  }

  function rebuildProgress(attempts) {
    const rebuilt = {};
    attempts.forEach(a => {
      if (!a.id) return;
      const p = rebuilt[a.id] || { correct: 0, wrong: 0, streak: 0, history: [], lastAnswered: null, lastCorrect: null };
      if (a.correct) { p.correct += 1; p.streak += 1; }
      else { p.wrong += 1; p.streak = 0; }
      p.history = [...p.history, a.correct].slice(-8);
      p.lastAnswered = a.at;
      p.lastCorrect = a.correct;
      rebuilt[a.id] = p;
    });
    return rebuilt;
  }

  function preserveLegacyCounts(rebuilt, ...sources) {
    const result = clone(rebuilt);
    sources.forEach(source => {
      Object.entries(source || {}).forEach(([id, p]) => {
        const current = result[id];
        const sourceCount = Number(p?.correct || 0) + Number(p?.wrong || 0);
        const currentCount = Number(current?.correct || 0) + Number(current?.wrong || 0);
        if (!current || sourceCount > currentCount) {
          result[id] = clone(p);
        }
      });
    });
    return result;
  }

  async function readRemoteProgress() {
    if (!selected.progress?.id) return { schemaVersion: 1, updatedAt: null, progress: {}, attemptLog: [] };
    const response = await downloadFile(selected.progress.id);
    const text = await response.text();
    if (!text.trim()) return { schemaVersion: 1, updatedAt: null, progress: {}, attemptLog: [] };
    try {
      const data = JSON.parse(text);
      return {
        schemaVersion: data.schemaVersion || data.version || 1,
        updatedAt: data.updatedAt || null,
        progress: data.progress || {},
        attemptLog: Array.isArray(data.attemptLog) ? data.attemptLog : []
      };
    } catch {
      throw new Error('progress.json のJSON形式が正しくありません。');
    }
  }

  async function syncProgressWithDrive() {
    if (!selected.progress?.id) throw new Error('progress.json が未選択です。');
    const local = window.BenrishiApp.getProgressState();
    const remote = await readRemoteProgress();
    const mergedAttempts = mergeAttempts(local.attemptLog, remote.attemptLog);
    let mergedProgress = rebuildProgress(mergedAttempts);
    mergedProgress = preserveLegacyCounts(mergedProgress, remote.progress, local.progress);
    const payload = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      progress: mergedProgress,
      attemptLog: mergedAttempts
    };
    window.BenrishiApp.setProgressState(payload);
    await updateJsonFile(selected.progress.id, payload);
    renderStatus(`学習履歴を同期しました（${mergedAttempts.length}回答）。`);
    return payload;
  }

  async function syncAll() {
    if (busy) return;
    setBusy(true);
    try {
      await authorize();
      await discoverAccessibleFiles();
      if (!selected.questions?.id || !selected.progress?.id) {
        renderStatus('未選択のファイルがあります。Pickerから選択してください。');
        return;
      }
      await loadQuestionsFromDrive();
      await syncProgressWithDrive();
      toast('Google Drive同期が完了しました。');
    } catch (err) {
      console.error(err);
      renderStatus(err.message || '同期に失敗しました。');
      toast(err.message || 'Google Drive同期に失敗しました。');
    } finally {
      setBusy(false);
      renderStatus();
    }
  }

  async function connect() {
    if (busy) return;
    setBusy(true);
    try {
      await authorize({ forceConsent: !accessToken });
      await discoverAccessibleFiles();
      renderStatus('接続しました。ファイルが揃っていれば「今すぐ同期」を押してください。');
      if (selected.questions?.id && selected.progress?.id) {
        setBusy(false);
        await syncAll();
        return;
      }
    } catch (err) {
      console.error(err);
      renderStatus(err.message || 'Google Driveへの接続に失敗しました。');
      toast(err.message || 'Google Driveへの接続に失敗しました。');
    } finally {
      setBusy(false);
      renderStatus();
    }
  }

  function scheduleAutoSync() {
    if (!tokenValid() || !selected.progress?.id) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      if (busy || !tokenValid()) return;
      setBusy(true);
      try {
        await syncProgressWithDrive();
      } catch (err) {
        console.warn('auto sync failed', err);
        renderStatus('端末には保存済みです。Drive同期は「今すぐ同期」で再試行できます。');
      } finally {
        setBusy(false);
        renderStatus();
      }
    }, 1400);
  }

  async function handlePick(kind) {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await pickFile(kind);
      if (!picked) return;
      if (kind === 'questions') {
        await loadQuestionsFromDrive();
        toast('questions.xlsx を読み込みました。');
      } else {
        await syncProgressWithDrive();
        toast('progress.json と学習履歴を同期しました。');
      }
    } catch (err) {
      console.error(err);
      toast(err.message || 'ファイル選択に失敗しました。');
    } finally {
      setBusy(false);
      renderStatus();
    }
  }

  function init() {
    const connectBtn = byId('drive-connect');
    if (!connectBtn) return;
    connectBtn.addEventListener('click', connect);
    byId('pick-questions').addEventListener('click', () => handlePick('questions'));
    byId('pick-progress').addEventListener('click', () => handlePick('progress'));
    byId('sync-drive').addEventListener('click', syncAll);
    window.addEventListener('benrishi:progress-changed', scheduleAutoSync);
    renderStatus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
