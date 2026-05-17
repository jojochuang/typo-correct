const SWIPE_THRESHOLD = 50;
const SAVE_KEY = "typoJungleGame_v1";
const MODE_STORAGE = "typoJungleGame_mode";
const RETRY_GAP = 20;

let gameMode = "basic";
let sheetRows = [];

let questions = [];
let playQueue = [];
let retryEntries = [];
let queuePos = 0;
let questionsShown = 0;
let score = 0;
let elapsedMs = 0;
let timerStarted = false;
let timerId = null;
let startX = 0;
let swipeBound = false;
let wordBoardResizeTimer = null;

function onWordBoardResize() {
  if (!gameStarted || !questions.length) return;
  clearTimeout(wordBoardResizeTimer);
  wordBoardResizeTimer = setTimeout(() => renderGame(), 120);
}

let speakingEnabled = true;
let gameStarted = false;
let audioCorrect = null;
let audioWrong = null;

const audioPathCandidates = {
  correct: ["assets/sounds/correct.mp3"],
  wrong: ["assets/sounds/wrong.mp3"]
};

function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isHan(ch) {
  return /[\u3400-\u9fff]/.test(ch);
}

function splitWordChars(word) {
  const out = [];
  const s = String(word || "");
  let i = 0;
  while (i < s.length) {
    const cp = s.codePointAt(i);
    const u = String.fromCodePoint(cp);
    if (isHan(u)) {
      let seg = u;
      i += u.length;
      while (i < s.length) {
        const cp2 = s.codePointAt(i);
        const isVS = cp2 >= 0xfe00 && cp2 <= 0xfe0f;
        const isIVS = cp2 >= 0xe0100 && cp2 <= 0xe01ef;
        if (isVS || isIVS) {
          seg += String.fromCodePoint(cp2);
          i += String.fromCodePoint(cp2).length;
        } else break;
      }
      out.push(seg);
    } else {
      i += u.length;
    }
  }
  return out;
}

