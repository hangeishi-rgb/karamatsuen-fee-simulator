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
    // ※ feeMaster は 2026-08-01.json（月額加算70単位。科学的介護推進体制加算(Ⅰ)40と
    //    個別機能訓練加算(Ⅱ)20は令和8年11月1日からの算定開始のため含まない）
    // I = (732+70)*15 = 12030, II=70, unitBeforeTreatment=12100
    // III = floor(12100*0.176) = floor(2129.6) = 2129
    // totalUnit = 12100+2129 = 14229
    // totalCost = floor(14229*10.72) = floor(152534.88) = 152534
    // copay(0.1) = floor(15253.4) = 15253
    assertEqual(result.careService.copay, 15253, "calculateTotal partial-month careService.copay");
    // food/room stage2 multi: room=430,food=390 -> (430+390)*15=12300
    assertEqual(result.food.totalAmount + result.room.totalAmount, 12300, "calculateTotal partial-month food+room");
    assertEqual(result.finalTotal, 15253 + 12300, "calculateTotal partial-month finalTotal");
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
    assertEqual(result.finalTotal, 15253 + 12300, "calculateTotal unselected finalTotal unchanged");
  }

  // calculateTotal: 生活保護受給等 選択時は介護サービス自己負担・食費・居住費すべて本人負担0円になること
  // (介護扶助と高額介護サービス費の組み合わせで全額公費負担されるため)
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
    // careService.copay = 50819(暫定版料金表30日例) - 20400(stage1 private food+room) = 30419 (公費内訳の参考値)
    // ※令和8年11月1日から（月額加算130単位）は 50895 - 20400 = 30495 になる
    assertEqual(result.careService.copay, 30419, "livelihoodProtection careService.copay (reference)");
    assertEqual(result.highCostCare.limitAmount, 15000, "livelihoodProtection highCostCare limit (reference)");
    assertEqual(result.highCostCare.reductionAmount, 15419, "livelihoodProtection highCostCare reduction (reference)");
    assertEqual(result.residentBurdenWaived, true, "livelihoodProtection residentBurdenWaived flag");
    assertEqual(result.finalCareServiceCopay, 0, "livelihoodProtection finalCareServiceCopay is 0");
    assertEqual(result.finalFoodAmount, 0, "livelihoodProtection finalFoodAmount is 0");
    assertEqual(result.finalRoomAmount, 0, "livelihoodProtection finalRoomAmount is 0");

    // 生活保護受給等で、自己負担相当額が高額介護サービス費の上限額(15,000円)を下回る場合
    // (月途中入退所・短期利用など)。介護扶助からの支給額は上限額ではなく自己負担相当額そのものになる。
    {
      const shortInput = {
        careLevel: "1",
        copayRatio: 0.1,
        roomType: "private",
        days: 5,
        limitStage: "1",
        highCostCareCategoryId: "livelihoodProtection",
        otherServicesCopay: 0,
        otherFees: 0,
      };
      const short = calculateTotal(feeMaster, highCostCareMaster, shortInput);
      // I = (589+70)*5 = 3295, II=70, before=3365
      // III = floor(3365*0.176) = floor(592.24) = 592 -> totalUnit=3957
      // totalCost = floor(3957*10.72) = floor(42419.04) = 42419
      // copay(0.1) = floor(4241.9) = 4241
      assertEqual(short.careService.copay, 4241, "livelihoodProtection(short) careService.copay");
      assertEqual(short.highCostCare.reductionAmount, 0, "livelihoodProtection(short) 高額介護サービス費は0円");
      assertEqual(short.highCostCare.amountAfterLimit, 4241, "livelihoodProtection(short) 介護扶助は自己負担相当額と同額");
      assertEqual(short.finalCareServiceCopay, 0, "livelihoodProtection(short) 本人負担は0円");
      assertEqual(short.finalTotal, 0, "livelihoodProtection(short) 合計も0円");
    }
    assertEqual(result.food.totalAmount, 9000, "livelihoodProtection reference food.totalAmount unchanged");
    assertEqual(result.room.totalAmount, 11400, "livelihoodProtection reference room.totalAmount unchanged");
    assertEqual(result.finalTotal, 0, "livelihoodProtection finalTotal is 0 (all publicly funded)");
  }

  // calculateTotal: 生活保護受給等でも、介護サービス自己負担が上限(15,000円)以下の場合は
  // 全額が生活保護の介護扶助のみで賄われる(高額介護サービス費からの支給は発生しない)が、本人負担は同じく0円
  {
    const input = {
      careLevel: "1",
      copayRatio: 0.1,
      roomType: "multi",
      days: 10,
      limitStage: "1",
      highCostCareCategoryId: "livelihoodProtection",
      otherServicesCopay: 0,
      otherFees: 0,
    };
    const result = calculateTotal(feeMaster, highCostCareMaster, input);
    assertEqual(result.highCostCare.reductionAmount, 0, "livelihoodProtection low-cost case: no high-cost-care portion");
    assertEqual(result.residentBurdenWaived, true, "livelihoodProtection low-cost case: still waived");
    assertEqual(result.finalCareServiceCopay, 0, "livelihoodProtection low-cost case: finalCareServiceCopay is 0");
    assertEqual(result.finalTotal, 0, "livelihoodProtection low-cost case: finalTotal is 0");
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
