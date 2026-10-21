import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply } from '../lib/index.js'
import { crc32, writeZip } from '../lib/zip.js'
import { fakePng, readZip, STORY } from './helpers.mjs'

function load(config = {}) {
  const defs = new Map()
  apply({ tools: { register: (d) => defs.set(d.name, d) } }, config)
  return defs
}
const exec = () => ({ signal: AbortSignal.timeout(10_000) })

test('注册三个工具，名字与插件市场 catalog 一致', () => {
  assert.deepEqual([...load().keys()], ['aura_batch_format', 'aura_batch_check', 'aura_batch_pack'])
})

test('zip：UTF-8 文件名、CRC 与内容可还原', () => {
  const zip = writeZip([{ path: '参考图/角色/程野.png', data: fakePng(10, 20) }, { path: '说明.md', data: Buffer.from('a'.repeat(500)) }])
  const files = readZip(zip)
  assert.deepEqual(files.map((f) => [f.path, f.utf8]), [['参考图/角色/程野.png', true], ['说明.md', true]])
  assert.equal(files[1].data.toString(), 'a'.repeat(500))
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926)
})

test('format：给出格式说明与模板，时长 / 画幅取参数或配置', async () => {
  const fmt = load({ defaultDuration: 12, defaultRatio: '9:16' }).get('aura_batch_format')
  const v = await fmt.execute({}, exec())
  assert.match(v.guide, /时长：12秒。/)
  assert.match(v.guide, /画幅：9:16竖屏/)
  assert.match((await fmt.execute({ duration: 8, ratio: '16:9' }, exec())).guide, /时长：8秒。[\s\S]*画幅：16:9横屏/)
  assert.equal(fmt.output.render({}, v)[0].type, 'text')
})

test('check + pack：按名称配图、分进角色 / 场景文件夹、缺图照常打包并说明', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'aura-batch-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(join(dir, '甲方是我前任-第01集-分镜提示词.md'), STORY)
  mkdirSync(join(dir, 'refs', '人物'), { recursive: true })
  writeFileSync(join(dir, 'refs', '人物', '程野.png'), fakePng(1248, 1664, 1))
  writeFileSync(join(dir, 'refs', '野芒工作室.png'), fakePng(1088, 1920, 2))
  writeFileSync(join(dir, 'refs', '电梯厅.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0x38, 0x07, 0x80, 0x03]))
  writeFileSync(join(dir, 'refs', '.DS_Store'), 'x')
  const defs = load()

  const checked = await defs.get('aura_batch_check').execute({ storyboard: join(dir, '甲方是我前任-第01集-分镜提示词.md'), references: join(dir, 'refs') }, exec())
  assert.equal(checked.ok, true)
  assert.deepEqual(checked.missing, ['程小满'])
  const text = defs.get('aura_batch_check').output.render({ references: 'refs' }, checked)[0].text
  assert.match(text, /可以导入：2 组/)
  assert.match(text, /缺图：程小满/)

  const assets = [{ name: '朝暮电梯厅', file: join(dir, 'refs', '电梯厅.jpg') }]
  const packed = await defs.get('aura_batch_pack').execute({ storyboard: join(dir, '甲方是我前任-第01集-分镜提示词.md'), references: join(dir, 'refs'), assets }, exec())
  assert.equal(packed.output, join(dir, '甲方是我前任-第01集-全套.zip'))
  assert.deepEqual(packed.missing, ['程小满'])
  const files = readZip(readFileSync(packed.output))
  assert.deepEqual(files.map((f) => f.path), [
    '甲方是我前任-第01集-分镜提示词.md',
    '参考图/角色/程野.png',
    '参考图/场景/野芒工作室.png',
    '参考图/场景/朝暮电梯厅.jpg',
  ])
  assert.equal(files[0].data.toString('utf8'), STORY)
  assert.equal(files[1].data[32], 1)
  assert.match(defs.get('aura_batch_pack').output.render({}, packed)[0].text, /放入参考图 3 张，缺图 1 个：程小满/)
})

test('pack：没有任何一组时报错，不写文件', async () => {
  await assert.rejects(load().get('aura_batch_pack').execute({ content: '   ' }, exec()), /需要 storyboard/)
  await assert.rejects(load().get('aura_batch_pack').execute({ content: '\n\n' }, exec()), /需要 storyboard|没有读到/)
})
