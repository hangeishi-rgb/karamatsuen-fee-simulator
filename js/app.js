import { calculateTotal } from "./calculation/total.js";
import { selectApplicableVersion, formatDateYmd } from "./calculation/versionSelect.js";

// 高額介護サービス費の区分(highCostCareCategoryId)は任意選択のため必須項目には含めない。
const REQUIRED_FIELDS = ["careLevel", "copayRatio", "roomType", "limitStage"];

const state = {
  careLevel: null,
  copayRatio: null,
  roomType: null,
  days: 30,
  limitStage: null,
  highCostCareCategoryId: null,
};

let feeMaster = null;
let highCostCareMaster = null;

async function loadVersions(path) {
  const res = await fetch(path);
  const json = await res.json();
  return json.versions;
}

async function loadData() {
  const today = formatDateYmd();

  const [feeVersions, hcVersions] = await Promise.all([
    loadVersions("./data/karamatsu/versions.json"),
    loadVersions("./data/osaka/high-cost-care/versions.json"),
  ]);

  const feeVersion = selectApplicableVersion(feeVersions, today);
  const hcVersion = selectApplicableVersion(hcVersions, today);

  const [feeRes, hcRes] = await Promise.all([
    fetch(`./data/karamatsu/${feeVersion}.json`),
    fetch(`./data/osaka/high-cost-care/${hcVersion}.json`),
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

const COPAY_RATIO_LABELS = { "0.1": "1割", "0.2": "2割", "0.3": "3割" };

function renderConditionSummary(input) {
  const careLevelLabel = feeMaster.careLevels[String(input.careLevel)].label;
  const roomTypeLabel = feeMaster.foodAndRoom.roomTypeLabels[input.roomType];
  const stageLabel = feeMaster.foodAndRoom.stageLabels[input.limitStage];
  const copayRatioLabel = COPAY_RATIO_LABELS[String(input.copayRatio)] || `${input.copayRatio * 100}割`;
  const highCostCareLabel = input.highCostCareCategoryId
    ? highCostCareMaster.categories.find((c) => c.id === input.highCostCareCategoryId)?.label
    : "選択しない(わからない)";

  document.getElementById("cond-careLevel").textContent = careLevelLabel;
  document.getElementById("cond-copayRatio").textContent = copayRatioLabel;
  document.getElementById("cond-roomType").textContent = roomTypeLabel;
  document.getElementById("cond-days").textContent = `${input.days}日`;
  document.getElementById("cond-limitStage").textContent = stageLabel;
  document.getElementById("cond-highCostCare").textContent = highCostCareLabel;

  document.getElementById("print-date").textContent = `作成日: ${new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date())}`;
}

function renderResult(result) {
  const { careService, food, room, highCostCare, finalCareServiceCopay, finalTotal } = result;

  renderConditionSummary(result.input);
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

  document.querySelectorAll(".option-btn").forEach((b) => b.setAttribute("aria-pressed", "false"));
  document.querySelectorAll(".step-status").forEach((s) => (s.textContent = ""));
  document.querySelector('[data-field="copayRatio"] [data-value="0.1"]').setAttribute("aria-pressed", "true");
  document.getElementById("days-display").textContent = "30";

  document.getElementById("result-panel").hidden = true;
  updateCalcButtonState();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function init() {
  await loadData();
  buildHighCostCareOptions();
  setupOptionGroups();
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
      otherServicesCopay: 0,
      otherFees: 0,
    };
    const result = calculateTotal(feeMaster, highCostCareMaster, input);
    renderResult(result);
  });

  document.getElementById("reset-button").addEventListener("click", resetAll);
  document.getElementById("print-button").addEventListener("click", () => {
    window.print();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      /* オフライン対応の登録に失敗しても計算機能自体は利用できるため無視する */
    });
  }
}

init();
