// rebuild trigger 1765397735
"use server";
import { prisma } from "@/lib/prisma";
import bcrypt from 'bcryptjs';
import { generateUniquePilotCode } from "@/lib/codegen";
import fs from 'fs';
import path from 'path';

type Payload = {
  nombre: string;
  apellido?: string;
  fecha_nacimiento?: string; // ISO date string
  email: string;
  telefono?: string;
  licencia?: string;
  tarifa_hora?: number;
};

export async function registerPilot(payload: Payload): Promise<{ ok: boolean; error?: string }> {
  try {
    // Build display name (nombre + apellido)
    const displayName = [payload.nombre, payload.apellido].filter(Boolean).join(" ");
    const hashedPassword = await bcrypt.hash('aqi', 10);
    const codigo = await generateUniquePilotCode(payload.nombre, payload.apellido);
    
    const user = await prisma.user.create({
      data: {
        nombre: displayName || payload.nombre,
        email: payload.email,
        rol: "PILOTO",
        saldo_cuenta: 0,
        tarifa_hora: payload.tarifa_hora ?? 170000,
        password: hashedPassword, // Default password: aqi
        codigo: codigo,
      },
    });

    // Agregar al CSV para que aparezca en la lista desplegable
    try {
      const csvPath = path.join(process.cwd(), 'Base de dato pilotos', 'Base de dato pilotos.csv');
      fs.appendFileSync(csvPath, `\n${codigo};${displayName || payload.nombre}`, 'utf-8');
    } catch (csvError) {
      console.error('Error updating pilots CSV:', csvError);
    }

    return { ok: true };
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return { ok: false, error: "Ya existe un usuario con ese correo." };
    }
    return { ok: false, error: e?.message || "Error desconocido" };
  }
}
