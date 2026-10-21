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
export const MAX_SHOT_REFS = 9
/** 单批组数上限 */
export const BATCH_GROUPS_MAX = 100
/** 单组提示词上限（字） */
export const BATCH_PROMPT_MAX = 20_000
/** 分镜表各列长度上限（字），超出部分只留在最终提示词里 */
export const SHOT_FIELD_MAX = { duration: 20, description: 2000, sceneSize: 40, lighting: 200, dialogue: 2000, sound: 200, camera: 100 } as const

export type SplitBy = 'marker' | 'separator' | 'section' | 'single'
export type AssetKind = 'roles' | 'scenes' | 'props'
export const KIND_LABEL: Record<AssetKind, string> = { roles: '角色', scenes: '场景', props: '道具' }

export interface RefSlot {
  /** 图N 的 N（1 起） */
  slot: number
  /** 「图N：名称，……」里的名称 */
  name: string
}

export interface Group {
  index: number
  title: string
  prompt: string
  duration?: string
  ratio?: string
  refs: RefSlot[]
  issues: string[]
}

export interface ParseResult {
  groups: Group[]
  splitBy: SplitBy
  warnings: string[]
}

const CN_DIGITS: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

/** 「十二」「二十」「一百零五」这类常见写法 → 数字；认不出返回 undefined */
export function chineseNumber(raw: string): number | undefined {
  if (/^\d+$/.test(raw)) return Number(raw)
  if (!/^[零一二两三四五六七八九十百]+$/.test(raw)) return undefined
  let total = 0
  let current = 0
  for (const ch of raw) {
    if (ch === '百') { total += (current || 1) * 100; current = 0 }
    else if (ch === '十') { total += (current || 1) * 10; current = 0 }
    else current = CN_DIGITS[ch] ?? 0
  }
  return total + current
}

