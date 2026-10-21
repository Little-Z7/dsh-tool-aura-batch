import { inflateRawSync } from 'node:zlib'

/** 只有文件头的 PNG（宽高写进 IHDR），够 imageSize 读 */
export function fakePng(width, height, seed = 0) {
  const b = Buffer.alloc(33)
  b.writeUInt32BE(0x89504e47, 0)
  b.writeUInt32BE(0x0d0a1a0a, 4)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(width, 16)
  b.writeUInt32BE(height, 20)
  b[32] = seed
  return b
}

/** 读 zip 中央目录：[{ path, utf8, data }] */
export function readZip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const count = buf.readUInt16LE(end + 10)
  let p = buf.readUInt32LE(end + 16)
  const out = []
  for (let i = 0; i < count; i++) {
    const flags = buf.readUInt16LE(p + 8)
    const method = buf.readUInt16LE(p + 10)
    const csize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const path = buf.toString('utf8', p + 46, p + 46 + nameLen)
    const lNameLen = buf.readUInt16LE(local + 26)
    const lExtraLen = buf.readUInt16LE(local + 28)
    const raw = buf.subarray(local + 30 + lNameLen + lExtraLen, local + 30 + lNameLen + lExtraLen + csize)
    out.push({ path, utf8: (flags & 0x0800) !== 0, data: method === 8 ? inflateRawSync(raw) : Buffer.from(raw) })
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

/** 《甲方是我前任》两组，结构与灵环导入测试用的那份一致 */
export const STORY = [
  '甲方是我前任 第01集（这一行在第一个「第N组」之前，导入时会被丢掉）',
  '',
  '# 第1组 野芒工作室·比稿通知',
  '【参考素材分工】',
  '图1：程野，锁定面貌、短发与沉静气质，深色衬衫。',
  '图2：野芒工作室，日景，绘图桌、手稿墙与落地窗。',
  '',
  '【场景提示词】',
  '白天，图2 里，图1 坐在绘图桌前修改手稿。',
  '',
  '【10s本组总控】',
  '时长：10秒。',
  '画幅：16:9横屏。',
  '',
  '【声效总控】',
  '城市底噪与空调风声，无BGM。',
  '',
  '镜头1（10秒，一镜到底）',
  '',
  '【焦段与景别】',
  '等效50mm，中景起，结束于近景。较浅景深，程野面部与手机屏幕清楚，手稿墙虚化，前景保留一角绘图桌。',
  '',
  '【机位与运镜】',
  '机位位于绘图桌斜前方，缓慢推近。',
  '',
  '【画面内容】',
  '0—4秒：图1 低头修改手稿。',
  '',
  '【光影】',
  '落地窗午后阳光为主光。',
  '',
  '【Dialogue】',
  '本组无对白。',
  '',
  '# 第2组 朝暮电梯厅·偶遇',
  '【参考素材分工】',
  '图1：程野，锁定面貌。',
  '图2：程小满，锁定面貌、兔牙与双马尾。',
  '图3：朝暮电梯厅，日景，金属电梯门。',
  '',
  '【场景提示词】',
  '图1 牵着图2 等电梯，背景是图3；图4 在远处看着。',
  '',
  '【10s本组总控】',
  '时长：10秒。',
].join('\n')
