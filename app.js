// ===== 저장 키 =====
const STORE_KEY = "latex_formulas_store_v1";
const EXCLUDE_KEY = "latex_formulas_excluded_v1";
const DECK_STATE_KEY = "latex_formulas_deck_state_v1"; // 현재 덱 진행 저장

const STATS_KEY = "latex_formulas_stats_v1"; // 맞춘 횟수 저장
const AUTO_EXCLUDE_AFTER = 5;                // n번 이상 맞추면 자동 제외 (원하는 숫자로)

const AUTO_EXCLUDED_KEY = "latex_formulas_auto_excluded_v1";
const DECK_CYCLES_KEY = "latex_formulas_deck_cycles_v1";
const DECAY_EVERY_CYCLES = 10;

const STAGE_STATE_KEY = "latex_formulas_stage_state_v1"; // 현재 보고 있던 카드/화면 상태

// ===== DOM =====
const el = {
  stage: document.getElementById("stage"),
  formulaBox: document.getElementById("formulaBox"),
  filename: document.getElementById("filename"),
  hint: document.querySelector(".hint"),

  btnExclude: document.getElementById("btnExclude"),
  btnUnlearned: document.getElementById("btnUnlearned"),
  btnExcluded: document.getElementById("btnExcluded"),

  panelUnlearned: document.getElementById("panelUnlearned"),
  panelExcluded: document.getElementById("panelExcluded"),
  closeUnlearned: document.getElementById("closeUnlearned"),
  closeExcluded: document.getElementById("closeExcluded"),
  gridUnlearned: document.getElementById("gridUnlearned"),
  gridExcluded: document.getElementById("gridExcluded"),

  unlearnedCount: document.getElementById("unlearnedCount"),
  excludedCount: document.getElementById("excludedCount"),

  fab: document.getElementById("fab"),
  sheet: document.getElementById("sheet"),
  btnAdd: document.getElementById("btnAdd"),
  btnBackup: document.getElementById("btnBackup"),
  fileRestore: document.getElementById("fileRestore"),
  btnSheetClose: document.getElementById("btnSheetClose"),

  modal: document.getElementById("modal"),
  inpDesc: document.getElementById("inpDesc"),
  inpTex: document.getElementById("inpTex"),
  btnPreview: document.getElementById("btnPreview"),
  btnSave: document.getElementById("btnSave"),
  btnCancel: document.getElementById("btnCancel"),
  preview: document.getElementById("preview"),
  panelFooter: document.getElementById("panelFooter"),
};

// ===== 상태 =====
let FORMULAS = loadStore();        // [{id, desc, tex}]
let FORMULA_MAP = new Map();       // id -> formula (O(1))
let excluded = loadExcluded();     // Set(ids)
let stats = loadStats();           // { [id]: number }
let autoExcluded = loadAutoExcluded(); // Set(ids) 자동 제외로 들어간 항목
let deckCycles = loadDeckCycles();     // 덱 완주 누적 횟수
let currentId = null;
// 스테이지 표시 상태: "desc"(설명) → "formula"(공식)
let stageView = "desc";

let deck = [];      // 현재 한 바퀴 덱(아이디 배열)
let deckIndex = 0;  // 다음에 보여줄 위치

