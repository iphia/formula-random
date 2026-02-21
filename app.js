/**
 * 공식 이미지 목록은 여기 배열에 파일명만 추가하면 됨.
 * 예: formulas 폴더에 f01.png 넣었으면 "f01.png" 추가.
 */
const FORMULAS = [
  "f000.png",
  "f001.png",
  "f002.png",
  "f003.png",
  // ...
];

const LS_KEY = "formula_excluded_set_v1";

const el = {
  stage: document.getElementById("stage"),
  img: document.getElementById("formulaImg"),
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
};

let excluded = loadExcluded(); // Set of filenames
let current = null;

// ---------- util ----------
function loadExcluded() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter(x => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function saveExcluded() {
  localStorage.setItem(LS_KEY, JSON.stringify([...excluded]));
}

function shufflePick(arr) {
  if (arr.length === 0) return null;
  const i = Math.floor(Math.random() * arr.length);
  return arr[i];
}

function availableFormulas() {
  // "아직 외우지 못한" = 전체 - excluded
  return FORMULAS.filter(f => !excluded.has(f));
}

function setCounts() {
  const unlearned = availableFormulas().length;
  el.unlearnedCount.textContent = String(unlearned);
  el.excludedCount.textContent = String(excluded.size);
}

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

// ---------- image sizing rule ----------
// 규칙:
// 1) 이미지 폭이 화면폭 넘으면: 양쪽 여백 조금 주고 폭에 맞춤 (width: 100% 느낌)
// 2) 아니면: 세로 길이를 화면의 20% 정도 (height: 20vh)로 보이게
function applySizingRules() {
  const vw = window.innerWidth;
  const pad = 14 * 2; // 좌우 여백
  const maxW = vw - pad;

  // naturalWidth는 이미지 로드 후에만 정확함
  const nw = el.img.naturalWidth || 0;

  // 초기화
  el.img.style.width = "";
  el.img.style.height = "";

  if (nw > maxW) {
    // 폭이 큰 공식: 폭 기준 맞춤
    el.img.style.width = `calc(100vw - ${pad}px)`;
    el.img.style.height = "auto";
  } else {
    // 폭이 작은 공식: 높이를 20vh 정도로
    el.img.style.height = "20vh";
    el.img.style.width = "auto";
  }
}

function showFormula(filename, { silent = false } = {}) {
  if (!filename) return;

  current = filename;
  el.img.src = `formulas/${filename}`;
  el.filename.textContent = filename;

  // 이미지 로드 후 규칙 적용
  el.img.onload = () => applySizingRules();

  if (!silent) closeBothPanels();
}

function showRandomNext() {
  const pool = availableFormulas();

  if (pool.length === 0) {
    // 다 외웠음(전부 제외됨)
    el.filename.textContent = "전부 제외됨(=다 외웠음). 제외 목록에서 다시 포함시켜줘.";
    el.img.removeAttribute("src");
    current = null;
    return;
  }

  // 지금 보고 있는 것과 똑같은 게 계속 나오는 거 방지(가능하면)
  let pick = shufflePick(pool);
  if (pool.length >= 2 && pick === current) {
    pick = shufflePick(pool.filter(x => x !== current));
  }
  showFormula(pick);
}

// ---------- grid render ----------
function makeThumb(filename, { mode }) {
  // mode:
  // - "view" (미암기 목록): 누르면 그 공식 바로 보기
  // - "include" (제외 목록): 누르면 다시 포함(=excluded에서 제거)
  const wrap = document.createElement("div");
  wrap.className = "thumb";
  wrap.tabIndex = 0;

  const img = document.createElement("img");
  img.loading = "lazy";
  img.alt = filename;
  img.src = `formulas/${filename}`;

  const cap = document.createElement("div");
  cap.className = "cap";
  cap.textContent = filename;

  wrap.appendChild(img);
  wrap.appendChild(cap);

  const action = () => {
    if (mode === "view") {
      showFormula(filename);
    } else if (mode === "include") {
      excluded.delete(filename);
      saveExcluded();
      setCounts();
      renderGrids();
      // 포함시킨 뒤엔 랜덤풀에 들어가니, 원하면 바로 보여주게도 할 수 있음
      showFormula(filename);
    }
  };

  wrap.addEventListener("click", (e) => {
    e.stopPropagation();
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
  // 미암기(=excluded 제외한 것들)
  const unlearned = availableFormulas();
  el.gridUnlearned.innerHTML = "";
  unlearned.forEach(f => el.gridUnlearned.appendChild(makeThumb(f, { mode: "view" })));

  // 제외(외운 것)
  const ex = [...excluded].filter(f => FORMULAS.includes(f));
  el.gridExcluded.innerHTML = "";
  ex.forEach(f => el.gridExcluded.appendChild(makeThumb(f, { mode: "include" })));
}

// ---------- events ----------
function isClickOnUI(target) {
  return (
    target.closest("#topbar") ||
    target.closest(".panel") ||
    target.closest(".topbtn") ||
    target.closest(".thumb") ||
    target.closest(".closeBtn")
  );
}

el.stage.addEventListener("touchend", (e) => {
  if (isClickOnUI(e.target)) return;
  e.preventDefault();         // 핵심: 기본 동작(줌 등) 방지
  showRandomNext();
}, { passive: false });

// 데스크탑/일반 브라우저용
el.stage.addEventListener("click", (e) => {
  if (isClickOnUI(e.target)) return;
  showRandomNext();
});

el.btnExclude.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!current) return;
  excluded.add(current);
  saveExcluded();
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

el.closeUnlearned.addEventListener("click", (e) => {
  e.stopPropagation();
  closePanel("left");
});
el.closeExcluded.addEventListener("click", (e) => {
  e.stopPropagation();
  closePanel("right");
});

// 창 크기 바뀌면 현재 이미지 규칙 다시 적용
window.addEventListener("resize", () => {
  if (current) applySizingRules();
});

// ---------- init ----------
function init() {
  // excluded에 FORMULAS에 없는 값이 들어있으면 정리(파일 삭제 등 대비)
  excluded = new Set([...excluded].filter(f => FORMULAS.includes(f)));
  saveExcluded();

  setCounts();
  renderGrids();
  showRandomNext();
}
// iOS 더블탭 줌 방지 (빠르게 연타할 때 확대되는 현상)
let lastTouchEnd = 0;
document.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) {
    e.preventDefault();
  }
  lastTouchEnd = now;
}, { passive: false });

// 핀치줌(제스처) 방지(필요하면)
document.addEventListener("gesturestart", (e) => e.preventDefault());
init();
