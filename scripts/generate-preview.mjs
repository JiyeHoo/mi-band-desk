import {readFileSync,writeFileSync} from 'node:fs'
const modules=['layout','holidays','clock','animation','robot-scenes','physical-glyphs','physical-ui','codex-card']
writeFileSync('design/robot-desk/v5/shared.js',modules.map(name=>readFileSync('src/common/'+name+'.js','utf8')).join('\n').replace(/^import .*$/gm,'').replace(/^export /gm,''))