// ===== 저장/로드 =====
function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(x => x && typeof x.id === "string" && typeof x.tex === "string")
      .map(x => ({ id: x.id, desc: String(x.desc ?? ""), tex: x.tex }));
  } catch {
    return [];
  }
}
function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(FORMULAS));
  } catch {
    // iOS/사파리 환경에서 가끔 실패할 수 있음(프라이빗/용량 등)
    // 여기서 굳이 alert 안 띄우고 조용히 실패 처리
  }
}
function loadExcluded() {
  try {
    const raw = localStorage.getItem(EXCLUDE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter(x => typeof x === "string"));
  } catch {
    return new Set();
  }
}
function saveExcluded() {
  try {
    localStorage.setItem(EXCLUDE_KEY, JSON.stringify([...excluded]));
  } catch {
    // 조용히 실패
  }
}
function saveDeckState() {
  try {
    const payload = {
      deck: Array.isArray(deck) ? deck : [],
      deckIndex: Number.isFinite(deckIndex) ? deckIndex : 0,
    };
    localStorage.setItem(DECK_STATE_KEY, JSON.stringify(payload));
  } catch {
    // 조용히 실패
  }
}
function clearDeckState() {
  try {
    localStorage.removeItem(DECK_STATE_KEY);
  } catch {
    // 조용히 실패
  }
}
function restoreDeckStateIfValid() {
  try {
    const raw = localStorage.getItem(DECK_STATE_KEY);
    if (!raw) return false;

    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.deck)) return false;

    const savedDeck = data.deck.filter(x => typeof x === "string");
    let savedIndex = Number(data.deckIndex);
    if (!Number.isFinite(savedIndex)) savedIndex = 0;
    savedIndex = Math.max(0, Math.floor(savedIndex));

    const pool = availableFormulas().map(f => f.id);
    const poolSet = new Set(pool);

    if (savedDeck.length !== pool.length) return false;
    if (new Set(savedDeck).size !== savedDeck.length) return false;
    for (const id of savedDeck) {
      if (!poolSet.has(id)) return false;
    }

    deck = savedDeck;
    deckIndex = Math.min(savedIndex, deck.length);
    return true;
  } catch {
    return false;
  }
}

function saveStageState() {
  try {
    const payload = {
      currentId: currentId || null,
      stageView: stageView || "desc",
    };
    localStorage.setItem(STAGE_STATE_KEY, JSON.stringify(payload));
  } catch {}
}

function clearStageState() {
  try {
    localStorage.removeItem(STAGE_STATE_KEY);
  } catch {}
}

function restoreStageStateIfValid() {
  try {
    const raw = localStorage.getItem(STAGE_STATE_KEY);
    if (!raw) return false;

    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return false;

    const id = (typeof data.currentId === "string") ? data.currentId : null;
    const view = (data.stageView === "formula") ? "formula" : "desc";

    if (!id) return false;

    // 현재 존재하는 카드인지 + 제외되지 않은 카드인지 확인
    const item = byId(id);
    if (!item) return false;
    if (excluded.has(id)) return false; // 제외된 카드는 스테이지 복원 안 함

    // 화면 복원
    if (view === "formula") showFormula(id);
    else showDesc(id);

    return true;
  } catch {
    return false;
  }
}

function loadAutoExcluded() {
  try {
    const raw = localStorage.getItem(AUTO_EXCLUDED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter(x => typeof x === "string"));
  } catch {
    return new Set();
  }
}
function saveAutoExcluded() {
  try {
    localStorage.setItem(AUTO_EXCLUDED_KEY, JSON.stringify([...autoExcluded]));
  } catch {}
}
function loadDeckCycles() {
  try {
    const n = Number(localStorage.getItem(DECK_CYCLES_KEY));
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}
function saveDeckCycles() {
  try {
    localStorage.setItem(DECK_CYCLES_KEY, String(deckCycles));
  } catch {}
}

function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return {};
    for (const k of Object.keys(obj)) {
      if (typeof obj[k] !== "number" || !isFinite(obj[k])) delete obj[k];
    }
    return obj;
  } catch {
    return {};
  }
}
function excludeNow(id, { manual = false } = {}) {
  excluded.add(id);
  if (manual) {
    autoExcluded.delete(id);
    saveAutoExcluded();
  } else {
    autoExcluded.add(id);
    saveAutoExcluded();
  }
  saveExcluded();

  rebuildDeck();
  setCounts();
  renderGrids();
  showRandomNext();
}

