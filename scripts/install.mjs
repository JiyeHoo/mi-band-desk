import { readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
try {
  const response = await fetch('http://127.0.0.1:10721/status', { signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error('AstroBox 本地接口未就绪')
  const status = await response.json()
  // /status lists connected devices; unlike /device/list its entries need not
  // contain a `connected` flag. Do not request the credential-bearing endpoint.
  const devices = Array.isArray(status.devices) ? status.devices : []
  if (!status.ok || status.device_count !== 1 || devices.length !== 1 || devices[0].connected === false) {
    throw new Error('请在 AstroBox 中只连接目标手环 9 NFC，再执行安装。')
  }
  const device = devices[0]
  if (!/(?:band\s*9(?!\d)|手环\s*9(?!\d))/i.test(device.name || '') || /pro/i.test(device.name)) {
    throw new Error('已连接设备名称不符合手环 9；为避免传错设备，停止安装。')
  }
  const verified = spawnSync(process.execPath, [join(root, 'scripts/verify-package.mjs')], { cwd: root, stdio: 'inherit' })
  if (verified.status !== 0) process.exit(verified.status || 1)
  const info = JSON.parse(readFileSync(join(root, 'dist/build-info.json')))
  console.log('安装目标：' + device.name)
  const result = spawnSync(join(root, 'node_modules/.bin/astrobox-cli'), ['install', join(root, 'dist', info.file), '--wait'], { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) {
    console.error('安装未确认完成；若提示超时，先检查 AstroBox 队列和手环，勿立即重复提交。')
    process.exit(result.status || 1)
  }
} catch (error) {
  console.error(error.cause?.code === 'ECONNREFUSED' ? '请先打开 AstroBox，并完成手环连接。' : error.message)
  process.exit(1)
}
