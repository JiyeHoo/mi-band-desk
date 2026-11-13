import { mkdtempSync, rmSync, mkdirSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (process.platform !== 'darwin') throw new Error('Icon regeneration requires macOS AppKit; the generated PNG is already included.')
const temp = mkdtempSync(join(tmpdir(), 'banddesk-icon-'))
try {
  const binary = join(temp, 'generate-launcher')
  const compile = spawnSync('xcrun', ['clang', '-fobjc-arc', '-framework', 'AppKit', join(root, 'scripts/generate-launcher.m'), '-o', binary], { stdio: 'inherit' })
  if (compile.status !== 0) throw new Error('Launcher renderer compilation failed')
  const render = spawnSync(binary, [], { cwd: root, stdio: 'inherit' })
  if (render.status !== 0) throw new Error('Launcher rendering failed')
  mkdirSync(join(root,'design/robot-desk/v3/assets'),{recursive:true})
  copyFileSync(join(root,'src/common/launcher-band9.png'),join(root,'design/robot-desk/v3/assets/launcher.png'))
} finally { rmSync(temp, { recursive: true, force: true }) }
