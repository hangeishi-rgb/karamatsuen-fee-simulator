// 介護サービス費(自己負担額)の計算
// からまつ苑公式料金表に明記された算定方法をそのまま実装する。
//
// I  = (基本サービス単位 + 通常加算単位) × 利用日数
// II = 月額加算単位(日数を掛けない)
// III = floor((I + II) × 処遇改善加算率)          … 単位未満切り捨て
// IV  = floor((I + II + III) × 地域区分単価)        … 円未満切り捨て(介護サービス総費用額)
// 自己負担額 = floor(IV × 負担割合)                 … 円未満切り捨て

/**
 * @param {object} feeMaster data/karamatsu/2026-08-01.json の内容
 * @param {"1"|"2"|"3"|"4"|"5"} careLevel
 * @param {number} days 利用日数(1〜31)
 * @param {0.1|0.2|0.3} copayRatio 負担割合
 * @returns {{
 *   baseUnit: number,
 *   dailyAdditionUnit: number,
 *   monthlyAdditionUnit: number,
 *   unitBeforeTreatment: number,
 *   treatmentImprovementUnit: number,
 *   totalUnit: number,
 *   totalCost: number,
 *   copay: number
 * }}
 */
export function calculateCareService(feeMaster, careLevel, days, copayRatio) {
  const level = feeMaster.careLevels[String(careLevel)];
  if (!level) {
    throw new Error(`不明な要介護度です: ${careLevel}`);
  }

  const baseUnit = level.baseUnit;
  const dailyAdditionUnit = feeMaster.dailyAdditions.totalUnit;
  const monthlyAdditionUnit = feeMaster.monthlyAdditions.totalUnit;
  const treatmentRate = feeMaster.treatmentImprovementAddition.rate;
  const unitPrice = feeMaster.unitPrice.value;

  const I = (baseUnit + dailyAdditionUnit) * days;
  const II = monthlyAdditionUnit; // 個別加算はVer.1未実装のため常に0として扱う
  const unitBeforeTreatment = I + II;

  const treatmentImprovementUnit = Math.floor(unitBeforeTreatment * treatmentRate);
  const totalUnit = unitBeforeTreatment + treatmentImprovementUnit;
  const totalCost = Math.floor(totalUnit * unitPrice);
  const copay = Math.floor(totalCost * copayRatio);

  return {
    baseUnit,
    dailyAdditionUnit,
    monthlyAdditionUnit,
    unitBeforeTreatment,
    treatmentImprovementUnit,
    totalUnit,
    totalCost,
    copay,
  };
}
