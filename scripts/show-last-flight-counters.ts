import { prisma } from "../lib/prisma";

async function showLastFlightCounters(pilotoId: number, matricula: string) {
  const lastFlight = await prisma.flight.findFirst({
    where: { pilotoId, aircraftId: matricula },
    orderBy: { createdAt: "desc" },
  });

  if (lastFlight) {
    console.log(`Último vuelo para piloto ${pilotoId} y aeronave ${matricula}:`);
    console.log(`hobbs_fin: ${lastFlight.hobbs_fin}`);
    console.log(`tach_fin: ${lastFlight.tach_fin}`);
    console.log(`createdAt: ${lastFlight.createdAt}`);
  } else {
    const aircraft = await prisma.aircraft.findUnique({ where: { matricula } });
    console.log(`Sin vuelos previos. Valores actuales del avión:`);
    console.log(`hobbs_actual: ${aircraft?.hobbs_actual}`);
    console.log(`tach_actual: ${aircraft?.tach_actual}`);
  }
}

// Cambia estos valores por los que quieras consultar
showLastFlightCounters(1, "CC-AQI");
