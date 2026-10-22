/**
 * 打包：分镜文档 + 参考图 → 灵环 TV 一次就能导入的 zip。
 *
 * 包内结构（灵环「导入分镜与参考素材」按这个认）：
 *   <分镜文档>.md
 *   参考图/角色/<名称>.<扩展名>
 *   参考图/场景/<名称>.<扩展名>
 *   参考图/道具/<名称>.<扩展名>
 * 每张图按它在分镜里的「名称」重新命名 —— 平台按文件名精确配对最稳（包含关系有歧义时会配不上）；
 * 几个名称共用一张图时各存一份，保证每个名称都配得上。
 * @module dsh-tool-aura-batch/pack
 */
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { checkStoryboard, classifyRef, KIND_LABEL, matchImage, mediaOfFile } from './format.js';
import { isLandscape } from './images.js';
/* 文件名里不能出现的字符；名称里有这些字就改成全角，平台配对会退到「包含关系」，打包时提醒 */
const UNSAFE = /[\\/:*?"<>|\u0000-\u001f]/g;
const safeName = (name) => name.replace(UNSAFE, '＿').replace(/^\.+/, '').trim() || '未命名';
export function buildPackage(input, read = (p) => readFileSync(p)) {
    const landscape = new Map();
    const landscapeOf = (img) => {
        const key = img.abs ?? img.path;
        if (!landscape.has(key))
            landscape.set(key, img.abs ? isLandscape(img.abs) : undefined);
        return landscape.get(key);
    };
    const check = checkStoryboard(input.storyboardText, input.images, (img) => landscapeOf(img));
    const warnings = [];
    const explicit = new Map((input.assets ?? []).map((a) => [a.name.trim(), a]));
    for (const a of input.assets ?? []) {
        if (!check.names.some((n) => n.name === a.name.trim()))
            warnings.push(`指定了「${a.name}」的图，但分镜里没有「图N：${a.name}」，没有打进包`);
    }
    const placed = [];
    const missing = [];
    const used = new Set();
    for (const n of check.names) {
        const ex = explicit.get(n.name);
        /* 图片名称只配图片、音频名称只配音频（「程野.png」与「程野.mp3」各归各的） */
        const auto = ex ? undefined : matchImage(n.name, input.images.filter((i) => mediaOfFile(i.file) === (n.media ?? 'image')));
        const from = ex?.abs ?? auto?.abs;
        if (!from) {
            missing.push(n.name);
            continue;
        }
        const kind = ex?.kind ?? (ex
            ? classifyRef({ name: n.name, line: n.line, ...(landscapeOf({ abs: ex.abs, path: ex.abs }) !== undefined ? { landscape: landscapeOf({ abs: ex.abs, path: ex.abs }) } : {}) })
            : n.kind);
        const file = safeName(n.name);
        if (file !== n.name)
            warnings.push(`名称「${n.name}」里有不能做文件名的字符，图片存成「${file}」，导入时可能要手动配图`);
        let to = `参考图/${KIND_LABEL[kind]}/${file}${extname(from).toLowerCase() || '.png'}`;
        for (let i = 2; used.has(to); i++)
            to = `参考图/${KIND_LABEL[kind]}/${file}（${i}）${extname(from).toLowerCase() || '.png'}`;
        used.add(to);
        placed.push({ name: n.name, kind, from, to });
    }
    const docName = /\.(md|markdown|txt)$/i.test(input.storyboardName) ? input.storyboardName : `${input.storyboardName}.md`;
    const entries = [
        { path: safeName(docName), data: Buffer.from(input.storyboardText.replace(/^\uFEFF/, ''), 'utf8') },
        ...placed.map((p) => ({ path: p.to, data: read(p.from) })),
    ];
    /* 打完再按平台规则核一遍：每个名称在包里配到的必须正是放给它的那张 */
    const packed = placed.map((p) => ({ file: p.to.split('/').pop(), path: p.to }));
    for (const p of placed) {
        const hit = matchImage(p.name, packed.filter((x) => mediaOfFile(x.file) === mediaOfFile(p.to)));
        if (hit?.path !== p.to)
            warnings.push(`「${p.name}」在包里会配到 ${hit?.path ?? '（配不上）'}，不是 ${p.to}，导入后请核对`);
    }
    return { entries, check, placed, missing, warnings };
}
//# sourceMappingURL=pack.js.map