function baseHan(seg) {
  for (const c of String(seg || "")) {
    if (isHan(c)) return c;
  }
  return String(seg || "");
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

function pickOptions(group, correctBase) {
  const g = [...new Set(group.filter(Boolean))];
  if (g.length <= 3) return shuffle(g);
  const opts = [correctBase];
  const pool = g.filter((x) => x !== correctBase);
  while (opts.length < 3 && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    opts.push(pool.splice(i, 1)[0]);
  }
  return shuffle(opts);
}

function modeStorageKey() {
  const cfg = window.TypoCorrectConfig || {};
  return MODE_STORAGE + "_" + (cfg.sheetId || "") + "_" + (cfg.gid || "");
}

function loadGameMode() {
  try {
    const v = localStorage.getItem(modeStorageKey());
    if (v === "advanced" || v === "basic") gameMode = v;
  } catch (_) {}
}

function isAdvancedMode() {
  return gameMode === "advanced";
}

function updateModeMenuLabel() {
  const btn = byId("menuToggleMode");
  if (btn) btn.textContent = isAdvancedMode() ? "切換初級版" : "切換進階版";
}

function updateStartHint() {
  const el = byId("startHint");
  if (!el) return;
  if (isAdvancedMode()) {
    el.textContent = "找出用錯的字並點擊，再從下方木牌選出正確的字。";
  } else {
    el.textContent = "依注音選出正確的字。點擊下方木牌上的答案繼續。";
  }
}

async function applyGameMode(mode) {
  gameMode = mode === "advanced" ? "advanced" : "basic";
  try {
    localStorage.setItem(modeStorageKey(), gameMode);
  } catch (_) {}
  updateModeMenuLabel();
  updateStartHint();
  if (sheetRows.length) {
    questions = await buildQuestions(sheetRows);
    if (gameStarted) {
      initSession();
      renderGame();
      const q = currentQuestion();
      if (q) speakWord(q.word);
    }
  }
}

function buildQuestionsBasic(rows) {
  const out = [];
  for (const row of rows || []) {
    const group = row.similarChars || [];
    const words = row.words || [];
    if (group.length < 2 || !words.length) continue;

    for (const word of words) {
      const chars = splitWordChars(word);
      if (!chars.length) continue;

      const hits = chars
        .map((seg, i) => ({ seg, i, base: baseHan(seg) }))
        .filter((x) => group.includes(x.base));
      if (!hits.length) continue;

      const target = hits[Math.floor(Math.random() * hits.length)];
      const correctBase = target.base;
      const options = pickOptions(group, correctBase);
      if (options.length < 2) continue;

      out.push({
        mode: "basic",
        word,
        chars,
        hideIndex: target.i,
        correctChar: target.seg,
        correctBase,
        options,
        solved: false,
        wrongAttempts: 0,
        mastered: false
      });
    }
  }
  return out;
}

function buildQuestionsAdvanced(rows) {
  const out = [];
  for (const row of rows || []) {
    const group = row.similarChars || [];
    const words = row.words || [];
    if (group.length < 2 || !words.length) continue;

    for (const word of words) {
      const chars = splitWordChars(word);
      if (!chars.length) continue;

      const hits = chars
        .map((seg, i) => ({ seg, i, base: baseHan(seg) }))
        .filter((x) => group.includes(x.base));
      if (!hits.length) continue;

      const target = hits[Math.floor(Math.random() * hits.length)];
      const correctBase = target.base;
      const alternatives = group.filter((g) => g !== correctBase);
      if (!alternatives.length) continue;

      const wrongChar = alternatives[Math.floor(Math.random() * alternatives.length)];
      const options = pickOptions(group, correctBase);
      if (options.length < 2) continue;

      const shownHanzi = chars.map((seg, i) => (i === target.i ? wrongChar : seg));

      out.push({
        mode: "advanced",
        word,
        chars,
        shownHanzi,
        wrongIdx: target.i,
        wrongChar,
        correctChar: target.seg,
        correctBase,
        options,
        pickerOpen: false,
        solved: false,
        wrongAttempts: 0,
        mastered: false
      });
    }
  }
  return out;
}

async function buildQuestions(rows) {
  return isAdvancedMode() ? buildQuestionsAdvanced(rows) : buildQuestionsBasic(rows);
}

function saveKey() {
  const cfg = window.TypoCorrectConfig || {};
  return SAVE_KEY + "_" + (cfg.sheetId || "") + "_" + (cfg.gid || "");
}

function loadSave() {
  try {
    const raw = localStorage.getItem(saveKey());
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function writeSave() {
  try {
    localStorage.setItem(
      saveKey(),
      JSON.stringify({
        queuePos,
        playQueue,
        retryEntries,
        questionsShown,
        score,
        elapsedMs,
        gameMode,
        questionStates: questions.map((q) => ({
          solved: !!q.solved,
          wrongAttempts: q.wrongAttempts || 0,
          mastered: !!q.mastered,
          pickerOpen: !!q.pickerOpen
        })),
        savedAt: Date.now()
      })
    );
  } catch (_) {}
}

function initQuestionStates() {
  for (const q of questions) {
    q.solved = false;
    q.wrongAttempts = 0;
    q.mastered = false;
    if (q.mode === "advanced") q.pickerOpen = false;
  }
}

function initSession() {
  initQuestionStates();
  playQueue = questions.map((_, i) => i);
  shuffle(playQueue);
  retryEntries = [];
  queuePos = 0;
  questionsShown = 0;
}

function currentQuestion() {
  if (!questions.length || !playQueue.length) return null;
  queuePos = Math.max(0, Math.min(queuePos, playQueue.length - 1));
  return questions[playQueue[queuePos]];
}

function resetQuestionForRetry(q) {
  q.solved = false;
  q.wrongAttempts = 0;
  if (q.mode === "advanced") q.pickerOpen = false;
}

function scheduleRetry(qIndex) {
  if (retryEntries.some((e) => e.qIndex === qIndex)) return;
  retryEntries.push({ qIndex, dueAt: questionsShown + RETRY_GAP + 1 });
}

function injectDueRetries() {
  const due = retryEntries.filter((e) => e.dueAt <= questionsShown);
  if (!due.length) return;
  retryEntries = retryEntries.filter((e) => e.dueAt > questionsShown);
  for (let i = due.length - 1; i >= 0; i--) {
    const qIndex = due[i].qIndex;
    resetQuestionForRetry(questions[qIndex]);
    playQueue.splice(queuePos, 0, qIndex);
  }
}

function extendPlayQueueIfNeeded() {
  if (queuePos < playQueue.length) return;
  injectDueRetries();
  if (queuePos < playQueue.length) return;

  const pool = questions
    .map((_, i) => i)
    .filter((i) => !questions[i].mastered);
  if (pool.length) {
    shuffle(pool);
    playQueue.push(...pool);
    return;
  }

  if (retryEntries.length) {
    const filler = questions.map((_, i) => i).filter((i) => !questions[i].mastered);
    const src = filler.length ? filler : questions.map((_, i) => i);
    shuffle(src);
    playQueue.push(...src);
    return;
  }

  initSession();
}

function afterAnswerAdvance() {
  questionsShown += 1;
  queuePos += 1;
  injectDueRetries();
  extendPlayQueueIfNeeded();
  if (queuePos >= playQueue.length) queuePos = 0;
}

function clearSave() {
  try {
    localStorage.removeItem(saveKey());
  } catch (_) {}
}

function formatTime(ms) {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ":" + String(s).padStart(2, "0");
}

function updateHud() {
  const timerEl = byId("timerHud");
  const scoreEl = byId("scoreHud");
  if (timerEl) timerEl.textContent = formatTime(elapsedMs);
  if (scoreEl) scoreEl.textContent = "✓ " + score;
}

function startTimer() {
  if (timerStarted) return;
  timerStarted = true;
  const t0 = Date.now() - elapsedMs;
  timerId = setInterval(() => {
    elapsedMs = Date.now() - t0;
    updateHud();
  }, 500);
}

function stopTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
}

function playAudio(ok) {
  const a = ok ? audioCorrect : audioWrong;
  if (!a) return;
  try {
    a.currentTime = 0;
    const p = a.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        const src = (a.getAttribute("data-fallback-src") || "").trim();
        if (!src) return;
        a.src = src;
        a.load();
        a.removeAttribute("data-fallback-src");
      });
    }
  } catch (_) {}
}