function decayCorrectCountsAndReinclude() {
  let changed = false;

  for (const id of Object.keys(stats)) {
    const n = Number(stats[id]) || 0;
    const next = Math.max(0, n - 1);
    if (next !== n) {
      stats[id] = next;
      changed = true;
    }
  }

  // 자동 제외된 항목만 기준 미만이면 다시 포함
  for (const id of [...autoExcluded]) {
    const n = Number(stats[id]) || 0;
    if (n < AUTO_EXCLUDE_AFTER) {
      excluded.delete(id);
      autoExcluded.delete(id);
      changed = true;
    }
  }

  if (changed) {
    saveStats();
    saveExcluded();
    saveAutoExcluded();
    rebuildDeck();
    setCounts();
    renderGrids();
    updateHint();
  }
}
function saveStats() {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {}
}
function incCorrect(id) {
  stats[id] = (stats[id] ?? 0) + 1;
  saveStats();
  return stats[id];
}
function newId() {
  return "f_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function updateAnswerButtonVisibility() {
  if (!el.btnExclude) return;
  el.btnExclude.style.visibility = (stageView === "formula") ? "visible" : "hidden";
  // 필요하면 자리까지 없애려면 visibility 대신 display 사용 가능
  // el.btnExclude.style.display = (stageView === "formula") ? "" : "none";
}

// ===== 맵 캐시 =====
function rebuildMap() {
  FORMULA_MAP = new Map(FORMULAS.map(f => [f.id, f]));
}
function byId(id) {
  return FORMULA_MAP.get(id) || null;
}

