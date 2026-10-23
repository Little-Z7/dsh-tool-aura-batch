/**
 * 表格（CSV 读出的 rows）检查入口：loose.ts 的 parseStoryboardTable 结果套进 format.ts 的逐组检查。
 * @module dsh-tool-aura-batch/format-table
 */
import { checkStoryboard, type CheckResult, type ImageRef } from './format.js'
import { parseStoryboardTable } from './loose.js'

export function checkStoryboardTable(
  rows: string[][],
  images?: readonly ImageRef[],
  landscapeOf?: (image: ImageRef) => boolean | undefined,
): CheckResult {
  return checkStoryboard('', images, landscapeOf, () => parseStoryboardTable(rows))
}
