import assert from 'node:assert/strict'
import test from 'node:test'
import { autoMatch, checkStoryboard, classifyRef, extractMeta, matchImage, mentionedSlots, parseStoryboard, sectionsOf, splitTextGroups } from '../lib/format.js'
import { STORY } from './helpers.mjs'

/* 与灵环仓库 web/test/batchVideoParse.test.ts、tvImportStoryboard.test.ts 同一批规则 */

test('切组：「第N组」标题优先，其次单独一行 ---，再次重复的【小节】，都没有就整份一组', () => {
  assert.equal(splitTextGroups('# 第1组 甲\n内容A\n## 第二组：乙\n内容B').chunks.length, 2)
  assert.deepEqual(splitTextGroups('# 第1组 甲\n内容A\n## 第二组：乙\n内容B').chunks.map((c) => c.title), ['第1组 甲', '第二组：乙'])
  assert.equal(splitTextGroups('正文里提到第1组的第二个镜头\n不算分界').splitBy, 'single')
  assert.equal(splitTextGroups('A\n---\nB\n---\nC').chunks.length, 3)
  assert.equal(splitTextGroups('【参考素材分工】\n图1：甲\n【场景提示词】\nx\n【参考素材分工】\n图1：乙').splitBy, 'section')
  assert.equal(splitTextGroups('说明\n# 第1组 甲\n内容').droppedHead, 1)
})

test('时长 / 画幅 / 图N', () => {
  assert.deepEqual(extractMeta('时长：15秒。\n画幅：16:9横屏。\n图1：索菲亚，锁定面貌。\n图2：废弃工厂的空间结构、混凝土梁柱'), {
    duration: '15s', ratio: '16:9', refs: [{ slot: 1, name: '索菲亚' }, { slot: 2, name: '废弃工厂的空间结构' }],
  })
  assert.equal(extractMeta('【12s本组总控】').duration, '12s')
  assert.equal(extractMeta('画幅：竖屏').ratio, '9:16')
  assert.deepEqual(extractMeta('15s 16:9。图1：索菲亚').refs, [], '图N 必须在行首')
  assert.deepEqual(mentionedSlots('图1：甲\n图1 看着图3，地图2 在桌上'), [1, 3])
})

test('名称配图：同名优先、唯一包含关系次之，再按文件夹名', () => {
  assert.equal(autoMatch('索菲亚', ['索菲亚.png', '艾莲娜.png']), '索菲亚.png')
  assert.equal(autoMatch('废弃工厂入口', ['废弃工厂.png']), '废弃工厂.png')
  assert.equal(autoMatch('纪岚', ['纪岚.png', '纪岚办公室.png']), '纪岚.png')
  assert.equal(autoMatch('打手', ['拍摄打手.png', '看守打手.png']), undefined, '两个候选不自动配')
  const imgs = [{ file: '正面.png', path: '角色/艾莲娜/正面.png' }, { file: '侧面.png', path: '角色/艾莲娜/侧面.png' }]
  assert.equal(matchImage('艾莲娜', imgs)?.path, '角色/艾莲娜/正面.png')
})

test('归类：文件夹 → 名称结尾 → 描述 → 横竖；竖屏短剧的竖版场景图也归场景', () => {
  assert.equal(classifyRef({ name: '野芒工作室', line: '野芒工作室，日景，绘图桌', landscape: false }), 'scenes')
  assert.equal(classifyRef({ name: '程野', line: '程野，锁定面貌、短发', landscape: true }), 'roles')
  assert.equal(classifyRef({ name: '小满', line: '小满', path: '参考图/场景/小满.png' }), 'scenes')
  assert.equal(classifyRef({ name: '青钢剑', line: '青钢剑，道具，古朴' }), 'props')
  assert.equal(classifyRef({ name: '阿福', line: '阿福', landscape: true }), 'scenes')
})

test('【小节】→ 分镜表列', () => {
  const cols = sectionsOf('【场景提示词】\n夜晚。\n【声效总控】\n风声。\n\nAll in English.\n镜头1（15秒）\n【焦段与景别】\n中全景。\n【画面内容】\n0—3秒：蜷坐。\n【光影】\n冷白光。\n【Dialogue】\n“Victor.”')
  assert.deepEqual(cols, { description: '0—3秒：蜷坐。', sceneSize: '中全景。', lighting: '冷白光。', dialogue: '“Victor.”', sound: '风声。\n\nAll in English.' })
})

test('整份检查：丢掉的开头、缺画幅、未登记的图N、配图与归类、超长的列', () => {
  const r = checkStoryboard(STORY, [
    { file: '程野.png', path: '程野.png' },
    { file: '野芒工作室.png', path: '野芒工作室.png' },
    { file: '朝暮电梯厅.png', path: '朝暮电梯厅.png' },
  ])
  assert.equal(r.ok, true)
  assert.equal(r.groups.length, 2)
  assert.ok(r.warnings.some((w) => w.includes('之前有 1 行文字')))
  assert.deepEqual(r.missing, ['程小满'])
  assert.deepEqual(r.names.map((n) => [n.name, n.kind]), [['程野', 'roles'], ['野芒工作室', 'scenes'], ['程小满', 'roles'], ['朝暮电梯厅', 'scenes']])
  const [g1, g2] = r.groups
  assert.deepEqual([g1.duration, g1.ratio], ['10s', '16:9'])
  assert.ok(g1.columns.find((c) => c.column === 'sceneSize').truncated, '景别超过 40 字会在表格里截断')
  assert.ok(g2.issues.some((i) => i.includes('没写画幅')))
  assert.ok(g2.issues.some((i) => i.includes('图4')), '正文用了图4 却没登记')
  assert.equal(parseStoryboard('').groups.length, 0)
  assert.equal(checkStoryboard('').ok, false)
})

test('检查结果写明：没写时长 / 画幅的组，批量生成会按 5 秒 / 16:9 出（平台按每组自己的时长与画幅出片）', async () => {
  const { renderCheck } = await import('../lib/tools.js')
  const text = renderCheck(checkStoryboard('第1组 有时长没画幅\n时长：12秒。\n正文\n\n第2组 都写了\n时长：10秒。\n画幅：9:16竖屏。\n正文'), false)
  assert.match(text, /第 1 组没写画幅.*按 16:9 出/)
  assert.doesNotMatch(text, /没写时长/)
  assert.match(text, /1\. .*｜12s｜缺画幅（按 16:9 出）/)
  assert.match(text, /2\. .*｜10s｜9:16/)
})
