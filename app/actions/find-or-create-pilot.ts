// rebuild trigger 1765397735
'use server';

import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';

export async function findOrCreatePilotByCode(code: string): Promise<number> {
  const upperCode = code.toUpperCase();
  
  // First, try to find existing user by code
  let user = await prisma.user.findFirst({
    where: { codigo: upperCode }
  });
  
  if (user) {
    return user.id;
  }
  
  // If not found, read CSV to get pilot name
  let pilotName = upperCode; // fallback
  try {
    const csvPath = path.join(process.cwd(), "Base de dato pilotos", "Base de dato pilotos.csv");
    if (fs.existsSync(csvPath)) {
      const content = fs.readFileSync(csvPath, "utf-8");
      const lines = content.split("\n").filter(l => l.trim());
      const entry = lines.slice(1).map(l => {
        const [csvCode, name] = l.split(";");
        return { code: (csvCode || '').trim().toUpperCase(), name: (name || '').trim() };
      }).find(e => e.code === upperCode);
      
      if (entry) {
        pilotName = entry.name;
      }
    }
  } catch (e) {
    console.error('Error reading pilot CSV:', e);
  }
  
  // Create new user
  user = await prisma.user.create({
    data: {
      codigo: upperCode,
      nombre: pilotName,
      email: `${upperCode.toLowerCase()}@piloto.local`,
      password: 'placeholder', // Temporary password for CSV pilots
      rol: 'PILOTO',
      tarifa_hora: 175,
    }
  });
  
  return user.id;
}
