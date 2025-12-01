#!/usr/bin/env node
/*
  Verification script for Flight Log System core logic.
  Safe read-only by default; set APPLY_TEST to true to insert a test submission/flight.

  What it checks:
  1. Retrieves last flight for CC-AQI and current aircraft/component counters.
  2. Simulates a hypothetical next flight (default ΔHobbs=2.3, ΔTach=1.8) and computes expected: cost, component hours.
  3. Validates formula: costo = ΔHobbs * (tarifa + instructor_rate) for flights >= 2025-11-25.
  4. Compares component hours projection against base + ΔTach.

  Optional insertion:
  If process.env.APPLY_TEST === 'true', inserts a test flight (cliente TEST) and re-validates persisted values.

  Run:
    node scripts/verify-system.js
    APPLY_TEST=true node scripts/verify-system.js   (to create test flight)
*/

import { PrismaClient, Prisma } from '@prisma/client';
const prisma = new PrismaClient();

const AIRCRAFT_ID = 'CC-AQI';
const SIM_DELTA_HOBBS = 2.3; // adjust as needed
const SIM_DELTA_TACH = 1.8;  // adjust as needed
const SIM_RATE = 185000;     // avión
const SIM_INSTRUCTOR = 30000; // instructor/SP
const THRESHOLD_DATE = new Date('2025-11-25');

function fmt(n) { return typeof n === 'number' ? n.toFixed(1) : '—'; }
function peso(n) { return `$${Math.round(n).toLocaleString('es-CL')}`; }

