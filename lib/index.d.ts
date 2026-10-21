/**
 * dsh-tool-aura-batch：把剧本与参考素材整理成灵环 TV「导入分镜与参考素材」可直接导入的格式。
 * 三个工具：aura_batch_format（格式说明 + 模板）、aura_batch_check（按平台规则检查）、aura_batch_pack（打成 zip）。
 * 不联网、不需要账号，只读写用户指定的本地文件。
 * @module dsh-tool-aura-batch
 */
import Schema from '@deepseek-ai/schemastery';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
export declare const name = "aura-batch";
export declare const inject: string[];
export declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
    defaultDuration: Schema<number, number, "volatile-defined">;
    defaultRatio: Schema<"16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9", "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9", "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    defaultDuration: Schema<number, number, "volatile-defined">;
    defaultRatio: Schema<"16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9", "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9", "volatile-defined">;
}>>, "plain">;
export declare function apply(ctx: {
    tools: {
        register(def: ToolDefinition): unknown;
    };
}, config: {
    defaultDuration?: unknown;
    defaultRatio?: unknown;
}): void;
export { checkStoryboard, classifyRef, parseStoryboard, sectionsOf } from './format.js';
export { buildPackage } from './pack.js';
export { formatGuide } from './spec.js';
export { writeZip } from './zip.js';
