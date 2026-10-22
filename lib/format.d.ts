/**
 * 灵环 TV「导入分镜与参考素材」的格式规则。
 *
 * ⚠️ 与灵环仓库这几份纯函数逐条一致（改那边就同步这里，测试里有同一批用例）：
 *   web/src/lib/batchVideo/parse.ts   切组、读时长 / 画幅 / 图N
 *   web/src/lib/batchVideo/match.ts   名称 ↔ 文件名配对
 *   web/src/lib/batchVideo/zipRefs.ts 文件名配不上时按所在文件夹名配
 *   web/src/lib/batchVideo/tvImport.ts 角色 / 场景 / 道具归类、【小节】→ 分镜表列、列长上限
 * 这里只收「整集 md / txt」这条路（Excel / CSV 由平台直接读，不需要整理）。
 * @module dsh-tool-aura-batch/format
 */
/** 每个镜头最多挂几张参考图（平台上限） */
export declare const MAX_SHOT_REFS = 9;
/** 单批组数上限 */
export declare const BATCH_GROUPS_MAX = 100;
/** 单组提示词上限（字） */
export declare const BATCH_PROMPT_MAX = 20000;
/** 分镜表各列长度上限（字），超出部分只留在最终提示词里 */
export declare const SHOT_FIELD_MAX: {
    readonly duration: 20;
    readonly description: 2000;
    readonly sceneSize: 40;
    readonly lighting: 200;
    readonly dialogue: 2000;
    readonly sound: 200;
    readonly camera: 100;
};
export type SplitBy = 'marker' | 'separator' | 'section' | 'single';
export type AssetKind = 'roles' | 'scenes' | 'props';
export declare const KIND_LABEL: Record<AssetKind, string>;
export interface RefSlot {
    /** 图N / 视频N / 音频N 的 N（1 起；三种各自编号） */
    slot: number;
    /** 「图N：名称，……」里的名称 */
    name: string;
    /** 缺省 = 图片；「视频N：…」「音频N：…」登记的是参考视频 / 参考音频（与灵环平台同一规则） */
    media?: 'video' | 'audio';
}
/** 参考文件的媒体类型（按扩展名）：「图N」只配图片、「视频N」只配视频、「音频N」只配音频 */
export declare function mediaOfFile(file: string): 'image' | 'video' | 'audio';
export interface Group {
    index: number;
    title: string;
    prompt: string;
    duration?: string;
    ratio?: string;
    refs: RefSlot[];
    issues: string[];
}
export interface ParseResult {
    groups: Group[];
    splitBy: SplitBy;
    warnings: string[];
}
/** 「十二」「二十」「一百零五」这类常见写法 → 数字；认不出返回 undefined */
export declare function chineseNumber(raw: string): number | undefined;
/** 标记行去掉 markdown 装饰后的文字；不是标记行返回 undefined */
export declare function markerOf(line: string): {
    text: string;
    rest: string;
} | undefined;
/** 切 md / txt：返回每块的（可选）标题与正文，以及第一个分组标记之前被丢掉的文字行数 */
export declare function splitTextGroups(text: string): {
    chunks: Array<{
        title?: string;
        body: string;
    }>;
    splitBy: SplitBy;
    droppedHead: number;
};
/** 从正文里读时长、画幅与参考位 */
export declare function extractMeta(prompt: string): {
    duration?: string;
    ratio?: string;
    refs: RefSlot[];
};
/** 正文里提到的「图N」编号（排除「图N：」登记行本身与「地图」这类词） */
export declare function mentionedSlots(prompt: string): number[];
/** 整份 md / txt → 一组组（与平台导入时的结果一致） */
export declare function parseStoryboard(text: string): ParseResult & {
    droppedHead: number;
};
/** 文件名去扩展名后与名称完全相同，或一方包含另一方且只有唯一一个候选 */
export declare function autoMatch(name: string, files: readonly string[]): string | undefined;
export interface ImageRef {
    /** 文件名（不含目录） */
    file: string;
    /** 相对参考图根目录的路径，`/` 分隔 */
    path: string;
}
/** 名称 → 参考图：先按文件名配；配不上再按所在文件夹名（「艾莲娜/正面.png」配「艾莲娜」，取排在最前的一张） */
export declare function matchImage<T extends ImageRef>(name: string, images: readonly T[]): T | undefined;
/** 「图N：…」那一整行（冒号后面的全部），找不到给空串 */
export declare function refLine(prompt: string, slot: number, media?: 'image' | 'video' | 'audio'): string;
/** 参考图归角色、场景还是道具：文件夹名 → 名称结尾 → 描述用词 → 横竖（横图算场景）；与平台导入时同一套判断 */
export declare function classifyRef(ref: {
    name: string;
    line: string;
    path?: string;
    landscape?: boolean;
}): AssetKind;
export type ShotColumn = 'description' | 'sceneSize' | 'camera' | 'lighting' | 'dialogue' | 'sound';
export declare const COLUMN_LABEL: Record<ShotColumn, string>;
/** 按「【小节】」切开一组提示词，得到分镜表各列的原文；小节到下一个「【…】」或「镜头N（…）」为止 */
export declare function sectionsOf(prompt: string): Partial<Record<ShotColumn, string>>;
export interface CheckedRef extends RefSlot {
    /** 配上的参考图（相对路径）；没提供参考图目录时为空 */
    image?: string;
    kind: AssetKind;
}
export interface CheckedGroup {
    index: number;
    title: string;
    duration?: string;
    ratio?: string;
    refs: CheckedRef[];
    /** 会填进分镜表的列（超出列长上限的标出来） */
    columns: Array<{
        column: ShotColumn;
        label: string;
        chars: number;
        truncated: boolean;
    }>;
    issues: string[];
}
export interface CheckResult {
    splitBy: SplitBy;
    groups: CheckedGroup[];
    /** 全集的参考名称（出现顺序） */
    names: Array<{
        name: string;
        line: string;
        image?: string;
        kind: AssetKind;
        media?: 'video' | 'audio';
    }>;
    /** 提供了参考图目录、但配不上图的名称 */
    missing: string[];
    /** 整份文件层面的提醒 */
    warnings: string[];
    /** 能不能导入：至少有一组、且没有超长的组 */
    ok: boolean;
}
/**
 * 按平台规则检查一份整集分镜文档。传了 `images` 才核对参考图是否配得上。
 * `landscapeOf` 给出某张图是不是横图（归类的最后一道判断），量不出来可以不传。
 */
export declare function checkStoryboard(text: string, images?: readonly ImageRef[], landscapeOf?: (image: ImageRef) => boolean | undefined): CheckResult;
