/**
 * Analyze matching between Flight (log entries) and EngineMonitorFlight (engine data)
 * by comparing dates and durations
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Get all flights from both tables
  const flights = await prisma.flight.findMany({
    orderBy: { fecha: 'desc' },
    take: 20,
    select: { id: true, fecha: true, hobbs_inicio: true, hobbs_fin: true, diff_hobbs: true, diff_tach: true, piloto_raw: true, cliente: true }
  });
  
  const engineFlights = await prisma.engineMonitorFlight.findMany({
    orderBy: { flightDate: 'desc' },
    take: 20,
    select: { id: true, flightNumber: true, flightDate: true, durationSec: true, sourceFile: true }
  });

  console.log("=== Last 20 Flight Log Entries ===");
  for (const f of flights) {
    const d = new Date(f.fecha);
    const hrs = f.diff_hobbs ? Number(f.diff_hobbs).toFixed(1) : '-';
    console.log(`  ID=${f.id} ${d.toISOString().slice(0,10)} hobbs=${hrs}h pilot=${f.piloto_raw || f.cliente || '-'}`);
  }

  console.log("\n=== Last 20 Engine Monitor Flights ===");
  for (const ef of engineFlights) {
    const d = new Date(ef.flightDate);
    const hrs = (ef.durationSec / 3600).toFixed(1);
    console.log(`  ID=${ef.id} #${ef.flightNumber} ${d.toISOString().slice(0,10)} dur=${hrs}h file=${ef.sourceFile}`);
  }

  // Try matching by date
  console.log("\n=== Matching Analysis ===");
  const allFlights = await prisma.flight.findMany({
    orderBy: { fecha: 'desc' },
    select: { id: true, fecha: true, diff_hobbs: true, diff_tach: true, hobbs_inicio: true, hobbs_fin: true }
  });
  const allEngine = await prisma.engineMonitorFlight.findMany({
    orderBy: { flightDate: 'desc' },
    select: { id: true, flightNumber: true, flightDate: true, durationSec: true }
  });

  console.log(`Total Flight Log entries: ${allFlights.length}`);
  console.log(`Total Engine Monitor flights: ${allEngine.length}`);

  // Match by same date (within same day)
  let matchCount = 0;
  let multiMatch = 0;
  const matchedPairs: { flightId: number; engineId: number; date: string; durationMatch: boolean }[] = [];

  for (const f of allFlights) {
    const fDate = new Date(f.fecha).toISOString().slice(0, 10);
    const sameDay = allEngine.filter(ef => new Date(ef.flightDate).toISOString().slice(0, 10) === fDate);
    
    if (sameDay.length === 1) {
      // Unique match by date
      const ef = sameDay[0];
      const fHrs = f.diff_hobbs ? Number(f.diff_hobbs) : null;
      const eHrs = ef.durationSec / 3600;
      const durationMatch = fHrs != null && Math.abs(fHrs - eHrs) < 0.5;
      matchedPairs.push({ flightId: f.id, engineId: ef.id, date: fDate, durationMatch });
      matchCount++;
    } else if (sameDay.length > 1) {
      multiMatch++;
      // Try to match by duration
      const fHrs = f.diff_hobbs ? Number(f.diff_hobbs) : null;
      if (fHrs) {
        const bestMatch = sameDay.reduce((best, ef) => {
          const eHrs = ef.durationSec / 3600;
          const diff = Math.abs(fHrs - eHrs);
          return diff < best.diff ? { ef, diff } : best;
        }, { ef: sameDay[0], diff: Infinity });
        
        if (bestMatch.diff < 0.5) {
          matchedPairs.push({ flightId: f.id, engineId: bestMatch.ef.id, date: fDate, durationMatch: true });
        }
      }
    }
  }

  console.log(`\nSingle-date matches: ${matchCount}`);
  console.log(`Multi-flight same day: ${multiMatch}`);
  console.log(`Total matched pairs: ${matchedPairs.length}`);

  // Show some multi-day examples
  console.log("\n=== Multi-flight same day examples ===");
  const dateCounts = new Map<string, { flights: typeof allFlights; engine: typeof allEngine }>();
  for (const f of allFlights) {
    const fDate = new Date(f.fecha).toISOString().slice(0, 10);
    if (!dateCounts.has(fDate)) dateCounts.set(fDate, { flights: [], engine: [] });
    dateCounts.get(fDate)!.flights.push(f);
  }
  for (const ef of allEngine) {
    const eDate = new Date(ef.flightDate).toISOString().slice(0, 10);
    if (dateCounts.has(eDate)) dateCounts.get(eDate)!.engine.push(ef);
  }
  
  let shown = 0;
  for (const [date, { flights: fs, engine: es }] of dateCounts) {
    if (fs.length > 1 && es.length > 1 && shown < 5) {
      console.log(`\n  ${date}: ${fs.length} flights, ${es.length} engine records`);
      for (const f of fs) {
        console.log(`    Flight ID=${f.id} hobbs=${f.diff_hobbs ? Number(f.diff_hobbs).toFixed(1) : '-'}h`);
      }
      for (const e of es) {
        console.log(`    Engine ID=${e.id} #${e.flightNumber} dur=${(e.durationSec/3600).toFixed(1)}h`);
      }
      shown++;
    }
  }

  // Show unmatched flight log entries (no engine data for that date)
  let unmatchedFlightLog = 0;
  const engineDates = new Set(allEngine.map(ef => new Date(ef.flightDate).toISOString().slice(0, 10)));
  for (const f of allFlights) {
    const fDate = new Date(f.fecha).toISOString().slice(0, 10);
    if (!engineDates.has(fDate)) unmatchedFlightLog++;
  }
  console.log(`\nFlight log entries with NO engine data: ${unmatchedFlightLog}`);

  await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
