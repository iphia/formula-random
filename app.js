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
};

// ===== 상태 =====
let FORMULAS = loadStore();             // [{id, desc, tex}]
let excluded = loadExcluded();          // Set(ids)
let currentId = null;

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
  const pool = availableFormulas();
  if (pool.length === 0) {
    el.filename.textContent = "전부 제외됨(=다 외웠음). 제외 목록에서 다시 포함시켜줘.";
    el.formulaBox.textContent = "";
    currentId = null;
    return;
  }
  let pick = shufflePick(pool);
  if (pool.length >= 2 && pick.id === currentId) {
    pick = shufflePick(pool.filter(x => x.id !== currentId));
  }
  showFormula(pick.id);
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
      // include
      excluded.delete(item.id);
      saveExcluded();
      setCounts();
      renderGrids();
      showFormula(item.id);
    }
  };

  wrap.addEventListener("click", (e) => { e.stopPropagation(); action(); });
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

  init(); // 화면 갱신
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

// 화면 탭 → 다음 공식
el.stage.addEventListener("touchend", (e) => {
  if (isClickOnUI(e.target)) return;
  e.preventDefault();
  showRandomNext();
}, { passive: false });
el.stage.addEventListener("click", (e) => {
  if (isClickOnUI(e.target)) return;
  showRandomNext();
});

// 상단 버튼
el.btnExclude.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!currentId) return;
  excluded.add(currentId);
  saveExcluded();
  setCounts();
  renderGrids();
  showRandomNext();
});
el.btnUnlearned.addEventListener("click", (e) => { e.stopPropagation(); renderGrids(); openPanel("left"); });
el.btnExcluded.addEventListener("click", (e) => { e.stopPropagation(); renderGrids(); openPanel("right"); });
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

// ===== 초기 샘플(처음 실행 편의) =====
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

  // excluded 정리(없는 id 제거)
  const ids = new Set(FORMULAS.map(f => f.id));
  excluded = new Set([...excluded].filter(id => ids.has(id)));
  saveExcluded();

  setCounts();
  renderGrids();
  showRandomNext();
}

init();
