import { prisma } from '../lib/prisma';
(async () => {
  const model: any = (prisma as any).fuelLog ?? (prisma as any).fuel ?? null;
  if (!model) {
    console.log('models:', Object.keys(prisma).filter(k => !k.startsWith('_') && !k.startsWith('$')));
    await prisma.$disconnect();
    return;
  }
  const logs = await model.findMany({ orderBy: { fecha: 'asc' } });
  console.log('range:', logs[0].fecha.toISOString().slice(0,10), '→', logs[logs.length-1].fecha.toISOString().slice(0,10));
  const byMonth: Record<string, { l: number; m: number }> = {};
  for (const l of logs) {
    const k = l.fecha.toISOString().slice(0, 7);
    byMonth[k] = byMonth[k] || { l: 0, m: 0 };
    byMonth[k].l += Number(l.litros); byMonth[k].m += Number(l.monto);
  }
  for (const k of Object.keys(byMonth).sort()) {
    const v = byMonth[k];
    console.log(k, 'litros', v.l.toFixed(0), 'CLP/L', Math.round(v.m / v.l));
  }
  console.log('total records:', await model.count());
  await prisma.$disconnect();
})();
