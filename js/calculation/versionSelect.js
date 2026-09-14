// 料金改定対応: 複数の日付付きマスタ(例: 2026-08-01.json, 2027-04-01.json)の中から、
// 「今日時点で適用されている最新のもの」を自動選択するための純粋関数。
// 新しい改定に対応するときは、新しい日付のJSONを追加して versions.json にその日付を足すだけでよく、
// このファイルやアプリ本体のコードを変更する必要はない。

/**
 * @param {string[]} versions "YYYY-MM-DD" 形式の effectiveFrom 一覧(順不同でよい)
 * @param {string} todayStr "YYYY-MM-DD" 形式の基準日
 * @returns {string} 採用すべき effectiveFrom の日付文字列
 */
export function selectApplicableVersion(versions, todayStr) {
  if (!versions || versions.length === 0) {
    throw new Error("versions が空です。少なくとも1つの日付が必要です。");
  }

  const sorted = [...versions].sort(); // "YYYY-MM-DD" は文字列比較で日付順に並ぶ
  const applicable = sorted.filter((v) => v <= todayStr);

  if (applicable.length > 0) {
    return applicable[applicable.length - 1]; // 適用開始日が今日以前のもののうち最新
  }

  // 今日がどのeffectiveFromよりも前(通常は起こらないが、フォールバックとして最も古いものを使う)
  return sorted[0];
}

/**
 * 実行環境のローカル日付を "YYYY-MM-DD" 形式で返す。
 * @param {Date} [date]
 * @returns {string}
 */
export function formatDateYmd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
