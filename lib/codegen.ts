import { prisma } from "./prisma";

function baseCodeFromName(nombre?: string, apellido?: string): string {
  const n = (nombre || "").trim().toUpperCase();
  const a = (apellido || "").trim().toUpperCase();
  const nInitial = n ? n[0] : "";
  const aPart = a ? a.replace(/[^A-Z]/g, "").slice(0, 2) : "";
  const code = (nInitial + aPart) || (n.replace(/[^A-Z]/g, "").slice(0, 3)) || "UNK";
  return code;
}

export async function generateUniquePilotCode(nombre?: string, apellido?: string): Promise<string> {
  const base = baseCodeFromName(nombre, apellido);
  let candidate = base;
  for (let i = 0; i < 10; i++) {
    const exists = await prisma.user.findFirst({ where: { codigo: candidate } });
    if (!exists) return candidate;
    candidate = `${base}${i+1}`;
  }
  // last resort random suffix
  return `${base}${Math.floor(Math.random() * 90 + 10)}`;
}