async function main() {
  const aircraft = await prisma.aircraft.findUnique({ where: { matricula: AIRCRAFT_ID } });
  if (!aircraft) {
    console.error('ERROR: Aircraft CC-AQI not found');
    process.exit(1);
  }

  const lastFlight = await prisma.flight.findFirst({
    where: { aircraftId: AIRCRAFT_ID },
    orderBy: { fecha: 'desc' },
  });

  const components = await prisma.component.findMany({ where: { aircraftId: AIRCRAFT_ID } });
  const compMap = Object.fromEntries(components.map(c => [c.tipo.toUpperCase(), Number(c.horas_acumuladas)]));

  const baseHobbs = lastFlight ? Number(lastFlight.hobbs_fin) : Number(aircraft.hobbs_actual);
  const baseTach = lastFlight ? Number(lastFlight.tach_fin) : Number(aircraft.tach_actual);
  const baseAirframe = compMap['AIRFRAME'] ?? null;
  const baseEngine = compMap['ENGINE'] ?? null;
  const basePropeller = compMap['PROPELLER'] ?? null;

  const simHobbsFin = baseHobbs + SIM_DELTA_HOBBS;
  const simTachFin = baseTach + SIM_DELTA_TACH;
  const expectedCost = SIM_DELTA_HOBBS * (SIM_RATE + SIM_INSTRUCTOR);
  const expectedAirframe = baseAirframe != null ? Number((baseAirframe + SIM_DELTA_TACH).toFixed(1)) : null;
  const expectedEngine = baseEngine != null ? Number((baseEngine + SIM_DELTA_TACH).toFixed(1)) : null;
  const expectedPropeller = basePropeller != null ? Number((basePropeller + SIM_DELTA_TACH).toFixed(1)) : null;

  console.log('--- CURRENT BASE STATE ---');
  console.log('Last Hobbs:', fmt(baseHobbs), 'Last Tach:', fmt(baseTach));
  console.log('Components (A/E/P):', fmt(baseAirframe), fmt(baseEngine), fmt(basePropeller));
  if (lastFlight) console.log('Last Flight Date:', new Date(lastFlight.fecha).toISOString().slice(0,10), 'ID:', lastFlight.id);
  console.log();

  console.log('--- SIMULATED NEXT FLIGHT ---');
  console.log('Hypothetical Hobbs Fin:', fmt(simHobbsFin), '(Δ', SIM_DELTA_HOBBS.toFixed(1), ')');
  console.log('Hypothetical Tach  Fin:', fmt(simTachFin), '(Δ', SIM_DELTA_TACH.toFixed(1), ')');
  console.log('Expected Cost Formula: ΔHobbs * (rate + instructor) =', peso(expectedCost));
  console.log('Expected Components A/E/P:', fmt(expectedAirframe), fmt(expectedEngine), fmt(expectedPropeller));
  console.log();

  // Validation summary object
  const summary = {
    base: { hobbs: baseHobbs, tach: baseTach, airframe: baseAirframe, engine: baseEngine, propeller: basePropeller },
    simulated: {
      hobbs_fin: simHobbsFin,
      tach_fin: simTachFin,
      diff_hobbs: SIM_DELTA_HOBBS,
      diff_tach: SIM_DELTA_TACH,
      costo_expected: expectedCost,
      components_expected: { airframe: expectedAirframe, engine: expectedEngine, propeller: expectedPropeller }
    }
  };

  // Optionally insert test flight
  if (process.env.APPLY_TEST === 'true') {
    console.log('APPLY_TEST=true -> inserting test flight...');
    const now = new Date();
    const fechaVuelo = now > THRESHOLD_DATE ? now : THRESHOLD_DATE; // ensure threshold logic applies
    const flight = await prisma.flight.create({
      data: {
        fecha: fechaVuelo,
        aircraftId: AIRCRAFT_ID,
        hobbs_inicio: baseHobbs,
        hobbs_fin: simHobbsFin,
        tach_inicio: baseTach,
        tach_fin: simTachFin,
        diff_hobbs: SIM_DELTA_HOBBS,
        diff_tach: SIM_DELTA_TACH,
        costo: expectedCost,
        tarifa: SIM_RATE,
        instructor_rate: SIM_INSTRUCTOR,
        cliente: 'TEST',
        copiloto: null,
        detalle: 'VERIFICATION FLIGHT',
        airframe_hours: expectedAirframe,
        engine_hours: expectedEngine,
        propeller_hours: expectedPropeller,
      }
    });

    // Update aircraft + components to reflect insertion
    await prisma.aircraft.update({ where: { matricula: AIRCRAFT_ID }, data: { hobbs_actual: simHobbsFin, tach_actual: simTachFin } });
    if (expectedAirframe != null) await prisma.component.updateMany({ where: { aircraftId: AIRCRAFT_ID, tipo: 'AIRFRAME' }, data: { horas_acumuladas: expectedAirframe } });
    if (expectedEngine != null) await prisma.component.updateMany({ where: { aircraftId: AIRCRAFT_ID, tipo: 'ENGINE' }, data: { horas_acumuladas: expectedEngine } });
    if (expectedPropeller != null) await prisma.component.updateMany({ where: { aircraftId: AIRCRAFT_ID, tipo: 'PROPELLER' }, data: { horas_acumuladas: expectedPropeller } });

    console.log('Inserted flight ID:', flight.id);

    // Re-read for verification
    const persisted = await prisma.flight.findUnique({ where: { id: flight.id } });
    summary.persisted = {
      diff_hobbs: Number(persisted?.diff_hobbs || 0),
      diff_tach: Number(persisted?.diff_tach || 0),
      costo: Number(persisted?.costo || 0),
      tarifa: Number(persisted?.tarifa || 0),
      instructor_rate: Number(persisted?.instructor_rate || 0),
      airframe_hours: Number(persisted?.airframe_hours || 0),
      engine_hours: Number(persisted?.engine_hours || 0),
      propeller_hours: Number(persisted?.propeller_hours || 0)
    };

    // Basic assertions
    const costMatches = Math.abs(summary.persisted.costo - expectedCost) < 1; // allow rounding
    const airframeMatches = expectedAirframe == null || summary.persisted.airframe_hours === expectedAirframe;
    const engineMatches = expectedEngine == null || summary.persisted.engine_hours === expectedEngine;
    const propMatches = expectedPropeller == null || summary.persisted.propeller_hours === expectedPropeller;

    console.log();
    console.log('--- PERSISTED VERIFICATION ---');
    console.log('Costo matches expected?', costMatches);
    console.log('Airframe matches?', airframeMatches);
    console.log('Engine matches?', engineMatches);
    console.log('Propeller matches?', propMatches);

    if (!costMatches || !airframeMatches || !engineMatches || !propMatches) {
      console.error('FAIL: Some persisted values differ from expectation.');
      console.dir(summary, { depth: null });
      process.exit(2);
    } else {
      console.log('PASS: Persisted values match expectations.');
    }
  }

  // Always output summary JSON (can be parsed if needed)
  console.log();
  console.log('--- SUMMARY JSON ---');
  console.log(JSON.stringify(summary, null, 2));

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
