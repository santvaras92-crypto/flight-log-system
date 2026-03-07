const XLSX = require("xlsx");
const fs = require("fs");
const buf = fs.readFileSync("Cuenta banco/Movimientos.xlsx");
const wb = XLSX.read(buf, { type: "buffer" });
const ws = wb.Sheets[wb.SheetNames[0]];

// Check rows 1-5
for (let r = 1; r <= 5; r++) {
  const cells = [];
  for (const col of ["B","C","D","E","F","G","H","I"]) {
    const key = col + r;
    cells.push(key + "=" + (ws[key] ? JSON.stringify(ws[key].v) : "EMPTY"));
  }
  console.log("Row", r, ":", cells.join(" | "));
}

// Check if row 1 has any data
console.log("\nDirect check row 1:");
console.log("B1:", ws["B1"]);
console.log("C1:", ws["C1"]);

// Try reading without range
console.log("\nReading WITHOUT range restriction:");
const data2 = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
console.log("Rows from default read:", data2.length);
if (data2.length > 1) {
  console.log("Row 0:", JSON.stringify(data2[0]).substring(0,200));
  console.log("Row 1:", JSON.stringify(data2[1]).substring(0,200));
  console.log("Row 8:", JSON.stringify(data2[8]).substring(0,200));
  console.log("Row 9:", JSON.stringify(data2[9]).substring(0,200));
}