function initAudio() {
  audioCorrect = new Audio(audioPathCandidates.correct[0]);
  audioWrong = new Audio(audioPathCandidates.wrong[0]);
  audioCorrect.preload = "auto";
  audioWrong.preload = "auto";
  audioCorrect.setAttribute("data-fallback-src", audioPathCandidates.correct[1]);
  audioWrong.setAttribute("data-fallback-src", audioPathCandidates.wrong[1]);
}

function speakWord(text) {
  if (!speakingEnabled) return;
  if (!("speechSynthesis" in window)) return;
  const t = String(text || "").trim();
  if (!t) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.lang = "zh-TW";
    u.rate = 0.85;
    window.speechSynthesis.speak(u);
  } catch (_) {}
}

function getMaxUnitsPerRow() {
  const vp = byId("gameViewport");
  const w = vp ? vp.getBoundingClientRect().width : 1024;
  const glyph = w * 0.075;
  const unitW = glyph * 2.14 + 3;
  const boardW = w * 0.94;
  return Math.max(1, Math.floor(boardW / unitW));
}

function renderWordUnit(q, i, glowCls) {
  const seg = escapeHtml(q.chars[i]);
  if (i === q.hideIndex) {
    const filled = q.solved
      ? `<span class="cell-hanzi-text${glowCls}" lang="zh-Hant">${escapeHtml(q.correctChar)}</span>`
      : "";
    const solvedCls = q.solved ? " word-unit--solved" : "";
    return (
      `<div class="word-unit word-unit--target${solvedCls}">` +
        `<div class="cell-hanzi cell-hanzi--blank">${filled}</div>` +
        `<div class="cell-bpmf"><span class="cell-bpmf-text${glowCls}" lang="zh-Hant">${seg}</span></div>` +
      `</div>`
    );
  }
  return (
    `<div class="word-unit">` +
      `<div class="cell-hanzi"><span class="cell-hanzi-text${glowCls}" lang="zh-Hant">${seg}</span></div>` +
      `<div class="cell-bpmf"><span class="cell-bpmf-text${glowCls}" lang="zh-Hant">${seg}</span></div>` +
    `</div>`
  );
}

function hanziDisplayAdvanced(q, i) {
  if (q.solved && i === q.wrongIdx) return escapeHtml(q.correctChar);
  if (i === q.wrongIdx && q.pickerOpen) return "";
  if (i === q.wrongIdx) return escapeHtml(q.wrongChar);
  return escapeHtml(q.chars[i]);
}

