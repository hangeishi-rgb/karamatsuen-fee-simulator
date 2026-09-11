import { calculateTotal } from "./calculation/total.js";

// 高額介護サービス費の区分(highCostCareCategoryId)は任意選択のため必須項目には含めない。
const REQUIRED_FIELDS = ["careLevel", "copayRatio", "roomType", "limitStage"];

const state = {
  careLevel: null,
  copayRatio: null,
  roomType: null,
  days: 30,
  limitStage: null,
  highCostCareCategoryId: null,
  hasOtherServices: "no",
  otherServicesCopay: 0,
  otherFees: 0,
};

let feeMaster = null;
let highCostCareMaster = null;

async function loadData() {
  const [feeRes, hcRes] = await Promise.all([
    fetch("./data/karamatsu/2026-08-01.json"),
    fetch("./data/osaka/high-cost-care/2026-08-01.json"),
  ]);
  feeMaster = await feeRes.json();
  highCostCareMaster = await hcRes.json();
}

function formatYen(value) {
  return new Intl.NumberFormat("ja-JP").format(Math.round(value));
}

function buildHighCostCareOptions() {
  const container = document.getElementById("highCostCareOptions");
  container.innerHTML = "";

  const skipBtn = document.createElement("button");
  skipBtn.className = "option-btn wide small skip-option";
  skipBtn.type = "button";
  skipBtn.dataset.value = "";
  skipBtn.textContent = "選択しない(わからない)";
  container.appendChild(skipBtn);

  for (const category of highCostCareMaster.categories) {
    const btn = document.createElement("button");
    btn.className = "option-btn wide small";
    btn.type = "button";
    btn.dataset.value = category.id;
    btn.textContent = category.label;
    container.appendChild(btn);
  }
  wireOptionGroup(container, "highCostCareCategoryId");
}

function wireOptionGroup(container, field) {
  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".option-btn");
    if (!btn || !container.contains(btn)) return;
    selectValue(field, btn.dataset.value, container);
  });
}

function selectValue(field, value, container) {
  state[field] = value;
  const buttons = container.querySelectorAll(".option-btn");
  buttons.forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.value === value));
  });
  const statusEl = document.getElementById(`status-${field}`);
  if (statusEl) {
    const btn = Array.from(buttons).find((b) => b.dataset.value === value);
    statusEl.textContent = btn ? `選択中: ${btn.textContent}` : "";
  }
  updateCalcButtonState();
}

function setupOptionGroups() {
  document.querySelectorAll(".option-grid[data-field]").forEach((container) => {
    const field = container.dataset.field;
    if (field === "highCostCareCategoryId") return; // built dynamically
    wireOptionGroup(container, field);
  });

  // copayRatio default = 1割 (0.1)
  const copayContainer = document.querySelector('[data-field="copayRatio"]');
  selectValue("copayRatio", "0.1", copayContainer);
}

function setupOtherServicesToggle() {
  const container = document.querySelector('[data-field="hasOtherServices"]');
  const inputWrap = document.getElementById("otherServicesInput");
  const input = document.getElementById("otherServicesCopay");

  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".option-btn");
    if (!btn) return;
    const value = btn.dataset.value;
    state.hasOtherServices = value;
    container.querySelectorAll(".option-btn").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.value === value));
    });
    if (value === "yes") {
      inputWrap.hidden = false;
    } else {
      inputWrap.hidden = true;
      input.value = "0";
      state.otherServicesCopay = 0;
    }
  });

  // default = いいえ
  container.querySelector('[data-value="no"]').setAttribute("aria-pressed", "true");

  input.addEventListener("input", () => {
    const n = parseInt(input.value, 10);
    state.otherServicesCopay = Number.isFinite(n) && n >= 0 ? n : 0;
  });
}

function setupOtherFeesInput() {
  const input = document.getElementById("otherFees");
  input.addEventListener("input", () => {
    const n = parseInt(input.value, 10);
    state.otherFees = Number.isFinite(n) && n >= 0 ? n : 0;
  });
}

function setupDaysControl() {
  const display = document.getElementById("days-display");
  const minusBtn = document.getElementById("days-minus");
  const plusBtn = document.getElementById("days-plus");

  function render() {
    display.textContent = String(state.days);
    minusBtn.disabled = state.days <= 1;
    plusBtn.disabled = state.days >= 31;
  }

  minusBtn.addEventListener("click", () => {
    state.days = Math.max(1, state.days - 1);
    render();
  });
  plusBtn.addEventListener("click", () => {
    state.days = Math.min(31, state.days + 1);
    render();
  });

  render();
}

function updateCalcButtonState() {
  const calcButton = document.getElementById("calc-button");
  const allFilled = REQUIRED_FIELDS.every((f) => state[f] !== null && state[f] !== undefined);
  calcButton.disabled = !allFilled;
}

