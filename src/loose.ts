/**
 * 灵环分镜导入的兼容模式与宽松参考登记 —— 移植自灵环平台
 * `web/src/lib/batchVideo/looseParse.ts`（平台提交 284fe1d1），平台改了这里同步改。
 *
 * 类型映射：平台 BatchRefSlot.kind ('video'|'audio') ↔ 插件 RefSlot.media；
 * 平台 BatchGroup ↔ 插件 Group（refLines 记「类型:编号 → 登记行内容」，供「只有提示词的参考」判定）。
 * @module dsh-tool-aura-batch/loose
 */
import { extractMeta, refLine, BATCH_GROUPS_MAX, BATCH_PROMPT_MAX, type Group, type RefSlot } from './format.js'

export type LooseSplit = 'shot' | 'heading' | 'number' | 'paragraph' | 'single'

export const LOOSE_SPLIT_LABEL: Record<LooseSplit, string> = {
  shot: '按镜头标记', heading: '按标题', number: '按行首编号', paragraph: '按空行分段', single: '整篇一个镜头',
}

export interface CompatInfo {
  split: LooseSplit
  options: LooseSplit[]
}

export interface LooseGroup extends Group {
  /** 「类型:编号」→ 那一行登记的全部内容（名称 + 提示词等）；只读得出整行的才有 */
  refLines?: Record<string, string>
}

export interface LooseParse {
  groups: LooseGroup[]
  splitBy: string
  compat?: CompatInfo
  inherited: number
  warnings: string[]
}

const KIND_OF = (word: string): RefSlot['media'] => (word === '视频' ? 'video' : word === '音频' ? 'audio' : undefined)
const WORD_OF = (r: RefSlot) => (r.media === 'video' ? '视频' : r.media === 'audio' ? '音频' : '图')
const rank = (r: RefSlot) => (r.media === 'video' ? 1 : r.media === 'audio' ? 2 : 0)
const declKey = (r: RefSlot) => `${r.media ?? 'image'}:${r.slot}`

