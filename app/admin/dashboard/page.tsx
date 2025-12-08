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
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
      select: {
        id: true,
        fecha: true,
        createdAt: true,
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
        aerodromoSalida: true,
        aerodromoDestino: true,
      }
    }),
    // All flights with complete data for client filtering in FlightsTable
    prisma.flight.findMany({ 
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }], 
      select: { 
        id: true, 
        fecha: true,
        createdAt: true, 
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
        aerodromoSalida: true,
        aerodromoDestino: true,
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
        // Fuel charges from DB transactions (tipo FUEL, excluding Stratus user ID 95)
        prisma.transaction.aggregate({
          where: { 
            tipo: 'FUEL',
            userId: { not: 95 }
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

      // Oil change is also done during 100hr inspections, so find the most recent of either
      const getLastOilChangeTach = async (): Promise<number | null> => {
        const flights = await prisma.flight.findMany({
          where: {
            OR: [
              { detalle: { contains: 'CAMBIO DE ACEITE', mode: 'insensitive' } },
              { detalle: { contains: 'REVISION 100 HRS', mode: 'insensitive' } },
              { detalle: { contains: 'REVISION 100 HORAS', mode: 'insensitive' } },
            ]
          },
          orderBy: { fecha: 'desc' },
          take: 1,
          select: { tach_inicio: true, tach_fin: true, diff_tach: true }
        });
        if (flights.length === 0) return null;
        const flight = flights[0];
        const ini = toNumber(flight.tach_inicio);
        const fin = toNumber(flight.tach_fin);
        const diff = toNumber(flight.diff_tach);
        return ini != null ? ini : (fin != null && diff != null ? fin - diff : null);
      };
      
      const currentTach = await getCurrentTach();
      const oilTachBase = await getLastOilChangeTach();
      const inspectTachBase = await getLastTachForDetalle('REVISION 100 HRS');
      
      const oilUsed = oilTachBase != null && currentTach != null ? (currentTach - oilTachBase) : (currentTach != null ? (currentTach % OIL_INTERVAL) : 0);
      const inspectUsed = inspectTachBase != null && currentTach != null ? (currentTach - inspectTachBase) : (currentTach != null ? (currentTach % INSPECT_100_INTERVAL) : 0);
      
      const oilChangeRemaining = Math.max(0, OIL_INTERVAL - (oilUsed < 0 ? 0 : oilUsed));
      const hundredHourRemaining = Math.max(0, INSPECT_100_INTERVAL - (inspectUsed < 0 ? 0 : inspectUsed));
      
      // === PREDICTIVE STATISTICS ===
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const prevThirtyStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      const prevThirtyEnd = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      // Get flights for each period
      const [flights30d, flights60d, flights90d, flightsPrev30d] = await Promise.all([
        prisma.flight.findMany({ where: { fecha: { gte: thirtyDaysAgo } }, select: { diff_tach: true, tach_inicio: true, tach_fin: true, fecha: true } }),
        prisma.flight.findMany({ where: { fecha: { gte: sixtyDaysAgo } }, select: { diff_tach: true, tach_inicio: true, tach_fin: true } }),
        prisma.flight.findMany({ where: { fecha: { gte: ninetyDaysAgo } }, select: { diff_tach: true, tach_inicio: true, tach_fin: true } }),
        prisma.flight.findMany({ where: { fecha: { gte: prevThirtyStart, lt: prevThirtyEnd } }, select: { diff_tach: true, tach_inicio: true, tach_fin: true } }),
      ]);
      
      // Calculate TACH hours for each period
      const computeTachHours = (flights: { diff_tach: any; tach_inicio: any; tach_fin: any }[]) => {
        let sum = 0;
        for (const f of flights) {
          const dt = toNumber(f.diff_tach);
          const ti = toNumber(f.tach_inicio);
          const tf = toNumber(f.tach_fin);
          const d = dt !== null ? dt : (ti !== null && tf !== null ? (tf - ti) : 0);
          if (!isNaN(d) && d > 0) sum += d;
        }
        return sum;
      };
      
      const hours30d = computeTachHours(flights30d);
      const hours60d = computeTachHours(flights60d);
      const hours90d = computeTachHours(flights90d);
      const hoursPrev30d = computeTachHours(flightsPrev30d);
      
      const rate30d = hours30d / 30;  // hrs/day
      const rate60d = hours60d / 60;
      const rate90d = hours90d / 90;
      const ratePrev30d = hoursPrev30d / 30;
      
      // Weighted average: 30d weights 3x, 60d weights 2x, 90d weights 1x
      const weightedRate = (rate30d * 3 + rate60d * 2 + rate90d * 1) / 6;
      
      // Trend: compare last 30d vs previous 30d
      const trend = ratePrev30d > 0 ? ((rate30d - ratePrev30d) / ratePrev30d) * 100 : 0;
      
      // Standard deviation of daily usage (from last 30 days)
      const dailyHours: number[] = [];
      const flightsByDay = new Map<string, number>();
      for (const f of flights30d) {
        const dateKey = new Date(f.fecha).toISOString().slice(0, 10);
        const dt = toNumber(f.diff_tach);
        const ti = toNumber(f.tach_inicio);
        const tf = toNumber(f.tach_fin);
        const d = dt !== null ? dt : (ti !== null && tf !== null ? (tf - ti) : 0);
        flightsByDay.set(dateKey, (flightsByDay.get(dateKey) || 0) + (d > 0 ? d : 0));
      }
      // Fill in days with 0 flights
      for (let i = 0; i < 30; i++) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dateKey = d.toISOString().slice(0, 10);
        dailyHours.push(flightsByDay.get(dateKey) || 0);
      }
      const mean = dailyHours.reduce((a, b) => a + b, 0) / dailyHours.length;
      const variance = dailyHours.reduce((sum, h) => sum + Math.pow(h - mean, 2), 0) / dailyHours.length;
      const stdDev = Math.sqrt(variance);
      
      // Calculate total payments (CSV + DB deposits)
      const totalPayments = paymentsFromCSV + Number(depositsFromDB._sum.monto || 0);
      
      // Fuel charges (non-Stratus users)
      const fuelCharges = Number(fuelChargesNonStratus._sum.monto || 0);
      
      // Fixed adjustment for pending balance (historical correction)
      const FIXED_ADJUSTMENT = 20749548;
      
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
          usageStats: {
            rate30d: Number(rate30d.toFixed(3)),
            rate60d: Number(rate60d.toFixed(3)),
            rate90d: Number(rate90d.toFixed(3)),
            weightedRate: Number(weightedRate.toFixed(3)),
            trend: Number(trend.toFixed(1)),
            stdDev: Number(stdDev.toFixed(3)),
          },
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

  // Calculate yearly flight hours per aircraft for prediction
  const aircraftYearlyStats = await Promise.all(
    aircraft.map(async (a) => {
      // Get all flights for this aircraft
      const allAircraftFlights = await prisma.flight.findMany({
        where: { aircraftId: a.matricula },
        orderBy: { fecha: 'asc' },
        select: { fecha: true, diff_hobbs: true }
      });
      
      if (allAircraftFlights.length === 0) {
        return { matricula: a.matricula, avgHoursPerYear: 0, yearsOfOperation: 0, totalHours: 0 };
      }
      
      // Calculate total hours and time span
      const totalHours = allAircraftFlights.reduce((sum, f) => sum + Number(f.diff_hobbs || 0), 0);
      const firstFlight = new Date(allAircraftFlights[0].fecha);
      const lastFlight = new Date(allAircraftFlights[allAircraftFlights.length - 1].fecha);
      const yearsDiff = Math.max((lastFlight.getTime() - firstFlight.getTime()) / (1000 * 60 * 60 * 24 * 365), 0.5);
      const avgHoursPerYear = totalHours / yearsDiff;
      
      return { 
        matricula: a.matricula, 
        avgHoursPerYear: Math.round(avgHoursPerYear * 10) / 10,
        yearsOfOperation: Math.round(yearsDiff * 10) / 10,
        totalHours: Math.round(totalHours * 10) / 10
      };
    })
  );

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
    aircraftYearlyStats,
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
            return new Date(year, month - 1, day, 12, 0, 0).getTime();
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
      const allRecords: { id: number | string; fecha: Date; pilotCode: string; pilotName: string; litros: number; monto: number; detalle: string; imageUrl: string | null; source: 'CSV' | 'DB'; exists: boolean }[] = [];
      const seen = new Set<string>(); // Track duplicates by "fecha|code|monto"
      
      // Helper to create a unique key for deduplication
      const makeKey = (fecha: string, code: string, monto: number) => `${fecha}|${code}|${Math.round(monto)}`;
      
      // Helper to parse DD-MM-YY to Date (use noon to avoid timezone issues)
      const parseDate = (d: string): Date => {
        const parts = d.split('-');
        if (parts.length !== 3) return new Date();
        const day = parseInt(parts[0]) || 1;
        const month = parseInt(parts[1]) || 1;
        let year = parseInt(parts[2]) || 0;
        if (year < 100) year = year < 50 ? 2000 + year : 1900 + year;
        return new Date(year, month - 1, day, 12, 0, 0); // Use noon to avoid timezone offset issues
      };
      
      // 1. Read CSV historical fuel
      try {
        const fuelPath = pathMod.join(process.cwd(), 'Combustible', 'Planilla control combustible.csv');
        if (fsMod.existsSync(fuelPath)) {
          const content = fsMod.readFileSync(fuelPath, 'utf-8');
          const lines = content.split('\n').filter(l => l.trim());
          for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(';');
            const fechaStr = (parts[0] || '').trim();
            const code = (parts[1] || '').trim().toUpperCase();
            const litrosStr = (parts[2] || '').trim().replace(',', '.');
            const montoStr = (parts[3] || '').trim();
            if (!code || !fechaStr) continue;
            const litros = parseFloat(litrosStr) || 0;
            const cleaned = montoStr.replace(/\$/g, '').replace(/\./g, '').replace(',', '.');
            const monto = parseFloat(cleaned) || 0;
            if (monto <= 0) continue;
            
            const key = makeKey(fechaStr, code, monto);
            if (seen.has(key)) continue;
            seen.add(key);
            
            // Find pilot name from users
            const user = users.find(u => (u.codigo || '').toUpperCase() === code);
            const pilotName = user?.nombre || code;
            
            allRecords.push({
              id: `csv-${i}`,
              fecha: parseDate(fechaStr),
              pilotCode: code,
              pilotName: pilotName,
              litros,
              monto,
              detalle: 'Histórico CSV',
              imageUrl: null,
              source: 'CSV',
              exists: false
            });
          }
        }
      } catch {}
      
      // 2. Add DB FuelLog entries
      for (const l of fuelLogs) {
        const code = (l.User?.codigo || '').toUpperCase();
        const fecha = l.fecha instanceof Date ? l.fecha : new Date(l.fecha);
        const fechaStr = `${String(fecha.getDate()).padStart(2,'0')}-${String(fecha.getMonth()+1).padStart(2,'0')}-${String(fecha.getFullYear()).slice(-2)}`;
        const monto = Number(l.monto) || 0;
        
        const key = makeKey(fechaStr, code, monto);
        // Skip if already in CSV (duplicate)
        if (seen.has(key)) continue;
        seen.add(key);
        
        // Check if image exists
        const filename = l.imageUrl?.startsWith('/uploads/fuel/') ? l.imageUrl.split('/').pop() || '' : '';
        let exists = false;
        if (filename) {
          try {
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
        
        allRecords.push({
          id: l.id,
          fecha: fecha,
          pilotCode: code,
          pilotName: l.User?.nombre || code || `#${l.userId}`,
          litros: Number(l.litros) || 0,
          monto: monto,
          detalle: l.detalle || '',
          imageUrl: l.imageUrl,
          source: 'DB',
          exists
        });
      }
      
      // Sort by date descending
      allRecords.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
      
      return allRecords;
    })(),
    pilotDirectory: {
      // For CSV pilots, merge with DB data if available
      initial: csvPilots.map(csvPilot => {
        // Find matching user in DB by code
        const dbUser = users.find(u => (u.codigo || '').toUpperCase() === csvPilot.code);
        if (dbUser) {
          return {
            id: dbUser.id,
            code: csvPilot.code,
            name: dbUser.nombre || csvPilot.name, // Prefer DB name if available
            email: dbUser.email || '',
            createdAt: dbUser.createdAt,
            fechaNacimiento: dbUser.fechaNacimiento || null,
            telefono: dbUser.telefono || null,
            numeroLicencia: dbUser.licencia || null,
            tipoDocumento: dbUser.tipoDocumento || null,
            documento: dbUser.documento || null,
            source: 'CSV' as const
          };
        }
        // No DB record, return CSV-only data
        return {
          id: null,
          code: csvPilot.code,
          name: csvPilot.name,
          email: '',
          createdAt: null,
          fechaNacimiento: null,
          telefono: null,
          numeroLicencia: null,
          tipoDocumento: null,
          documento: null,
          source: 'CSV' as const
        };
      }),
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
          tipoDocumento: u.tipoDocumento || null,
          documento: u.documento || null
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
