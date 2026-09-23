import { calculateCareService } from "./careService.js";
import { calculateFood } from "./food.js";
import { calculateRoom } from "./room.js";
import { calculateHighCostCare } from "./highCostCare.js";

/**
 * @typedef {object} SimulationInput
 * @property {"1"|"2"|"3"|"4"|"5"} careLevel
 * @property {0.1|0.2|0.3} copayRatio
 * @property {"private"|"multi"} roomType
 * @property {number} days
 * @property {"1"|"2"|"3_1"|"3_2"|"4"} limitStage
 * @property {string|null} highCostCareCategoryId 未選択(わからない)の場合は null
 * @property {number} otherServicesCopay
 * @property {number} otherFees その他費用(入力値、初期値0)
 */

/**
 * すべての計算をまとめ、結果画面表示用の calculationResult オブジェクトを作る。
 * 将来の保存機能・履歴機能のために、計算に使った入力値もそのまま保持する。
 *
 * @param {object} feeMaster
 * @param {object} highCostCareMaster
 * @param {SimulationInput} input
 */
export function calculateTotal(feeMaster, highCostCareMaster, input) {
  const {
    careLevel,
    copayRatio,
    roomType,
    days,
    limitStage,
    highCostCareCategoryId,
    otherServicesCopay,
    otherFees,
  } = input;

  const careService = calculateCareService(feeMaster, careLevel, days, copayRatio);
  const food = calculateFood(feeMaster, roomType, limitStage, days);
  const room = calculateRoom(feeMaster, roomType, limitStage, days);

  // 高額介護サービス費の区分は任意選択。未選択(わからない)の場合は軽減額の計算自体を行わない。
  const highCostCare = highCostCareCategoryId
    ? calculateHighCostCare(highCostCareMaster, highCostCareCategoryId, careService.copay, otherServicesCopay || 0)
    : null;

  // 生活保護受給等が選択されている場合、介護サービス自己負担・食費・居住費のいずれも、
  // 生活保護の介護扶助と介護保険の高額介護サービス費の組み合わせ(他法優先の原則による公費間の調整)により
  // 本人負担は生じないものとして扱う(料金表・大阪市資料の範囲外の一般的な制度理解のため、実装前にユーザーへ確認済み)。
  // マスタ側の residentBurdenWaived フラグで判定する。
  // 「適用前」「上限額」「高額介護サービス費支給相当額」等の内訳は、施設側の公費請求(介護扶助券との照合等)の
  // 参考情報として意味があるため、0円に置き換えず元の値のまま返す。
  const residentBurdenWaived = Boolean(highCostCare?.category?.residentBurdenWaived);

  const finalCareServiceCopay = residentBurdenWaived
    ? 0
    : highCostCare
      ? highCostCare.karamatsuCopayAfterReduction
      : careService.copay;
  const finalFoodAmount = residentBurdenWaived ? 0 : food.totalAmount;
  const finalRoomAmount = residentBurdenWaived ? 0 : room.totalAmount;

  const finalTotal = finalCareServiceCopay + finalFoodAmount + finalRoomAmount + (otherFees || 0);

  return {
    input,
    careService,
    food,
    room,
    highCostCare,
    finalCareServiceCopay,
    residentBurdenWaived,
    finalFoodAmount,
    finalRoomAmount,
    otherFees: otherFees || 0,
    finalTotal,
  };
}