function renderAdvancedCharBtn(q, i, glowCls) {
  const bpmf = escapeHtml(q.chars[i]);
  const typoCls = i === q.wrongIdx ? " word-char-btn--typo" : "";
  const fixedCls = q.solved && i === q.wrongIdx ? " word-char-btn--fixed" : "";
  const blankCls =
    i === q.wrongIdx && q.pickerOpen && !q.solved ? " cell-hanzi--blank" : "";
  const hanziInner = hanziDisplayAdvanced(q, i);
  const hanziSpan = hanziInner
    ? `<span class="cell-hanzi-text${glowCls}" lang="zh-Hant">${hanziInner}</span>`
    : "";
  return (
    `<button type="button" class="word-char-btn${typoCls}${fixedCls}" data-char-idx="${i}" aria-label="第 ${i + 1} 字">` +
      `<span class="word-char-btn__num" aria-hidden="true">${i + 1}</span>` +
      `<span class="word-char-btn__unit">` +
        `<span class="cell-hanzi${blankCls}">${hanziSpan}</span>` +
        `<span class="cell-bpmf"><span class="cell-bpmf-text${glowCls}" lang="zh-Hant">${bpmf}</span></span>` +
      `</span>` +
    `</button>`
  );
}

function renderBoardAdvanced(q) {
  const glowCls = q.solved ? "" : " glyph-glow";
  const maxPerRow = getMaxUnitsPerRow();
  const rows = [];
  for (let start = 0; start < q.chars.length; start += maxPerRow) {
    const units = [];
    const end = Math.min(start + maxPerRow, q.chars.length);
    for (let i = start; i < end; i++) {
      units.push(renderAdvancedCharBtn(q, i, glowCls));
    }
    rows.push(`<div class="word-board-row word-board-row--advanced">${units.join("")}</div>`);
  }
  return rows.join("");
}

function renderBoard(q) {
  if (q.mode === "advanced") return renderBoardAdvanced(q);
  const glowCls = q.solved ? "" : " glyph-glow";
  const maxPerRow = getMaxUnitsPerRow();
  const rows = [];
  for (let start = 0; start < q.chars.length; start += maxPerRow) {
    const units = [];
    const end = Math.min(start + maxPerRow, q.chars.length);
    for (let i = start; i < end; i++) {
      units.push(renderWordUnit(q, i, glowCls));
    }
    rows.push(`<div class="word-board-row">${units.join("")}</div>`);
  }
  return rows.join("");
}

function renderBoardOptions(q) {
  const glowCls = q.solved ? "" : " glyph-glow";
  return q.options
    .map(
      (ch, idx) => {
        const n = idx + 1;
        return (
          `<button type="button" class="board-btn" data-pick="${escapeHtml(ch)}" ${q.solved ? "disabled" : ""} aria-label="選項 ${n}：${escapeHtml(ch)}">` +
          `<span class="board-index" aria-hidden="true">${n}</span>` +
          `<span class="board-char${glowCls}" lang="zh-Hant">${escapeHtml(ch)}</span>` +
          `</button>`
        );
      }
    )
    .join("");
}

function finishCorrectAnswer(q, center) {
  if ((q.wrongAttempts || 0) === 0) {
    q.mastered = true;
    score += 1;
  } else {
    scheduleRetry(playQueue[queuePos]);
  }
  updateHud();
  writeSave();
  setTimeout(() => {
    afterAnswerAdvance();
    renderGame();
    const next = currentQuestion();
    if (next) speakWord(next.word);
  }, 650);
}

function bindBoardPickHandlers(center, q) {
  center.querySelectorAll(".board-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (q.solved) return;
      center.querySelectorAll(".board-btn").forEach((b) => b.classList.remove("board-btn--picked"));
      btn.classList.add("board-btn--picked");
      const picked = btn.getAttribute("data-pick") || "";
      if (picked !== q.correctBase) {
        q.wrongAttempts = (q.wrongAttempts || 0) + 1;
        playAudio(false);
        btn.classList.add("wrong-flash");
        setTimeout(() => btn.classList.remove("wrong-flash"), 400);
        return;
      }
      playAudio(true);
      btn.classList.add("correct-flash");
      q.solved = true;
      if (q.mode === "advanced") {
        q.pickerOpen = false;
        q.shownHanzi[q.wrongIdx] = q.correctChar;
      }
      finishCorrectAnswer(q, center);
    });
  });
}

