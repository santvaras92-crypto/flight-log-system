const code = require('fs').readFileSync('app/admin/dashboard/ui/DashboardClient.tsx', 'utf8');
const lines = code.split('\n');

let renderCardStart = -1;
let braceCount = 0;
let renderCardEnd = -1;
let insideRenderCard = false;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const renderCard =')) {
    renderCardStart = i + 1;
    insideRenderCard = true;
  }
  if (insideRenderCard) {
    for (const ch of lines[i]) {
      if (ch === '{') braceCount++;
      if (ch === '}') braceCount--;
    }
    if (braceCount === 0 && insideRenderCard && i > renderCardStart) {
      renderCardEnd = i + 1;
      break;
    }
  }
}

console.log('renderCard function: lines', renderCardStart, '-', renderCardEnd);

for (let i = renderCardStart - 1; i < renderCardEnd; i++) {
  if (lines[i].includes('useRef')) {
    console.log('  ** useRef INSIDE renderCard at line', i + 1, ':', lines[i].trim());
  }
}

for (let i = 0; i < lines.length; i++) {
  if (i >= renderCardStart - 1 && i < renderCardEnd) continue;
  if (lines[i].includes('useRef') && !lines[i].startsWith('import')) {
    console.log('  useRef OUTSIDE renderCard at line', i + 1, ':', lines[i].trim());
  }
}
