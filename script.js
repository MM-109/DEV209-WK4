"use strict";

const boardEl = document.getElementById("board");
const difficultyEl = document.getElementById("difficulty");
const cardStyleEl = document.getElementById("cardStyle");
const newGameBtn = document.getElementById("newGameBtn");
const movesEl = document.getElementById("moves");
const timeEl = document.getElementById("time");
const messageEl = document.getElementById("message");

// NEW (optional element; only if you added it in HTML)
const totalMovesEl = document.getElementById("totalMoves");

// Sounds
const flipSound = new Audio("sound/flip.mp3");
const winSound = new Audio("sound/win.mp3");
const loseSound = new Audio("sound/mismatch.mp3");

flipSound.preload = "auto";
winSound.preload = "auto";
loseSound.preload = "auto";

// Difficulty settings
const DIFFICULTY = {
  easy: { rows: 4, cols: 4, seconds: 60 },
  medium: { rows: 4, cols: 5, seconds: 120 },
  hard: { rows: 4, cols: 6, seconds: 180 },
};

// Card themes
const STYLES = {
  default:     { back: "#2196f3", face: "#4caf50", text: "#0b3a66" },
  tealPink:    { back: "#009688", face: "#e91e63", text: "#ffffff" },
  blackYellow: { back: "#111111", face: "#fbc02d", text: "#111111" },
  purpleRed:   { back: "#9c27b0", face: "#e53935", text: "#ffffff" },
};

// --------------------
// NEW: Storage keys
// --------------------
const GAME_KEY = "mg_gameState_v1";        // sessionStorage (per tab)
const TOTAL_MOVES_KEY = "mg_totalMoves_v1"; // localStorage (shared across tabs)

// --------------------
// Game state variables
// --------------------
let tiles = [];
let first = null;
let second = null;
let lock = false;
let moves = 0;
let matched = 0;
let timer = null;
let timeLeft = 60;
let gameOver = false;

// NEW: for timer persistence
let deadlineMs = null;      // when timer is running: Date.now() + timeLeft*1000
let deckValues = [];        // array of tile symbols in order

function stopAllSounds() {
  [flipSound, winSound, loseSound].forEach((s) => {
    s.pause();
    s.currentTime = 0;
  });
}

function playSound(sound) {
  try {
    sound.pause();
    sound.currentTime = 0;
    sound.play();
  } catch {
    // ignore autoplay restriction errors
  }
}

function applyStyle(key) {
  const s = STYLES[key] ?? STYLES.default;
  document.documentElement.style.setProperty("--card-back", s.back);
  document.documentElement.style.setProperty("--card-face", s.face);
  document.documentElement.style.setProperty("--card-text", s.text);
}

// NEW: update total moves UI
function renderTotalMoves() {
  if (!totalMovesEl) return;
  const total = Number(localStorage.getItem(TOTAL_MOVES_KEY) || 0);
  totalMovesEl.textContent = String(total);
}

// NEW: increment total moves (shared across tabs)
function incrementTotalMoves() {
  const current = Number(localStorage.getItem(TOTAL_MOVES_KEY) || 0);
  localStorage.setItem(TOTAL_MOVES_KEY, String(current + 1));
  renderTotalMoves();
}

// NEW: cross-tab update of total moves display
window.addEventListener("storage", (e) => {
  if (e.key === TOTAL_MOVES_KEY) {
    renderTotalMoves();
  }
});

cardStyleEl.addEventListener("change", () => {
  applyStyle(cardStyleEl.value);
  saveGameState(); // NEW
});
applyStyle(cardStyleEl.value);

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// --------------------
// NEW: Save/Load state
// --------------------
function saveGameState() {
  // If timer is running, recompute timeLeft from deadline
  if (deadlineMs && !gameOver) {
    const remaining = Math.ceil((deadlineMs - Date.now()) / 1000);
    timeLeft = Math.max(0, remaining);
  }

  const revealedIdx = tiles
    .map((t, i) => (t.classList.contains("revealed") ? i : -1))
    .filter((i) => i !== -1);

  const matchedIdx = tiles
    .map((t, i) => (t.classList.contains("matched") ? i : -1))
    .filter((i) => i !== -1);

  const state = {
    difficulty: difficultyEl.value,
    style: cardStyleEl.value,

    moves,
    matched,
    timeLeft,
    deadlineMs,      // null if timer never started yet
    gameOver,

    deckValues,      // exact order of symbols
    revealedIdx,
    matchedIdx,

    message: messageEl.textContent || "",
  };

  sessionStorage.setItem(GAME_KEY, JSON.stringify(state));
}

