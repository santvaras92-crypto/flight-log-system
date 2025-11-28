import { prisma } from "../lib/prisma";

async function updateTachActual() {
  await prisma.aircraft.update({
    where: { matricula: "CC-AQI" },
    data: { tach_actual: 563.9 },
  });
  console.log("tach_actual actualizado a 563.9 para CC-AQI");
}

updateTachActual();