// ===== 유틸 =====
function shuffleInPlace(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function availableFormulas() {
  return FORMULAS.filter(f => !excluded.has(f.id));
}
function setCounts() {
  el.unlearnedCount.textContent = String(availableFormulas().length);
  el.excludedCount.textContent = String(excluded.size);
}
function ensureDeckProgressBar() {
  if (!el.stage || document.getElementById("deckProgressWrap")) return;

  const wrap = document.createElement("div");
  wrap.id = "deckProgressWrap";
  const fill = document.createElement("div");
  fill.id = "deckProgressFill";

  wrap.appendChild(fill);
  el.stage.appendChild(wrap);
}

function updateDeckProgressBar() {
  const fill = document.getElementById("deckProgressFill");
  if (!fill) return;

  let ratio = 0;
  if (deck.length > 0) ratio = deckIndex / deck.length;
  ratio = Math.max(0, Math.min(1, ratio));

  fill.style.width = `${ratio * 100}%`;
}

// ===== 덱 =====
function rebuildDeck() {
  const pool = availableFormulas().map(f => f.id);

  if (pool.length === 0) {
    deck = [];
    deckIndex = 0;
    clearDeckState();
    updateDeckProgressBar();
    return;
  }

  deck = shuffleInPlace(pool);
  deckIndex = 0;

  // 첫 장이 직전과 같으면(가능할 때) 한 번 회피
  if (deck.length >= 2 && deck[0] === currentId) {
    [deck[0], deck[1]] = [deck[1], deck[0]];
  }

  saveDeckState();
  updateDeckProgressBar();
}

function nextFromDeck() {
  if (deck.length === 0) return null;

  // 한 바퀴 끝났으면 완주 처리
  if (deckIndex >= deck.length) {
    deckCycles += 1;
    saveDeckCycles();
    updateDecayCounterText();

    // DECAY_EVERY_CYCLES(예: 10) 바퀴마다 맞춘 횟수 감쇠
    if (deckCycles > 0 && deckCycles % DECAY_EVERY_CYCLES === 0) {
      decayCorrectCountsAndReinclude();
      updateDecayCounterText();
    }

    // 감쇠/재포함으로 풀 구성이 바뀔 수 있으니 새 덱 구성
    rebuildDeck();
    if (deck.length === 0) return null;
  }

  const id = deck[deckIndex];
  deckIndex += 1;

  saveDeckState();
  updateDeckProgressBar();

  return id;
}

// ===== KaTeX 렌더 =====
function renderKatexInto(node, tex, { displayMode = true } = {}) {
  node.textContent = "";
  if (!window.katex) { node.textContent = tex; return; }
  try {
    katex.render(tex, node, {
      throwOnError: false,
      displayMode,
      strict: "ignore",
    });
  } catch {
    node.textContent = tex;
  }
}

// ===== 패널 =====
function openPanel(which) {
  if (which === "left") {
    el.panelUnlearned.classList.add("open", "left");
    el.panelUnlearned.setAttribute("aria-hidden", "false");
  } else {
    el.panelExcluded.classList.add("open", "right");
    el.panelExcluded.setAttribute("aria-hidden", "false");
  }
}
function closePanel(which) {
  if (which === "left") {
    el.panelUnlearned.classList.remove("open", "left");
    el.panelUnlearned.setAttribute("aria-hidden", "true");
  } else {
    el.panelExcluded.classList.remove("open", "right");
    el.panelExcluded.setAttribute("aria-hidden", "true");
  }
}
function closeBothPanels() {
  closePanel("left");
  closePanel("right");
}

function updateHint() {
  if (!el.hint) return;

  const n = currentId ? (Number(stats[currentId]) || 0) : 0;

  const mainText =
    (currentId && stageView === "desc")
      ? "화면을 누르면 공식"
      : "화면을 누르면 다음 공식";

  el.hint.innerHTML = `
    ${mainText}
    <span class="hintSub">(${n}/${AUTO_EXCLUDE_AFTER})</span>
  `;
}

// ===== 표시 =====
function showDesc(id) {
  const item = byId(id);
  if (!item) return;
  currentId = item.id;

  // 설명 먼저 크게 보여주기
  el.formulaBox.textContent = item.desc || "(설명 없음)";
  el.filename.textContent = "";
  stageView = "desc";
  updateHint();
  updateAnswerButtonVisibility();
  saveStageState();
  closeBothPanels();
}

function showFormula(id) {
  const item = byId(id);
  if (!item) return;
  currentId = item.id;

  renderKatexInto(el.formulaBox, item.tex, { displayMode: true });
  el.filename.textContent = item.desc || "";
  stageView = "formula";
  updateHint();
  updateAnswerButtonVisibility();
  saveStageState();
  closeBothPanels();
}

function showRandomNext() {
  if (deck.length === 0) rebuildDeck();

  if (deck.length === 0) {
    el.formulaBox.textContent = "전부 제외됨(=다 외웠음). 제외 목록에서 다시 포함시켜줘.";
    el.filename.textContent = "";
    currentId = null;
    stageView = "desc";
    clearStageState();
    updateHint();
    updateAnswerButtonVisibility();
    return;
  }

  const id = nextFromDeck();
  if (!id) return;
  showDesc(id);
}

// ===== 삭제 =====
function deleteFormula(id) {
  const idx = FORMULAS.findIndex(f => f.id === id);
  if (idx === -1) return;

  FORMULAS.splice(idx, 1);
  rebuildMap();
  saveStore();

  excluded.delete(id);
  autoExcluded.delete(id);
  saveExcluded();
  saveAutoExcluded();

  if (currentId === id) currentId = null;

  // 풀 변경 지점 → 덱 재구성
  rebuildDeck();

  setCounts();
  renderGrids();
  if (!currentId) showRandomNext();
}

function confirmDelete(item) {
  const name = item.desc ? `“${item.desc}”` : "(설명 없음)";
  const ok = confirm(`${name}\n이 공식을 삭제할까?\n(삭제하면 백업 파일로만 복구 가능)`);
  if (!ok) return;
  deleteFormula(item.id);
}

// ===== 그리드 =====
function makeThumb(item, mode) {
  const wrap = document.createElement("div");
  wrap.className = "thumb";
  wrap.tabIndex = 0;

  const cap = document.createElement("div");
  cap.className = "cap";
  cap.textContent = item.desc || "(설명 없음)";

  const mini = document.createElement("div");
  mini.className = "mini";
  renderKatexInto(mini, item.tex, { displayMode: false });

  wrap.appendChild(cap);
  wrap.appendChild(mini);

  const action = () => {
    if (mode === "view") {
      showDesc(item.id);
    } else {
      excluded.delete(item.id);
      saveExcluded();
    
      rebuildDeck();
      setCounts();
      renderGrids();
      showDesc(item.id);
    }
  };

  // 롱프레스(길게 누름)로 삭제 + 드래그/스크롤 시 취소
  let pressTimer = null;
  let longPressed = false;
  let startX = 0;
  let startY = 0;
  const MOVE_CANCEL_PX = 8;

  const startPress = (e) => {
    longPressed = false;
    startX = e.clientX ?? 0;
    startY = e.clientY ?? 0;

    pressTimer = setTimeout(() => {
      longPressed = true;
      confirmDelete(item);
    }, 550);
  };

  const cancelPress = () => {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
  };

  wrap.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startPress(e);
  });

  wrap.addEventListener("pointermove", (e) => {
    if (!pressTimer) return;
    const dx = Math.abs((e.clientX ?? 0) - startX);
    const dy = Math.abs((e.clientY ?? 0) - startY);
    if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) cancelPress();
  });

  wrap.addEventListener("pointerup", cancelPress);
  wrap.addEventListener("pointercancel", cancelPress);
  wrap.addEventListener("pointerleave", cancelPress);

  wrap.addEventListener("click", (e) => {
    e.stopPropagation();
    if (longPressed) return;
    action();
  });

  wrap.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      action();
    }
  });

  return wrap;
}

