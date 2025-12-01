import { prisma } from "@/lib/prisma";
import DashboardClient from "./ui/DashboardClient";
import fs from "fs";
import path from "path";

export const revalidate = 0;

export default async function AdminDashboardPage({ searchParams }: { searchParams?: { page?: string; pageSize?: string } }) {
  const page = Number(searchParams?.page || 1);
  const pageSize = Number(searchParams?.pageSize || 200);
  const skip = (page - 1) * pageSize;
  const [users, aircraft, flights, allFlightsComplete, allFlightsLight, submissions, components, transactions, totalFlights] = await Promise.all([
    prisma.user.findMany(),
    prisma.aircraft.findMany(),
    prisma.flight.findMany({
      orderBy: { fecha: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        fecha: true,
        hobbs_inicio: true,
        hobbs_fin: true,
        tach_inicio: true,
        tach_fin: true,
        diff_hobbs: true,
        diff_tach: true,
        costo: true,
        tarifa: true,
        instructor_rate: true,
        copiloto: true,
        cliente: true,
        instructor: true,
        detalle: true,
        aircraftId: true,
        piloto_raw: true,
        pilotoId: true,
        airframe_hours: true,
        engine_hours: true,
        propeller_hours: true,
      }
    }),
    // All flights with complete data for client filtering in FlightsTable
    prisma.flight.findMany({ 
      orderBy: { fecha: "desc" }, 
      select: { 
        id: true, 
        fecha: true, 
        hobbs_inicio: true,
        hobbs_fin: true,
        tach_inicio: true,
        tach_fin: true,
        diff_hobbs: true,
        diff_tach: true,
        costo: true,
        tarifa: true,
        instructor_rate: true,
        copiloto: true,
        cliente: true, 
        instructor: true,
        detalle: true,
        aircraftId: true,
        piloto_raw: true,
        pilotoId: true,
        airframe_hours: true,
        engine_hours: true,
        propeller_hours: true,
      } 
    }),
    prisma.flight.findMany({ orderBy: { fecha: "desc" }, select: { id: true, fecha: true, cliente: true, diff_hobbs: true, costo: true } }), // Lightweight for Active Pilots calculation
    prisma.flightSubmission.findMany({
      include: {
        ImageLog: true,
        Flight: {
          select: { id: true, fecha: true, diff_hobbs: true, diff_tach: true, costo: true, cliente: true }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 200
    }),
    prisma.component.findMany(),
    prisma.transaction.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.flight.count(),
  ]);

  // Read allowed pilot codes from official CSV (Base de dato pilotos)
  let allowedPilotCodes: string[] = [];
  let csvPilots: { code: string; name: string }[] = [];
  let csvPilotNames: Record<string, string> = {}; // Map code -> name
  try {
    const csvPath = path.join(process.cwd(), "Base de dato pilotos", "Base de dato pilotos.csv");
    if (fs.existsSync(csvPath)) {
      const content = fs.readFileSync(csvPath, "utf-8");
      const lines = content.split("\n").filter(l => l.trim());
      const entries = lines.slice(1).map(l => {
        const [code, name] = l.split(";");
        return { code: (code || '').trim().toUpperCase(), name: (name || '').trim() };
      }).filter(e => e.code);
      allowedPilotCodes = Array.from(new Set(entries.map(e => e.code)));
      csvPilots = entries;
      csvPilotNames = Object.fromEntries(entries.map(e => [e.code, e.name]));
    }
  } catch (e) {
    // Ignore CSV errors; fallback will show current behavior
    allowedPilotCodes = [];
  }

  const csvPilotStats: Record<string, { flights: number; hours: number; spent: number }> = {};
  try {
    const flightsCsvPath = path.join(process.cwd(), "Base de dato AQI.csv");
    if (fs.existsSync(flightsCsvPath)) {
      const raw = fs.readFileSync(flightsCsvPath, "utf-8");
      const lines = raw.split("\n").filter(l => l.trim());

      const parseCSVLine = (line: string) => {
        const result: string[] = [];
        let current = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ';' && !inQuotes) {
            result.push(current);
            current = "";
          } else {
            current += char;
          }
        }
        result.push(current);
        return result;
      };

      const parseDecimal = (value?: string) => {
        if (!value) return 0;
        const cleaned = value.replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".");
        if (!cleaned) return 0;
        const num = Number(cleaned);
        return Number.isFinite(num) ? num : 0;
      };

      const parseCurrency = (value?: string) => {
        if (!value) return 0;
        const cleaned = value.replace(/[^0-9,-]+/g, "").replace(/\./g, "").replace(",", ".");
        if (!cleaned) return 0;
        const num = Number(cleaned);
        return Number.isFinite(num) ? num : 0;
      };

      const dataLines = lines.slice(1); // skip header
      dataLines.forEach(line => {
        const cols = parseCSVLine(line);
        const code = (cols[10] || "").trim().toUpperCase();
        if (!code) return;
        const hours = parseDecimal(cols[7]);
        const total = parseCurrency(cols[13]);
        if (!csvPilotStats[code]) {
          csvPilotStats[code] = { flights: 0, hours: 0, spent: 0 };
        }
        csvPilotStats[code].flights += 1;
        csvPilotStats[code].hours += hours;
        csvPilotStats[code].spent += total;
      });
    }
  } catch {}

  const registeredPilotCodes = users
    .filter(u => u.rol === 'PILOTO' && u.email && !u.email.endsWith('@piloto.local'))
    .map(u => (u.codigo || '').toUpperCase())
    .filter(c => c && !allowedPilotCodes.includes(c));

  // Build maintenance items: use DB baseline + add Δ Tach from flights after baseline date
  // Baseline components are stored in DB with initial values (AIRFRAME 2722.8, ENGINE 569.6, PROPELLER 1899.0)
  // Future flights will increment these values
  const baselineDate = new Date('2025-11-28T00:00:00Z'); // Date when baseline was set
  
  const maintenanceComponents = await Promise.all(
    aircraft.map(async (a) => {
      // Get baseline from DB (if exists)
      const dbComponents = await prisma.component.findMany({ 
        where: { aircraftId: a.matricula },
        orderBy: { tipo: 'asc' }
      });
      
      // Calculate additional hours from flights after baseline
      const additionalTach = await prisma.flight.aggregate({
        where: { 
          aircraftId: a.matricula,
          fecha: { gte: baselineDate }
        },
        _sum: { diff_tach: true }
      });
      const increment = Number(additionalTach._sum.diff_tach || 0);

      // If DB has components, use them + increment; otherwise compute from all flights (legacy)
      if (dbComponents.length > 0) {
        return dbComponents.map(c => ({
          id: String(c.id),
          aircraftId: c.aircraftId,
          tipo: c.tipo,
          horas_acumuladas: Number(c.horas_acumuladas) + increment,
          limite_tbo: Number(c.limite_tbo)
        }));
      } else {
        // Fallback: compute from all flights (for aircraft without baseline)
        const allTach = await prisma.flight.aggregate({
          where: { aircraftId: a.matricula },
          _sum: { diff_tach: true }
        });
        const total = Number(allTach._sum.diff_tach || 0);
        return [
          { id: `${a.matricula}-AF`, aircraftId: a.matricula, tipo: 'AIRFRAME', horas_acumuladas: total, limite_tbo: 30000 },
          { id: `${a.matricula}-EN`, aircraftId: a.matricula, tipo: 'ENGINE', horas_acumuladas: total, limite_tbo: 2000 },
          { id: `${a.matricula}-PR`, aircraftId: a.matricula, tipo: 'PROPELLER', horas_acumuladas: total, limite_tbo: 2000 },
        ];
      }
    })
  );
  const computedComponents = maintenanceComponents.flat();

  const data = {
    users: users.map(u => ({ ...u, saldo_cuenta: Number(u.saldo_cuenta), tarifa_hora: Number(u.tarifa_hora) })),
    aircraft: aircraft.map(a => ({ ...a, hobbs_actual: Number(a.hobbs_actual), tach_actual: Number(a.tach_actual) })),
    flights: flights.map(f => ({ ...f, hobbs_inicio: Number(f.hobbs_inicio), hobbs_fin: Number(f.hobbs_fin), tach_inicio: Number(f.tach_inicio), tach_fin: Number(f.tach_fin), diff_hobbs: Number(f.diff_hobbs), diff_tach: Number(f.diff_tach), costo: Number(f.costo), tarifa: f.tarifa ? Number(f.tarifa) : null, piloto_raw: f.piloto_raw || null })),
    allFlights: allFlightsLight.map((f: any) => ({ id: f.id, fecha: f.fecha, cliente: f.cliente || null, diff_hobbs: Number(f.diff_hobbs), costo: Number(f.costo) })), // Lightweight for Active Pilots
    allFlightsComplete: allFlightsComplete.map((f: any) => ({ ...f, hobbs_inicio: Number(f.hobbs_inicio), hobbs_fin: Number(f.hobbs_fin), tach_inicio: Number(f.tach_inicio), tach_fin: Number(f.tach_fin), diff_hobbs: Number(f.diff_hobbs), diff_tach: Number(f.diff_tach), costo: Number(f.costo), tarifa: f.tarifa ? Number(f.tarifa) : null, piloto_raw: f.piloto_raw || null })), // Complete data for FlightsTable client filter
    submissions: submissions.map(s => ({ ...s, imageLogs: s.ImageLog.map(img => ({ ...img, valorExtraido: img.valorExtraido ? Number(img.valorExtraido) : null, confianza: img.confianza ? Number(img.confianza) : null })), flight: s.Flight ? { ...s.Flight, diff_hobbs: Number(s.Flight.diff_hobbs), diff_tach: Number(s.Flight.diff_tach), costo: Number(s.Flight.costo) } : null })),
    components: computedComponents.map(c => ({ ...c, horas_acumuladas: Number(c.horas_acumuladas), limite_tbo: Number(c.limite_tbo) })),
    transactions: transactions.map(t => ({ ...t, monto: Number(t.monto) })),
    fuelByCode: (() => {
      const map: Record<string, number> = {};
      try {
        const fuelPath = path.join(process.cwd(), 'Combustible', 'Planilla control combustible.csv');
        if (fs.existsSync(fuelPath)) {
          const content = fs.readFileSync(fuelPath, 'utf-8');
          const lines = content.split('\n').filter(l => l.trim());
          const header = lines[0].split(';');
          const COL_CUENTA = 1; // Code
          const COL_MONTO = 3; // Monto (column 3)
          for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(';');
            const code = (parts[COL_CUENTA] || '').trim().toUpperCase();
            const montoStr = (parts[COL_MONTO] || '').trim();
            if (!code) continue;
            const cleaned = montoStr.replace(/\$/g, '').replace(/\./g, '').replace(',', '.');
            const val = parseFloat(cleaned);
            if (!isNaN(val)) map[code] = (map[code] || 0) + val;
          }
        }
      } catch {}
      return map;
    })(),
    // Detailed fuel records by code for PDF
    fuelDetailsByCode: (() => {
      const map: Record<string, { fecha: string; litros: number; monto: number }[]> = {};
      try {
        const fuelPath = path.join(process.cwd(), 'Combustible', 'Planilla control combustible.csv');
        if (fs.existsSync(fuelPath)) {
          const content = fs.readFileSync(fuelPath, 'utf-8');
          const lines = content.split('\n').filter(l => l.trim());
          for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(';');
            const code = (parts[1] || '').trim().toUpperCase();
            const fecha = (parts[0] || '').trim();
            const litrosStr = (parts[2] || '').trim().replace(',', '.');
            const montoStr = (parts[3] || '').trim();
            if (!code) continue;
            const litros = parseFloat(litrosStr) || 0;
            const cleaned = montoStr.replace(/\$/g, '').replace(/\./g, '').replace(',', '.');
            const monto = parseFloat(cleaned) || 0;
            if (!map[code]) map[code] = [];
            // Include entry even if litros is 0 (some entries only have monto)
            if (monto > 0) {
              map[code].push({ fecha, litros, monto });
            }
          }
        }
      } catch {}
      return map;
    })(),
    csvPilotStats,
    depositsByCode: (() => {
      const map: Record<string, number> = {};
      try {
        const depositsPath = path.join(process.cwd(), 'Pago pilotos', 'Pago pilotos.csv');
        if (fs.existsSync(depositsPath)) {
          const content = fs.readFileSync(depositsPath, 'utf-8');
          const lines = content.split('\n').filter(l => l.trim());
          // Header: Fecha;Descripción;ingreso;Cliente
          const COL_INGRESO = 2;
          const COL_CLIENTE = 3;
          for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(';');
            const code = (parts[COL_CLIENTE] || '').trim().toUpperCase();
            const montoStr = (parts[COL_INGRESO] || '').trim();
            if (!code) continue;
            const cleaned = montoStr.replace(/\$/g, '').replace(/\./g, '').replace(',', '.');
            const val = parseFloat(cleaned);
            if (!isNaN(val)) map[code] = (map[code] || 0) + val;
          }
        }
      } catch {}
      return map;
    })(),
    // Detailed deposit records by code for PDF
    depositsDetailsByCode: (() => {
      const map: Record<string, { fecha: string; descripcion: string; monto: number }[]> = {};
      try {
        const depositsPath = path.join(process.cwd(), 'Pago pilotos', 'Pago pilotos.csv');
        if (fs.existsSync(depositsPath)) {
          const content = fs.readFileSync(depositsPath, 'utf-8');
          const lines = content.split('\n').filter(l => l.trim());
          for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(';');
            const fecha = (parts[0] || '').trim();
            const descripcion = (parts[1] || '').trim();
            const montoStr = (parts[2] || '').trim();
            const code = (parts[3] || '').trim().toUpperCase();
            if (!code) continue;
            const cleaned = montoStr.replace(/\$/g, '').replace(/\./g, '').replace(',', '.');
            const monto = parseFloat(cleaned) || 0;
            if (!map[code]) map[code] = [];
            map[code].push({ fecha, descripcion, monto });
          }
        }
      } catch {}
      return map;
    })(),
    pilotDirectory: {
      initial: csvPilots,
      registered: users
        .filter(u => {
          if (u.rol !== 'PILOTO') return false;
          const code = (u.codigo || '').toUpperCase();
          // Only include pilots NOT in CSV AND have real email (not @piloto.local)
          return code && !allowedPilotCodes.includes(code) && u.email && !u.email.endsWith('@piloto.local');
        })
        .map(u => ({ 
          id: u.id, 
          code: (u.codigo || '').toUpperCase(), 
          name: u.nombre, 
          email: u.email, 
          createdAt: u.createdAt,
          fechaNacimiento: u.fechaNacimiento || null,
          telefono: u.telefono || null,
          numeroLicencia: (u as any).licencia || null,
          tipoDocumento: (u as any).tipoDocumento || null,
          documento: (u as any).documento || null
        }))
    }
  };

  return (
    <div className="min-h-screen w-full">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <DashboardClient initialData={data} pagination={{ page, pageSize, total: totalFlights }} allowedPilotCodes={allowedPilotCodes} registeredPilotCodes={registeredPilotCodes} csvPilotNames={csvPilotNames} />
      </div>
    </div>
  );
}
