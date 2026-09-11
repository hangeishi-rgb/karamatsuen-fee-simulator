// 居住費の計算(1日あたりの金額 × 利用日数)

/**
 * @param {object} feeMaster
 * @param {"private"|"multi"} roomType
 * @param {"1"|"2"|"3_1"|"3_2"|"4"} limitStage
 * @param {number} days
 * @returns {{ dailyAmount: number, totalAmount: number }}
 */
export function calculateRoom(feeMaster, roomType, limitStage, days) {
  const amounts = feeMaster.foodAndRoom.amounts[roomType]?.[limitStage];
  if (!amounts) {
    throw new Error(`居住費データが見つかりません: roomType=${roomType}, limitStage=${limitStage}`);
  }
  const dailyAmount = amounts.room;
  return {
    dailyAmount,
    totalAmount: dailyAmount * days,
  };
}