function renderGrids() {
  el.gridUnlearned.innerHTML = "";
  const fragU = document.createDocumentFragment();
  for (const item of availableFormulas()) fragU.appendChild(makeThumb(item, "view"));
  el.gridUnlearned.appendChild(fragU);

  el.gridExcluded.innerHTML = "";

  const autoIds = [];
  const manualIds = [];
  for (const id of excluded) {
    if (autoExcluded.has(id)) autoIds.push(id);
    else manualIds.push(id);
  }

  const makeSection = (title, ids) => {
    const titleEl = document.createElement("div");
    titleEl.className = "excludedSectionTitle";
    titleEl.textContent = `${title} (${ids.length})`;

    const box = document.createElement("div");
    box.className = "excludedSectionList";

    const frag = document.createDocumentFragment();
    for (const id of ids) {
      const item = byId(id);
      if (item) frag.appendChild(makeThumb(item, "include"));
    }
    box.appendChild(frag);

    el.gridExcluded.appendChild(titleEl);
    el.gridExcluded.appendChild(box);
  };

  // 위: 자동 제외, 아래: 직접 제외
  makeSection("제외된 공식들", autoIds);
  makeSection("직접 제외한 공식들", manualIds);
}

// ===== 메뉴/모달 =====
function openSheet() {
  el.sheet.classList.add("open");
  el.sheet.setAttribute("aria-hidden", "false");
}
function closeSheet() {
  el.sheet.classList.remove("open");
  el.sheet.setAttribute("aria-hidden", "true");
}
function openModal() {
  el.modal.classList.add("open");
  el.modal.setAttribute("aria-hidden", "false");
  el.inpDesc.value = "";
  el.inpTex.value = "";
  el.preview.textContent = "";
}
function closeModal() {
  el.modal.classList.remove("open");
  el.modal.setAttribute("aria-hidden", "true");
}

