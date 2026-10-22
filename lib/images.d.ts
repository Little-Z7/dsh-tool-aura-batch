import type { ImageRef } from './format.js';
export declare const IMAGE_EXT: RegExp;
/** 参考文件：图片之外也收视频与音频（灵环全能参考可带参考视频、参考音频；分镜里写「视频N / 音频N」） */
export declare const MEDIA_EXT: RegExp;
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
