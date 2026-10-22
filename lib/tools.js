/**
 * 三个模型可见工具：格式说明（aura_batch_format）、检查（aura_batch_check）、打包（aura_batch_pack）。
 * 读剧本、改写成分镜文档由模型用 DSH 自带的读写文件工具完成；这里负责「平台认什么」与「打成平台能导入的包」。
 * @module dsh-tool-aura-batch/tools
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, resolve } from 'node:path';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { KIND_LABEL, checkStoryboard } from './format.js';
import { isLandscape, listImages } from './images.js';
import { buildPackage } from './pack.js';
import { RATIOS, formatGuide } from './spec.js';
import { writeZip } from './zip.js';
/** `~` 展开 + 相对路径按 DSH 当前工作目录解析 */
export function resolvePath(p) {
    const t = p.trim();
    return resolve(t === '~' ? homedir() : t.startsWith('~/') ? `${homedir()}${t.slice(1)}` : t);
}
function readStoryboard(args) {
    if (args.content?.trim())
        return { text: args.content };
    if (!args.storyboard?.trim())
        throw new Error('需要 storyboard（分镜文档路径）或 content（分镜文档全文）');
    const file = resolvePath(args.storyboard);
    if (!existsSync(file))
        throw new Error(`找不到分镜文档：${file}`);
    if (!/\.(md|markdown|txt)$/i.test(file))
        throw new Error('分镜文档要是 .md / .txt。Word / PDF 请先读出正文、按格式改写成 md 再检查');
    return { text: readFileSync(file, 'utf8'), file };
}
function readImages(dir) {
    if (!dir?.trim())
        return { images: [] };
    const root = resolvePath(dir);
    if (!existsSync(root) || !statSync(root).isDirectory())
        throw new Error(`参考图目录不存在：${root}`);
    return { images: listImages(root), root };
}
const KINDS = ['roles', 'scenes', 'props'];
const KIND_ALIAS = { role: 'roles', roles: 'roles', 角色: 'roles', scene: 'scenes', scenes: 'scenes', 场景: 'scenes', prop: 'props', props: 'props', 道具: 'props' };
/** 检查结果 → 给人看的一段话 */
export function renderCheck(r, withImages) {
    const lines = [];
    const names = r.names.length;
    lines.push(`${r.ok ? '可以导入' : '还不能导入'}：${r.groups.length} 组（切分方式：${{ marker: '第N组标题', separator: '--- 分隔', section: '重复的【小节】', single: '整份一组' }[r.splitBy]}），参考名称 ${names} 个${withImages ? `，配上图 ${names - r.missing.length} 个` : ''}。`);
    for (const w of r.warnings)
        lines.push(`⚠ ${w}`);
    /* 平台批量生成按每组自己的时长与画幅出片：没写的组按 5 秒 / 16:9，十有八九不是作者想要的 */
    const noDuration = r.groups.filter((g) => !g.duration).map((g) => g.index);
    const noRatio = r.groups.filter((g) => !g.ratio).map((g) => g.index);
    if (noDuration.length)
        lines.push(`⚠ 第 ${noDuration.join('、')} 组没写时长（「时长：15秒。」），批量生成会按 5 秒出`);
    if (noRatio.length)
        lines.push(`⚠ 第 ${noRatio.join('、')} 组没写画幅（「画幅：16:9横屏。」或「9:16竖屏」），批量生成会按 16:9 出`);
    if (withImages && r.missing.length)
        lines.push(`⚠ 缺图：${r.missing.join('、')}（参考图文件名要与名称一致，或在 aura_batch_pack 的 assets 里指定）`);
    for (const g of r.groups) {
        const refs = g.refs.map((x) => `${x.media === 'video' ? '视频' : x.media === 'audio' ? '音频' : '图'}${x.slot}${x.name}${withImages ? (x.image ? `→${x.image}` : '（缺文件）') : ''}·${KIND_LABEL[x.kind]}`).join('，');
        const cols = g.columns.map((c) => `${c.label}${c.truncated ? `（${c.chars} 字，表格里截断）` : ''}`).join('、');
        lines.push(`${g.index}. ${g.title}｜${g.duration ?? '缺时长（按 5 秒出）'}｜${g.ratio ?? '缺画幅（按 16:9 出）'}${refs ? `｜${refs}` : ''}${cols ? `｜填表：${cols}` : ''}`);
        for (const i of g.issues)
            lines.push(`   - ${i}`);
    }
    return lines.join('\n');
}
const checkOutputSchema = {
    type: 'object',
    additionalProperties: true,
    properties: {
        ok: { type: 'boolean' },
        groups: { type: 'array' },
        missing: { type: 'array', items: { type: 'string' } },
        warnings: { type: 'array', items: { type: 'string' } },
    },
};
export function createTools(cfg) {
    return [
        defineTool({
            name: 'aura_batch_format',
            description: '返回灵环 TV「导入分镜与参考素材」认的批量导入格式：一个 zip（分镜文档 md + 参考图/角色|场景|道具），分镜文档每组的写法与一组模板。把用户的剧本改写成分镜文档之前先调用它。',
            parameters: {
                duration: { type: 'integer', description: '模板里每组的时长（秒），缺省用插件配置' },
                ratio: { type: 'string', enum: RATIOS, description: '模板里的画幅，缺省用插件配置' },
            },
            output: {
                schema: { type: 'object', additionalProperties: false, properties: { guide: { type: 'string' } } },
                render: (_args, v) => [{ type: 'text', text: v.guide ?? '' }],
            },
            isConcurrencySafe: () => true,
            timeoutMs: 5_000,
            async execute(args) {
                return { guide: formatGuide(args.duration ?? cfg.defaultDuration, args.ratio ?? cfg.defaultRatio) };
            },
            presentCall: () => ({ card: 'generic', title: '查看灵环批量导入格式', kind: 'other' }),
        }),
        defineTool({
            name: 'aura_batch_check',
            description: '按灵环 TV 的导入规则检查一份整集分镜文档：会切成几组、每组的时长 / 画幅 / 参考图登记、哪些小节会填进分镜表；给了参考图目录还会核对每个名称配不配得上图、归到角色 / 场景 / 道具哪一类。改完分镜文档后、打包之前调用。',
            parameters: {
                storyboard: { type: 'string', description: '分镜文档路径（.md / .txt）' },
                content: { type: 'string', description: '分镜文档全文（不想先写文件时用；与 storyboard 二选一）' },
                references: { type: 'string', description: '参考图目录（可含子目录），给了才核对配图' },
            },
            output: {
                schema: checkOutputSchema,
                render: (args, v) => [{ type: 'text', text: renderCheck(v, !!args.references) }],
            },
            isConcurrencySafe: () => true,
            timeoutMs: 30_000,
            async execute(args) {
                const { text } = readStoryboard(args);
                const { images } = readImages(args.references);
                return checkStoryboard(text, args.references ? images : undefined, (img) => isLandscape(img.abs));
            },
            presentCall: (args) => ({ card: 'generic', title: `检查分镜文档${args.storyboard ? `：${basename(args.storyboard)}` : ''}`, kind: 'other' }),
        }),
        defineTool({
            name: 'aura_batch_pack',
            description: '把分镜文档和参考图打成灵环 TV 一次就能导入的 zip：分镜文档放根目录，参考图按分镜里的名称重新命名、分进 参考图/角色|场景|道具/。图默认从 references 目录按名称自动配（文件名或所在文件夹名与名称一致），也可以用 assets 逐个指定。返回 zip 路径、放了哪些图、缺哪些图。',
            parameters: {
                storyboard: { type: 'string', description: '分镜文档路径（.md / .txt）' },
                content: { type: 'string', description: '分镜文档全文（与 storyboard 二选一）' },
                episode: { type: 'string', description: '包名与包内分镜文档名，如「甲方是我前任-第01集」；缺省取分镜文档文件名' },
                references: { type: 'string', description: '参考图目录（可含子目录）' },
                assets: {
                    type: 'array',
                    description: '逐个指定名称用哪张图（优先于自动配对）',
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            name: { type: 'string', required: true, description: '分镜里「图N：名称」的名称' },
                            file: { type: 'string', required: true, description: '图片路径' },
                            kind: { type: 'string', enum: ['role', 'scene', 'prop'], description: '角色 / 场景 / 道具；缺省按名称和描述判断' },
                        },
                    },
                },
                output: { type: 'string', description: 'zip 输出路径；缺省放在分镜文档旁边，名为「<episode>-全套.zip」' },
            },
            output: {
                schema: {
                    type: 'object',
                    additionalProperties: true,
                    properties: {
                        output: { type: 'string' },
                        groups: { type: 'integer' },
                        placed: { type: 'array' },
                        missing: { type: 'array', items: { type: 'string' } },
                        warnings: { type: 'array', items: { type: 'string' } },
                    },
                },
                render: (_args, v) => {
                    const placed = (v.placed ?? []);
                    const missing = (v.missing ?? []);
                    const warnings = (v.warnings ?? []);
                    const text = [
                        `已打包：${v.output}`,
                        `${v.groups} 组，放入参考图 ${placed.length} 张${missing.length ? `，缺图 ${missing.length} 个：${missing.join('、')}（导入后这些名称会标黄，可在画布上手动补图）` : ''}。`,
                        ...placed.map((p) => `- ${p.name} → ${p.to}`),
                        ...warnings.map((w) => `⚠ ${w}`),
                        '在灵环 TV 画布里打开脚本节点 →「导入分镜与参考素材」→ 上传这个 zip，再点「批量生成分镜视频」。',
                    ];
                    return [{ type: 'text', text: text.join('\n') }];
                },
            },
            timeoutMs: 120_000,
            async execute(args) {
                const { text, file } = readStoryboard(args);
                const { images } = readImages(args.references);
                const assets = (args.assets ?? []).map((a) => {
                    const abs = resolvePath(a.file);
                    if (!existsSync(abs))
                        throw new Error(`assets 里「${a.name}」的图片不存在：${abs}`);
                    const kind = a.kind ? KIND_ALIAS[a.kind] : undefined;
                    return { name: a.name, abs, ...(kind ? { kind } : {}) };
                });
                const episode = (args.episode?.trim() || (file ? basename(file, extname(file)).replace(/-?分镜提示词$/, '') : '') || '分镜').replace(/[\\/:*?"<>|]/g, '＿');
                const result = buildPackage({ storyboardText: text, storyboardName: `${episode}-分镜提示词.md`, images, assets });
                if (!result.check.ok)
                    throw new Error(`分镜文档还不能导入：${result.check.warnings.join('；') || '没有读到任何一组提示词'}。先用 aura_batch_check 看问题`);
                const output = args.output?.trim()
                    ? resolvePath(args.output.endsWith('.zip') ? args.output : `${args.output}.zip`)
                    : resolve(file ? dirname(file) : process.cwd(), `${episode}-全套.zip`);
                mkdirSync(dirname(output), { recursive: true });
                writeFileSync(output, writeZip(result.entries));
                return {
                    output,
                    groups: result.check.groups.length,
                    placed: result.placed.map((p) => ({ name: p.name, kind: p.kind, to: p.to })),
                    missing: result.missing,
                    warnings: [...result.check.warnings, ...result.warnings],
                };
            },
            presentCall: (args) => ({ card: 'generic', title: `打包灵环批量导入 zip${args.episode ? `：${args.episode}` : ''}`, kind: 'other' }),
        }),
    ];
}
export { KINDS };
//# sourceMappingURL=tools.js.map