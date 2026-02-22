// ===== 저장 키 =====
const STORE_KEY = "latex_formulas_store_v1";
const EXCLUDE_KEY = "latex_formulas_excluded_v1";

// ===== DOM =====
const el = {
  stage: document.getElementById("stage"),
  formulaBox: document.getElementById("formulaBox"),
  filename: document.getElementById("filename"),

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
let excluded = loadExcluded();     // Set(ids)
let currentId = null;
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
  localStorage.setItem(STORE_KEY, JSON.stringify(FORMULAS));
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
  localStorage.setItem(EXCLUDE_KEY, JSON.stringify([...excluded]));
}
function newId() {
  return "f_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

// ===== 유틸 =====
function shuffleInPlace(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rebuildDeck() {
  const pool = availableFormulas().map(f => f.id);

  if (pool.length === 0) {
    deck = [];
    deckIndex = 0;
    return;
  }

  deck = shuffleInPlace(pool);
  deckIndex = 0;

  // 첫 장이 직전과 같으면(가능할 때) 한 번 회피
  if (deck.length >= 2 && deck[0] === currentId) {
    [deck[0], deck[1]] = [deck[1], deck[0]];
  }
}

function nextFromDeck() {
  if (deck.length === 0) return null;

  if (deckIndex >= deck.length) {
    // 한 바퀴 끝 → 다시 셔플해서 새 바퀴
    rebuildDeck();
    if (deck.length === 0) return null;
  }

  const id = deck[deckIndex];
  deckIndex += 1;
  return id;
}
function byId(id) {
  return FORMULAS.find(f => f.id === id) || null;
}
function availableFormulas() {
  return FORMULAS.filter(f => !excluded.has(f.id));
}
function shufflePick(arr) {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
}
function setCounts() {
  el.unlearnedCount.textContent = String(availableFormulas().length);
  el.excludedCount.textContent = String(excluded.size);
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

// ===== 표시 =====
function showFormula(id) {
  const item = byId(id);
  if (!item) return;
  currentId = item.id;
  renderKatexInto(el.formulaBox, item.tex, { displayMode: true });
  el.filename.textContent = item.desc || "";
  closeBothPanels();
}
function showRandomNext() {
  // 덱이 비었거나, 덱이 현재 풀(미암기)과 안 맞을 수 있으니 필요하면 재구성
  const poolIds = new Set(availableFormulas().map(f => f.id));

  const deckValid =
    deck.length > 0 &&
    deck.every(id => poolIds.has(id)); // 제외/삭제로 풀 바뀌면 무효

  if (!deckValid) rebuildDeck();

  if (deck.length === 0) {
    el.filename.textContent = "전부 제외됨(=다 외웠음). 제외 목록에서 다시 포함시켜줘.";
    el.formulaBox.textContent = "";
    currentId = null;
    return;
  }

  const id = nextFromDeck();
  if (!id) return;

  showFormula(id);
}

// ===== 삭제 =====
function deleteFormula(id) {
  const idx = FORMULAS.findIndex(f => f.id === id);
  if (idx === -1) return;

  FORMULAS.splice(idx, 1);
  saveStore();

  excluded.delete(id);
  saveExcluded();

  if (currentId === id) {
    currentId = null;
  }

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
      showFormula(item.id);
    } else {
      excluded.delete(item.id);
      rebuildDeck();
      saveExcluded();
      setCounts();
      renderGrids();
      showFormula(item.id);
    }
  };

  // 롱프레스(길게 누름)로 삭제
  let pressTimer = null;
  let longPressed = false;

  const startPress = () => {
    longPressed = false;
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
    startPress();
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
  availableFormulas().forEach(item => el.gridUnlearned.appendChild(makeThumb(item, "view")));

  el.gridExcluded.innerHTML = "";
  [...excluded].map(byId).filter(Boolean).forEach(item => el.gridExcluded.appendChild(makeThumb(item, "include")));
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
  saveStore();

  excluded = new Set(Array.isArray(data.excluded) ? data.excluded.filter(x => typeof x === "string") : []);
  saveExcluded();

  init();
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

// ===== 화면 탭 → 다음 공식 (중복 방지: 터치/펜은 pointerup, 마우스는 click) =====
let lastAdvanceAt = 0;

function tryAdvance(e) {
  if (isClickOnUI(e.target)) return;

  const now = Date.now();
  if (now - lastAdvanceAt < 1200) return; // 길게 눌렀을 때 늦은 click까지 확실히 차단
  lastAdvanceAt = now;

  showRandomNext();
}

// 터치/펜 전용
el.stage.addEventListener("pointerup", (e) => {
  if (e.pointerType === "mouse") return;
  e.preventDefault();
  tryAdvance(e);
}, { passive: false });

// 마우스 전용
el.stage.addEventListener("click", (e) => {
  // 터치에서 합성 click이 와도, 위 lastAdvanceAt 가 막아줌
  tryAdvance(e);
});

// 상단 버튼
el.btnExclude.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!currentId) return;
  excluded.add(currentId);
  saveExcluded();
  rebuildDeck();
  setCounts();
  renderGrids();
  showRandomNext();
});

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
  saveStore();

  setCounts();
  renderGrids();
  showFormula(item.id);
  closeModal();
});

el.btnCancel.addEventListener("click", closeModal);
el.modal.addEventListener("click", (e) => { if (e.target === el.modal) closeModal(); });

// iOS 더블탭 줌 방지
let lastTouchEnd = 0;
document.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener("gesturestart", (e) => e.preventDefault());

// ===== 초기 샘플 =====
function ensureSeed() {
  if (FORMULAS.length > 0) return;
  FORMULAS = [
    { id: newId(), desc: "유효전력", tex: String.raw`P = VI\cos\theta` },
    { id: newId(), desc: "무효전력", tex: String.raw`Q = VI\sin\theta` },
  ];
  saveStore();
}

// ===== init =====
function init() {
  ensureSeed();

  const ids = new Set(FORMULAS.map(f => f.id));
  excluded = new Set([...excluded].filter(id => ids.has(id)));
  saveExcluded();

  const v = document.querySelector('meta[name="app-version"]')?.content || "v?";
el.panelFooter.textContent = `버전: ${v}`;
  
  setCounts();
  renderGrids();
  rebuildDeck();
  showRandomNext();
}

init();