function loadGameState() {
  const raw = sessionStorage.getItem(GAME_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearGameState() {
  sessionStorage.removeItem(GAME_KEY);
}

// --------------------
// Timer
// --------------------
function startTimer() {
  // NEW: if timer begins, create a deadline so refresh can continue
  if (!deadlineMs) {
    deadlineMs = Date.now() + timeLeft * 1000;
    saveGameState();
  }

  timer = setInterval(() => {
    const remaining = Math.ceil((deadlineMs - Date.now()) / 1000);
    timeLeft = Math.max(0, remaining);

    timeEl.textContent = formatTime(timeLeft);
    saveGameState(); // keep state current (lightweight)

    if (timeLeft <= 0) {
      endGame(false);
    }
  }, 250); // smoother persistence than 1000ms
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

// --------------------
// Board builder (supports restoring a saved deck)
// --------------------
function buildBoard(valuesOverride = null) {
  const { rows, cols } = DIFFICULTY[difficultyEl.value];
  const total = rows * cols;

  // generate deck if none provided
  if (valuesOverride && Array.isArray(valuesOverride) && valuesOverride.length === total) {
    deckValues = valuesOverride.slice();
  } else {
    const pool = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const symbols = pool.slice(0, total / 2).split("");
    deckValues = shuffle([...symbols, ...symbols]);
  }

  boardEl.innerHTML = "";
  boardEl.style.setProperty("--cols", cols);

  tiles = [];

  for (let i = 0; i < total; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tile";
    btn.textContent = deckValues[i];

    btn.addEventListener("click", () => flip(btn));
    boardEl.appendChild(btn);
    tiles.push(btn);
  }
}

// --------------------
// Gameplay
// --------------------
function flip(tile) {
  if (lock || gameOver) return;
  if (tile.classList.contains("revealed") || tile.classList.contains("matched")) return;

  if (!timer) startTimer();

  playSound(flipSound);

  tile.classList.add("revealed");

  if (!first) {
    first = tile;
    saveGameState(); // NEW
    return;
  }

  second = tile;
  lock = true;

  moves++;
  movesEl.textContent = String(moves);

  // NEW: total moves across ALL tabs
  incrementTotalMoves();

  if (first.textContent === second.textContent) {
    first.classList.add("matched");
    second.classList.add("matched");
    matched += 2;

    resetPick();
    saveGameState(); // NEW

    if (matched === tiles.length) {
      endGame(true);
    }
  } else {
    setTimeout(() => {
      first.classList.remove("revealed");
      second.classList.remove("revealed");
      resetPick();
      saveGameState(); // NEW
    }, 650);
  }
}

function resetPick() {
  first = null;
  second = null;
  lock = false;
}

function endGame(didWin) {
  stopTimer();
  gameOver = true;
  lock = true;

  stopAllSounds();

  if (didWin) {
    playSound(winSound);
    messageEl.textContent = "You won! 🎉 Click New Game to play again.";
  } else {
    playSound(loseSound);
    messageEl.textContent = "Time’s up! Click New Game to try again.";
    tiles.forEach((t) => t.classList.add("revealed"));
  }

  // NEW: timer no longer running
  deadlineMs = null;

  saveGameState(); // NEW
}

function newGame({ fromUser = true } = {}) {
  stopAllSounds();
  stopTimer();

  gameOver = false;
  lock = false;

  moves = 0;
  matched = 0;
  movesEl.textContent = "0";
  messageEl.textContent = "";

  const { seconds } = DIFFICULTY[difficultyEl.value];
  timeLeft = seconds;
  timeEl.textContent = formatTime(timeLeft);

  // NEW: reset timer persistence
  deadlineMs = null;

  first = null;
  second = null;

  buildBoard(); // new shuffled deck

  // NEW: If user explicitly started a new game, we should overwrite saved state
  if (fromUser) {
    saveGameState();
  }
}

// --------------------
// NEW: Restore saved game on load
// --------------------
function restoreIfPossible() {
  const state = loadGameState();
  if (!state) {
    newGame({ fromUser: false });
    saveGameState();
    return;
  }

  // apply selects + style
  if (state.difficulty && DIFFICULTY[state.difficulty]) {
    difficultyEl.value = state.difficulty;
  }
  if (state.style && STYLES[state.style]) {
    cardStyleEl.value = state.style;
  }
  applyStyle(cardStyleEl.value);

  // restore counters
  moves = Number(state.moves || 0);
  matched = Number(state.matched || 0);
  gameOver = Boolean(state.gameOver);

  movesEl.textContent = String(moves);

  // restore time + deadline
  deadlineMs = state.deadlineMs ?? null;
  timeLeft = Number(state.timeLeft || DIFFICULTY[difficultyEl.value].seconds);

  // If a deadline exists, recompute current remaining
  if (deadlineMs && !gameOver) {
    const remaining = Math.ceil((deadlineMs - Date.now()) / 1000);
    timeLeft = Math.max(0, remaining);
  } else if (gameOver) {
    deadlineMs = null;
  }

  timeEl.textContent = formatTime(timeLeft);

  // rebuild board with exact saved deck order
  buildBoard(Array.isArray(state.deckValues) ? state.deckValues : null);

  // restore tile classes
  const revealedIdx = new Set(state.revealedIdx || []);
  const matchedIdx = new Set(state.matchedIdx || []);

  tiles.forEach((t, i) => {
    if (revealedIdx.has(i)) t.classList.add("revealed");
    if (matchedIdx.has(i)) t.classList.add("matched");
  });

  // restore message
  messageEl.textContent = state.message || "";

  // If timer was running before refresh and game isn't over, resume ticking
  if (deadlineMs && !gameOver && timeLeft > 0) {
    startTimer();
  }

  // lock state
  lock = false;
  first = null;
  second = null;

  // If time already ran out due to refresh delay, end immediately
  if (!gameOver && timeLeft <= 0) {
    endGame(false);
  }
}

// --------------------
// Events
// --------------------
difficultyEl.addEventListener("change", () => {
  // treat difficulty change as a "new game"
  clearGameState();
  newGame({ fromUser: true });
});

newGameBtn.addEventListener("click", () => {
  clearGameState();
  newGame({ fromUser: true });
});

// Save state when leaving/reloading (extra safety)
window.addEventListener("beforeunload", saveGameState);

// Initial boot
renderTotalMoves();
restoreIfPossible();
