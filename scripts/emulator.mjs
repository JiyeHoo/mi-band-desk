import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createInterface } from 'node:readline'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const { VvdManager, defaultSDKHome, defaultVvdHome } = require('@aiot-toolkit/emulator')
const manager = new VvdManager({ sdkHome: defaultSDKHome, vvdHome: defaultVvdHome })
const name = 'Vela_BandDesk_192x490'
const artifactDir = join(root, '.artifacts')
mkdirSync(artifactDir, { recursive: true })
const log = (line) => appendFileSync(join(artifactDir, 'emulator.log'), String(line) + '\n')
if (process.argv.includes('--stop')) {
  await manager.stopVvd(name)
  process.exit(0)
}
const check = spawnSync(process.execPath, [join(root, 'scripts/verify-package.mjs')], { stdio: 'inherit' })
if (check.status !== 0) process.exit(check.status || 1)
if (!manager.hasLocaleImage('vela-pre-4.0')) {
  console.log('正在下载小米官方模拟器 SDK（首次运行需要数 GB 空间）…')
  const download = await manager.downloadSDK({ imageTypeArr: ['vela-pre-4.0'], cliProgress: false, parallelDownloads: 4 })
  await download.downlodPromise
}
if (!manager.getVvdList().some((item) => item.name === name)) {
  manager.createVvd({ name, arch: 'arm', width: '192', height: '490', shape: 'pill-shaped', flavor: 'band', density: '320', customLcdRadius: '96', imageType: 'vela-pre-4.0', imageDir: dirname(manager.getLocalSystemPath('vela-pre-4.0')) })
}
console.log('启动专用 192×490 Vela 模拟器；日志保存在 .artifacts/emulator.log')
await manager.stopVvd(name)
const session = await manager.startVvd({ vvdName: name, origin: 'ide', stdoutCallback: log, stderrCallback: log, customLogger: log })
const instance = session.emulatorInstance
// Every toolkit operation is explicitly addressed to this named emulator.
if (!/^emulator-\d+$/.test(instance.sn)) throw new Error('模拟器目标校验失败')
if (!(await instance.isConnected())) throw new Error('模拟器未就绪')
// PRE reports an ADB device before its shell accepts commands. Starting vapp in
// that gap exits with status 255 and produces a misleading all-black capture.
let shellReady = false
for (let attempt = 0; attempt < 30 && !shellReady; attempt++) {
  const probe = spawnSync('adb', ['-s', instance.sn, 'shell', 'echo', 'ready'], { encoding: 'utf8' })
  shellReady = probe.status === 0 && probe.stdout.includes('ready')
  if (!shellReady) await new Promise(resolve => setTimeout(resolve, 500))
}
if (!shellReady) throw new Error('模拟器系统 shell 未就绪')
const info = JSON.parse(readFileSync(join(root, 'dist/build-info.json')))
const target = await instance.pushRpk(join(root, 'dist', info.file), info.package)
// PRE installs by unzipping. The toolkit's 10 s ADB limit is too short for
// whole-row font assets; keep the same named-emulator operation with more time.
const adb = promisify(execFile)
const appPath = `${instance.appDir}/${info.package}`
await adb('adb', ['-s', instance.sn, 'shell', 'mkdir', appPath], { timeout: 10000 })
await adb('adb', ['-s', instance.sn, 'shell', 'unzip', '-o', target, '-d', appPath], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 })
await instance.startApp(info.package)
const agent = session.getAgent()
await agent.waitForReady()
async function capture(label = 'clock') {
  const file = join(artifactDir, label.replace(/[^a-z0-9_-]/gi, '') + '.png')
  writeFileSync(file, await agent.getScreenshot())
  console.log('截图：' + file)
}
await new Promise((resolve) => setTimeout(resolve, 3000))
await capture()
console.log('模拟器已运行。回车截图；Ctrl+C 关闭本项目模拟器。')
// Optional JSON commands let local QA exercise actual emulator touch events.
const input = createInterface({ input: process.stdin })
async function runCommand(command) {
    if (command.sequence) {
      for (const item of command.sequence) await runCommand({...item, noCapture:true})
      await new Promise(resolve=>setTimeout(resolve,command.settleMs === undefined ? 700 : command.settleMs))
      await capture(command.name || 'sequence')
      return
    }
    if (command.touch) {
      const [x,y,buttons]=command.touch;agent.sendMouse({x,y,buttons})
      await new Promise(resolve=>setTimeout(resolve,command.settleMs===undefined?80:command.settleMs))
    }
    if (command.tap) {
      const [x, y] = command.tap
      agent.sendMouse({ x, y, buttons: 1 })
      await new Promise((resolve) => setTimeout(resolve, 100))
      agent.sendMouse({ x, y, buttons: 0 })
      await new Promise((resolve) => setTimeout(resolve, command.settleMs === undefined ? 500 : command.settleMs))
    }
    if (command.swipe) {
      const [from, to] = command.swipe
      const steps = 16
      for (let step = 0; step <= steps; step++) {
        const x = Math.round(from[0] + (to[0] - from[0]) * step / steps)
        const y = Math.round(from[1] + (to[1] - from[1]) * step / steps)
        agent.sendMouse({ x, y, buttons: 1 })
        await new Promise((resolve) => setTimeout(resolve, command.stepMs === undefined ? 25 : Math.max(2,command.stepMs)))
      }
      agent.sendMouse({ x: to[0], y: to[1], buttons: 0 })
      await new Promise((resolve) => setTimeout(resolve, command.settleMs === undefined ? (command.captureTransition ? 0 : 600) : command.settleMs))
    }
    if (command.noCapture) return
    if (command.captureFrames) {
      const count = Math.min(20, Math.max(1, Number(command.captureFrames)))
      for (let frame = 0; frame < count; frame++) {
        await capture((command.name || 'frames') + '-' + frame)
        await new Promise((resolve) => setTimeout(resolve, command.captureIntervalMs ? Math.min(1000,Math.max(40,command.captureIntervalMs)) : command.captureTransition ? 40 : 100))
      }
    } else await capture(command.name || 'clock')
}
let commands = Promise.resolve()
input.on('line', (line) => {
  commands = commands.then(() => runCommand(line.trim() ? JSON.parse(line) : {})).catch(error=>console.error(error.message))
})
process.on('SIGINT', async () => {
  agent.close()
  input.close()
  await manager.stopVvd(name)
  process.exit(0)
})
