import fs from 'node:fs';

const html = fs.readFileSync('docs/beacon-tab-layout-map.html', 'utf8');

const nodeRegex = /<div class="node" id="(node-[^"]+)"[^>]*>[\s\S]*?<div class="phone-screen">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<div class="phone-caption">([^<]*)<\/div>/g;
let nMatch;
const nodes = {};
while ((nMatch = nodeRegex.exec(html)) !== null) {
  nodes[nMatch[1]] = {
    caption: nMatch[3],
    html: nMatch[2].trim()
  };
}

fs.writeFileSync('tools/extracted-nodes.json', JSON.stringify(nodes, null, 2), 'utf8');
console.log('Saved', Object.keys(nodes).length, 'nodes to tools/extracted-nodes.json');
