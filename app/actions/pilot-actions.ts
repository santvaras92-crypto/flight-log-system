'use server';

import { prisma } from '@/lib/prisma';

/**
 * Normaliza texto removiendo acentos y convirtiendo a minúsculas
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remueve acentos
    .trim();
}

/**
 * Busca pilotos existentes en dos pasos:
 * 1) Por documento (match exacto)
 * 2) Por nombre similar (para sugerencias) - con normalización de acentos
 */
export async function searchExistingPilots(
  nombre: string,
  apellido: string,
  documento?: string
) {
  // PASO 1: Buscar por documento (match exacto - misma persona)
  if (documento && documento.trim()) {
    const byDocument = await prisma.user.findFirst({
      where: {
        documento: documento.trim(),
      },
      select: {
        id: true,
        nombre: true,
        codigo: true,
        email: true,
        documento: true,
        telefono: true,
        licencia: true,
        fechaNacimiento: true,
      }
    });

    if (byDocument) {
      return {
        exactMatch: true,
        matchType: 'document' as const,
        pilot: byDocument,
        suggestions: []
      };
    }
  }

  // PASO 2: Buscar por nombre similar (para sugerencias)
  const nombreNormalized = normalizeText(nombre);
  const apellidoNormalized = normalizeText(apellido);

  if (!nombreNormalized) {
    return { exactMatch: false, matchType: undefined, pilot: null, suggestions: [] };
  }

  // Obtener todos los pilotos y filtrar en memoria para manejar acentos correctamente
  const allPilots = await prisma.user.findMany({
    where: { rol: 'PILOTO' },
    select: {
      id: true,
      nombre: true,
      codigo: true,
      email: true,
      documento: true,
      telefono: true,
      licencia: true,
      fechaNacimiento: true,
    }
  });

  // Filtrar pilotos cuyo nombre normalizado contenga la búsqueda
  const suggestions = allPilots.filter(pilot => {
    const pilotNameNormalized = normalizeText(pilot.nombre);
    
    // Si hay apellido, AMBOS (nombre Y apellido) deben aparecer
    if (apellidoNormalized && nombreNormalized) {
      return pilotNameNormalized.includes(nombreNormalized) && 
             pilotNameNormalized.includes(apellidoNormalized);
    }
    
    // Si solo hay apellido, buscar apellido
    if (apellidoNormalized) {
      return pilotNameNormalized.includes(apellidoNormalized);
    }
    
    // Si solo hay nombre, buscar nombre
    if (nombreNormalized) {
      return pilotNameNormalized.includes(nombreNormalized);
    }
    
    return false;
  }).slice(0, 10); // Máximo 10 sugerencias

  return {
    exactMatch: false,
    matchType: 'name' as const,
    pilot: null,
    suggestions: suggestions
  };
}

/**
 * Crea o actualiza piloto
 * Si se proporciona pilotId, actualiza ese piloto específico
 */
export async function createOrUpdatePilot(data: {
  nombre: string;
  apellido: string;
  documento: string;
  email: string;
  telefono?: string;
  licencia?: string;
  fechaNacimiento?: string;
  pilotId?: number; // ID del piloto a actualizar (si el usuario seleccionó uno de las sugerencias)
}) {
  const fullName = `${data.nombre.trim()} ${data.apellido.trim()}`.trim();
  
  // Si se seleccionó un piloto existente (de las sugerencias), actualizar ese
  if (data.pilotId) {
    const updated = await prisma.user.update({
      where: { id: data.pilotId },
      data: {
        nombre: fullName,
        documento: data.documento,
        email: data.email,
        telefono: data.telefono || null,
        licencia: data.licencia || null,
        fechaNacimiento: data.fechaNacimiento ? new Date(data.fechaNacimiento) : null,
        // Mantiene el código original
      }
    });

    return {
      success: true,
      isUpdate: true,
      pilot: updated,
      message: `Piloto actualizado: ${updated.nombre} (Código: ${updated.codigo})`
    };
  }

  // Buscar si existe por documento
  const existing = await prisma.user.findFirst({
    where: { documento: data.documento }
  });

  if (existing) {
    // Actualizar piloto existente (mismo documento = misma persona)
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        nombre: fullName,
        email: data.email,
        telefono: data.telefono || null,
        licencia: data.licencia || null,
        fechaNacimiento: data.fechaNacimiento ? new Date(data.fechaNacimiento) : null,
      }
    });

    return {
      success: true,
      isUpdate: true,
      pilot: updated,
      message: `Piloto actualizado: ${updated.nombre} (Código: ${updated.codigo})`
    };
  }

  // Crear nuevo piloto
  const newCode = await generateUniquePilotCode(data.nombre, data.apellido);
  
  const newPilot = await prisma.user.create({
    data: {
      nombre: fullName,
      documento: data.documento,
      email: data.email,
      telefono: data.telefono || null,
      licencia: data.licencia || null,
      fechaNacimiento: data.fechaNacimiento ? new Date(data.fechaNacimiento) : null,
      codigo: newCode,
      rol: 'PILOT',
      tarifa_hora: 0,
      password: '', // Required field
    }
  });

  return {
    success: true,
    isUpdate: false,
    pilot: newPilot,
    message: `Nuevo piloto creado: ${newPilot.nombre} (Código: ${newPilot.codigo})`
  };
}

async function generateUniquePilotCode(nombre: string, apellido: string): Promise<string> {
  const firstInitial = nombre.trim()[0]?.toUpperCase() || 'X';
  const secondInitial = apellido.trim()[0]?.toUpperCase() || 'X';
  const initials = firstInitial + secondInitial;
  
  const existingCodes = await prisma.user.findMany({
    where: {
      codigo: { startsWith: initials }
    },
    select: { codigo: true }
  });

  if (existingCodes.length === 0) {
    return initials;
  }

  const codesSet = new Set(existingCodes.map(c => c.codigo));
  
  // Sufijos alfabéticos
  const suffixes = ['CO', 'CA', 'CH', 'CE', 'CI', 'CL', 'CR', 'CU', 'DA', 'DI', 'DO'];
  for (const suffix of suffixes) {
    const candidate = initials + suffix;
    if (!codesSet.has(candidate)) {
      return candidate;
    }
  }

  // Sufijos numéricos
  let counter = 1;
  while (codesSet.has(`${initials}${counter}`)) {
    counter++;
  }
  
  return `${initials}${counter}`;
}
