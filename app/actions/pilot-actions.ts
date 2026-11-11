'use server';

import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { generateUniquePilotCode } from '@/lib/codegen';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { revalidatePath } from 'next/cache';

type RegistrationInput = {
  nombre: string;
  apellido?: string;
  documento?: string;
  tipoDocumento?: string;
  email: string;
  telefono?: string;
  licencia?: string;
  fechaNacimiento?: string;
};

/** Agrega un piloto al CSV de pilotos (lista desplegable del formulario de vuelos). */
function appendPilotToCSV(codigo: string, nombre: string): void {
  try {
    const csvPath = path.join(process.cwd(), 'Base de dato pilotos', 'Base de dato pilotos.csv');
    fs.appendFileSync(csvPath, `\n${codigo};${nombre}`, 'utf-8');
  } catch (error) {
    // No bloquea la creación del piloto
    console.error('Error al agregar piloto al CSV:', error);
  }
}

function clean(v?: string | null): string | null {
  const t = (v ?? '').trim();
  return t ? t : null;
}

function parseBirth(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** Escapa HTML: los datos vienen de un formulario público. */
function esc(v?: string | null): string {
  return (v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Avisa al admin de una nueva solicitud (Resend). Nunca lanza: no debe bloquear el registro. */
async function sendPilotRegistrationEmail(reg: {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string | null;
  licencia: string | null;
  tipoDocumento: string | null;
  documento: string | null;
}) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.log('RESEND_API_KEY no configurada, omitiendo correo de nueva inscripción');
    return;
  }

  const fullName = `${reg.nombre} ${reg.apellido}`.trim();
  const baseUrl = process.env.NEXTAUTH_URL || 'https://flight-log-system-production.up.railway.app';
  const html = `
    <h2>Nueva Solicitud de Inscripción de Piloto - CC-AQI</h2>
    <p><strong>Nombre:</strong> ${esc(fullName)}</p>
    <p><strong>Correo:</strong> ${esc(reg.email)}</p>
    <p><strong>${reg.tipoDocumento === 'pasaporte' ? 'Pasaporte' : 'RUT'}:</strong> ${esc(reg.documento) || '-'}</p>
    <p><strong>Teléfono:</strong> ${esc(reg.telefono) || '-'}</p>
    <p><strong>Licencia:</strong> ${esc(reg.licencia) || '-'}</p>
    <hr/>
    <p>Revísala en el Centro de Validación (pestaña Pilotos): el sistema te indicará si se parece a algún piloto ya inscrito y podrás actualizarlo o crear uno nuevo.</p>
    <p><a href="${baseUrl}/admin/validacion">Ver Validaciones Pendientes</a></p>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'CC-AQI Flight Log <onboarding@resend.dev>',
        to: ['santvaras92@gmail.com'],
        subject: `Nueva inscripción de piloto - ${fullName}`,
        html,
      }),
    });
    if (!response.ok) {
      console.error('Error enviando correo de inscripción:', await response.text());
    }
  } catch (error) {
    console.error('Error enviando correo de inscripción:', error);
  }
}

/**
 * PÚBLICO (sin sesión): el formulario /pilots/new solo crea una solicitud pendiente.
 * No consulta ni modifica pilotos existentes; eso lo decide el admin en /admin/validacion.
 */
export async function submitPilotRegistration(
  data: RegistrationInput
): Promise<{ success: boolean; message: string }> {
  const nombre = (data.nombre || '').trim();
  const email = (data.email || '').trim().toLowerCase();
  if (!nombre) return { success: false, message: 'El nombre es obligatorio' };
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return { success: false, message: 'Correo inválido' };
  }
  if (nombre.length > 100 || email.length > 150) {
    return { success: false, message: 'Datos demasiado largos' };
  }

  // Evita solicitudes repetidas mientras la anterior sigue pendiente
  const dup = await prisma.pilotRegistration.findFirst({
    where: { estado: 'PENDIENTE', email },
    select: { id: true },
  });
  if (dup) {
    return {
      success: true,
      message: 'Ya tenemos una solicitud pendiente con este correo. Un administrador la revisará pronto.',
    };
  }

  const created = await prisma.pilotRegistration.create({
    data: {
      nombre,
      apellido: (data.apellido || '').trim(),
      email,
      telefono: clean(data.telefono),
      licencia: clean(data.licencia),
      fechaNacimiento: parseBirth(data.fechaNacimiento),
      tipoDocumento: clean(data.tipoDocumento),
      documento: clean(data.documento),
    },
  });

  await sendPilotRegistrationEmail(created);

  return {
    success: true,
    message: 'Solicitud enviada. Un administrador la revisará y te avisará cuando tu perfil esté listo.',
  };
}

/**
 * ADMIN: resuelve una solicitud.
 *  - pilotId presente  → actualiza ese piloto con los datos de la solicitud (solo campos no vacíos)
 *  - pilotId ausente   → crea un piloto nuevo (código único, contraseña inicial "aqi")
 */
export async function approvePilotRegistration(
  registrationId: number,
  pilotId?: number
): Promise<{ success: boolean; message: string }> {
  await requireAdmin();

  const reg = await prisma.pilotRegistration.findUnique({ where: { id: registrationId } });
  if (!reg) return { success: false, message: 'Solicitud no encontrada' };
  if (reg.estado !== 'PENDIENTE') return { success: false, message: 'La solicitud ya fue resuelta' };

  const fullName = `${reg.nombre} ${reg.apellido}`.trim();
  const email = reg.email.trim().toLowerCase();

  try {
    let userId: number;
    let message: string;

    if (pilotId) {
      const existing = await prisma.user.findUnique({ where: { id: pilotId } });
      if (!existing) return { success: false, message: 'El piloto seleccionado no existe' };

      const updated = await prisma.user.update({
        where: { id: pilotId },
        data: {
          nombre: fullName || existing.nombre,
          email,
          ...(reg.documento ? { documento: reg.documento } : {}),
          ...(reg.tipoDocumento ? { tipoDocumento: reg.tipoDocumento } : {}),
          ...(reg.telefono ? { telefono: reg.telefono } : {}),
          ...(reg.licencia ? { licencia: reg.licencia } : {}),
          ...(reg.fechaNacimiento ? { fechaNacimiento: reg.fechaNacimiento } : {}),
        },
      });
      userId = updated.id;
      message = `Piloto actualizado: ${updated.nombre} (${updated.codigo})`;
    } else {
      const codigo = await generateUniquePilotCode(reg.nombre, reg.apellido);
      const created = await prisma.user.create({
        data: {
          nombre: fullName,
          codigo,
          email,
          documento: reg.documento,
          tipoDocumento: reg.tipoDocumento,
          telefono: reg.telefono,
          licencia: reg.licencia,
          fechaNacimiento: reg.fechaNacimiento,
          rol: 'PILOTO',
          tarifa_hora: 0,
          password: await bcrypt.hash('aqi', 10),
        },
      });
      userId = created.id;
      appendPilotToCSV(codigo, fullName);
      message = `Piloto creado: ${created.nombre} (${created.codigo})`;
    }

    await prisma.pilotRegistration.update({
      where: { id: registrationId },
      data: { estado: 'APROBADO', resolvedUserId: userId, resolvedAt: new Date() },
    });

    revalidatePath('/admin/validacion');
    revalidatePath('/admin/dashboard');
    return { success: true, message };
  } catch (e: any) {
    // P2002 = violación de unicidad (email o código ya usados por otro piloto)
    if (e?.code === 'P2002') {
      return {
        success: false,
        message: 'Ese correo ya pertenece a otro piloto. Elige "Actualizar" sobre ese piloto.',
      };
    }
    console.error('[approvePilotRegistration]', e);
    return { success: false, message: e?.message || 'Error al procesar la solicitud' };
  }
}

/** ADMIN: descarta una solicitud sin crear ni modificar pilotos. */
export async function rejectPilotRegistration(
  registrationId: number
): Promise<{ success: boolean; message: string }> {
  await requireAdmin();
  const reg = await prisma.pilotRegistration.findUnique({ where: { id: registrationId } });
  if (!reg) return { success: false, message: 'Solicitud no encontrada' };
  await prisma.pilotRegistration.update({
    where: { id: registrationId },
    data: { estado: 'RECHAZADO', resolvedAt: new Date() },
  });
  revalidatePath('/admin/validacion');
  return { success: true, message: 'Solicitud rechazada' };
}