function bindAdvancedCharHandlers(center, q) {
  center.querySelectorAll(".word-char-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (q.solved) return;
      const idx = parseInt(btn.getAttribute("data-char-idx"), 10);
      if (idx !== q.wrongIdx) {
        playAudio(false);
        return;
      }
      playAudio(true);
      q.pickerOpen = true;
      renderGame();
    });
  });
}

function renderGame() {
  const center = byId("gameCenter");
  if (!center) return;

  if (!questions.length) {
    center.innerHTML = "<p class='game-empty'>尚無題目，請確認試算表資料。</p>";
    center.classList.remove("hidden");
    return;
  }

  extendPlayQueueIfNeeded();
  const q = currentQuestion();
  if (!q) return;

  const adv = q.mode === "advanced";
  const boardCls =
    "word-board" +
    (q.solved ? " word-board--solved" : "") +
    (adv ? " word-board--advanced" : "");
  const pickerVisible = adv ? q.pickerOpen || q.solved : true;
  const pickerCls =
    "boards-row" +
    (q.solved ? " boards-row--solved" : "") +
    (pickerVisible ? " boards-row--visible" : "");

  center.innerHTML =
    `<div class="${boardCls}">${renderBoard(q)}</div>` +
    (adv ? `<div class="adv-picker-slot${pickerVisible ? " adv-picker-slot--show" : ""}">` : "") +
    `<div class="${pickerCls}">${renderBoardOptions(q)}</div>` +
    (adv ? `</div>` : "") +
    `<p class="page-indicator" id="pageIndicator">${questionsShown + 1} / ${questions.length}</p>`;

  if (adv) bindAdvancedCharHandlers(center, q);
  bindBoardPickHandlers(center, q);
}

function goPrev() {
  if (!gameStarted || playQueue.length <= 1) return;
  queuePos = (queuePos - 1 + playQueue.length) % playQueue.length;
  const q = currentQuestion();
  if (q) {
    q.solved = false;
    q.wrongAttempts = 0;
    if (q.mode === "advanced") q.pickerOpen = false;
  }
  renderGame();
}

function goNext() {
  if (!gameStarted || playQueue.length <= 1) return;
  queuePos = (queuePos + 1) % playQueue.length;
  const q = currentQuestion();
  if (q) {
    q.solved = false;
    q.wrongAttempts = 0;
    if (q.mode === "advanced") q.pickerOpen = false;
  }
  renderGame();
}

function initSwipe() {
  if (swipeBound) return;
  swipeBound = true;
  const el = byId("gameCenter");
  if (!el) return;
  el.addEventListener("touchstart", (e) => {
    if (e.touches && e.touches.length) startX = e.touches[0].clientX;
  }, { passive: true });
  el.addEventListener("touchend", (e) => {
    const t = e.changedTouches && e.changedTouches.length ? e.changedTouches[0] : null;
    if (!t) return;
    const dx = t.clientX - startX;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    if (dx > 0) goPrev();
    else goNext();
  }, { passive: true });
}

function beginGame(continueSave) {
  const overlay = byId("startOverlay");
  const center = byId("gameCenter");
  const app = byId("gameApp");

  if (continueSave) {
    const s = loadSave();
    if (s && Array.isArray(s.playQueue) && s.playQueue.length) {
      if (s.gameMode === "advanced" || s.gameMode === "basic") gameMode = s.gameMode;
      queuePos = s.queuePos || 0;
      playQueue = s.playQueue;
      retryEntries = Array.isArray(s.retryEntries) ? s.retryEntries : [];
      questionsShown = s.questionsShown || 0;
      score = s.score || 0;
      elapsedMs = s.elapsedMs || 0;
      if (Array.isArray(s.questionStates)) {
        s.questionStates.forEach((st, i) => {
          if (!questions[i] || !st) return;
          questions[i].solved = !!st.solved;
          questions[i].wrongAttempts = st.wrongAttempts || 0;
          questions[i].mastered = !!st.mastered;
          if (questions[i].mode === "advanced") questions[i].pickerOpen = !!st.pickerOpen;
        });
      }
    } else if (s && typeof s.slideIndex === "number") {
      initSession();
      queuePos = Math.min(s.slideIndex, playQueue.length - 1);
      score = s.score || 0;
      elapsedMs = s.elapsedMs || 0;
    } else {
      initSession();
      score = s?.score || 0;
      elapsedMs = s?.elapsedMs || 0;
    }
  } else {
    score = 0;
    elapsedMs = 0;
    clearSave();
    initSession();
  }

  gameStarted = true;
  if (overlay) overlay.classList.add("hidden");
  if (app) app.classList.add("jungle-game--play");
  if (center) center.classList.remove("hidden");
  startTimer();
  updateHud();
  renderGame();
  initSwipe();
  const q = currentQuestion();
  if (q) speakWord(q.word);
}

