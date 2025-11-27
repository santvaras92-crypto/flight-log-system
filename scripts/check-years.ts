import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const flights = await prisma.$queryRaw`
    SELECT strftime('%Y', fecha) as año, COUNT(*) as cantidad 
    FROM Flight 
    GROUP BY año 
    ORDER BY año
  `;
  
  console.log('\nVuelos por año:');
  console.table(flights);
  
  const total = await prisma.flight.count();
  console.log(`\nTotal vuelos: ${total}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
