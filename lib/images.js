/**
 * 本地参考图：列目录、读图片宽高（只读文件头，不解码）。
 * @module dsh-tool-aura-batch/images
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
export const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp)$/i;
/** 递归列出目录里的图片（跳过点开头的文件、`__MACOSX`），按路径排序，与解压后的顺序一致 */
export function listImages(root, maxDepth = 4) {
    const out = [];
    const walk = (dir, rel, depth) => {
        const names = readdirSync(dir).filter((n) => !n.startsWith('.') && n !== '__MACOSX').sort();
        for (const n of names) {
            const abs = join(dir, n);
            const path = rel ? `${rel}/${n}` : n;
            const st = statSync(abs);
            if (st.isDirectory()) {
                if (depth < maxDepth)
                    walk(abs, path, depth + 1);
            }
            else if (st.isFile() && IMAGE_EXT.test(n))
                out.push({ file: n, path, abs });
        }
    };
    walk(root, '', 0);
    return out;
}
/** PNG / JPEG / GIF / WebP / BMP 的宽高；认不出返回 undefined */
export function imageSize(buf) {
    if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.toString('ascii', 12, 16) === 'IHDR') {
        return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (buf.length >= 10 && buf.toString('ascii', 0, 3) === 'GIF')
        return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    if (buf.length >= 26 && buf.toString('ascii', 0, 2) === 'BM')
        return { width: buf.readInt32LE(18), height: Math.abs(buf.readInt32LE(22)) };
    if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
        const kind = buf.toString('ascii', 12, 16);
        if (kind === 'VP8X')
            return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
        if (kind === 'VP8L') {
            const b = buf.readUInt32LE(21);
            return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) };
        }
        if (kind === 'VP8 ')
            return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
        let i = 2;
        while (i + 9 < buf.length) {
            if (buf[i] !== 0xff) {
                i++;
                continue;
            }
            const marker = buf[i + 1];
            if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
                i += 2;
                continue;
            }
            const len = buf.readUInt16BE(i + 2);
            if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
                return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
            }
            i += 2 + len;
        }
    }
    return undefined;
}
/** 横图（宽 ≥ 高）；读不出宽高返回 undefined */
export function isLandscape(abs) {
    try {
        const size = imageSize(readFileSync(abs));
        return size ? size.width >= size.height : undefined;
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=images.js.map