// ===== 백업/복원 =====
function downloadBackup() {
  const payload = {
    version: 1,
    formulas: FORMULAS,
    excluded: [...excluded],
    autoExcluded: [...autoExcluded],
    deckCycles,
    stats,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "formulas_backup.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function restoreFromFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);

  if (!data || !Array.isArray(data.formulas)) throw new Error("invalid backup");

  const formulas = data.formulas
    .filter(x => x && typeof x.id === "string" && typeof x.tex === "string")
    .map(x => ({ id: x.id, desc: String(x.desc ?? ""), tex: x.tex }));

  FORMULAS = formulas;
  rebuildMap();
  saveStore();

  excluded = new Set(Array.isArray(data.excluded) ? data.excluded.filter(x => typeof x === "string") : []);
  autoExcluded = new Set(Array.isArray(data.autoExcluded) ? data.autoExcluded.filter(x => typeof x === "string") : []);
  deckCycles = Number.isFinite(Number(data.deckCycles)) ? Math.max(0, Math.floor(Number(data.deckCycles))) : 0;
  saveExcluded();
  saveAutoExcluded();
  saveDeckCycles();

  stats = (data && typeof data.stats === "object" && data.stats) ? data.stats : {};
  for (const k of Object.keys(stats)) {
    if (typeof stats[k] !== "number" || !isFinite(stats[k])) delete stats[k];
  }
  saveStats();

  init();
}

function updateDecayCounterText() {
  if (!el.decayCounterText) return;

  // DECAY_EVERY_CYCLES가 10이라고 가정
  const mod = deckCycles % DECAY_EVERY_CYCLES;
  const left = mod === 0 ? DECAY_EVERY_CYCLES : (DECAY_EVERY_CYCLES - mod);

  el.decayCounterText.textContent = `감쇠까지 ${left}바퀴`;
}

// ===== 이벤트 =====
function isClickOnUI(target) {
  return (
    target.closest("#topbar") ||
    target.closest(".panel") ||
    target.closest(".thumb") ||
    target.closest(".closeBtn") ||
    target.closest(".fab") ||
    target.closest(".sheet") ||
    target.closest(".modal")
  );
}
////////
let stagePointerActive = false;
let stageStartX = 0;
let stageStartY = 0;

el.stage.addEventListener("pointerdown", (e) => {
  // 왼쪽/오른쪽 패널 영역에서 시작한 터치는 무시 (기존 로직 있으면 유지)
  stagePointerActive = true;
  stageStartX = e.clientX;
  stageStartY = e.clientY;

  // iOS에서 길게 누르다 떼는 동작 안정화에 도움
  try { el.stage.setPointerCapture(e.pointerId); } catch (_) {}

  e.preventDefault();
}, { passive: false });

el.stage.addEventListener("pointerup", (e) => {
  if (!stagePointerActive) return;
  stagePointerActive = false;

  const dx = e.clientX - stageStartX;
  const dy = e.clientY - stageStartY;
  const moved = Math.hypot(dx, dy) > 12; // 12px 이상 움직였으면 탭으로 안 봄
  if (moved) return;

  // ✅ 여기서 “설명→공식→다음” 동작 실행
  if (currentId && stageView === "desc") {
    showFormula(currentId);
  } else {
    showRandomNext();
  }

  e.preventDefault();
}, { passive: false });

el.stage.addEventListener("pointercancel", () => {
  stagePointerActive = false;
});

// 상단 버튼
let excludeBtnLongPressed = false;
let excludeBtnTimer = null;
const LONGPRESS_MS = 550;

el.btnExclude.addEventListener("click", (e) => {
  e.stopPropagation();
  if (excludeBtnLongPressed) return; // 길게 눌러서 이미 처리됐으면 클릭 무시
  if (!currentId) return;

  const n = incCorrect(currentId);

  if (n >= AUTO_EXCLUDE_AFTER) {
    excludeNow(currentId, { manual: false }); // n번 이상이면 자동 제외
  } else {
    showRandomNext();      // 아직이면 다음으로만
  }
});

el.btnExclude.addEventListener("pointerdown", (e) => {
  if (!currentId) return;
  excludeBtnLongPressed = false;

  excludeBtnTimer = setTimeout(() => {
    excludeBtnLongPressed = true;
    excludeNow(currentId, { manual: true }); // 길게 누르면 즉시 제외(수동 제외)
  }, LONGPRESS_MS);
});

function clearExcludeBtnPress() {
  if (excludeBtnTimer) clearTimeout(excludeBtnTimer);
  excludeBtnTimer = null;
}

el.btnExclude.addEventListener("pointerup", clearExcludeBtnPress);
el.btnExclude.addEventListener("pointercancel", clearExcludeBtnPress);
el.btnExclude.addEventListener("pointerleave", clearExcludeBtnPress);

el.btnUnlearned.addEventListener("click", (e) => {
  e.stopPropagation();
  renderGrids();
  openPanel("left");
});
el.btnExcluded.addEventListener("click", (e) => {
  e.stopPropagation();
  renderGrids();
  openPanel("right");
});
el.closeUnlearned.addEventListener("click", (e) => { e.stopPropagation(); closePanel("left"); });
el.closeExcluded.addEventListener("click", (e) => { e.stopPropagation(); closePanel("right"); });

// 우하단 메뉴
el.fab.addEventListener("click", (e) => { e.stopPropagation(); openSheet(); });
el.btnSheetClose.addEventListener("click", (e) => { e.stopPropagation(); closeSheet(); });
el.sheet.addEventListener("click", (e) => { if (e.target === el.sheet) closeSheet(); });

// 메뉴 항목
el.btnAdd.addEventListener("click", () => { closeSheet(); openModal(); });
el.btnBackup.addEventListener("click", () => { closeSheet(); downloadBackup(); });

el.decayCounterText = document.getElementById("decayCounterText");

el.fileRestore.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  try {
    closeSheet();
    await restoreFromFile(file);
  } catch {
    alert("복원 실패: JSON 형식이 이상함");
  }
});

