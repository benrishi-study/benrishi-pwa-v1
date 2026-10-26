
(() => {
  'use strict';

  const KEYS = {
    bank: 'benrishi-question-bank-v1',
    progress: 'benrishi-progress-v1',
    attempts: 'benrishi-attempt-log-v1'
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const byId = (id) => document.getElementById(id);

  let questionBank = loadJson(KEYS.bank, null) || clone(window.SEED_QUESTIONS || []);
  let progress = loadJson(KEYS.progress, {});
  let attemptLog = loadJson(KEYS.attempts, []);
  let session = [];
  let sessionIndex = 0;
  let answeredInSession = {};

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function loadJson(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  }
  function saveAll() {
    localStorage.setItem(KEYS.bank, JSON.stringify(questionBank));
    localStorage.setItem(KEYS.progress, JSON.stringify(progress));
    localStorage.setItem(KEYS.attempts, JSON.stringify(attemptLog.slice(-5000)));
  }
  function showToast(msg) {
    const t = byId('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function escapeHtml(s='') {
    return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }
  function todayKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function getProgress(id) {
    return progress[id] || { correct: 0, wrong: 0, streak: 0, history: [], lastAnswered: null, lastCorrect: null };
  }
  function rankFor(id) {
    const p = getProgress(id);
    const attempts = p.correct + p.wrong;
    if (!attempts) return 'NEW';
    const recent = (p.history || []).slice(-5);
    const recentRate = recent.length ? recent.filter(Boolean).length / recent.length : 0;
    if (recent.length >= 3 && p.streak >= 3 && recentRate >= .9) return 'A';
    if (p.streak >= 2 && recentRate >= .75) return 'B';
    if (recentRate >= .5) return 'C';
    return 'D';
  }
  function rateFor(id) {
    const p = getProgress(id), n = p.correct + p.wrong;
    return n ? p.correct / n : null;
  }
  function fields() {
    return [...new Set(questionBank.map(q => q.field).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ja'));
  }
  function filteredBank(field='ALL') {
    return field === 'ALL' ? questionBank : questionBank.filter(q => q.field === field);
  }
  function shuffle(arr) {
    const a = [...arr];
    for (let i=a.length-1; i>0; i--) { const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
    return a;
  }

  function navigate(screen) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === `screen-${screen}`));
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.screen === screen));
    if (screen === 'home') renderHome();
    if (screen === 'review') renderReview();
    if (screen === 'stats') renderStats();
    if (screen === 'quiz') {
      window.scrollTo(0, 0);
      scheduleQuizFit();
    } else {
      const shell = $('.quiz-shell');
      if (shell) shell.style.height = '';
    }
  }

  // v1.1.1: iPad横画面でもミニテスト全体をビューポート内に収める。
  // 問題文と解説は各ペイン内で独立スクロールし、長文だけ段階的に縮小する。
  function fitQuizViewport() {
    const screen = byId('screen-quiz');
    const shell = $('.quiz-shell');
    if (!screen?.classList.contains('active') || !shell) return;

    // スマホ縦画面では従来どおり縦積みにし、iPad横画面・PCだけ固定レイアウトにする。
    if (window.innerWidth <= 820) {
      shell.style.height = '';
      return;
    }

    const top = shell.getBoundingClientRect().top;
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const available = Math.max(430, Math.floor(viewportHeight - top - 10));
    shell.style.height = `${available}px`;

    const questionEl = byId('quiz-question');
    const explanationEl = byId('explanation-text');
    if (!questionEl || !explanationEl) return;

    questionEl.classList.remove('fit-compact', 'fit-dense', 'scroll-from-top');
    explanationEl.classList.remove('fit-compact', 'fit-dense');

    const qLen = (questionEl.textContent || '').replace(/\s+/g, '').length;
    const eLen = (explanationEl.textContent || '').replace(/\s+/g, '').length;
    if (qLen > 135) questionEl.classList.add('fit-compact');
    if (qLen > 245) { questionEl.classList.remove('fit-compact'); questionEl.classList.add('fit-dense'); }
    if (eLen > 430) explanationEl.classList.add('fit-compact');
    if (eLen > 800) { explanationEl.classList.remove('fit-compact'); explanationEl.classList.add('fit-dense'); }

    requestAnimationFrame(() => {
      // 文字数だけでなく実際の表示領域も見て、必要な場合だけ一段階縮小。
      if (questionEl.scrollHeight > questionEl.clientHeight * 1.18) {
        if (!questionEl.classList.contains('fit-compact') && !questionEl.classList.contains('fit-dense')) {
          questionEl.classList.add('fit-compact');
        } else if (questionEl.classList.contains('fit-compact')) {
          questionEl.classList.remove('fit-compact');
          questionEl.classList.add('fit-dense');
        }
      }
      if (explanationEl.scrollHeight > explanationEl.clientHeight * 1.22) {
        if (!explanationEl.classList.contains('fit-compact') && !explanationEl.classList.contains('fit-dense')) {
          explanationEl.classList.add('fit-compact');
        } else if (explanationEl.classList.contains('fit-compact')) {
          explanationEl.classList.remove('fit-compact');
          explanationEl.classList.add('fit-dense');
        }
      }

      // 長文でスクロールが必要な場合は冒頭が隠れないよう上寄せにする。
      questionEl.classList.toggle('scroll-from-top', questionEl.scrollHeight > questionEl.clientHeight + 2);
      questionEl.scrollTop = 0;
      explanationEl.scrollTop = 0;
      const articleBox = $('.article-box');
      if (articleBox) articleBox.scrollTop = 0;
    });
  }

  function scheduleQuizFit() {
    cancelAnimationFrame(scheduleQuizFit._raf || 0);
    scheduleQuizFit._raf = requestAnimationFrame(() => {
      fitQuizViewport();
      setTimeout(fitQuizViewport, 80);
    });
  }

  function populateFieldSelects() {
    const opts = ['<option value="ALL">すべての分野</option>'].concat(fields().map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`)).join('');
    byId('home-field-select').innerHTML = opts;
    byId('review-field-select').innerHTML = opts;
  }

  function renderHome() {
    const ranks = questionBank.map(q => rankFor(q.id));
    const weak = ranks.filter(r => r === 'C' || r === 'D').length;
    const fresh = ranks.filter(r => r === 'NEW').length;
    byId('home-weak-count').textContent = weak;
    byId('home-new-count').textContent = fresh;
    byId('home-total-count').textContent = `全${questionBank.length}問`;
    byId('bank-status').textContent = `現在 ${questionBank.length}問。Excelから同じ問題IDを読み込むと内容を更新できます。`;

    const t = todayKey();
    const todays = attemptLog.filter(a => a.day === t);
    if (todays.length) {
      const c = todays.filter(a => a.correct).length;
      byId('home-today-rate').textContent = `${Math.round(c/todays.length*100)}%`;
      byId('home-today-count').textContent = `${todays.length}問回答 / ${c}問正解`;
    } else {
      byId('home-today-rate').textContent = '—';
      byId('home-today-count').textContent = 'まだ解答していません';
    }
  }

  function pickByRank(bank, rank, count) {
    let pool = bank.filter(q => rankFor(q.id) === rank);
    if (rank === 'D' || rank === 'C') {
      pool.sort((a,b) => {
        const pa=getProgress(a.id), pb=getProgress(b.id);
        if (pa.lastCorrect === false && pb.lastCorrect !== false) return -1;
        if (pb.lastCorrect === false && pa.lastCorrect !== false) return 1;
        return (pa.lastAnswered || '').localeCompare(pb.lastAnswered || '');
      });
    } else if (rank === 'A') {
      pool.sort((a,b) => (getProgress(a.id).lastAnswered || '').localeCompare(getProgress(b.id).lastAnswered || ''));
    } else {
      pool = shuffle(pool);
    }
    return pool.slice(0, count);
  }

  function selectTodayTen(bank = questionBank) {
    const quotas = [['D',4],['C',2],['B',1],['A',1],['NEW',2]];
    const picked = [];
    const used = new Set();
    for (const [rank,count] of quotas) {
      for (const q of pickByRank(bank, rank, count)) {
        if (!used.has(q.id)) { used.add(q.id); picked.push(q); }
      }
    }
    if (picked.length < Math.min(10, bank.length)) {
      const priority = {D:0,C:1,NEW:2,B:3,A:4};
      const rest = bank.filter(q => !used.has(q.id)).sort((a,b) => priority[rankFor(a.id)] - priority[rankFor(b.id)] || Math.random()-.5);
      for (const q of rest) {
        if (picked.length >= Math.min(10, bank.length)) break;
        picked.push(q);
      }
    }
    return shuffle(picked);
  }

  function startSession(questions, label='ミニテスト') {
    if (!questions.length) { showToast('該当する問題がありません。'); return; }
    session = questions;
    sessionIndex = 0;
    answeredInSession = {};
    navigate('quiz');
    renderQuestion();
    showToast(`${label}を開始します（${questions.length}問）`);
  }

  function renderQuestion() {
    if (!session.length) return;
    const q = session[sessionIndex];
    const rank = rankFor(q.id);
    byId('quiz-field').textContent = q.field || '—';
    const rp = byId('quiz-rank'); rp.textContent = rank; rp.className = `rank-pill rank-${rank.toLowerCase()}`;
    byId('quiz-counter').textContent = `${sessionIndex+1} / ${session.length}`;
    byId('quiz-progress').style.width = `${(sessionIndex+1)/session.length*100}%`;
    byId('quiz-unit').textContent = q.unit || '—';
    byId('quiz-point').textContent = q.point || '';
    byId('quiz-question').textContent = q.question || '';

    const state = answeredInSession[q.id];
    $$('.answer-btn').forEach(b => b.disabled = !!state);
    const pane = byId('explanation-pane');
    const badge = byId('result-badge');
    if (state) {
      pane.classList.remove('waiting');
      badge.textContent = state.correct ? '✓ あなたの回答：正解' : `✕ あなたの回答：不正解（${state.answer}）`;
      badge.className = `result-badge ${state.correct ? 'correct' : 'wrong'}`;
      const explanationEl = byId('explanation-text');
      const rawExplanation = (q.explanation || '').trim();
      const verdictPattern = /^正解\s*[：:]\s*[○×]\s*/;
      const reasonText = rawExplanation.replace(verdictPattern, '').trim();
      explanationEl.replaceChildren();

      const verdictEl = document.createElement('div');
      verdictEl.className = `answer-verdict verdict-${q.answer === '○' ? 'circle' : 'cross'}`;
      verdictEl.textContent = `正解：${q.answer}`;
      explanationEl.appendChild(verdictEl);

      if (reasonText) {
        const reasonEl = document.createElement('div');
        reasonEl.className = 'answer-reason';
        reasonEl.textContent = reasonText;
        explanationEl.appendChild(reasonEl);
      }
      byId('article-text').textContent = q.articles || '—';
    } else {
      pane.classList.add('waiting');
      badge.textContent = '回答すると解説を表示';
      badge.className = 'result-badge';
      byId('explanation-text').textContent = 'ここに「正解 → 理由 → 条文 → 趣旨」を表示します。';
      byId('article-text').textContent = '—';
    }
    byId('prev-question').disabled = sessionIndex === 0;
    byId('next-question').textContent = sessionIndex === session.length-1 ? '結果を見る →' : '次の問題 →';
    scheduleQuizFit();
  }

  function answerCurrent(answer) {
    if (!session.length) return;
    const q = session[sessionIndex];
    if (answeredInSession[q.id]) return;
    const correct = answer === q.answer;
    const p = getProgress(q.id);
    if (correct) { p.correct += 1; p.streak += 1; }
    else { p.wrong += 1; p.streak = 0; }
    p.history = [...(p.history || []), correct].slice(-8);
    p.lastAnswered = new Date().toISOString();
    p.lastCorrect = correct;
    progress[q.id] = p;
    answeredInSession[q.id] = { answer, correct };
    attemptLog.push({ uid: (crypto.randomUUID ? crypto.randomUUID() : `${q.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`), id: q.id, correct, at: p.lastAnswered, day: todayKey() });
    attemptLog = attemptLog.slice(-5000);
    saveAll();
    window.dispatchEvent(new CustomEvent('benrishi:progress-changed'));
    renderQuestion();
    renderHome();
  }

  function nextQuestion() {
    if (!session.length) return;
    if (sessionIndex === session.length - 1) {
      const answered = session.filter(q => answeredInSession[q.id]);
      const correct = answered.filter(q => answeredInSession[q.id].correct).length;
      showToast(`終了：${answered.length}問中 ${correct}問正解`);
      renderStats();
      navigate('stats');
      return;
    }
    sessionIndex += 1; renderQuestion();
  }
  function prevQuestion() { if (sessionIndex > 0) { sessionIndex -= 1; renderQuestion(); } }

  function renderReview() {
    const field = byId('review-field-select').value || 'ALL';
    const bank = filteredBank(field);
    const d = bank.filter(q => rankFor(q.id) === 'D');
    const c = bank.filter(q => rankFor(q.id) === 'C');
    const missed = bank.filter(q => getProgress(q.id).lastCorrect === false);
    byId('review-d-count').textContent = `${d.length}問`;
    byId('review-c-count').textContent = `${c.length}問`;
    byId('review-missed-count').textContent = `${missed.length}問`;
  }

  function renderStats() {
    let attempts=0, correct=0;
    Object.values(progress).forEach(p => { attempts += (p.correct||0)+(p.wrong||0); correct += (p.correct||0); });
    byId('stats-attempts').textContent = attempts;
    byId('stats-rate').textContent = attempts ? `${Math.round(correct/attempts*100)}%` : '—';
    byId('stats-a').textContent = questionBank.filter(q => rankFor(q.id)==='A').length;
    byId('stats-d').textContent = questionBank.filter(q => rankFor(q.id)==='D').length;

    const rows = fields().map(field => {
      const bank = questionBank.filter(q => q.field === field);
      let a=0,corr=0,answered=0;
      bank.forEach(q => { const p=getProgress(q.id); const n=(p.correct||0)+(p.wrong||0); if(n){answered++; a+=n; corr+=p.correct||0;} });
      const c = bank.filter(q => rankFor(q.id)==='C').length;
      const d = bank.filter(q => rankFor(q.id)==='D').length;
      return `<tr><td>${escapeHtml(field)}</td><td>${answered} / ${bank.length}</td><td>${a ? Math.round(corr/a*100)+'%' : '—'}</td><td>${c}</td><td>${d}</td></tr>`;
    }).join('');
    byId('stats-table-body').innerHTML = rows || '<tr><td colspan="5">問題データがありません。</td></tr>';
  }

  async function importExcel(file) {
    if (!window.XLSX) {
      showToast('Excel読込ライブラリが未読込です。ネット接続を確認して再読み込みしてください。');
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, {type:'array'});
      const preferred = ['ミニテスト試作20問','問題データ'];
      const sheetName = preferred.find(n => wb.SheetNames.includes(n)) || wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {defval:''});
      let imported=0, ignored=0;
      const map = new Map(questionBank.map(q => [q.id, q]));
      rows.forEach((r, idx) => {
        const id = String(r['問題ID']||'').trim();
        const question = String(r['問題文']||'').trim();
        const answer = String(r['正解']||'').trim();
        if (!id || !question || !['○','×'].includes(answer)) { ignored++; return; }
        map.set(id, {
          id,
          field: String(r['分野']||'').trim() || '未分類',
          unit: String(r['単元']||'').trim(),
          point: String(r['論点']||'').trim(),
          question,
          answer,
          explanation: String(r['解説']||'').trim() || `正解：${answer}`,
          articles: String(r['条文']||'').trim()
        });
        imported++;
      });
      questionBank = [...map.values()];
      saveAll(); populateFieldSelects(); renderHome(); renderReview(); renderStats();
      showToast(`${sheetName}から${imported}問を追加・更新しました${ignored ? `（${ignored}行は対象外）` : ''}`);
    } catch (e) {
      console.error(e); showToast('Excelの読み込みに失敗しました。列名を確認してください。');
    }
  }

  function resetBank() {
    if (!confirm('この端末内の問題データをクリアします。Google Drive上のquestions.xlsxは削除されません。よろしいですか？')) return;
    questionBank = []; saveAll(); populateFieldSelects(); renderHome(); renderReview(); renderStats();
    showToast('端末内の問題データをクリアしました。Driveから再同期できます。');
  }
  function resetProgress() {
    if (!confirm('学習履歴をすべてリセットします。問題データは残ります。よろしいですか？')) return;
    progress = {}; attemptLog = []; saveAll(); renderHome(); renderReview(); renderStats();
    window.dispatchEvent(new CustomEvent('benrishi:progress-changed'));
    showToast('学習履歴をリセットしました。');
  }

  // Events
  $$('.nav-btn').forEach(b => b.addEventListener('click', () => navigate(b.dataset.screen)));
  byId('start-today').addEventListener('click', () => startSession(selectTodayTen(), '今日の10問'));
  byId('start-field').addEventListener('click', () => {
    const field = byId('home-field-select').value; startSession(selectTodayTen(filteredBank(field)), field === 'ALL' ? '分野別演習' : field);
  });
  $$('.answer-btn').forEach(b => b.addEventListener('click', () => answerCurrent(b.dataset.answer)));
  byId('next-question').addEventListener('click', nextQuestion);
  byId('prev-question').addEventListener('click', prevQuestion);
  byId('review-field-select').addEventListener('change', renderReview);
  byId('start-d').addEventListener('click', () => {
    const bank=filteredBank(byId('review-field-select').value); startSession(bank.filter(q=>rankFor(q.id)==='D'), 'Dランク復習');
  });
  byId('start-cd').addEventListener('click', () => {
    const bank=filteredBank(byId('review-field-select').value).filter(q=>['C','D'].includes(rankFor(q.id)));
    startSession(shuffle(bank).slice(0,10), 'C・D復習');
  });
  byId('start-missed').addEventListener('click', () => {
    const bank=filteredBank(byId('review-field-select').value).filter(q=>getProgress(q.id).lastCorrect===false)
      .sort((a,b)=>(getProgress(b.id).lastAnswered||'').localeCompare(getProgress(a.id).lastAnswered||''));
    startSession(bank.slice(0,20), '最近の誤答');
  });
  byId('excel-file').addEventListener('change', e => { const f=e.target.files?.[0]; if(f) importExcel(f); e.target.value=''; });
  byId('reset-bank').addEventListener('click', resetBank);
  byId('reset-progress').addEventListener('click', resetProgress);

  document.addEventListener('keydown', e => {
    if (!byId('screen-quiz').classList.contains('active')) return;
    if (e.key.toLowerCase()==='o') answerCurrent('○');
    if (e.key.toLowerCase()==='x') answerCurrent('×');
    if (e.key==='Enter' && session.length) nextQuestion();
  });

  window.addEventListener('resize', scheduleQuizFit, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(scheduleQuizFit, 120), { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleQuizFit, { passive: true });

  // Public bridge for Google Drive sync (v1.1)
  window.BenrishiApp = {
    getQuestionBank: () => clone(questionBank),
    getProgressState: () => ({ progress: clone(progress), attemptLog: clone(attemptLog) }),
    setProgressState: (state = {}) => {
      progress = clone(state.progress || {});
      attemptLog = clone(state.attemptLog || []).slice(-5000);
      saveAll(); renderHome(); renderReview(); renderStats();
    },
    replaceQuestionBank: (bank = []) => {
      if (!Array.isArray(bank) || !bank.length) throw new Error('問題データが空です。');
      questionBank = clone(bank);
      saveAll(); populateFieldSelects(); renderHome(); renderReview(); renderStats();
    },
    parseQuestionWorkbook: (buffer) => {
      if (!window.XLSX) throw new Error('Excel読込ライブラリが読み込まれていません。');
      const wb = XLSX.read(buffer, {type:'array'});
      const preferred = ['問題データ','ミニテスト試作20問'];
      const sheetName = preferred.find(n => wb.SheetNames.includes(n)) || wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {defval:''});
      const bank = [];
      let ignored = 0;
      rows.forEach(r => {
        const id = String(r['問題ID']||'').trim();
        const question = String(r['問題文']||'').trim();
        const answer = String(r['正解']||'').trim();
        if (!id || !question || !['○','×'].includes(answer)) { ignored++; return; }
        bank.push({
          id,
          field: String(r['分野']||'').trim() || '未分類',
          unit: String(r['単元']||'').trim(),
          point: String(r['論点']||'').trim(),
          question,
          answer,
          explanation: String(r['解説']||'').trim() || `正解：${answer}`,
          articles: String(r['条文']||'').trim()
        });
      });
      return { bank, ignored, sheetName };
    },
    refresh: () => { populateFieldSelects(); renderHome(); renderReview(); renderStats(); },
    toast: showToast
  };

  // Init
  populateFieldSelects(); renderHome(); renderReview(); renderStats();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('service-worker.js').catch(console.warn);
  }
})();
