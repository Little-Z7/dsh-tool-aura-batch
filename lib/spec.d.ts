export declare const RATIOS: readonly ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
export type Ratio = (typeof RATIOS)[number];
/** 一组的模板：小节结构与灵环分镜表的列一一对应 */
export declare function groupTemplate(index: number, duration: number, ratio: string): string;
export declare function formatGuide(duration: number, ratio: string): string;
