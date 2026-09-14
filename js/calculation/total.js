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

  const finalCareServiceCopay = highCostCare ? highCostCare.karamatsuCopayAfterReduction : careService.copay;

  // 生活保護受給等が選択されている場合、負担限度額(第1段階)相当の食費・居住費も
  // 生活保護の介護扶助により本人負担は生じないものとして扱う(料金表・大阪市資料の範囲外の一般的な制度理解のため、
  // 実装前にユーザーへ確認済み)。マスタ側の foodAndRoomCoveredByWelfare フラグで判定する。
  const welfareCoversFoodAndRoom = Boolean(highCostCare?.category?.foodAndRoomCoveredByWelfare);
  const finalFoodAmount = welfareCoversFoodAndRoom ? 0 : food.totalAmount;
  const finalRoomAmount = welfareCoversFoodAndRoom ? 0 : room.totalAmount;

  const finalTotal = finalCareServiceCopay + finalFoodAmount + finalRoomAmount + (otherFees || 0);

  return {
    input,
    careService,
    food,
    room,
    highCostCare,
    finalCareServiceCopay,
    welfareCoversFoodAndRoom,
    finalFoodAmount,
    finalRoomAmount,
    otherFees: otherFees || 0,
    finalTotal,
  };
}
