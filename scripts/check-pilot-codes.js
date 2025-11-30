const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Leer CSV
  const csvPath = path.join(process.cwd(), 'Base de dato pilotos', 'Base de dato pilotos.csv');
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  
  const csvPilots = new Map();
  lines.slice(1).forEach(l => {
    const [code, name] = l.split(';');
    if (code && name) {
      csvPilots.set(code.trim().toUpperCase(), name.trim());
    }
  });
  
  // Leer DB
  const dbPilots = await prisma.user.findMany({
    where: { rol: 'PILOTO', codigo: { not: null } },
    select: { id: true, nombre: true, codigo: true, email: true }
  });
  
  // Pilot Directory = CSV pilotos en DB + DB pilotos con email real no en CSV
  console.log('=== PILOT DIRECTORY (Lista Desplegable) ===');
  console.log('');
  
  const pilotDirectory = [];
  
  // 1. Pilotos del CSV que están en DB
  csvPilots.forEach((name, code) => {
    const dbMatch = dbPilots.find(p => p.codigo.toUpperCase() === code);
    if (dbMatch) {
      pilotDirectory.push({ code, name, source: 'CSV' });
    }
  });
  
  // 2. Pilotos registrados con email real NO en CSV
  dbPilots.forEach(p => {
    const inCSV = csvPilots.has(p.codigo.toUpperCase());
    const hasRealEmail = p.email && !p.email.endsWith('@piloto.local');
    if (!inCSV && hasRealEmail) {
      pilotDirectory.push({ code: p.codigo, name: p.nombre, source: 'Registered' });
    }
  });
  
  // Ordenar por nombre
  pilotDirectory.sort((a,b) => a.name.localeCompare(b.name));
  
  // Mostrar
  pilotDirectory.forEach((p, i) => {
    console.log((i+1) + '. ' + p.code + ' - ' + p.name);
  });
  
  console.log('');
  console.log('=== TOTAL: ' + pilotDirectory.length + ' pilotos ===');
}

main().catch(console.error).finally(() => prisma.$disconnect());