function renderResult(result) {
  const { careService, food, room, highCostCare, finalCareServiceCopay, otherFees, finalTotal } = result;

  document.getElementById("result-finalTotal").textContent = formatYen(finalTotal);

  document.getElementById("result-baseUnit").textContent = `${formatYen(careService.baseUnit)} 単位/日`;
  const additionUnits = careService.dailyAdditionUnit * state.days + careService.monthlyAdditionUnit;
  document.getElementById("result-additions").textContent = `${formatYen(additionUnits)} 単位`;
  document.getElementById("result-treatment").textContent = `${formatYen(careService.treatmentImprovementUnit)} 単位`;
  document.getElementById("result-careCopay").textContent = `${formatYen(careService.copay)}円`;

  const banner = document.getElementById("reduction-banner");
  if (highCostCare) {
    document.getElementById("result-hcBefore").textContent = `${formatYen(highCostCare.targetAmount)}円`;
    document.getElementById("result-hcCategoryLabel").textContent = highCostCare.category.label;
    document.getElementById("result-hcLimit").textContent = `${formatYen(highCostCare.limitAmount)}円`;
    document.getElementById("result-hcAfter").textContent = `${formatYen(highCostCare.amountAfterLimit)}円`;
    document.getElementById("result-hcReduction").textContent = `${formatYen(highCostCare.reductionAmount)}円`;

    if (highCostCare.reductionAmount > 0) {
      banner.hidden = false;
      banner.textContent = `高額介護サービス費により、からまつ苑分の自己負担が ${formatYen(
        careService.copay - finalCareServiceCopay
      )}円 軽減される見込みです(適用後: ${formatYen(finalCareServiceCopay)}円)。`;
    } else {
      banner.hidden = true;
    }
  } else {
    document.getElementById("result-hcBefore").textContent = `${formatYen(careService.copay)}円`;
    document.getElementById("result-hcCategoryLabel").textContent = "選択しない";
    document.getElementById("result-hcLimit").textContent = "—";
    document.getElementById("result-hcAfter").textContent = "—";
    document.getElementById("result-hcReduction").textContent = "未計算(区分未選択)";
    banner.hidden = false;
    banner.textContent = "高額介護サービス費の区分が選択されていないため、軽減額は計算していません。";
  }

  document.getElementById("result-food").textContent = `${formatYen(food.totalAmount)}円`;
  document.getElementById("result-room").textContent = `${formatYen(room.totalAmount)}円`;
  document.getElementById("result-otherFees").textContent = `${formatYen(otherFees)}円`;

  document.getElementById("result-panel").hidden = false;
  document.getElementById("result-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetAll() {
  state.careLevel = null;
  state.copayRatio = "0.1";
  state.roomType = null;
  state.days = 30;
  state.limitStage = null;
  state.highCostCareCategoryId = null;
  state.hasOtherServices = "no";
  state.otherServicesCopay = 0;
  state.otherFees = 0;

  document.querySelectorAll(".option-btn").forEach((b) => b.setAttribute("aria-pressed", "false"));
  document.querySelectorAll(".step-status").forEach((s) => (s.textContent = ""));
  document.querySelector('[data-field="copayRatio"] [data-value="0.1"]').setAttribute("aria-pressed", "true");
  document.querySelector('[data-field="hasOtherServices"] [data-value="no"]').setAttribute("aria-pressed", "true");
  document.getElementById("otherServicesInput").hidden = true;
  document.getElementById("otherServicesCopay").value = "0";
  document.getElementById("otherFees").value = "0";
  document.getElementById("days-display").textContent = "30";

  document.getElementById("result-panel").hidden = true;
  updateCalcButtonState();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function init() {
  await loadData();
  buildHighCostCareOptions();
  setupOptionGroups();
  setupOtherServicesToggle();
  setupOtherFeesInput();
  setupDaysControl();
  updateCalcButtonState();

  document.getElementById("calc-button").addEventListener("click", () => {
    const input = {
      careLevel: state.careLevel,
      copayRatio: parseFloat(state.copayRatio),
      roomType: state.roomType,
      days: state.days,
      limitStage: state.limitStage,
      highCostCareCategoryId: state.highCostCareCategoryId,
      otherServicesCopay: state.hasOtherServices === "yes" ? state.otherServicesCopay : 0,
      otherFees: state.otherFees,
    };
    const result = calculateTotal(feeMaster, highCostCareMaster, input);
    renderResult(result);
  });

  document.getElementById("reset-button").addEventListener("click", resetAll);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      /* オフライン対応の登録に失敗しても計算機能自体は利用できるため無視する */
    });
  }
}

init();
