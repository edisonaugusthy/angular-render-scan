const fs = require('fs');
const core = fs.readFileSync('node_modules/@angular/core/fesm2022/_debug_node-chunk.mjs', 'utf8');
const match = core.match(/const globalUtilsFunctions = \{([\s\S]*?)\};/);
if (match) console.log(match[1]);
