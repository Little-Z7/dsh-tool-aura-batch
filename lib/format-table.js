/**
 * 表格（CSV 读出的 rows）检查入口：loose.ts 的 parseStoryboardTable 结果套进 format.ts 的逐组检查。
 * @module dsh-tool-aura-batch/format-table
 */
import { checkStoryboard } from './format.js';
import { parseStoryboardTable } from './loose.js';
export function checkStoryboardTable(rows, images, landscapeOf) {
    return checkStoryboard('', images, landscapeOf, () => parseStoryboardTable(rows));
}
//# sourceMappingURL=format-table.js.map