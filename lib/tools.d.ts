import { type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { type CheckResult } from './format.js';
export interface ToolConfig {
    readonly defaultDuration: number;
    readonly defaultRatio: string;
}
/** `~` 展开 + 相对路径按 DSH 当前工作目录解析 */
export declare function resolvePath(p: string): string;
declare const KINDS: readonly ["roles", "scenes", "props"];
/** 检查结果 → 给人看的一段话 */
export declare function renderCheck(r: CheckResult, withImages: boolean): string;
export declare function createTools(cfg: ToolConfig): ToolDefinition[];
export { KINDS };
