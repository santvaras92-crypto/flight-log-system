const XLSX = require("xlsx");
const fs = require("fs");
const buf = fs.readFileSync("Cuenta banco/Movimientos.xlsx");
const wb = XLSX.read(buf, { type: "buffer" });
const ws = wb.Sheets[wb.SheetNames[0]];
console.log("Ref:", ws["!ref"]);

// Count actual cells
let cellCount = 0;
let maxRow = 0;
for (const key of Object.keys(ws)) {
  if (key.startsWith("!")) continue;
  cellCount++;
  const match = key.match(/\d+/);
  if (match) {
    const row = parseInt(match[0]);
    if (row > maxRow) maxRow = row;
  }
}
console.log("Total cells with data:", cellCount);
console.log("Max row with data:", maxRow);

// Show first 5 cells and last 5 cells
const cellKeys = Object.keys(ws).filter(k => !k.startsWith("!")).sort();
console.log("\nFirst 10 cells:");
cellKeys.slice(0, 10).forEach(k => console.log(k, "=", JSON.stringify(ws[k])));
console.log("\nLast 10 cells:");
cellKeys.slice(-10).forEach(k => console.log(k, "=", JSON.stringify(ws[k])));
