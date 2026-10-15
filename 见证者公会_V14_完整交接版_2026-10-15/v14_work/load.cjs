const fs = require('fs');
const path = require('path');
const {load:loadBaseline} = require('../analysis_src/load.cjs');
const modes = {
  baseline: [],
  mechanics: ['battle-v14-mechanics.js'],
  projection: ['battle-v14-mechanics.js','battle-v14-projection.js'],
  fixed: ['battle-v14-mechanics.js','battle-v14-projection.js','battle-v14-ai.js'],
};
function load(mode='fixed') {
  if (!modes[mode]) throw new Error('Unknown V14 mode: '+mode);
  const box=loadBaseline(true);
  for (const file of modes[mode]) {
    const source=fs.readFileSync(path.join(__dirname,'src',file),'utf8');
    new Function('window','globalThis','module','exports','require','localStorage','crypto',source)(box,box,undefined,undefined,undefined,box.localStorage,box.crypto);
  }
  if (mode!=='baseline') {
    for (const file of ['campaign-v14-compat.js','battle-v14-ui.js']) {
      const full=path.join(__dirname,'src',file);
      if (fs.existsSync(full)) new Function('window','globalThis','module','exports','require','localStorage','crypto',fs.readFileSync(full,'utf8'))(box,box,undefined,undefined,undefined,box.localStorage,box.crypto);
    }
  }
  return box;
}
module.exports={load,modes};
