import type { ImageRef } from './format.js';
export declare const IMAGE_EXT: RegExp;
export interface LocalImage extends ImageRef {
    /** 绝对路径 */
    abs: string;
}
/** 递归列出目录里的图片（跳过点开头的文件、`__MACOSX`），按路径排序，与解压后的顺序一致 */
export declare function listImages(root: string, maxDepth?: number): LocalImage[];
/** PNG / JPEG / GIF / WebP / BMP 的宽高；认不出返回 undefined */
export declare function imageSize(buf: Buffer): {
    width: number;
    height: number;
} | undefined;
/** 横图（宽 ≥ 高）；读不出宽高返回 undefined */
export declare function isLandscape(abs: string): boolean | undefined;
