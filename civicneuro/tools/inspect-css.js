import fs from 'node:fs';

const html = fs.readFileSync('docs/beacon-tab-layout-map.html', 'utf8');
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
if (styleMatch) {
  const css = styleMatch[1];
  // Find lines or rules with bc-, mode-, draw-, cf-, offpath-, anat-
  const lines = css.split('\n');
  const beaconCss = [];
  let inRule = false;
  let currentBlock = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('/* ---------- beacon') || line.includes('/* add to circle') || line.includes('/* beacon chat') || line.includes('/* active session') || line.includes('/* ---------- contacts') || line.includes('/* modal') || line.includes('/* pre-perm') || line.includes('mode-') || line.includes('draw-')) {
      beaconCss.push(`\n/* Line ${i + 1} */\n${line}`);
    }
  }

  // Also extract everything from line 490 to the end of <style>
  const from490 = lines.slice(489).join('\n');
  fs.writeFileSync('tools/extracted-style.css', from490, 'utf8');
  console.log('Saved tools/extracted-style.css, length:', from490.length);
}
