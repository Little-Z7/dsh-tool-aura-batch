import assert from 'node:assert/strict'
import test from 'node:test'
import { checkStoryboard, genSpecOf } from '../lib/format.js'
import { checkStoryboardTable } from '../lib/format-table.js'
import { parseCsv } from '../lib/loose.js'
import { buildPackage } from '../lib/pack.js'

/* 与灵环平台 web/src/lib/batchVideo/looseParse.ts（提交 284fe1d1）同一套兼容模式切法与宽松登记 */

test('兼容模式：认不出模板时按镜头标记 / 标题 / 行首编号 / 空行 / 整篇切', () => {
  const shot = checkStoryboard('镜头1：甲进门\n甲推门而入。\n镜头2：乙说话\n乙看着窗外。')
  assert.equal(shot.compat.split, 'shot')
  assert.equal(shot.groups.length, 2)
  const heading = checkStoryboard('# 开场\n甲进门。\n# 中场\n乙说话。')
  assert.equal(heading.compat.split, 'heading')
  const num = checkStoryboard('1. 甲进门。\n2. 乙说话。\n3. 两人对视。')
  assert.equal(num.compat.split, 'number')
  const para = checkStoryboard('甲进门，环顾四周。\n\n乙在窗边说话。\n\n两人对视。')
  assert.equal(para.compat.split, 'paragraph')
  const single = checkStoryboard('一句话剧本。')
  assert.equal(single.compat.split, 'single')
})

test('宽松参考登记：`图1 程野`、`【图1】程野`、一行多条、文档开头统一登记', () => {
  const r = checkStoryboard('参考：图1 程野、图2 纪岚\n\n镜头1 开场\n程野进门。\n\n镜头2 对峙\n图1 看图2。')
  assert.equal(r.groups.length, 2)
  const g2 = r.groups[1]
  assert.deepEqual((g2.refs||[]).map((x) => `图${x.slot}${x.name}`), ['图1程野', '图2纪岚'])
  assert.equal(r.inherited, 1, '镜头 2 没登记但点到 图1/图2，从全篇登记补挂')
  const bracket = checkStoryboard('镜头1 开场\n【图1】程野\n图1 进门。')
  assert.deepEqual(bracket.groups[0].refs.map((x) => x.name), ['程野'])
})

test('只有提示词的参考：图片按提示词生成不用文件；音频缺台词报错；参考视频报错', () => {
  assert.deepEqual(genSpecOf('程野｜提示词：25岁男性，短发', '程野', 'image'), { prompt: '25岁男性，短发' })
  assert.deepEqual(genSpecOf('程野，锁定面貌', '程野', 'image'), { prompt: '锁定面貌' })
  assert.equal(genSpecOf('电梯｜提示词：x', '电梯', 'video'), undefined)
  const r = checkStoryboard('参考：图1 程野｜提示词：25岁男性\n\n镜头1 开场\n图1 进门。')
  assert.equal(r.ok, true)
  assert.equal(r.names[0].generate?.prompt, '25岁男性')
  const badAudio = checkStoryboard('参考：音频1 程野｜音色：沉稳\n\n镜头1 开场\n音频1 在响。')
  assert.equal(badAudio.ok, false)
  assert.ok(badAudio.errors[0].includes('没有台词'))
  const badVideo = checkStoryboard('参考：视频1 电梯门｜提示词：门开\n\n镜头1 开场\n视频1 播着。')
  assert.equal(badVideo.ok, false)
  assert.ok(badVideo.errors[0].includes('必须配视频文件'))
  const goodAudio = checkStoryboard('参考：音频1 程野｜台词：你好｜音色：沉稳\n\n镜头1 开场\n音频1 在响。')
  assert.equal(goodAudio.ok, true)
  assert.equal(goodAudio.names[0].generate?.voice?.text, '你好')
})

test('表格（CSV）：没有「提示词」列每行各列拼成提示词，参考列只写名字按顺序登记', () => {
  const rows = parseCsv('镜号,时长,画面,台词\n1,10,甲进门。,你好\n2,10,乙说话。,\n')
  assert.equal(rows.length, 3)
  const r = checkStoryboardTable(rows)
  assert.equal(r.groups.length, 2)
  assert.equal(r.groups[0].duration, '10s')
  const withRefs = checkStoryboardTable([['镜号', '参考', '画面'], ['1', '程野、纪岚', '图1 进门。']])
  assert.deepEqual(withRefs.groups[0].refs.map((x) => `图${x.slot}${x.name}`), ['图1程野', '图2纪岚'])
})

test('打包：只有提示词的参考不算缺图，也没文件进包', () => {
  const text = '参考：图1 程野｜提示词：25岁男性\n\n第1组 开场\n图1 进门。'
  const r = buildPackage({ storyboardText: text, storyboardName: 'test.md', images: [] })
  assert.equal(r.missing.length, 0, '按提示词生成的不算缺图')
  assert.equal(r.placed.length, 0)
})
