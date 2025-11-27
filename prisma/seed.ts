import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed de la base de datos...");

  // Limpiar datos existentes (opcional, comentar si no quieres resetear)
  // await prisma.transaction.deleteMany();
  // await prisma.flight.deleteMany();
  // await prisma.imageLog.deleteMany();
  // await prisma.flightSubmission.deleteMany();
  // await prisma.component.deleteMany();
  // await prisma.aircraft.deleteMany();
  // await prisma.user.deleteMany();

  // Crear usuarios
  console.log("👥 Creando usuarios...");
  
  const admin = await prisma.user.upsert({
    where: { email: "admin@aeroclub.com" },
    update: {},
    create: {
      nombre: "Administrador Principal",
      email: "admin@aeroclub.com",
      rol: "ADMIN",
      saldo_cuenta: 0,
      tarifa_hora: 0,
      password: await bcrypt.hash("admin123", 10),
    },
  });

  const piloto1 = await prisma.user.upsert({
    where: { email: "juan.perez@example.com" },
    update: {},
    create: {
      nombre: "Juan Pérez",
      email: "juan.perez@example.com",
      rol: "PILOTO",
      saldo_cuenta: 500000, // $500,000 CLP
      tarifa_hora: 85000, // $85,000 CLP por hora
      password: await bcrypt.hash("juan123", 10),
    },
  });

  const piloto2 = await prisma.user.upsert({
    where: { email: "maria.gonzalez@example.com" },
    update: {},
    create: {
      nombre: "María González",
      email: "maria.gonzalez@example.com",
      rol: "PILOTO",
      saldo_cuenta: 750000, // $750,000 CLP
      tarifa_hora: 85000,
      password: await bcrypt.hash("maria123", 10),
    },
  });

  console.log(`✅ Usuarios creados: Admin, ${piloto1.nombre}, ${piloto2.nombre}`);

  // Crear aeronave CC-AQI
  console.log("✈️  Creando aeronave CC-AQI...");
  
  const aircraft = await prisma.aircraft.upsert({
    where: { matricula: "CC-AQI" },
    update: {},
    create: {
      matricula: "CC-AQI",
      modelo: "Cessna 172 Skyhawk",
      hobbs_actual: 1234.5,
      tach_actual: 987.3,
    },
  });

  console.log(`✅ Aeronave creada: ${aircraft.matricula} (${aircraft.modelo})`);

  // Crear componentes de la aeronave
  console.log("🔧 Creando componentes de la aeronave...");

  const airframe = await prisma.component.create({
    data: {
      tipo: "AIRFRAME",
      horas_acumuladas: 3500.0,
      limite_tbo: 12000.0, // 12,000 horas para célula
      aircraftId: aircraft.matricula,
    },
  });

  const engine = await prisma.component.create({
    data: {
      tipo: "ENGINE",
      horas_acumuladas: 987.3,
      limite_tbo: 2000.0, // 2,000 horas TBO para motor Lycoming
      aircraftId: aircraft.matricula,
    },
  });

  const propeller = await prisma.component.create({
    data: {
      tipo: "PROPELLER",
      horas_acumuladas: 987.3,
      limite_tbo: 2000.0, // 2,000 horas para hélice
      aircraftId: aircraft.matricula,
    },
  });

  console.log(`✅ Componentes creados: Célula, Motor, Hélice`);

  // Crear un vuelo de ejemplo (opcional)
  console.log("📝 Creando vuelo de ejemplo...");

  const exampleFlight = await prisma.flight.create({
    data: {
      hobbs_inicio: 1230.0,
      hobbs_fin: 1234.5,
      tach_inicio: 983.0,
      tach_fin: 987.3,
      diff_hobbs: 4.5,
      diff_tach: 4.3,
      costo: 382500, // 4.5 horas * $85,000
      pilotoId: piloto1.id,
      aircraftId: aircraft.matricula,
    },
  });

  // Crear transacción asociada al vuelo
  await prisma.transaction.create({
    data: {
      monto: -382500,
      tipo: "CARGO_VUELO",
      userId: piloto1.id,
      flightId: exampleFlight.id,
    },
  });

  // Actualizar saldo del piloto
  await prisma.user.update({
    where: { id: piloto1.id },
    data: {
      saldo_cuenta: {
        decrement: 382500,
      },
    },
  });

  console.log(`✅ Vuelo de ejemplo creado: ${exampleFlight.diff_hobbs} horas Hobbs`);

  // Crear un abono de ejemplo
  console.log("💰 Creando abono de ejemplo...");

  await prisma.transaction.create({
    data: {
      monto: 500000,
      tipo: "ABONO",
      userId: piloto2.id,
    },
  });

  await prisma.user.update({
    where: { id: piloto2.id },
    data: {
      saldo_cuenta: {
        increment: 500000,
      },
    },
  });

  console.log("✅ Abono de ejemplo creado");

  // Mostrar resumen
  console.log("\n📊 Resumen de la base de datos:");
  
  const stats = {
    usuarios: await prisma.user.count(),
    aeronaves: await prisma.aircraft.count(),
    componentes: await prisma.component.count(),
    vuelos: await prisma.flight.count(),
    transacciones: await prisma.transaction.count(),
  };

  console.table(stats);

  console.log("\n✨ Seed completado exitosamente!");
  console.log("\n📋 Datos de acceso:");
  console.log(`   Admin: admin@aeroclub.com`);
  console.log(`   Piloto 1: juan.perez@example.com (Saldo: $${(500000 - 382500).toLocaleString()})`);
  console.log(`   Piloto 2: maria.gonzalez@example.com (Saldo: $${(750000 + 500000).toLocaleString()})`);
  console.log(`   Aeronave: CC-AQI (Hobbs: ${aircraft.hobbs_actual}, Tach: ${aircraft.tach_actual})`);
}

main()
  .catch((e) => {
    console.error("❌ Error durante el seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
