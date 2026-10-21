export interface ZipEntry {
    /** 包内路径，`/` 分隔 */
    path: string;
    data: Buffer;
}
export declare function crc32(data: Uint8Array): number;
export declare function writeZip(entries: readonly ZipEntry[], date?: Date): Buffer;
