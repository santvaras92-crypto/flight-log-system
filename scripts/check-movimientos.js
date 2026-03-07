const XLSX = require("xlsx");
const fs = require("fs");
const buf = fs.readFileSync("Cuenta banco/Movimientos.xlsx");
const wb = XLSX.read(buf, { type: "buffer" });
const ws = wb.Sheets[wb.SheetNames[0]];
console.log("Ref:", ws["!ref"]);
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, range: "B1" });
console.log("Total rows (inc header):", data.length);
// Last 15 rows
for (let i = Math.max(1, data.length - 15); i < data.length; i++) {
  const r = data[i];
  if (r && r[0]) {
    let fecha = r[1];
    if (fecha && typeof fecha === "object" && fecha.toISOString) fecha = fecha.toISOString().slice(0,10);
    else if (typeof fecha === "number") {
      const d = new Date((fecha - 25569) * 86400 * 1000);
      fecha = d.toISOString().slice(0,10);
    }
    console.log(r[0], "|", fecha, "|", String(r[2]).substring(0,45), "|E:", r[3]||0, "|I:", r[4]||0, "|S:", r[5], "|", r[6], "|", r[7]||"");
  }
}
