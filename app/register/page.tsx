import { prisma } from '@/lib/prisma';
import RegisterClient from './ui/RegisterClient';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export default async function RegistroPage() {
  const users = await prisma.user.findMany();
  
  // Read allowed pilot codes from official CSV (Base de dato pilotos)
  let allowedPilotCodes: string[] = [];
  let csvPilots: { code: string; name: string }[] = [];
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
    }
  } catch (e) {
    // Ignore CSV errors
    allowedPilotCodes = [];
  }

  // Build pilot options: CSV pilots + registered pilots not in CSV
  const csvPilotOpts = csvPilots.map(p => ({
    id: p.code,
    value: p.code,
    label: `${p.name} (${p.code})`,
  }));

  const registeredPilotOpts = users
    .filter(u => {
      if (u.rol !== 'PILOTO') return false;
      const code = (u.codigo || '').toUpperCase();
      // Only include pilots NOT in CSV AND have real email (not @piloto.local)
      return code && !allowedPilotCodes.includes(code) && u.email && !u.email.endsWith('@piloto.local');
    })
    .map(u => ({
      id: String(u.id),
      value: u.codigo || String(u.id), // Usar código como value para que coincida con la búsqueda
      label: `${u.nombre} (${u.codigo})`,
    }));

  // Combine and sort alphabetically by label
  const allPilots = [...csvPilotOpts, ...registeredPilotOpts].sort((a, b) => 
    a.label.localeCompare(b.label, 'es', { sensitivity: 'base' })
  );

  // Obtener los últimos contadores Hobbs y Tach del vuelo con mayor HOBBS para CC-AQI
  const lastFlight = await prisma.flight.findFirst({
    where: { aircraftId: "CC-AQI", hobbs_fin: { not: null } },
    orderBy: { hobbs_fin: "desc" },
    select: { 
      hobbs_fin: true, 
      tach_fin: true,
      airframe_hours: true,
      engine_hours: true,
      propeller_hours: true,
      aerodromoDestino: true,
    },
  });

  const lastCounters = {
    hobbs: lastFlight?.hobbs_fin ? Number(lastFlight.hobbs_fin) : null,
    tach: lastFlight?.tach_fin ? Number(lastFlight.tach_fin) : null,
  };

  // Obtener horas acumuladas de componentes desde el último vuelo registrado
  const lastComponents = {
    airframe: lastFlight?.airframe_hours ? Number(lastFlight.airframe_hours) : null,
    engine: lastFlight?.engine_hours ? Number(lastFlight.engine_hours) : null,
    propeller: lastFlight?.propeller_hours ? Number(lastFlight.propeller_hours) : null,
  };

  // El aeródromo de salida por defecto es el destino del último vuelo (o SCCV)
  const lastAerodromoDestino = lastFlight?.aerodromoDestino || 'SCCV';

  return <RegisterClient pilots={allPilots} lastCounters={lastCounters} lastComponents={lastComponents} lastAerodromoDestino={lastAerodromoDestino} />;
}
