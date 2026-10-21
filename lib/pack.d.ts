import { type AssetKind, type CheckResult } from './format.js';
import { type LocalImage } from './images.js';
import type { ZipEntry } from './zip.js';
export interface PackAsset {
    /** 分镜里「图N：名称」的名称 */
    name: string;
    /** 图片的绝对路径 */
    abs: string;
    kind?: AssetKind;
}
export interface PackInput {
    storyboardText: string;
    /** 包内分镜文档的文件名（.md） */
    storyboardName: string;
    /** 参考图目录里列出来的图 */
    images: readonly LocalImage[];
    /** 显式指定：某个名称用哪张图、归哪一类（优先于按名字自动配） */
    assets?: readonly PackAsset[];
}
export interface Placed {
    name: string;
    kind: AssetKind;
    /** 来源图片（绝对路径） */
    from: string;
    /** 包内路径 */
    to: string;
}
export interface PackResult {
    entries: ZipEntry[];
    check: CheckResult;
    placed: Placed[];
    missing: string[];
    warnings: string[];
}
export declare function buildPackage(input: PackInput, read?: (abs: string) => Buffer): PackResult;