// 추가 모달
el.btnPreview.addEventListener("click", () => {
  const tex = el.inpTex.value.trim();
  el.preview.textContent = "";
  if (!tex) return;
  renderKatexInto(el.preview, tex, { displayMode: true });
});

el.btnSave.addEventListener("click", () => {
  const tex = el.inpTex.value.trim();
  const desc = el.inpDesc.value.trim();
  if (!tex) return;

  const item = { id: newId(), desc, tex };
  FORMULAS.push(item);
  rebuildMap();
  saveStore();

  // 풀 변경 지점 → 덱 재구성
  rebuildDeck();

  setCounts();
  renderGrids();
  showDesc(item.id);
  closeModal();
});

el.btnCancel.addEventListener("click", closeModal);
el.modal.addEventListener("click", (e) => { if (e.target === el.modal) closeModal(); });

// ===== 초기 샘플 =====
function ensureSeed() {
  if (FORMULAS.length > 0) return;
  FORMULAS = [
    { id: newId(), desc: "유효전력", tex: String.raw`P = VI\cos\theta` },
    { id: newId(), desc: "무효전력", tex: String.raw`Q = VI\sin\theta` },
  ];
  rebuildMap();
  saveStore();
}

// ===== init =====
function init() {
  ensureSeed();

  // 맵/정합성
  rebuildMap();
  const ids = new Set(FORMULAS.map(f => f.id));

  excluded = new Set([...excluded].filter(id => ids.has(id)));
  autoExcluded = new Set([...autoExcluded].filter(id => ids.has(id) && excluded.has(id)));
  saveExcluded();
  saveAutoExcluded();

  for (const k of Object.keys(stats)) {
    if (!ids.has(k)) delete stats[k];
  }
  saveStats();

  const v = document.querySelector('meta[name="app-version"]')?.content || "v?";
  el.panelFooter.textContent = `버전: ${v}`;

  setCounts();
  renderGrids();
  
  ensureDeckProgressBar();
  updateDecayCounterText();
  
  if (!restoreDeckStateIfValid()) {
    rebuildDeck();
  } else {
    updateDeckProgressBar();
  }
  
  // ✅ 마지막에 보던 카드/화면 복원 우선
  if (!restoreStageStateIfValid()) {
    showRandomNext();
  }
}

init();
