import { prisma } from '@/lib/prisma';
import RegisterClient from './ui/RegisterClient';

export const dynamic = 'force-dynamic';

export default async function RegistroPage() {
  const pilots = await prisma.user.findMany({
    select: { id: true, nombre: true, codigo: true },
    orderBy: [{ nombre: 'asc' }],
  });
  const opts = pilots.map(p => ({
    id: p.id,
    value: String(p.id),
    label: p.codigo ? `${p.nombre} (${p.codigo})` : p.nombre,
  }));
  return <RegisterClient pilots={opts} />;
}
