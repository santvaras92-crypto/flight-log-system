"use server";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

type Payload = {
  nombre: string;
  apellido?: string;
  fechaNacimiento?: string; // ISO date string
  email: string;
  telefono?: string;
  licencia?: string;
  tarifa_hora?: number;
};

export async function registerPilot(payload: Payload): Promise<{ ok: boolean; error?: string }> {
  try {
    // Build display name (nombre + apellido)
    const displayName = [payload.nombre, payload.apellido].filter(Boolean).join(" ");
    // Minimal required fields based on current schema
    const user = await prisma.user.create({
      data: {
        nombre: displayName || payload.nombre,
        email: payload.email,
        rol: "PILOTO",
        saldo_cuenta: 0,
        tarifa_hora: payload.tarifa_hora ?? 170000,
        password: randomUUID(),
        // Optional: store extra fields in codigo if empty, otherwise ignore.
        // We avoid schema migrations here and focus on making the pilot visible in Dashboard.
        codigo: undefined,
      },
    });

    // Optionally, attach a note transaction with metadata (not required for dashboard visibility)
    // If future schema adds fields for telefono/licencia, we can migrate and backfill.

    return { ok: true };
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return { ok: false, error: "Ya existe un usuario con ese correo." };
    }
    return { ok: false, error: e?.message || "Error desconocido" };
  }
}
