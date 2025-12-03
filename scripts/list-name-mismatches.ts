import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function compareNames() {
  const csvPath = path.join(process.cwd(), 'Base de dato pilotos', 'Base de dato pilotos.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.trim().split('\n').slice(1);
  
  const csvMap = new Map();
  lines.forEach(line => {
    const [codigo, piloto] = line.split(';');
    if (codigo && piloto) {
      csvMap.set(codigo.trim(), piloto.trim());
    }
  });

  const users = await prisma.user.findMany({
    where: { codigo: { not: null } },
    select: { id: true, codigo: true, nombre: true },
    orderBy: { codigo: 'asc' }
  });

  const mismatches = [];
  
  for (const user of users) {
    const csvName = csvMap.get(user.codigo!);
    if (csvName && csvName !== user.nombre) {
      mismatches.push({
        codigo: user.codigo,
        dbName: user.nombre,
        csvName: csvName
      });
    }
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('NOMBRES INCORRECTOS EN DB (comparado con CSV)');
  console.log('═══════════════════════════════════════════════════════\n');
  
  mismatches.forEach(m => {
    console.log(`Código: ${m.codigo}`);
    console.log(`  ❌ DB:  "${m.dbName}"`);
    console.log(`  ✅ CSV: "${m.csvName}"`);
    console.log('');
  });
  
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Total: ${mismatches.length} piloto(s) con nombres incorrectos`);
  console.log('═══════════════════════════════════════════════════════');
}

compareNames().catch(console.error).finally(() => prisma.$disconnect());
