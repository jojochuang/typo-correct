const SWIPE_THRESHOLD = 50;
const SAVE_KEY = "typoJungleGame_v1";
const MODE_STORAGE = "typoJungleGame_mode";
const UNIT_STORAGE = "typoJungleGame_unit";
const SFX_STORAGE = "typoJungleGame_sfx";
const RETRY_GAP = 20;

let gameMode = "basic";
let selectedUnit = "";
let availableUnits = [];
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
let levelCompleteActive = false;
let sfxEnabled = true;
let feedbackFxTimer = null;
let audioCorrect = null;
let audioWrong = null;

const audioPathCandidates = {
  correct: ["assets/sounds/correct.mp3", "../ptt/sounds/correct.mp3"],
  wrong: ["assets/sounds/wrong.mp3", "../ptt/sounds/wrong.mp3"]
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

function configScopeKey() {
  const cfg = window.TypoCorrectConfig || {};
  return (cfg.sheetId || "") + "_" + (cfg.gid || "");
}

function modeStorageKey() {
  return MODE_STORAGE + "_" + configScopeKey();
}

function unitStorageKey() {
  return UNIT_STORAGE + "_" + configScopeKey();
}

function sfxStorageKey() {
  return SFX_STORAGE + "_" + configScopeKey();
}

function loadSfxSetting() {
  try {
    const v = localStorage.getItem(sfxStorageKey());
    if (v === "0" || v === "off") sfxEnabled = false;
    else if (v === "1" || v === "on") sfxEnabled = true;
  } catch (_) {}
}

function saveSfxSetting() {
  try {
    localStorage.setItem(sfxStorageKey(), sfxEnabled ? "1" : "0");
  } catch (_) {}
}

function updateSfxMenuLabel() {
  const btn = byId("menuToggleSfx");
  if (btn) {
    btn.textContent = sfxEnabled ? "關閉答對答錯音效" : "開啟答對答錯音效（大拇指）";
  }
}

function showAnswerFeedback(ok) {
  if (sfxEnabled) {
    playAudio(ok);
    return;
  }
  const el = byId("feedbackFx");
  if (!el) return;
  el.textContent = ok ? "👍" : "👎";
  el.className = "feedback-fx feedback-fx--" + (ok ? "ok" : "wrong");
  if (feedbackFxTimer) clearTimeout(feedbackFxTimer);
  feedbackFxTimer = setTimeout(() => {
    el.classList.add("hidden");
    feedbackFxTimer = null;
  }, 750);
}

function unitLabel(unit) {
  return "第 " + unit + " 關";
}

function getNextUnit() {
  const idx = availableUnits.indexOf(String(selectedUnit));
  if (idx < 0 || idx >= availableUnits.length - 1) return null;
  return availableUnits[idx + 1];
}

function isLevelComplete() {
  if (!questions.length) return false;
  if (retryEntries.length) return false;
  return questions.every((q) => q.mastered);
}

function rowsForSelectedUnit() {
  if (!selectedUnit || !sheetRows.length) return sheetRows;
  if (!sheetRows[0] || sheetRows[0].unit == null) return sheetRows;
  return sheetRows.filter((r) => String(r.unit) === String(selectedUnit));
}

function syncAvailableUnits() {
  if (window.TypoCorrectSheet && window.TypoCorrectSheet.listUnits) {
    availableUnits = window.TypoCorrectSheet.listUnits(sheetRows);
  } else {
    availableUnits = [];
  }
}

function loadSelectedUnit() {
  const cfg = window.TypoCorrectConfig || {};
  if (cfg.unit) {
    selectedUnit = String(cfg.unit);
    return;
  }
  try {
    const v = localStorage.getItem(unitStorageKey());
    if (v) selectedUnit = v;
  } catch (_) {}
}

function saveSelectedUnit() {
  try {
    localStorage.setItem(unitStorageKey(), selectedUnit);
  } catch (_) {}
}

function ensureSelectedUnitValid() {
  syncAvailableUnits();
  if (!availableUnits.length) {
    selectedUnit = "";
    return;
  }
  if (!availableUnits.includes(String(selectedUnit))) {
    selectedUnit = availableUnits[0];
  }
}

function updateUnitMenuLabel() {
  const btn = byId("menuPickUnit");
  if (!btn) return;
  if (!availableUnits.length) {
    btn.textContent = "選擇關卡";
    return;
  }
  btn.textContent = "關卡：" + unitLabel(selectedUnit);
}

function updateStartHint() {
  const el = byId("startHint");
  if (!el) return;
  let base;
  if (isAdvancedMode()) {
    base = "找出用錯的字並點擊，再從下方木牌選出正確的字。";
  } else {
    base = "依注音選出正確的字。點擊下方木牌上的答案繼續。";
  }
  if (availableUnits.length && selectedUnit !== "") {
    base += "（" + unitLabel(selectedUnit) + "）";
  }
  el.textContent = base;
}

function renderUnitPicker() {
  const picker = byId("unitPicker");
  if (!picker) return;
  picker.innerHTML = "";
  if (!availableUnits.length) return;

  availableUnits.forEach((unit) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = unitLabel(unit);
    if (String(unit) === String(selectedUnit)) {
      btn.classList.add("unit-picker__btn--active");
    }
    btn.addEventListener("click", async () => {
      await applyUnit(unit);
      picker.classList.add("hidden");
    });
    picker.appendChild(btn);
  });
}

