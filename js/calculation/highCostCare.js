// 高額介護サービス費の計算
// 対象は「介護保険サービスの利用者負担額」のみ(食費・居住費・その他費用は含まない)。
// 大阪市公式ページの区分・上限額(世帯単位)を用いる。
// 個人単位の上限額が別途存在する区分についても、V.1では世帯単位の上限額のみを適用する
// (2026年のPhase1報告時にユーザー確認済みの簡易仕様)。

/**
 * @param {object} highCostCareMaster data/osaka/high-cost-care/2026-08-01.json の内容
 * @param {string} categoryId
 * @param {number} karamatsuCopay からまつ苑の介護サービス自己負担額(食費・居住費を含まない)
 * @param {number} otherServicesCopay 他の介護保険サービスの自己負担額(入力値、初期値0)
 * @returns {{
 *   category: object,
 *   targetAmount: number,
 *   limitAmount: number,
 *   amountAfterLimit: number,
 *   reductionAmount: number,
 *   karamatsuCopayAfterReduction: number
 * }}
 */
export function calculateHighCostCare(highCostCareMaster, categoryId, karamatsuCopay, otherServicesCopay) {
  const category = highCostCareMaster.categories.find((c) => c.id === categoryId);
  if (!category) {
    throw new Error(`不明な高額介護サービス費区分です: ${categoryId}`);
  }

  const targetAmount = karamatsuCopay + otherServicesCopay;
  const limitAmount = category.householdLimit;
  const amountAfterLimit = Math.min(targetAmount, limitAmount);
  const reductionAmount = Math.max(0, targetAmount - limitAmount);

  // 軽減額は、からまつ苑分と他サービス分の自己負担額の比率で按分する(世帯合算の一般的な考え方)。
  // 他サービス自己負担額が0円の場合は、軽減額はすべてからまつ苑分に充当される。
  let karamatsuCopayAfterReduction = karamatsuCopay;
  if (reductionAmount > 0 && targetAmount > 0) {
    const karamatsuShareOfReduction = Math.floor(reductionAmount * (karamatsuCopay / targetAmount));
    karamatsuCopayAfterReduction = karamatsuCopay - karamatsuShareOfReduction;
  }

  return {
    category,
    targetAmount,
    limitAmount,
    amountAfterLimit,
    reductionAmount,
    karamatsuCopayAfterReduction,
  };
}
