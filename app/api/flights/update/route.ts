import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { updates } = body as { updates: Array<any> };
    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ ok: false, error: "No hay cambios para guardar" }, { status: 400 });
    }

    for (const up of updates) {
      const id = Number(up.id);
      if (!id) continue;

      // Fetch existing flight and related pilot to compute cost
      const flight = await prisma.flight.findUnique({ where: { id } });
      if (!flight) continue;

      // Prepare fields (permit nulls and explicit diffs)
      const fecha = up.fecha ? new Date(up.fecha) : undefined;
      const tach_inicio = up.tach_inicio === '' ? null : (up.tach_inicio !== undefined ? Number(up.tach_inicio) : undefined);
      const tach_fin = up.tach_fin === '' ? null : (up.tach_fin !== undefined ? Number(up.tach_fin) : undefined);
      const hobbs_inicio = up.hobbs_inicio === '' ? null : (up.hobbs_inicio !== undefined ? Number(up.hobbs_inicio) : undefined);
      const hobbs_fin = up.hobbs_fin === '' ? null : (up.hobbs_fin !== undefined ? Number(up.hobbs_fin) : undefined);
      const diff_tach = up.diff_tach === '' ? null : (up.diff_tach !== undefined ? Number(up.diff_tach) : (tach_inicio !== undefined && tach_fin !== undefined ? Number((Number(tach_fin ?? 0) - Number(tach_inicio ?? 0)).toFixed(1)) : undefined));
      const diff_hobbs = up.diff_hobbs === '' ? null : (up.diff_hobbs !== undefined ? Number(up.diff_hobbs) : (hobbs_inicio !== undefined && hobbs_fin !== undefined ? Number((Number(hobbs_fin ?? 0) - Number(hobbs_inicio ?? 0)).toFixed(1)) : undefined));

      // Update mutable text fields
      const data: any = {
        ...(fecha ? { fecha } : {}),
        ...(tach_inicio !== undefined ? { tach_inicio } : {}),
        ...(tach_fin !== undefined ? { tach_fin } : {}),
        ...(diff_tach !== undefined ? { diff_tach } : {}),
        ...(hobbs_inicio !== undefined ? { hobbs_inicio } : {}),
        ...(hobbs_fin !== undefined ? { hobbs_fin } : {}),
        ...(diff_hobbs !== undefined ? { diff_hobbs } : {}),
        ...(up.copiloto !== undefined ? { copiloto: String(up.copiloto) } : {}),
        ...(up.cliente !== undefined ? { cliente: String(up.cliente) } : {}),
        ...(up.instructor !== undefined ? { instructor: String(up.instructor) } : {}),
        ...(up.detalle !== undefined ? { detalle: String(up.detalle) } : {}),
      };

      // Recompute costo preserving the historical per-flight rate from CSV when possible
      // Determine previous effective rate from the stored flight (fallback to pilot's tarifa_hora)
      const pilot = flight.pilotoId ? await prisma.user.findUnique({ where: { id: flight.pilotoId } }) : null;
      const prevHoras = flight.diff_hobbs != null ? Number(flight.diff_hobbs) : 0;
      const prevCosto = flight.costo != null ? Number(flight.costo) : 0;
      const historicalRate = prevHoras > 0 ? (prevCosto / prevHoras) : Number(pilot?.tarifa_hora || 170000);
      const horasVal = data.diff_hobbs ?? diff_hobbs ?? flight.diff_hobbs;
      if (horasVal == null) {
        data.costo = null;
      } else {
        const horas = Number(horasVal) || 0;
        data.costo = Number((historicalRate * horas).toFixed(0));
      }

      await prisma.flight.update({ where: { id }, data });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Error updating flights:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Error desconocido" }, { status: 500 });
  }
}
