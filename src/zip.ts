/**
 * 最小 zip 写入（不加依赖）：能压就 deflate，文件名按 UTF-8 写并打通用位第 11 位 ——
 * 灵环导入、macOS 与 Windows 自带解压都能正确显示中文文件名。不支持 ZIP64（单包 4GB / 65535 个文件以内）。
 * @module dsh-tool-aura-batch/zip
 */
import { deflateRawSync } from 'node:zlib'

export interface ZipEntry {
  /** 包内路径，`/` 分隔 */
  path: string
  data: Buffer
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const UTF8_FLAG = 0x0800
const MAX_U32 = 0xffffffff

export function writeZip(entries: readonly ZipEntry[], date = new Date()): Buffer {
  if (entries.length > 0xffff) throw new Error(`文件太多（${entries.length} 个），单个 zip 最多 65535 个`)
  const time = ((date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)) & 0xffff
  const day = (((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.path.replace(/\\/g, '/'), 'utf8')
    const deflated = deflateRawSync(e.data)
    const deflate = deflated.length < e.data.length
    const body = deflate ? deflated : e.data
    const crc = crc32(e.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(UTF8_FLAG, 6)
    local.writeUInt16LE(deflate ? 8 : 0, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(day, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(e.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50, 0)
    cen.writeUInt16LE(20, 4)
    cen.writeUInt16LE(20, 6)
    cen.writeUInt16LE(UTF8_FLAG, 8)
    cen.writeUInt16LE(deflate ? 8 : 0, 10)
    cen.writeUInt16LE(time, 12)
    cen.writeUInt16LE(day, 14)
    cen.writeUInt32LE(crc, 16)
    cen.writeUInt32LE(body.length, 20)
    cen.writeUInt32LE(e.data.length, 24)
    cen.writeUInt16LE(name.length, 28)
    cen.writeUInt32LE(offset, 42)
    parts.push(local, name, body)
    central.push(cen, name)
    offset += local.length + name.length + body.length
    if (offset > MAX_U32) throw new Error('压缩包超过 4GB，请分成几集分别打包')
  }
  const centralSize = central.reduce((s, b) => s + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, ...central, end])
}