function showStartScreen() {
  const overlay = byId("startOverlay");
  const continueBtn = byId("continueBtn");
  const s = loadSave();
  if (continueBtn) {
    if (s && questions.length && Array.isArray(s.playQueue) && s.playQueue.length) {
      continueBtn.classList.remove("hidden");
    } else {
      continueBtn.classList.add("hidden");
    }
  }
  if (overlay) overlay.classList.remove("hidden");
}

async function loadSheet() {
  const cfg = window.TypoCorrectConfig || {};
  const center = byId("gameCenter");
  if (center) {
    center.classList.remove("hidden");
    center.classList.add("game-center--busy");
    center.innerHTML = "<p class='game-loading'>載入試算表中…</p>";
  }
  const rows = await window.TypoCorrectSheet.fetchTypoRows(cfg.sheetId, cfg.gid);
  sheetRows = rows;
  questions = await buildQuestions(rows);
  if (center) {
    center.classList.remove("game-center--busy");
    center.classList.add("hidden");
  }
  showStartScreen();
}

function resetGame() {
  stopTimer();
  timerStarted = false;
  gameStarted = false;
  clearSave();
  score = 0;
  elapsedMs = 0;
  const app = byId("gameApp");
  const center = byId("gameCenter");
  if (app) app.classList.remove("jungle-game--play");
  if (center) center.classList.add("hidden");
  initSession();
  showStartScreen();
  updateHud();
}

function toggleFullscreen() {
  const el = byId("gameViewport") || document.documentElement;
  if (!document.fullscreenElement) {
    el.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

function toggleMenu() {
  const menu = byId("sideMenu");
  if (menu) menu.classList.toggle("hidden");
}

window.addEventListener("resize", onWordBoardResize);

async function init() {
  const cfg = window.TypoCorrectConfig || {};
  document.title = cfg.title || "字音字形改錯";

  if (cfg.embed) {
    document.documentElement.classList.add("typo-embed-root");
    document.body.classList.add("typo-embed");
  }
  if (cfg.transparent) {
    document.body.classList.add("typo-embed--transparent");
  }

  initAudio();
  loadGameMode();
  updateModeMenuLabel();
  updateStartHint();
  updateHud();

  byId("menuToggleMode")?.addEventListener("click", async () => {
    toggleMenu();
    await applyGameMode(isAdvancedMode() ? "basic" : "advanced");
  });
  byId("startBtn")?.addEventListener("click", () => beginGame(false));
  byId("continueBtn")?.addEventListener("click", () => beginGame(true));
  byId("menuBtn")?.addEventListener("click", toggleMenu);
  byId("menuRestart")?.addEventListener("click", () => {
    toggleMenu();
    resetGame();
  });
  byId("menuSave")?.addEventListener("click", () => {
    writeSave();
    toggleMenu();
    alert("已存檔，下次可從選單或開始畫面繼續。");
  });
  byId("speakBtn")?.addEventListener("click", () => {
    const q = currentQuestion();
    if (q) speakWord(q.word);
    else speakingEnabled = !speakingEnabled;
    byId("speakBtn")?.classList.toggle("muted-audio", !speakingEnabled);
  });
  byId("fsBtn")?.addEventListener("click", toggleFullscreen);
  byId("hudClose")?.addEventListener("click", () => {
    if (gameStarted) resetGame();
  });

  try {
    await loadSheet();
  } catch (e) {
    const center = byId("gameCenter");
    if (center) {
      center.classList.remove("hidden");
      center.classList.add("game-center--busy");
      center.innerHTML =
        "<p class='game-empty'>載入失敗：" + escapeHtml(e && e.message ? e.message : e) + "</p>";
    }
  }
}

init();
window.TypoCorrectPageInit = init;
