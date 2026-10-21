/**
 * dsh-tool-aura-batch：把剧本与参考素材整理成灵环 TV「导入分镜与参考素材」可直接导入的格式。
 * 三个工具：aura_batch_format（格式说明 + 模板）、aura_batch_check（按平台规则检查）、aura_batch_pack（打成 zip）。
 * 不联网、不需要账号，只读写用户指定的本地文件。
 * @module dsh-tool-aura-batch
 */
import Schema from '@deepseek-ai/schemastery';
import { RATIOS } from './spec.js';
import { createTools } from './tools.js';
export const name = 'aura-batch';
export const inject = ['tools'];
export const Config = Schema.object({
    defaultDuration: Schema.number().default(15).volatile().description('格式模板里每组的默认时长（秒）'),
    defaultRatio: Schema.union([...RATIOS]).default('16:9').volatile().description('格式模板里每组的默认画幅'),
});
/** volatile 字段在 UI 保存后是装箱值，读时解开 */
function readV(v) {
    if (typeof v === 'object' && v !== null && typeof v.get === 'function')
        return v.get();
    return v;
}
export function apply(ctx, config) {
    const live = {
        get defaultDuration() {
            const n = Number(readV(config.defaultDuration));
            return Number.isFinite(n) && n > 0 ? Math.round(n) : 15;
        },
        get defaultRatio() {
            const r = readV(config.defaultRatio);
            return RATIOS.includes(r) ? r : '16:9';
        },
    };
    for (const def of createTools(live))
        ctx.tools.register(def);
}
export { checkStoryboard, classifyRef, parseStoryboard, sectionsOf } from './format.js';
export { buildPackage } from './pack.js';
export { formatGuide } from './spec.js';
export { writeZip } from './zip.js';
//# sourceMappingURL=index.js.map