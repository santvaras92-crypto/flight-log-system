import { prisma } from "@/lib/prisma";
import DashboardClient from "./ui/DashboardClient";
import fs from "fs";
import path from "path";

export const revalidate = 0;

export default async function AdminDashboardPage({ searchParams }: { searchParams?: { page?: string; pageSize?: string } }) {
  const page = Number(searchParams?.page || 1);
  const pageSize = Number(searchParams?.pageSize || 200);
  const skip = (page - 1) * pageSize;
  const [users, aircraft, flights, allFlightsComplete, allFlightsLight, submissions, components, transactions, totalFlights, depositsFromDB, fuelLogs, overviewMetrics] = await Promise.all([
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
    prisma.deposit.findMany({ 
      include: { User: { select: { codigo: true } } },
      orderBy: { fecha: "desc" }
    }),
    prisma.fuelLog.findMany({
      orderBy: { fecha: 'desc' },
      select: {
        id: true,
        fecha: true,
        litros: true,
        monto: true,
        detalle: true,
        imageUrl: true,
        userId: true,
        User: { select: { nombre: true, codigo: true } },
      },
    }),
    // Overview metrics - All dynamic from DB
    (async () => {
      const sep9_2020 = new Date('2020-09-09');
      const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
      const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

      const [
        totalFlights,
        totalRevenue,
        fuelSinceSep2020,
        activePilots,
        depositsFromDB,
        paymentsFromCSV,
        fuelChargesNonStratus,
        thisMonth,
        // Fetch flights needed to compute hours with fallback
        flightsForHoursAllTime,
        flightsForHoursSinceSep
      ] = await Promise.all([
        // Total flights count
        prisma.flight.count(),
        // Total revenue (all time)
        prisma.flight.aggregate({ _sum: { costo: true } }),
        // Fuel consumed since Sep 9, 2020 (CSV historical + new DB entries)
        (async () => {
          // Get CSV fuel (historical baseline)
          let csvFuel = 0;
          let csvLatestDate: Date | null = null;
          try {
            const fuelPath = path.join(process.cwd(), 'Combustible', 'Planilla control combustible.csv');
            if (fs.existsSync(fuelPath)) {
              const content = fs.readFileSync(fuelPath, 'utf-8');
              const lines = content.split('\n').filter(l => l.trim());
              
              for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(';');
                const dateStr = (parts[0] || '').trim();
                if (!dateStr) continue;
                
                const dateParts = dateStr.split('-');
                if (dateParts.length !== 3) continue;
                
                const day = parseInt(dateParts[0]);
                const month = parseInt(dateParts[1]);
                let year = parseInt(dateParts[2]);
                if (year < 100) year = year < 50 ? 2000 + year : 1900 + year;
                
                const fuelDate = new Date(year, month - 1, day);
                
                if (fuelDate >= sep9_2020) {
                  const litrosStr = (parts[2] || '').trim().replace(',', '.');
                  const litros = parseFloat(litrosStr);
                  if (!isNaN(litros) && litros > 0) {
                    csvFuel += litros;
                    if (!csvLatestDate || fuelDate > csvLatestDate) {
                      csvLatestDate = fuelDate;
                    }
                  }
                }
              }
            }
          } catch {}
          
          // Get new DB fuel entries after CSV cutoff date
          let newDbFuel = 0;
          try {
            const cutoffDate = csvLatestDate || new Date('2024-01-01'); // Safe fallback
            const fuelData = await prisma.fuelLog.aggregate({
              where: { 
                fecha: { gt: cutoffDate } // Only entries AFTER CSV
              },
              _sum: { litros: true }
            });
            newDbFuel = Number(fuelData._sum.litros || 0);
          } catch {}
          
          // Return CSV baseline + new DB entries
          return csvFuel + newDbFuel;
        })(),
        // Active pilots (last 6 months, unique pilotoId)
        prisma.flight.findMany({
          where: { fecha: { gte: sixMonthsAgo } },
          select: { pilotoId: true },
          distinct: ['pilotoId']
        }),
        // Total deposits from DB
        prisma.deposit.aggregate({ _sum: { monto: true } }),
        // Total payments from CSV (Pago pilotos.csv)
        (async () => {
          let csvPayments = 0;
          try {
            const paymentsPath = path.join(process.cwd(), 'Pago pilotos', 'Pago pilotos.csv');
            if (fs.existsSync(paymentsPath)) {
              const raw = fs.readFileSync(paymentsPath, 'utf-8');
              const lines = raw.split('\n').filter(l => l.trim());
              
              const parseCurrency = (value?: string) => {
                if (!value) return 0;
                const cleaned = value.replace(/[^0-9,-]/g, '').replace(/\./g, '').replace(',', '.');
                if (!cleaned) return 0;
                const num = Number(cleaned);
                return Number.isFinite(num) ? num : 0;
              };
              
              // Skip header, sum column 3 (ingreso)
              lines.slice(1).forEach(line => {
                const cols = line.split(';');
                const amount = parseCurrency(cols[2]);
                csvPayments += amount;
              });
            }
          } catch {}
          return csvPayments;
        })(),
        // Fuel charges from DB transactions (tipo FUEL, excluding Stratus user ID 96)
        prisma.transaction.aggregate({
          where: { 
            tipo: 'FUEL',
            userId: { not: 96 }
          },
          _sum: { monto: true }
        }),
        // This month flights
        prisma.flight.findMany({
          where: { fecha: { gte: firstDayOfMonth } },
          select: { diff_hobbs: true }
        }),
        // All flights minimal data to compute total hours robustly
        prisma.flight.findMany({ select: { hobbs_inicio: true, hobbs_fin: true, diff_hobbs: true } }),
        // Flights since Sep 9, 2020 to compute hours robustly
        prisma.flight.findMany({ where: { fecha: { gte: sep9_2020 } }, select: { hobbs_inicio: true, hobbs_fin: true, diff_hobbs: true } })
      ]);

      // Compute hours with fallback: use diff_hobbs if present, else hobbs_fin - hobbs_inicio
      const toNumber = (v: any) => {
        if (v === null || v === undefined) return null;
        if (typeof v === 'number') return v;
        // Prisma Decimal
        if (typeof v === 'object' && v !== null && 'toNumber' in v && typeof (v as any).toNumber === 'function') {
          try { return (v as any).toNumber(); } catch { return Number(v as any) || null; }
        }
        const n = Number(v);
        return isNaN(n) ? null : n;
      };

      const computeHours = (rows: { hobbs_inicio: any; hobbs_fin: any; diff_hobbs: any }[]) => {
        let sum = 0;
        for (const r of rows) {
          const dh = toNumber(r.diff_hobbs);
          const hi = toNumber(r.hobbs_inicio);
          const hf = toNumber(r.hobbs_fin);
          const d = dh !== null ? dh : (hi !== null && hf !== null ? (hf - hi) : 0);
          if (!isNaN(d) && d > 0) sum += d;
        }
        return Number(sum.toFixed(1));
      };

      const totalHoursAllTime = computeHours(flightsForHoursAllTime);
      const totalHoursSinceSep2020 = computeHours(flightsForHoursSinceSep);
      const totalFuelSinceSep2020 = Number(fuelSinceSep2020);
      
      // Apply 10% idle adjustment: divide by 90% of hours
      const effectiveHours = totalHoursSinceSep2020 > 0 ? totalHoursSinceSep2020 * 0.9 : 0;
      const litersPerHour = effectiveHours > 0 ? Number((totalFuelSinceSep2020 / effectiveHours).toFixed(2)) : 0;
      const gallonsPerHour = litersPerHour > 0 ? Number((litersPerHour / 3.78541).toFixed(2)) : 0;
      
      // Compute Next Inspections (Oil Change and 100-hour)
      const OIL_INTERVAL = 50;
      const INSPECT_100_INTERVAL = 100;
      
      const getCurrentTach = async (): Promise<number | null> => {
        const latest = await prisma.flight.findFirst({
          orderBy: { fecha: 'desc' },
          select: { tach_fin: true, tach_inicio: true, diff_tach: true }
        });
        if (!latest) return null;
        const fin = toNumber(latest.tach_fin);
        const ini = toNumber(latest.tach_inicio);
        const diff = toNumber(latest.diff_tach);
        if (fin != null) return fin;
        if (ini != null && diff != null) return ini + diff;
        return ini;
      };
      
      const getLastTachForDetalle = async (keyword: string): Promise<number | null> => {
        const flight = await prisma.flight.findFirst({
          where: { detalle: { contains: keyword, mode: 'insensitive' } },
          orderBy: { fecha: 'desc' },
          select: { tach_inicio: true, tach_fin: true, diff_tach: true }
        });
        if (!flight) return null;
        const ini = toNumber(flight.tach_inicio);
        const fin = toNumber(flight.tach_fin);
        const diff = toNumber(flight.diff_tach);
        return ini != null ? ini : (fin != null && diff != null ? fin - diff : null);
      };
      
      const currentTach = await getCurrentTach();
      const oilTachBase = await getLastTachForDetalle('CAMBIO DE ACEITE');
      const inspectTachBase = await getLastTachForDetalle('REVISION 100 HRS');
      
      const oilUsed = oilTachBase != null && currentTach != null ? (currentTach - oilTachBase) : (currentTach != null ? (currentTach % OIL_INTERVAL) : 0);
      const inspectUsed = inspectTachBase != null && currentTach != null ? (currentTach - inspectTachBase) : (currentTach != null ? (currentTach % INSPECT_100_INTERVAL) : 0);
      
      const oilChangeRemaining = Math.max(0, OIL_INTERVAL - (oilUsed < 0 ? 0 : oilUsed));
      const hundredHourRemaining = Math.max(0, INSPECT_100_INTERVAL - (inspectUsed < 0 ? 0 : inspectUsed));
      
      // Calculate total payments (CSV + DB deposits)
      const totalPayments = paymentsFromCSV + Number(depositsFromDB._sum.monto || 0);
      
      // Fuel charges (non-Stratus users)
      const fuelCharges = Number(fuelChargesNonStratus._sum.monto || 0);
      
      // Fixed adjustment for pending balance
      const FIXED_ADJUSTMENT = 22471361;
      
      return {
        totalHours: totalHoursAllTime,
        totalFlights: totalFlights,
        totalRevenue: Number(totalRevenue._sum.costo || 0),
        fuelConsumed: totalFuelSinceSep2020,
        hoursSinceSep2020: totalHoursSinceSep2020,
        fuelRateLph: litersPerHour,
        fuelRateGph: gallonsPerHour,
        activePilots: activePilots.length,
        pendingBalance: Number(totalRevenue._sum.costo || 0) - totalPayments - fuelCharges - FIXED_ADJUSTMENT,
        thisMonthFlights: thisMonth.length,
        thisMonthHours: thisMonth.reduce((sum, f) => sum + (Number(f.diff_hobbs) || 0), 0),
        nextInspections: {
          oilChangeRemaining: Number(oilChangeRemaining.toFixed(1)),
          hundredHourRemaining: Number(hundredHourRemaining.toFixed(1)),
        },
      };
    })(),
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

  // Build maintenance items: get values directly from last flight in Flight Log Entries
  const maintenanceComponents = await Promise.all(
    aircraft.map(async (a) => {
      // Get the last flight for this aircraft
      const lastFlight = await prisma.flight.findFirst({
        where: { aircraftId: a.matricula },
        orderBy: { fecha: 'desc' },
        select: {
          airframe_hours: true,
          engine_hours: true,
          propeller_hours: true
        }
      });

      // Use values from Flight Log Entries, or default to 0 if no flights exist
      const airframeHours = lastFlight?.airframe_hours ? Number(lastFlight.airframe_hours) : 0;
      const engineHours = lastFlight?.engine_hours ? Number(lastFlight.engine_hours) : 0;
      const propellerHours = lastFlight?.propeller_hours ? Number(lastFlight.propeller_hours) : 0;

      return [
        { id: `${a.matricula}-AF`, aircraftId: a.matricula, tipo: 'AIRFRAME', horas_acumuladas: airframeHours, limite_tbo: 30000 },
        { id: `${a.matricula}-EN`, aircraftId: a.matricula, tipo: 'ENGINE', horas_acumuladas: engineHours, limite_tbo: 2000 },
        { id: `${a.matricula}-PR`, aircraftId: a.matricula, tipo: 'PROPELLER', horas_acumuladas: propellerHours, limite_tbo: 2000 },
      ];
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
      // 1. Read CSV historical fuel
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
      // 2. Add DB Transaction tipo FUEL, mapped by user codigo
      transactions.forEach(t => {
        if (t.tipo === 'FUEL' && t.userId) {
          const user = users.find(u => u.id === t.userId);
          const code = user?.codigo?.toUpperCase();
          if (code) {
            map[code] = (map[code] || 0) + Number(t.monto);
          }
        }
      });
      return map;
    })(),
    // Detailed fuel records by code for PDF
    fuelDetailsByCode: (() => {
      const map: Record<string, { fecha: string; litros: number; monto: number }[]> = {};
      const seen: Record<string, Set<string>> = {}; // Track duplicates by code -> "fecha|monto"
      
      // Helper to create a unique key for deduplication
      const makeKey = (fecha: string, monto: number) => `${fecha}|${Math.round(monto)}`;
      
      // 1. Read CSV historical fuel
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
            if (!seen[code]) seen[code] = new Set();
            // Include entry even if litros is 0 (some entries only have monto)
            if (monto > 0) {
              const key = makeKey(fecha, monto);
              seen[code].add(key);
              map[code].push({ fecha, litros, monto });
            }
          }
        }
      } catch {}
      // 2. Add DB FuelLog entries (only if not already in CSV)
      fuelLogs.forEach((log: any) => {
        const code = log.User?.codigo?.toUpperCase();
        if (!code) return;
        const fecha = log.fecha instanceof Date 
          ? `${String(log.fecha.getDate()).padStart(2,'0')}-${String(log.fecha.getMonth()+1).padStart(2,'0')}-${String(log.fecha.getFullYear()).slice(-2)}`
          : String(log.fecha).split('T')[0];
        const litros = typeof log.litros === 'number' ? log.litros : parseFloat(log.litros?.toString() || '0');
        const monto = typeof log.monto === 'number' ? log.monto : parseFloat(log.monto?.toString() || '0');
        if (!map[code]) map[code] = [];
        if (!seen[code]) seen[code] = new Set();
        if (monto > 0) {
          const key = makeKey(fecha, monto);
          // Only add if not already seen (avoid duplicates)
          if (!seen[code].has(key)) {
            seen[code].add(key);
            map[code].push({ fecha, litros, monto });
          }
        }
      });
      // 3. Sort each pilot's entries by date descending (most recent first)
      for (const code of Object.keys(map)) {
        map[code].sort((a, b) => {
          // Parse DD-MM-YY format
          const parseDate = (d: string) => {
            const parts = d.split('-');
            if (parts.length !== 3) return 0;
            const day = parseInt(parts[0]) || 1;
            const month = parseInt(parts[1]) || 1;
            let year = parseInt(parts[2]) || 0;
            if (year < 100) year = year < 50 ? 2000 + year : 1900 + year;
            return new Date(year, month - 1, day).getTime();
          };
          return parseDate(b.fecha) - parseDate(a.fecha);
        });
      }
      return map;
    })(),
    csvPilotStats,
    depositsByCode: (() => {
      const map: Record<string, number> = {};
      // 1. Read from CSV
      try {
        const depositsPath = path.join(process.cwd(), 'Pago pilotos', 'Pago pilotos.csv');
        if (fs.existsSync(depositsPath)) {
          const content = fs.readFileSync(depositsPath, 'utf-8');
          const lines = content.split('\n').filter(l => l.trim());
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
      // 2. Add from database
      depositsFromDB.forEach(dep => {
        const code = dep.User?.codigo?.toUpperCase();
        if (code && dep.monto) {
          const monto = typeof dep.monto === 'number' ? dep.monto : parseFloat(dep.monto.toString());
          map[code] = (map[code] || 0) + monto;
        }
      });
      return map;
    })(),
    // Detailed deposit records by code for PDF
    depositsDetailsByCode: (() => {
      const map: Record<string, { fecha: string; descripcion: string; monto: number }[]> = {};
      // 1. Read from CSV
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
      // 2. Add from database
      depositsFromDB.forEach(dep => {
        const code = dep.User?.codigo?.toUpperCase();
        if (code) {
          if (!map[code]) map[code] = [];
          const monto = typeof dep.monto === 'number' ? dep.monto : parseFloat(dep.monto.toString());
          map[code].push({ 
            fecha: dep.fecha.toISOString().split('T')[0], 
            descripcion: dep.detalle || 'Depósito (BD)', 
            monto 
          });
        }
      });
      return map;
    })(),
    fuelLogs: await (async () => {
      const pathMod = await import('path');
      const fsMod = await import('fs');
      const logsWithExists = await Promise.all(
        fuelLogs.map(async (l: any) => {
          const filename = l.imageUrl?.startsWith('/uploads/fuel/') ? l.imageUrl.split('/').pop() || '' : '';
          let exists = false;
          if (filename) {
            try {
              // Check volume first, then public
              const volumePath = process.env.RAILWAY_VOLUME_MOUNT_PATH
                ? pathMod.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'fuel', filename)
                : null;
              const publicPath = pathMod.join(process.cwd(), 'public', 'uploads', 'fuel', filename);
              
              if (volumePath && fsMod.existsSync(volumePath)) {
                exists = true;
              } else if (fsMod.existsSync(publicPath)) {
                exists = true;
              }
            } catch {}
          }
          return { ...l, litros: Number(l.litros), monto: Number(l.monto), User: l.User, exists };
        })
      );
      return logsWithExists;
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
          numeroLicencia: u.licencia || null,
          tipoDocumento: null,
          documento: null
        }))
    }
  };

  return (
    <div className="min-h-screen w-full">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <DashboardClient initialData={data} overviewMetrics={overviewMetrics} pagination={{ page, pageSize, total: totalFlights }} allowedPilotCodes={allowedPilotCodes} registeredPilotCodes={registeredPilotCodes} csvPilotNames={csvPilotNames} />
      </div>
    </div>
  );
}
