import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  // Read CSV
  const csvPath = path.join(process.cwd(), 'Base de dato pilotos', 'Base de dato pilotos.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').slice(1); // skip header
  
  const csvMap = new Map<string, string>();
  
  for (const line of lines) {
    if (!line.trim()) continue;
    const [codigo, nombre] = line.split(';').map(s => s.trim());
    if (codigo && nombre) {
      csvMap.set(codigo, nombre);
    }
  }

  console.log(`📋 Loaded ${csvMap.size} pilot names from CSV`);

  // Get all users with codigo
  const users = await prisma.user.findMany({
    where: {
      codigo: { not: null }
    }
  });

  console.log(`👥 Found ${users.length} users with codigo in database`);

  let updated = 0;
  let unchanged = 0;

  for (const user of users) {
    const csvName = csvMap.get(user.codigo!);
    
    if (!csvName) {
      console.log(`⚠️  No CSV entry for codigo: ${user.codigo}`);
      continue;
    }

    if (user.nombre !== csvName) {
      console.log(`🔧 Updating ${user.codigo}: "${user.nombre}" → "${csvName}"`);
      await prisma.user.update({
        where: { id: user.id },
        data: { 
          nombre: csvName
        }
      });
      updated++;
    } else {
      unchanged++;
    }
  }

  console.log(`\n✅ Summary:`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Unchanged: ${unchanged}`);
  console.log(`   Total: ${users.length}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