/* 标记后面只能是行尾、空白或标点：正文里「第1组的第二个镜头」这种句子不能被当成分界 */
const MARKER = /^第\s*([0-9]+|[零一二两三四五六七八九十百]+)\s*[组条段](?=$|[\s：:、.\-—（(【[「])/
const SEPARATOR = /^\s*(?:-{3,}|\*{3,}|_{3,}|={3,})\s*$/
const SECTION = /^【[^】\n]{1,30}】/

/** 标记行去掉 markdown 装饰后的文字；不是标记行返回 undefined */
export function markerOf(line: string): { text: string; rest: string } | undefined {
  const cleaned = line
    .trim()
    .replace(/^#{1,6}\s*/, '')
    .replace(/^(?:[-*+]\s+|\d+[.)、]\s*)/, '')
    .replace(/\*\*/g, '')
    .trim()
  const m = MARKER.exec(cleaned)
  if (!m || chineseNumber(m[1]!) === undefined) return undefined
  const rest = cleaned.slice(m[0].length).replace(/^[\s：:、.\-—]+/, '')
  return { text: cleaned, rest }
}

/** 切 md / txt：返回每块的（可选）标题与正文，以及第一个分组标记之前被丢掉的文字行数 */
export function splitTextGroups(text: string): { chunks: Array<{ title?: string; body: string }>; splitBy: SplitBy; droppedHead: number } {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  const clean = (chunks: Array<{ title?: string; body: string }>) =>
    chunks.map((c) => ({ ...c, body: c.body.trim() })).filter((c) => c.body)

  if (lines.some((l) => markerOf(l))) {
    const chunks: Array<{ title?: string; body: string }> = []
    let cur: { title?: string; lines: string[] } | undefined
    const head: string[] = []
    for (const line of lines) {
      const mk = markerOf(line)
      if (mk) {
        if (cur) chunks.push({ ...(cur.title ? { title: cur.title } : {}), body: cur.lines.join('\n') })
        const long = mk.rest.length > 30
        cur = { title: long ? mk.text.slice(0, mk.text.length - mk.rest.length).replace(/[\s：:、.\-—]+$/, '') : mk.text, lines: long ? [mk.rest] : [] }
        continue
      }
      if (cur) cur.lines.push(line)
      else head.push(line)
    }
    if (cur) chunks.push({ ...(cur.title ? { title: cur.title } : {}), body: cur.lines.join('\n') })
    /* 平台丢弃第一个标记之前的内容（文件说明之类）；这里数出来提醒用户 */
    const droppedHead = head.filter((l) => l.trim() && !/^#{1,6}\s/.test(l.trim())).length
    return { chunks: clean(chunks), splitBy: 'marker', droppedHead }
  }

  if (lines.some((l) => SEPARATOR.test(l))) {
    const chunks: Array<{ body: string }> = []
    let buf: string[] = []
    for (const line of lines) {
      if (SEPARATOR.test(line)) { chunks.push({ body: buf.join('\n') }); buf = [] }
      else buf.push(line)
    }
    chunks.push({ body: buf.join('\n') })
    return { chunks: clean(chunks), splitBy: 'separator', droppedHead: 0 }
  }

  const firstSection = lines.map((l) => l.trim()).find((l) => SECTION.test(l))
  const header = firstSection ? SECTION.exec(firstSection)![0] : undefined
  if (header && lines.filter((l) => l.trim().startsWith(header)).length >= 2) {
    const chunks: Array<{ body: string }> = []
    let buf: string[] = []
    for (const line of lines) {
      if (line.trim().startsWith(header) && buf.some((l) => l.trim())) { chunks.push({ body: buf.join('\n') }); buf = [] }
      buf.push(line)
    }
    chunks.push({ body: buf.join('\n') })
    return { chunks: clean(chunks), splitBy: 'section', droppedHead: 0 }
  }

  return { chunks: clean([{ body: lines.join('\n') }]), splitBy: 'single', droppedHead: 0 }
}

/** 从正文里读时长、画幅与参考位 */
export function extractMeta(prompt: string): { duration?: string; ratio?: string; refs: RefSlot[] } {
  const out: { duration?: string; ratio?: string; refs: RefSlot[] } = { refs: [] }
  const dur = /时长\s*[：:]\s*(\d+(?:\.\d+)?)\s*(?:秒|s\b|S\b)/.exec(prompt)
    ?? /【\s*(\d+(?:\.\d+)?)\s*(?:s|S|秒)\s*本组/.exec(prompt)
  if (dur) out.duration = `${Number(dur[1])}s`
  const ratio = /画幅\s*[：:]\s*(\d{1,2})\s*[:：]\s*(\d{1,2})/.exec(prompt)
  if (ratio) out.ratio = `${Number(ratio[1])}:${Number(ratio[2])}`
  else {
    const orient = /画幅\s*[：:][^\n]*?(横屏|竖屏)/.exec(prompt)
    if (orient) out.ratio = orient[1] === '横屏' ? '16:9' : '9:16'
  }
  const seen = new Set<number>()
  for (const m of prompt.matchAll(/^[ \t]*图\s*(\d{1,2})\s*[：:]\s*(.+)$/gmu)) {
    const slot = Number(m[1])
    if (seen.has(slot)) continue
    seen.add(slot)
    const name = m[2]!.split(/[，,、；;。]/u)[0]!.trim().slice(0, 40)
    if (name) out.refs.push({ slot, name })
  }
  out.refs.sort((a, b) => a.slot - b.slot)
  return out
}

/* 正文里这些「×图」是普通词（地图、截图、效果图……），不是参考引用 */
const NOT_A_REF_PREFIX = '@A-Za-z0-9地插截贴草蓝构附示拼挂底果面配制绘视原帧意'

/** 正文里提到的「图N」编号（排除「图N：」登记行本身与「地图」这类词） */
export function mentionedSlots(prompt: string): number[] {
  const body = prompt.replace(/^[ \t]*图\s*\d{1,2}\s*[：:].*$/gmu, '')
  const out = new Set<number>()
  for (const m of body.matchAll(new RegExp(`(?<![${NOT_A_REF_PREFIX}])图(\\d{1,2})(?!\\d)`, 'gu'))) out.add(Number(m[1]))
  return [...out].sort((a, b) => a - b)
}

/** 整份 md / txt → 一组组（与平台导入时的结果一致） */
export function parseStoryboard(text: string): ParseResult & { droppedHead: number } {
  const { chunks, splitBy, droppedHead } = splitTextGroups(text)
  const warnings: string[] = []
  if (chunks.length > BATCH_GROUPS_MAX) warnings.push(`文件里有 ${chunks.length} 组，单批最多 ${BATCH_GROUPS_MAX} 组，平台只取前 ${BATCH_GROUPS_MAX} 组`)
  const groups = chunks.slice(0, BATCH_GROUPS_MAX).map((c, i): Group => {
    const meta = extractMeta(c.body)
    const issues: string[] = []
    if (c.body.length > BATCH_PROMPT_MAX) issues.push(`提示词 ${c.body.length} 字，超过单条 ${BATCH_PROMPT_MAX} 字上限`)
    const slots = meta.refs.map((r) => r.slot)
    if (slots.length && slots.some((s, k) => s !== k + 1)) issues.push(`参考图编号不连续（${slots.map((s) => `图${s}`).join('、')}）`)
    return {
      index: i + 1,
      title: c.title?.trim() || `第${i + 1}组`,
      prompt: c.body,
      ...(meta.duration ? { duration: meta.duration } : {}),
      ...(meta.ratio ? { ratio: meta.ratio } : {}),
      refs: meta.refs,
      issues,
    }
  })
  return { groups, splitBy, warnings, droppedHead }
}

/* ───────────────────────── 名称 ↔ 参考图 ───────────────────────── */

const baseName = (file: string) => file.replace(/\.[^./\\]+$/, '').trim().toLowerCase()

/** 文件名去扩展名后与名称完全相同，或一方包含另一方且只有唯一一个候选 */
export function autoMatch(name: string, files: readonly string[]): string | undefined {
  const n = name.trim().toLowerCase()
  if (!n) return undefined
  const exact = files.filter((f) => baseName(f) === n)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return undefined
  const partial = files.filter((f) => {
    const b = baseName(f)
    return b.length > 0 && (b.includes(n) || n.includes(b))
  })
  return partial.length === 1 ? partial[0] : undefined
}

export interface ImageRef {
  /** 文件名（不含目录） */
  file: string
  /** 相对参考图根目录的路径，`/` 分隔 */
  path: string
}

const folderOf = (path: string | undefined) => {
  const parts = (path ?? '').split('/')
  return parts.length > 1 ? parts[parts.length - 2]!.trim().toLowerCase() : ''
}

/** 名称 → 参考图：先按文件名配；配不上再按所在文件夹名（「艾莲娜/正面.png」配「艾莲娜」，取排在最前的一张） */
export function matchImage<T extends ImageRef>(name: string, images: readonly T[]): T | undefined {
  const byFile = autoMatch(name, images.map((i) => i.file))
  if (byFile) return images.find((i) => i.file === byFile)
  const n = name.trim().toLowerCase()
  if (!n) return undefined
  const exact = images.find((i) => folderOf(i.path) === n)
  if (exact) return exact
  const folders = [...new Set(images.map((i) => folderOf(i.path)).filter((f) => f && (f.includes(n) || n.includes(f))))]
  return folders.length === 1 ? images.find((i) => folderOf(i.path) === folders[0]) : undefined
}

/* ───────────────────────── 角色 / 场景 / 道具 ───────────────────────── */

/** 「图N：…」那一整行（冒号后面的全部），找不到给空串 */
export function refLine(prompt: string, slot: number): string {
  const m = new RegExp(`^[ \\t]*图\\s*${slot}\\s*[：:]\\s*(.+)$`, 'mu').exec(prompt)
  return m ? m[1]!.trim() : ''
}

const ROLE_DIR = /(^|\/)(角色|人物|人设|演员|characters?|roles?)(\/|$)/iu
const SCENE_DIR = /(^|\/)(场景|环境|地点|背景|scenes?|locations?)(\/|$)/iu
const PROP_DIR = /(^|\/)(道具|物品|props?)(\/|$)/iu
const SCENE_NAME = /(厅|室|房|屋|库|厂|楼|街|巷|院|馆|店|场|园|间|廊|台|站|所|区|城|村|路|桥|港|岛|山|林|湖|河|海|门口|入口|出口|结构|内部|外景|内景)$/u
const SCENE_WORDS = /(日景|夜景|室内|室外|内景|外景|场景|空间|环境|建筑|厂房|街道|房间|走廊|天台|车库|工厂|办公室|工作室|会议|大厅|电梯|医院|病房|教室|餐厅|梁柱|管道|铁架|落地窗|天际线)/u
const ROLE_WORDS = /(面貌|五官|长相|发型|头发|卷发|短发|长发|发夹|服装|童装|西装|风衣|衬衫|眼镜|妆容|年龄|岁|男|女|孩|儿童|角色|人物|打手|保安|主角|配角)/u
const PROP_WORDS = /(道具|物品)/u

/** 参考图归角色、场景还是道具：文件夹名 → 名称结尾 → 描述用词 → 横竖（横图算场景）；与平台导入时同一套判断 */
export function classifyRef(ref: { name: string; line: string; path?: string; landscape?: boolean }): AssetKind {
  const dir = ref.path ?? ''
  if (PROP_DIR.test(dir)) return 'props'
  if (SCENE_DIR.test(dir)) return 'scenes'
  if (ROLE_DIR.test(dir)) return 'roles'
  if (SCENE_NAME.test(ref.name)) return 'scenes'
  const rest = ref.line.startsWith(ref.name) ? ref.line.slice(ref.name.length) : ref.line
  if (PROP_WORDS.test(rest)) return 'props'
  const scene = SCENE_WORDS.test(`${ref.name}${rest}`)
  const role = ROLE_WORDS.test(rest)
  if (scene !== role) return scene ? 'scenes' : 'roles'
  return ref.landscape ? 'scenes' : 'roles'
}

/* ───────────────────────── 【小节】→ 分镜表列 ───────────────────────── */

export type ShotColumn = 'description' | 'sceneSize' | 'camera' | 'lighting' | 'dialogue' | 'sound'
export const COLUMN_LABEL: Record<ShotColumn, string> = {
  description: '画面描述', sceneSize: '景别', camera: '运镜', lighting: '光影氛围', dialogue: '对白·旁白', sound: '音效',
}

const COLUMN_SECTIONS: Array<[ShotColumn, RegExp]> = [
  ['description', /^(画面内容|画面描述)/u],
  ['description', /^场景(提示词|描述)?$/u],
  ['sceneSize', /景别/u],
  ['camera', /运镜|机位/u],
  ['lighting', /光影|灯光|光线/u],
  ['dialogue', /^(dialogue|对白|台词|旁白)/iu],
  ['sound', /声效|音效|声音/u],
]

/** 按「【小节】」切开一组提示词，得到分镜表各列的原文；小节到下一个「【…】」或「镜头N（…）」为止 */
export function sectionsOf(prompt: string): Partial<Record<ShotColumn, string>> {
  const sections: Array<{ title: string; lines: string[] }> = []
  let cur: { title: string; lines: string[] } | null = null
  for (const line of prompt.split(/\r?\n/)) {
    const head = /^\s*【([^】]{1,20})】\s*(.*)$/u.exec(line)
    if (head) {
      cur = { title: head[1]!.trim(), lines: head[2] ? [head[2]] : [] }
      sections.push(cur)
    } else if (/^\s*镜头\s*\d+\s*[（(]/u.test(line)) cur = null
    else cur?.lines.push(line)
  }
  const out: Partial<Record<ShotColumn, string>> = {}
  const taken = new Set<string>()
  for (const [col, re] of COLUMN_SECTIONS) {
    if (col === 'description' && out.description) continue
    const hits = sections.filter((s) => re.test(s.title) && !taken.has(s.title))
    const text = hits.map((s) => s.lines.join('\n').trim()).filter(Boolean).join('\n\n')
    hits.forEach((s) => taken.add(s.title))
    if (text) out[col] = out[col] ? `${out[col]}\n\n${text}` : text
  }
  return out
}

/* ───────────────────────── 整份检查 ───────────────────────── */

export interface CheckedRef extends RefSlot {
  /** 配上的参考图（相对路径）；没提供参考图目录时为空 */
  image?: string
  kind: AssetKind
}

export interface CheckedGroup {
  index: number
  title: string
  duration?: string
  ratio?: string
  refs: CheckedRef[]
  /** 会填进分镜表的列（超出列长上限的标出来） */
  columns: Array<{ column: ShotColumn; label: string; chars: number; truncated: boolean }>
  issues: string[]
}

export interface CheckResult {
  splitBy: SplitBy
  groups: CheckedGroup[]
  /** 全集的参考名称（出现顺序） */
  names: Array<{ name: string; line: string; image?: string; kind: AssetKind }>
  /** 提供了参考图目录、但配不上图的名称 */
  missing: string[]
  /** 整份文件层面的提醒 */
  warnings: string[]
  /** 能不能导入：至少有一组、且没有超长的组 */
  ok: boolean
}

/**
 * 按平台规则检查一份整集分镜文档。传了 `images` 才核对参考图是否配得上。
 * `landscapeOf` 给出某张图是不是横图（归类的最后一道判断），量不出来可以不传。
 */
export function checkStoryboard(
  text: string,
  images?: readonly ImageRef[],
  landscapeOf?: (image: ImageRef) => boolean | undefined,
): CheckResult {
  const parsed = parseStoryboard(text)
  const warnings = [...parsed.warnings]
  if (!parsed.groups.length) warnings.push('没有读到任何一组提示词')
  if (parsed.droppedHead) warnings.push(`第一个「第N组」标题之前有 ${parsed.droppedHead} 行文字，平台导入时会丢掉；要保留就挪进某一组里`)
  if (parsed.splitBy === 'single' && parsed.groups.length === 1 && parsed.groups[0]!.prompt.length > 3000) {
    warnings.push('整份文件只切出一组；要分成多条视频，每组前加「# 第N组 标题」或单独一行 ---')
  }
  const names: CheckResult['names'] = []
  const groups = parsed.groups.map((g): CheckedGroup => {
    const issues = [...g.issues]
    if (!g.duration) issues.push('没写时长（在【N秒本组总控】里写「时长：N秒。」），导入后要在分镜表里补')
    if (!g.ratio) issues.push('没写画幅（写「画幅：16:9横屏」或「画幅：9:16竖屏」）')
    if (g.refs.length > MAX_SHOT_REFS) issues.push(`参考图有 ${g.refs.length} 个，平台每个镜头只挂前 ${MAX_SHOT_REFS} 个`)
    const declared = new Set(g.refs.map((r) => r.slot))
    const undeclared = mentionedSlots(g.prompt).filter((s) => !declared.has(s))
    if (undeclared.length) issues.push(`正文提到 ${undeclared.map((s) => `图${s}`).join('、')}，但【参考素材分工】里没有「图N：名称」那一行，这些不会挂参考`)
    const refs = g.refs.map((r): CheckedRef => {
      const line = refLine(g.prompt, r.slot)
      const image = images ? matchImage(r.name, images) : undefined
      const kind = classifyRef({ name: r.name, line, ...(image ? { path: image.path } : {}), ...(image && landscapeOf?.(image) !== undefined ? { landscape: landscapeOf(image)! } : {}) })
      if (!names.some((n) => n.name === r.name)) names.push({ name: r.name, line, ...(image ? { image: image.path } : {}), kind })
      return { ...r, ...(image ? { image: image.path } : {}), kind }
    })
    const cols = sectionsOf(g.prompt)
    const columns = (Object.keys(cols) as ShotColumn[]).map((column) => {
      const chars = cols[column]!.trim().length
      return { column, label: COLUMN_LABEL[column], chars, truncated: chars > SHOT_FIELD_MAX[column] }
    })
    return { index: g.index, title: g.title, ...(g.duration ? { duration: g.duration } : {}), ...(g.ratio ? { ratio: g.ratio } : {}), refs, columns, issues }
  })
  const missing = images ? names.filter((n) => !n.image).map((n) => n.name) : []
  const ok = groups.length > 0 && !parsed.groups.some((g) => g.prompt.length > BATCH_PROMPT_MAX)
  return { splitBy: parsed.splitBy, groups, names, missing, warnings, ok }
}
