import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Buscando vuelos con cliente = 'GL'...\n");

  const flights = await prisma.flight.findMany({
    where: { cliente: "GL" },
    orderBy: { fecha: "asc" },
  });

  if (flights.length === 0) {
    console.log("No se encontraron vuelos con cliente = 'GL'.");
    return;
  }

  console.log(`Se encontraron ${flights.length} vuelos:\n`);
  console.table(
    flights.map((f) => ({
      id: f.id,
      Fecha: f.fecha ? f.fecha.toISOString().split("T")[0] : null,
      Piloto: (f as any).piloto_raw ?? "N/A",
      Cliente: f.cliente,
      Hobbs: `${f.hobbs_inicio} -> ${f.hobbs_fin}`,
      DiffHrs: f.diff_hobbs?.toString(),
      Costo: f.costo?.toString(),
    }))
  );
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
