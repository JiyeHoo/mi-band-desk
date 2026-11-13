import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ux = readFileSync(join(root, 'src/pages/index/index.ux'), 'utf8')
if (/transform\s*:|animation-name\s*:/.test(ux)) throw new Error('禁止恢复原生旋转显示层；使用物理坐标和预旋转资源')
const manifest = JSON.parse(readFileSync(join(root, 'src/manifest.json')))
function newestSource(folder) {
  return Math.max(...readdirSync(folder).map((name) => {
    const path = join(folder, name)
    return statSync(path).isDirectory() ? newestSource(path) : statSync(path).mtimeMs
  }), 0)
}
const files = readdirSync(join(root, 'dist')).filter((name) => name.endsWith('.rpk'))
if (!files.length) throw new Error('构建没有生成 RPK')
const name = files.sort((a, b) => statSync(join(root, 'dist', b)).mtimeMs - statSync(join(root, 'dist', a)).mtimeMs)[0]
const path = join(root, 'dist', name)
if (statSync(path).mtimeMs < newestSource(join(root, 'src'))) throw new Error('RPK 早于源文件，请重新构建')
const result = spawnSync('python3', ['-c', `import zipfile,json,sys,struct,pathlib
with zipfile.ZipFile(sys.argv[1]) as z:
 bad=z.testzip()
 if bad: raise RuntimeError('CRC failure: '+bad)
 m=json.loads(z.read('manifest.json'))
 assert m['package']==sys.argv[2]
 assert m['versionName']==sys.argv[3]
 assert m['name']==sys.argv[4] and m['name'].strip()
 assert m['versionCode']==int(sys.argv[5])
 assert m['icon']=='/common/launcher-band9.png'
 icon=z.read(m['icon'].lstrip('/'))
 assert icon==pathlib.Path(sys.argv[6]).read_bytes()
 assert icon[:8]==bytes([137,80,78,71,13,10,26,10])
 assert struct.unpack('>II',icon[16:24])==(192,156), 'Band 9 launcher tile dimensions changed'
 assert m['config']['designWidth']==192
 assert 'pages/index/index.js' in z.namelist()
 assert 'common/licenses/Twemoji-LICENSE.txt' in z.namelist()
 assert b'Twemoji' in z.read('common/licenses/Twemoji-NOTICE.txt')
 assert not any(n.endswith('.pem') for n in z.namelist())
 scenes=json.loads(pathlib.Path(sys.argv[7]).read_text().split(' = ',1)[1].strip())
 assert len(scenes)==26
 for scene in scenes.values():
  for path in [scene['left'],scene['right']]+scene['effects']:
   data=z.read(path.lstrip('/'))
   assert struct.unpack('>II',data[16:24])==(96,96), path
 assert len([n for n in z.namelist() if n.startswith('common/robot/') and n.endswith('.png')])==27
 for key in ['cancel','confirm']:
  assert struct.unpack('>II',z.read('common/robot/'+key+'.png')[16:24])==(92,192)

 inventory=json.loads(pathlib.Path(sys.argv[8]).read_text())
 assert len(inventory)>100, 'Pre-rotated assets missing'
 for key,dimensions in inventory.items():
  packaged=z.read('common/physical/'+key)
  assert struct.unpack('>II',packaged[16:24])==tuple(dimensions), key
  assert packaged==pathlib.Path(sys.argv[9],key).read_bytes(), key
 assert len([n for n in z.namelist() if n.startswith('common/physical/') and n.endswith('.png')])==len(inventory)
 print('RPK manifest, launcher, pre-rotated resources, CRC and private-key exclusion: OK')`, path, manifest.package, manifest.versionName, manifest.name, String(manifest.versionCode), join(root, 'src/common/launcher-band9.png'), join(root, 'src/common/robot-scenes.js'), join(root, 'scripts/physical-inventory.json'), join(root, 'src/common/physical')], { encoding: 'utf8' })
if (result.status !== 0) throw new Error(result.stderr || result.error?.message || 'RPK 校验失败')
const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
writeFileSync(join(root, 'dist/build-info.json'), JSON.stringify({ file: name, package: manifest.package, version: manifest.versionName, bytes: statSync(path).size, sha256, builtAt: new Date().toISOString() }, null, 2) + '\n')
console.log(result.stdout.trim())
console.log(path)
console.log(`${statSync(path).size} bytes · SHA-256 ${sha256}`)