async function applyUnit(unit) {
  hideLevelComplete();
  const next = String(unit);
  if (next === selectedUnit && questions.length && !levelCompleteActive) {
    updateUnitMenuLabel();
    return;
  }
  selectedUnit = next;
  saveSelectedUnit();
  updateUnitMenuLabel();
  updateStartHint();
  renderUnitPicker();

  if (sheetRows.length) {
    questions = await buildQuestions(rowsForSelectedUnit());
    if (gameStarted) {
      initSession();
      renderGame();
      const q = currentQuestion();
      if (q) speakWord(q.word);
    } else {
      showStartScreen();
    }
  }
}

function toggleUnitPicker() {
  const picker = byId("unitPicker");
  if (!picker || !availableUnits.length) return;
  picker.classList.toggle("hidden");
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

async function applyGameMode(mode) {
  hideLevelComplete();
  gameMode = mode === "advanced" ? "advanced" : "basic";
  try {
    localStorage.setItem(modeStorageKey(), gameMode);
  } catch (_) {}
  updateModeMenuLabel();
  updateStartHint();
  if (sheetRows.length) {
    questions = await buildQuestions(rowsForSelectedUnit());
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
  const u = selectedUnit !== "" ? "_" + selectedUnit : "";
  return SAVE_KEY + "_" + configScopeKey() + u;
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
        gameUnit: selectedUnit,
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

function resetAdvancedQuestionDisplay(q) {
  q.shownHanzi = q.chars.map((seg, i) => (i === q.wrongIdx ? q.wrongChar : seg));
}

function initQuestionStates() {
  for (const q of questions) {
    q.solved = false;
    q.wrongAttempts = 0;
    q.mastered = false;
    if (q.mode === "advanced") {
      q.pickerOpen = false;
      resetAdvancedQuestionDisplay(q);
    }
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
  q._attemptKey = "";
  if (q.mode === "advanced") {
    q.pickerOpen = false;
    resetAdvancedQuestionDisplay(q);
  }
}

/** 每次題目重新出現在佇列時，視為新的一輪作答（清除上次的 wrongAttempts） */
function prepareQuestionForAttempt(q) {
  if (!q || q.mastered) return;
  const qIndex = playQueue[queuePos];
  const attemptKey = qIndex + "@" + queuePos + "#" + playQueue.length;
  if (q._attemptKey === attemptKey) return;
  q._attemptKey = attemptKey;
  q.wrongAttempts = 0;
  q.solved = false;
  if (q.mode === "advanced") {
    q.pickerOpen = false;
    resetAdvancedQuestionDisplay(q);
  }
}

function scheduleRetry(qIndex) {
  if (questions[qIndex]?.mastered) return;
  const dueAt = questionsShown + RETRY_GAP + 1;
  const existing = retryEntries.find((e) => e.qIndex === qIndex);
  if (existing) {
    existing.dueAt = dueAt;
    return;
  }
  retryEntries.push({ qIndex, dueAt });
}

function clearRetryForQuestion(qIndex) {
  retryEntries = retryEntries.filter((e) => e.qIndex !== qIndex);
}

function pruneRetryEntries() {
  retryEntries = retryEntries.filter((e) => {
    const q = questions[e.qIndex];
    return q && !q.mastered;
  });
}

/** 已掌握題目不再出現在後面的佇列中 */
function removeQuestionFromQueueAhead(qIndex) {
  for (let i = playQueue.length - 1; i > queuePos; i--) {
    if (playQueue[i] === qIndex) playQueue.splice(i, 1);
  }
}

function injectDueRetries() {
  pruneRetryEntries();
  const due = retryEntries.filter((e) => e.dueAt <= questionsShown);
  if (!due.length) return;
  retryEntries = retryEntries.filter((e) => e.dueAt > questionsShown);
  for (let i = due.length - 1; i >= 0; i--) {
    const qIndex = due[i].qIndex;
    if (questions[qIndex]?.mastered) continue;
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
    pool.forEach((i) => resetQuestionForRetry(questions[i]));
    playQueue.push(...pool);
    return;
  }

  pruneRetryEntries();

  if (retryEntries.length) {
    const filler = questions.map((_, i) => i).filter((i) => !questions[i].mastered);
    if (filler.length) {
      shuffle(filler);
      filler.forEach((i) => resetQuestionForRetry(questions[i]));
      playQueue.push(...filler);
    }
    return;
  }

  if (isLevelComplete()) {
    showLevelComplete();
    return;
  }

  const remaining = questions.map((_, i) => i).filter((i) => !questions[i].mastered);
  if (remaining.length) {
    shuffle(remaining);
    remaining.forEach((i) => resetQuestionForRetry(questions[i]));
    playQueue.push(...remaining);
    return;
  }

  if (questions.every((q) => q.mastered)) {
    showLevelComplete();
  }
}

function advanceToNextPlayable() {
  if (!playQueue.length) return;
  let guard = playQueue.length + 4;
  while (guard-- > 0) {
    if (queuePos >= playQueue.length) {
      extendPlayQueueIfNeeded();
      if (!playQueue.length) return;
      if (queuePos >= playQueue.length) queuePos = 0;
    }
    const q = currentQuestion();
    if (q && !q.mastered) return;
    queuePos += 1;
  }
}

function afterAnswerAdvance() {
  questionsShown += 1;
  queuePos += 1;
  injectDueRetries();
  extendPlayQueueIfNeeded();
  advanceToNextPlayable();
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
  speakPhrase(text, 0.85);
}

function speakPhrase(text, rate) {
  if (!("speechSynthesis" in window)) return;
  const t = String(text || "").trim();
  if (!t) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.lang = "zh-TW";
    u.rate = rate != null ? rate : 0.9;
    window.speechSynthesis.speak(u);
  } catch (_) {}
}

function updateLevelCompleteButtons() {
  const advBtn = byId("levelCompleteAdvanced");
  const nextBtn = byId("levelCompleteNext");
  const next = getNextUnit();
  if (advBtn) {
    advBtn.removeAttribute("data-replay");
    if (isAdvancedMode()) {
      advBtn.classList.add("hidden");
    } else {
      advBtn.classList.remove("hidden");
      advBtn.textContent = "挑戰進階版";
    }
  }
  if (nextBtn) {
    nextBtn.removeAttribute("data-replay");
    if (next != null) {
      nextBtn.classList.remove("hidden");
      nextBtn.textContent = "進入" + unitLabel(next);
    } else {
      nextBtn.classList.add("hidden");
    }
  }
  if (advBtn?.classList.contains("hidden") && nextBtn?.classList.contains("hidden") && nextBtn) {
    nextBtn.classList.remove("hidden");
    nextBtn.textContent = "再玩一次";
    nextBtn.setAttribute("data-replay", "1");
  }
}

function showLevelComplete() {
  if (levelCompleteActive || !gameStarted) return;
  if (!isLevelComplete()) return;
  levelCompleteActive = true;
  clearSave();
  updateLevelCompleteButtons();
  const overlay = byId("levelCompleteOverlay");
  if (overlay) overlay.classList.remove("hidden");
  speakPhrase("你做到了！");
}

function hideLevelComplete() {
  levelCompleteActive = false;
  byId("levelCompleteOverlay")?.classList.add("hidden");
}

async function onLevelCompleteAdvanced() {
  hideLevelComplete();
  clearSave();
  if (!isAdvancedMode()) {
    await applyGameMode("advanced");
  } else {
    initSession();
    renderGame();
    const q = currentQuestion();
    if (q) speakWord(q.word);
  }
}

async function onLevelCompleteNext() {
  const nextBtn = byId("levelCompleteNext");
  if (nextBtn?.getAttribute("data-replay") === "1") {
    hideLevelComplete();
    clearSave();
    initSession();
    renderGame();
    const q = currentQuestion();
    if (q) speakWord(q.word);
    return;
  }
  const next = getNextUnit();
  if (next == null) return;
  hideLevelComplete();
  clearSave();
  if (isAdvancedMode()) {
    await applyGameMode("basic");
  }
  await applyUnit(next);
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
  const qIndex = playQueue[queuePos];
  if ((q.wrongAttempts || 0) === 0) {
    q.mastered = true;
    score += 1;
    clearRetryForQuestion(qIndex);
    removeQuestionFromQueueAhead(qIndex);
  } else {
    scheduleRetry(qIndex);
  }
  updateHud();
  writeSave();
  setTimeout(() => {
    afterAnswerAdvance();
    renderGame();
    if (levelCompleteActive) return;
    const next = currentQuestion();
    if (next) speakWord(next.word);
  }, 650);
}

function bindBoardPickHandlers(center, q) {
  center.querySelectorAll(".board-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (q.solved) return;
      if (q.mode === "advanced" && !q.pickerOpen) return;
      center.querySelectorAll(".board-btn").forEach((b) => b.classList.remove("board-btn--picked"));
      btn.classList.add("board-btn--picked");
      const picked = btn.getAttribute("data-pick") || "";
      if (picked !== q.correctBase) {
        q.wrongAttempts = (q.wrongAttempts || 0) + 1;
        showAnswerFeedback(false);
        btn.classList.add("wrong-flash");
        setTimeout(() => btn.classList.remove("wrong-flash"), 400);
        return;
      }
      showAnswerFeedback(true);
      btn.classList.add("correct-flash");
      const firstTry = (q.wrongAttempts || 0) === 0;
      if (firstTry) {
        q.solved = true;
        if (q.mode === "advanced") {
          q.pickerOpen = false;
          q.shownHanzi[q.wrongIdx] = q.correctChar;
        }
      } else if (q.mode === "advanced") {
        q.pickerOpen = false;
        resetAdvancedQuestionDisplay(q);
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
        q.wrongAttempts = (q.wrongAttempts || 0) + 1;
        showAnswerFeedback(false);
        btn.classList.add("wrong-flash");
        setTimeout(() => btn.classList.remove("wrong-flash"), 400);
        return;
      }
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
  advanceToNextPlayable();
  let q = currentQuestion();
  if (!q) return;

  let guard = playQueue.length + 4;
  while (q.mastered && guard-- > 0) {
    if (isLevelComplete()) {
      showLevelComplete();
      return;
    }
    advanceToNextPlayable();
    q = currentQuestion();
    if (!q) return;
  }
  if (q.mastered) {
    if (isLevelComplete()) showLevelComplete();
    return;
  }

  prepareQuestionForAttempt(q);

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
    if (q.mode === "advanced") {
      q.pickerOpen = false;
      resetAdvancedQuestionDisplay(q);
    }
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
    if (q.mode === "advanced") {
      q.pickerOpen = false;
      resetAdvancedQuestionDisplay(q);
    }
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
      if (s.gameUnit != null && String(s.gameUnit) !== String(selectedUnit)) {
        initSession();
        score = 0;
        elapsedMs = 0;
      } else {
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
          if (!questions[i].mastered && questions[i].solved) {
            questions[i].solved = false;
            if (questions[i].mode === "advanced") {
              questions[i].pickerOpen = false;
              resetAdvancedQuestionDisplay(questions[i]);
            }
          } else if (questions[i].mode === "advanced") {
            questions[i].pickerOpen = !!st.pickerOpen;
            if (!questions[i].solved) resetAdvancedQuestionDisplay(questions[i]);
          }
        });
      }
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
  syncAvailableUnits();
  ensureSelectedUnitValid();
  saveSelectedUnit();
  updateUnitMenuLabel();
  renderUnitPicker();
  questions = await buildQuestions(rowsForSelectedUnit());
  if (center) {
    center.classList.remove("game-center--busy");
    center.classList.add("hidden");
  }
  showStartScreen();
}

function resetGame() {
  hideLevelComplete();
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
  byId("unitPicker")?.classList.add("hidden");
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
  loadSfxSetting();
  loadSelectedUnit();
  updateModeMenuLabel();
  updateUnitMenuLabel();
  updateSfxMenuLabel();
  updateStartHint();
  updateHud();

  byId("menuPickUnit")?.addEventListener("click", () => {
    toggleUnitPicker();
  });
  byId("levelCompleteAdvanced")?.addEventListener("click", () => {
    onLevelCompleteAdvanced();
  });
  byId("levelCompleteNext")?.addEventListener("click", () => {
    onLevelCompleteNext();
  });
  byId("menuToggleMode")?.addEventListener("click", async () => {
    toggleMenu();
    await applyGameMode(isAdvancedMode() ? "basic" : "advanced");
  });
  byId("menuToggleSfx")?.addEventListener("click", () => {
    sfxEnabled = !sfxEnabled;
    saveSfxSetting();
    updateSfxMenuLabel();
    toggleMenu();
    byId("feedbackFx")?.classList.add("hidden");
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
