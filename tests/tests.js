import { calculateCareService } from "../js/calculation/careService.js";
import { calculateFood } from "../js/calculation/food.js";
import { calculateRoom } from "../js/calculation/room.js";
import { calculateHighCostCare } from "../js/calculation/highCostCare.js";
import { calculateTotal } from "../js/calculation/total.js";
import { selectApplicableVersion } from "../js/calculation/versionSelect.js";

/**
 * ブラウザ上で動く簡易テストランナー(Node.js不使用環境のため)。
 * 結果は #results 要素にテキストとして書き出す。
 */

const results = [];
let passCount = 0;
let failCount = 0;

function assertEqual(actual, expected, label) {
  const ok = actual === expected;
  if (ok) {
    passCount++;
  } else {
    failCount++;
    results.push(`NG: ${label} -> actual=${actual} expected=${expected}`);
  }
}

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`failed to load ${path}: ${res.status}`);
  }
  return res.json();
}

async function run() {
  const feeMaster = await loadJson("../data/karamatsu/2026-08-01.json");
  const highCostCareMaster = await loadJson("../data/osaka/high-cost-care/2026-08-01.json");

  const examples = feeMaster.verifiedThirtyDayExamples;
  const roomTypes = ["private", "multi"];
  const stages = ["1", "2", "3_1", "3_2", "4"];
  const careLevels = ["1", "2", "3", "4", "5"];

  // 1割 x 全段階 x 全介護度 x 個室/多床室 (料金表 掲載の30日例)
  for (const roomType of roomTypes) {
    for (const stage of stages) {
      for (const careLevel of careLevels) {
        const care = calculateCareService(feeMaster, careLevel, 30, 0.1);
        const food = calculateFood(feeMaster, roomType, stage, 30);
        const room = calculateRoom(feeMaster, roomType, stage, 30);
        const total = care.copay + food.totalAmount + room.totalAmount;
        const expected = examples.wariai1[roomType][stage][careLevel];
        assertEqual(total, expected, `1wari ${roomType} stage${stage} careLevel${careLevel}`);
      }
    }
  }

  // 2割・3割 x 第4段階 x 個室/多床室 x 全介護度 (料金表 掲載の30日例)
  for (const careLevel of careLevels) {
    for (const roomType of roomTypes) {
      const care2 = calculateCareService(feeMaster, careLevel, 30, 0.2);
      const care3 = calculateCareService(feeMaster, careLevel, 30, 0.3);
      const food4 = calculateFood(feeMaster, roomType, "4", 30);
      const room4 = calculateRoom(feeMaster, roomType, "4", 30);

      const total2 = care2.copay + food4.totalAmount + room4.totalAmount;
      const total3 = care3.copay + food4.totalAmount + room4.totalAmount;

      assertEqual(total2, examples.wariai2_stage4[roomType][careLevel], `2wari stage4 ${roomType} careLevel${careLevel}`);
      assertEqual(total3, examples.wariai3_stage4[roomType][careLevel], `3wari stage4 ${roomType} careLevel${careLevel}`);
    }
  }

  // 高額介護サービス費: 他サービスなし、上限超過なしのケース(軽減額0円になること)
  {
    const hc = calculateHighCostCare(highCostCareMaster, "over690", 10000, 0);
    assertEqual(hc.reductionAmount, 0, "highCostCare no-reduction case");
    assertEqual(hc.karamatsuCopayAfterReduction, 10000, "highCostCare no-reduction copay unchanged");
  }

  // 高額介護サービス費: 上限超過ケース(第1段階相当のシナリオを模した数値で按分を検証)
  {
    // targetAmount=50000, limit=44400 => reduction=5600, 他サービスなしなので全額からまつ苑に按分
    const hc = calculateHighCostCare(highCostCareMaster, "under380", 50000, 0);
    assertEqual(hc.targetAmount, 50000, "highCostCare targetAmount");
    assertEqual(hc.limitAmount, 44400, "highCostCare limitAmount");
    assertEqual(hc.amountAfterLimit, 44400, "highCostCare amountAfterLimit");
    assertEqual(hc.reductionAmount, 5600, "highCostCare reductionAmount");
    assertEqual(hc.karamatsuCopayAfterReduction, 44400, "highCostCare karamatsuCopayAfterReduction (other=0)");
  }

  // 高額介護サービス費: 他サービスありのケース(按分計算)
  {
    // karamatsu=40000, other=10000 => target=50000, limit=44400, reduction=5600
    // karamatsu share = floor(5600 * 40000/50000) = floor(4480) = 4480
    // karamatsu after = 40000-4480 = 35520
    const hc = calculateHighCostCare(highCostCareMaster, "under380", 40000, 10000);
    assertEqual(hc.reductionAmount, 5600, "highCostCare with-other reductionAmount");
    assertEqual(hc.karamatsuCopayAfterReduction, 35520, "highCostCare with-other karamatsuCopayAfterReduction");
  }

  // calculateTotal 全体結合テスト(月途中利用・15日、要介護3・1割・多床室・第2段階)
  {
    const input = {
      careLevel: "3",
      copayRatio: 0.1,
      roomType: "multi",
      days: 15,
      limitStage: "2",
      highCostCareCategoryId: "under380",
      otherServicesCopay: 0,
      otherFees: 0,
    };
    const result = calculateTotal(feeMaster, highCostCareMaster, input);
    // I = (732+70)*15 = 12030, II=130, unitBeforeTreatment=12160
    // III = floor(12160*0.176) = floor(2140.16) = 2140
    // totalUnit = 12160+2140 = 14300
    // totalCost = floor(14300*10.72) = floor(153296) = 153296
    // copay(0.1) = floor(15329.6) = 15329
    assertEqual(result.careService.copay, 15329, "calculateTotal partial-month careService.copay");
    // food/room stage2 multi: room=430,food=390 -> (430+390)*15=12300
    assertEqual(result.food.totalAmount + result.room.totalAmount, 12300, "calculateTotal partial-month food+room");
    assertEqual(result.finalTotal, 15329 + 12300, "calculateTotal partial-month finalTotal");
  }

  // calculateTotal: 高額介護サービス費の区分が未選択(null)の場合、軽減額を計算せずそのまま合算すること
  {
    const input = {
      careLevel: "3",
      copayRatio: 0.1,
      roomType: "multi",
      days: 15,
      limitStage: "2",
      highCostCareCategoryId: null,
      otherServicesCopay: 0,
      otherFees: 0,
    };
    const result = calculateTotal(feeMaster, highCostCareMaster, input);
    assertEqual(result.highCostCare, null, "calculateTotal unselected highCostCare is null");
    assertEqual(result.finalCareServiceCopay, result.careService.copay, "calculateTotal unselected finalCareServiceCopay unchanged");
    assertEqual(result.finalTotal, 15329 + 12300, "calculateTotal unselected finalTotal unchanged");
  }

  // calculateTotal: 生活保護受給等 選択時は食費・居住費の本人負担が0円になること
  {
    const input = {
      careLevel: "3",
      copayRatio: 0.1,
      roomType: "private",
      days: 30,
      limitStage: "1",
      highCostCareCategoryId: "livelihoodProtection",
      otherServicesCopay: 0,
      otherFees: 0,
    };
    const result = calculateTotal(feeMaster, highCostCareMaster, input);
    // careService.copay = 50895(料金表30日例) - 20400(stage1 private food+room) = 30495
    assertEqual(result.careService.copay, 30495, "livelihoodProtection careService.copay");
    // highCostCare limit=15000, target=30495 -> reduction適用でfinalCareServiceCopay=15000
    assertEqual(result.finalCareServiceCopay, 15000, "livelihoodProtection finalCareServiceCopay capped at 15000");
    assertEqual(result.welfareCoversFoodAndRoom, true, "livelihoodProtection welfareCoversFoodAndRoom flag");
    assertEqual(result.finalFoodAmount, 0, "livelihoodProtection finalFoodAmount is 0");
    assertEqual(result.finalRoomAmount, 0, "livelihoodProtection finalRoomAmount is 0");
    assertEqual(result.food.totalAmount, 9000, "livelihoodProtection reference food.totalAmount unchanged");
    assertEqual(result.room.totalAmount, 11400, "livelihoodProtection reference room.totalAmount unchanged");
    assertEqual(result.finalTotal, 15000, "livelihoodProtection finalTotal excludes food/room");
  }

  // selectApplicableVersion: 料金改定対応の日付選択ロジック
  {
    const versions = ["2026-08-01", "2027-04-01", "2025-01-01"];
    assertEqual(selectApplicableVersion(versions, "2026-09-14"), "2026-08-01", "selectApplicableVersion current date");
    assertEqual(selectApplicableVersion(versions, "2027-04-01"), "2027-04-01", "selectApplicableVersion exact effective date");
    assertEqual(selectApplicableVersion(versions, "2027-12-31"), "2027-04-01", "selectApplicableVersion after latest revision");
    assertEqual(selectApplicableVersion(versions, "2024-01-01"), "2025-01-01", "selectApplicableVersion before earliest (fallback to earliest)");
    assertEqual(selectApplicableVersion(["2026-08-01"], "2026-08-01"), "2026-08-01", "selectApplicableVersion single version");
  }

  const summary = `TOTAL: ${passCount + failCount}  PASS: ${passCount}  FAIL: ${failCount}`;
  results.push(summary);
  document.getElementById("results").textContent = results.join("\n");
  document.title = failCount === 0 ? "TESTS PASSED" : "TESTS FAILED";
}

run().catch((err) => {
  document.getElementById("results").textContent = `ERROR: ${err.message}\n${err.stack}`;
  document.title = "TESTS ERROR";
});