const LEAD = /^(?:[-*+·•]\s*|\d{1,3}[.、)）]\s*)?(?:(?:参考(?:素材|图)?|素材)\s*[：:]\s*)?/u
const HEAD = /^(@)?([【[])?(图|视频|音频)\s*(\d{1,2})([】\]])?/u
const NAME = /^[^\s，,、；;。（(【[@：:｜|]{1,40}/u

function declsOfLine(line: string): RefSlot[] {
  const raw = line.trim().replace(/\*\*/g, '')
  const lead = LEAD.exec(raw)?.[0] ?? ''
  const prefixed = /参考|素材/u.test(lead)
  let rest = raw.slice(lead.length)
  const out: RefSlot[] = []
  for (;;) {
    const h = HEAD.exec(rest)
    if (!h) break
    let after = rest.slice(h[0].length)
    const strongSep = /^\s*[：:=＝\-—．.]\s*/u.exec(after)
    const weakSep = strongSep ? null : /^(?:\s+|\s*、\s*)/u.exec(after)
    const strong = Boolean(h[1]) || Boolean(h[2] && h[5]) || Boolean(strongSep)
    if (!strong && !weakSep) break
    after = after.slice((strongSep ?? weakSep)?.[0].length ?? 0)
    const nm = NAME.exec(after)
    if (!nm || HEAD.test(nm[0])) break
    const tail = after.slice(nm[0].length)
    const sep = /^[\s，,、；;]+/u.exec(tail)
    const nextIsItem = Boolean(sep && HEAD.test(tail.slice(sep[0].length)))
    if (!strong && !prefixed && !nextIsItem && !out.length && tail.trim()) break
    const kind = KIND_OF(h[3]!)
    out.push({ slot: Number(h[4]), name: nm[0].trim(), ...(kind ? { media: kind } : {}) })
    if (!nextIsItem) break
    rest = tail.slice(sep![0].length)
  }
  return out
}

export { declsOfLine }

export function looseRefDecls(text: string): RefSlot[] {
  const seen = new Set<string>()
  const out: RefSlot[] = []
  for (const line of text.split(/\r?\n/)) {
    for (const r of declsOfLine(line)) {
      const key = declKey(r)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(r)
    }
  }
  return out.sort((a, b) => rank(a) - rank(b) || a.slot - b.slot)
}

type GlobalDecl = RefSlot & { line: string }

function globalDecls(text: string): GlobalDecl[] {
  const names = new Map<string, Set<string>>()
  const first = new Map<string, GlobalDecl>()
  for (const line of text.split(/\r?\n/)) {
    const ds = declsOfLine(line)
    ds.forEach((r, i) => {
      const key = declKey(r)
      names.set(key, (names.get(key) ?? new Set()).add(r.name))
      /* 与平台 looseParse 同一条规则：一行多条登记时只有最后一条带内容 */
      const content = i === ds.length - 1 ? refLine(line, r.slot, r.media ?? 'image') : ''
      const cur = first.get(key)
      if (!cur) first.set(key, { ...r, line: content })
      else if (content.length > cur.line.length) first.set(key, { ...cur, line: content })
    })
  }
  return [...first].filter(([k]) => names.get(k)!.size === 1).map(([, r]) => r).sort((a, b) => rank(a) - rank(b) || a.slot - b.slot)
}

const mentions = (prompt: string, r: RefSlot) => new RegExp(`(?<![@A-Za-z0-9])${WORD_OF(r)}${r.slot}(?!\\d)`, 'u').test(prompt)

const GEN_LABEL = /\s*(?:[｜|]|(?:提示词|台词|文本|内容|音色|声音|声线)\s*[：:]).*$/u
function tidyRefNames<T extends { groups: LooseGroup[] }>(r: T): T {
  for (const g of r.groups) {
    g.refs = g.refs.map((ref) => {
      const name = ref.name.replace(GEN_LABEL, '').trim()
      return name && name !== ref.name ? { ...ref, name } : ref
    })
  }
  return r
}

function inheritRefs(groups: LooseGroup[], global: readonly GlobalDecl[]): number {
  if (!global.length) return 0
  let n = 0
  for (const g of groups) {
    const extra = global.filter((r) => mentions(g.prompt, r) && !g.refs.some((x) => declKey(x) === declKey(r)))
    if (!extra.length) continue
    g.refs = [...g.refs, ...extra.map(({ line: _line, ...r }) => r)].sort((a, b) => rank(a) - rank(b) || a.slot - b.slot)
    g.refLines = { ...g.refLines, ...Object.fromEntries(extra.map((r) => [declKey(r), r.line])) }
    n += 1
  }
  return n
}

/* ---------- 切镜头 ---------- */

const NUM = '([0-9]+|[零一二两三四五六七八九十百]+)'
const SHOT_MARK = new RegExp(`^(?:镜头|分镜|镜|场景|场|shot|scene)\\s*${NUM}(?=$|[\\s：:、.\\-—（(【\\[)）】\\]])`, 'iu')
const ORDINAL_MARK = new RegExp(`^第\\s*${NUM}\\s*[镜场幕个节](?=$|[\\s：:、.\\-—（(【\\[)）】\\]])`, 'u')
const HEADING = /^(#{1,6})\s+\S/
const NUMBERED = /^(\d{1,3})\s*[.、)）]\s*\S/

function shotMarkOf(line: string): string | undefined {
  const t = line.trim().replace(/^#{1,6}\s*/, '').replace(/^[-*+]\s+/, '').replace(/\*\*/g, '').replace(/^[【[]/, '').trim()
  return SHOT_MARK.test(t) || ORDINAL_MARK.test(t) ? t.replace(/[】\]]/, ' ').replace(/\s+/g, ' ').trim() : undefined
}

type Chunk = { title?: string; body: string }

function splitAt(lines: readonly string[], isMark: (line: string) => string | undefined): Chunk[] {
  const out: Chunk[] = []
  let cur: { title: string; lines: string[] } | undefined
  for (const line of lines) {
    const mark = isMark(line)
    if (mark !== undefined) {
      if (cur) out.push({ title: cur.title, body: cur.lines.join('\n') })
      const m = /^(\S{1,16}?[：:])\s*(.{12,})$/u.exec(mark)
      cur = m ? { title: m[1]!.replace(/[：:]$/, ''), lines: [m[2]!] } : { title: mark, lines: [] }
      continue
    }
    cur?.lines.push(line)
  }
  if (cur) out.push({ title: cur.title, body: cur.lines.join('\n') })
  return out.map((c) => ({ ...c, body: c.body.trim() })).filter((c) => c.body || c.title)
}

const isDeclOnly = (block: string) => {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
  return lines.length > 0 && lines.every((l) => declsOfLine(l).length > 0 || /^(?:参考(?:素材|图)?|素材)\s*[：:]?$/u.test(l))
}

function chunksBy(split: LooseSplit, lines: readonly string[]): Chunk[] {
  if (split === 'shot') return splitAt(lines, shotMarkOf)
  if (split === 'heading') {
    const levels = lines.map((l) => HEADING.exec(l.trim())?.[1]?.length).filter((n): n is number => n !== undefined)
    const level = [1, 2, 3, 4, 5, 6].find((lv) => levels.filter((n) => n === lv).length >= 2)
    if (!level) return []
    return splitAt(lines, (l) => (HEADING.exec(l.trim())?.[1]?.length === level ? l.trim().replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '').trim() : undefined))
  }
  if (split === 'number') {
    return splitAt(lines, (l) => (!/^\s/.test(l) && NUMBERED.test(l) ? l.trim() : undefined))
  }
  if (split === 'paragraph') {
    return lines.join('\n').split(/\n\s*\n+/).map((b) => b.trim()).filter((b) => b && !isDeclOnly(b)).map((body) => ({ body }))
  }
  const body = lines.join('\n').trim()
  return body ? [{ body }] : []
}

const firstLine = (body: string) => body.split('\n').map((l) => l.trim()).find(Boolean)?.replace(/^#{1,6}\s*/, '').slice(0, 40) ?? ''

function looseDuration(title: string, body: string): string | undefined {
  const m = /(?:时长|时间|秒数|duration)\s*[：:=]?\s*(\d{1,3}(?:\.\d)?)\s*(?:s|秒|sec)/iu.exec(body)
    ?? /[（(【[]\s*(\d{1,3}(?:\.\d)?)\s*(?:s|秒)\s*[)）】\]]/u.exec(`${title}\n${firstLine(body)}`)
  return m ? `${Number(m[1])}s` : undefined
}
function looseRatio(title: string, body: string): string | undefined {
  const labeled = /(?:画幅|比例|画面比例|宽高比|ratio)\s*[：:=]?\s*(\d{1,2})\s*[:：]\s*(\d{1,2})/iu.exec(`${title}\n${body}`)
  const m = labeled ?? /(?<![\d:：])(16|9|1|4|3|21)\s*[:：]\s*(9|16|1|3|4)(?![\d:：])/u.exec(title)
  if (m) return `${Number(m[1])}:${Number(m[2])}`
  const orient = /(?:画幅|比例)[^\n]{0,8}?(横屏|竖屏)/u.exec(`${title}\n${body}`) ?? /(横屏|竖屏)/u.exec(title)
  return orient ? (orient[1] === '横屏' ? '16:9' : '9:16') : undefined
}

function toGroups(chunks: readonly Chunk[], global: readonly GlobalDecl[], warnings: string[]): { groups: LooseGroup[]; inherited: number } {
  if (chunks.length > BATCH_GROUPS_MAX) warnings.push(`切出 ${chunks.length} 个镜头，单批最多 ${BATCH_GROUPS_MAX} 个，只取前 ${BATCH_GROUPS_MAX} 个`)
  const groups = chunks.slice(0, BATCH_GROUPS_MAX).map((c, i): LooseGroup => {
    const prompt = c.title && !c.body ? c.title : c.body
    const title = c.title?.trim() || firstLine(prompt) || `第${i + 1}个镜头`
    const meta = extractMeta(prompt)
    const refs = meta.refs.length ? meta.refs : looseRefDecls(prompt)
    const duration = meta.duration ?? looseDuration(title, prompt)
    const ratio = meta.ratio ?? looseRatio(title, prompt)
    return {
      index: i + 1,
      title,
      prompt,
      ...(duration ? { duration } : {}),
      ...(ratio ? { ratio } : {}),
      refs,
      issues: prompt.length > BATCH_PROMPT_MAX ? [`提示词 ${prompt.length} 字，超过单条 ${BATCH_PROMPT_MAX} 字上限`] : [],
    }
  })
  return { groups, inherited: inheritRefs(groups, global) }
}

export function looseSplitOptions(text: string): LooseSplit[] {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')
  return [...(['shot', 'heading', 'number', 'paragraph'] as const).filter((s) => chunksBy(s, lines).length >= 2), 'single']
}

/**
 * md / txt 总入口：`strict` 是插件自己的模板切法（marker / separator / section / single）；
 * 整篇一组时进兼容模式，按 `split`（缺省自动挑）切。两条路都挂全篇登记。
 */
export function parseStoryboardLoose(
  text: string,
  strict: { groups: Group[]; splitBy: string; warnings: string[] },
  split?: LooseSplit,
): LooseParse {
  const global = globalDecls(text)
  if (strict.splitBy !== 'single' && !split) {
    const groups = strict.groups.map((g): LooseGroup => ({ ...g }))
    return tidyRefNames({ groups, splitBy: strict.splitBy, warnings: strict.warnings, inherited: inheritRefs(groups, global) })
  }
  const options = looseSplitOptions(text)
  const use = split && options.includes(split) ? split : options[0]!
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')
  const warnings: string[] = []
  const { groups, inherited } = toGroups(chunksBy(use, lines), global, warnings)
  return tidyRefNames({ groups, splitBy: 'single', warnings, compat: { split: use, options }, inherited })
}

/* ---------- 表格（CSV / Excel 转成 rows 后走这里） ---------- */

const COLUMN_RULES: Array<[RegExp, 'title' | 'duration' | 'ratio' | 'refs' | string]> = [
  [/^(镜号|编号|序号|镜头号|镜头编号|shot|no\.?|#)$/iu, 'title'],
  [/^(时长|秒数|时间|duration)/iu, 'duration'],
  [/^(画幅|比例|画面比例|宽高比|ratio)/iu, 'ratio'],
  [/^(参考|参考图|参考素材|素材|引用|references?)/iu, 'refs'],
  [/^(画面|画面描述|画面内容|镜头描述|描述|内容|分镜|场景描述|description|scene)/iu, '画面内容'],
  [/景别/u, '景别'],
  [/运镜|机位|镜头运动|camera/iu, '机位与运镜'],
  [/光影|灯光|光线|lighting/iu, '光影'],
  [/^(台词|对白|旁白|dialogue)/iu, '对白'],
  [/音效|声音|声效|sound/iu, '音效'],
]

/** 表格总入口：有「提示词」列时那一列就是每组正文；没有就每行拼成带【列名】小节的提示词 */
export function parseStoryboardTable(rows: string[][]): LooseParse {
  const header = (rows[0] ?? []).map((h) => h.trim())
  const promptCol = header.findIndex((h) => /提示词|prompt/iu.test(h))
  const titleCol = header.findIndex((h) => COLUMN_RULES.find(([re]) => re.test(h.replace(/\s+/g, '')))?.[1] === 'title')
  if (promptCol >= 0) {
    const groups: LooseGroup[] = rows.slice(1).map((r, i): LooseGroup => {
      const prompt = (r[promptCol] ?? '').trim()
      const meta = extractMeta(prompt)
      return {
        index: i + 1,
        title: (titleCol >= 0 ? (r[titleCol] ?? '').trim() : '') || firstLine(prompt) || `第${i + 1}个镜头`,
        prompt,
        ...(meta.duration ? { duration: meta.duration } : {}),
        ...(meta.ratio ? { ratio: meta.ratio } : {}),
        refs: meta.refs.length ? meta.refs : looseRefDecls(prompt),
        issues: prompt.length > BATCH_PROMPT_MAX ? [`提示词 ${prompt.length} 字，超过单条 ${BATCH_PROMPT_MAX} 字上限`] : [],
      }
    }).filter((g) => g.prompt)
    return tidyRefNames({ groups, splitBy: 'table', warnings: [], inherited: 0 })
  }
  const roles = header.map((h) => COLUMN_RULES.find(([re]) => re.test(h.replace(/\s+/g, '')))?.[1])
  const hasHeader = roles.some(Boolean)
  const body = hasHeader ? rows.slice(1) : rows
  const chunks: Chunk[] = body.map((r) => {
    const cells = r.map((c) => (c ?? '').trim())
    if (!hasHeader) return { body: cells.filter(Boolean).join('\n') }
    let title: string | undefined
    const meta: string[] = []
    const parts: string[] = []
    cells.forEach((v, i) => {
      if (!v) return
      const role = roles[i]
      if (role === 'title') { title = v; return }
      if (role === 'duration') { const d = /^(\d{1,3}(?:\.\d)?)\s*(?:s|秒)?$/iu.exec(v); meta.push(`时长：${d ? `${Number(d[1])}秒` : v}`); return }
      if (role === 'ratio') { meta.push(`画幅：${v}`); return }
      if (role === 'refs') {
        const decl = looseRefDecls(v).length ? v : v.split(/[，,、；;\n]+/u).map((n) => n.trim()).filter(Boolean).map((n, k) => `图${k + 1}：${n}`).join('\n')
        parts.push(`【参考素材】\n${decl}`)
        return
      }
      parts.push(`【${role ?? (header[i] || `第${i + 1}列`)}】\n${v}`)
    })
    return { ...(title ? { title } : {}), body: [...(meta.length ? [meta.join('\n')] : []), ...parts].join('\n\n') }
  }).filter((c) => c.body)
  const warnings: string[] = []
  const { groups, inherited } = toGroups(chunks, [], warnings)
  return tidyRefNames({ groups, splitBy: 'table', warnings, compat: { split: 'single', options: [] }, inherited })
}

/** 简版 CSV 读取（引号内逗号 / 换行 / ""转义）；Excel xlsx 读不了（二进制，插件不引依赖） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1 } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"') { quoted = true; continue }
    if (ch === ',') { row.push(cell); cell = ''; continue }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1
      row.push(cell); cell = ''
      if (row.some((c) => c.trim())) rows.push(row)
      row = []
      continue
    }
    cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim())) rows.push(row)
  return rows
}
