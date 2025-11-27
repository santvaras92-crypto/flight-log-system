import xlsx from 'xlsx';

const wb = xlsx.readFile('Bitacora CC-AQI.xlsx');
const ws = wb.Sheets['Libro'];
const range = xlsx.utils.decode_range(ws['!ref'] || '');

console.log('Headers (primera fila):');
for (let C = range.s.c; C <= range.e.c; ++C) {
  const cell = ws[xlsx.utils.encode_cell({r: 0, c: C})];
  const value = cell ? cell.v : '(vacío)';
  console.log(`Col ${C}: ${value}`);
}

console.log('\nDatos filas 2-6:');
for (let r = 1; r <= 5; r++) {
  const row: any = {};
  for (let C = 0; C <= 10; C++) {
    const cell = ws[xlsx.utils.encode_cell({r, c: C})];
    row[`C${C}`] = cell ? cell.v : '';
  }
  console.log(`Fila ${r}:`, row);
}
