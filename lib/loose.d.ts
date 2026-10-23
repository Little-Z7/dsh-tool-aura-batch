/**
 * 灵环分镜导入的兼容模式与宽松参考登记 —— 移植自灵环平台
 * `web/src/lib/batchVideo/looseParse.ts`（平台提交 284fe1d1），平台改了这里同步改。
 *
 * 类型映射：平台 BatchRefSlot.kind ('video'|'audio') ↔ 插件 RefSlot.media；
 * 平台 BatchGroup ↔ 插件 Group（refLines 记「类型:编号 → 登记行内容」，供「只有提示词的参考」判定）。
 * @module dsh-tool-aura-batch/loose
 */
import { type Group, type RefSlot } from './format.js';
export type LooseSplit = 'shot' | 'heading' | 'number' | 'paragraph' | 'single';
export declare const LOOSE_SPLIT_LABEL: Record<LooseSplit, string>;
export interface CompatInfo {
    split: LooseSplit;
    options: LooseSplit[];
}
export interface LooseGroup extends Group {
    /** 「类型:编号」→ 那一行登记的全部内容（名称 + 提示词等）；只读得出整行的才有 */
    refLines?: Record<string, string>;
}
export interface LooseParse {
    groups: LooseGroup[];
    splitBy: string;
    compat?: CompatInfo;
    inherited: number;
    warnings: string[];
}
declare function declsOfLine(line: string): RefSlot[];
export { declsOfLine };
export declare function looseRefDecls(text: string): RefSlot[];
export declare function looseSplitOptions(text: string): LooseSplit[];
/**
 * md / txt 总入口：`strict` 是插件自己的模板切法（marker / separator / section / single）；
 * 整篇一组时进兼容模式，按 `split`（缺省自动挑）切。两条路都挂全篇登记。
 */
export declare function parseStoryboardLoose(text: string, strict: {
    groups: Group[];
    splitBy: string;
    warnings: string[];
}, split?: LooseSplit): LooseParse;
/** 表格总入口：有「提示词」列时那一列就是每组正文；没有就每行拼成带【列名】小节的提示词 */
export declare function parseStoryboardTable(rows: string[][]): LooseParse;
/** 简版 CSV 读取（引号内逗号 / 换行 / ""转义）；Excel xlsx 读不了（二进制，插件不引依赖） */
export declare function parseCsv(text: string): string[][];
