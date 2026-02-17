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
      
      // Fecha límite: solo recalcular automáticamente para vuelos >= 25 nov 2025
      const autoRecalcDate = new Date('2025-11-25');
      autoRecalcDate.setHours(0, 0, 0, 0);
      const flightDate = fecha || (flight.fecha ? new Date(flight.fecha) : null);
      if (flightDate) flightDate.setHours(0, 0, 0, 0);
      const shouldAutoRecalc = flightDate && flightDate >= autoRecalcDate;
      
      console.log('Flight update:', { id, flightDate: flightDate?.toISOString(), autoRecalcDate: autoRecalcDate.toISOString(), shouldAutoRecalc, tach_fin, tach_inicio });
      
      // Recalcular diff_tach si se editó tach_inicio o tach_fin (solo para vuelos >= 25 nov 2025)
      let diff_tach: number | null | undefined = undefined;
      if (up.diff_tach !== undefined) {
        diff_tach = up.diff_tach === '' ? null : Number(up.diff_tach);
      } else if (shouldAutoRecalc && (tach_inicio !== undefined || tach_fin !== undefined)) {
        // Usar el valor nuevo o el existente del vuelo
        const ti = tach_inicio !== undefined ? tach_inicio : (flight.tach_inicio ? Number(flight.tach_inicio) : 0);
        const tf = tach_fin !== undefined ? tach_fin : (flight.tach_fin ? Number(flight.tach_fin) : 0);
        if (ti !== null && tf !== null) {
          diff_tach = Number((tf - ti).toFixed(1));
        }
      }
      
      // Recalcular diff_hobbs si se editó hobbs_inicio o hobbs_fin (solo para vuelos >= 25 nov 2025)
      let diff_hobbs: number | null | undefined = undefined;
      if (up.diff_hobbs !== undefined) {
        diff_hobbs = up.diff_hobbs === '' ? null : Number(up.diff_hobbs);
      } else if (shouldAutoRecalc && (hobbs_inicio !== undefined || hobbs_fin !== undefined)) {
        // Usar el valor nuevo o el existente del vuelo
        const hi = hobbs_inicio !== undefined ? hobbs_inicio : (flight.hobbs_inicio ? Number(flight.hobbs_inicio) : 0);
        const hf = hobbs_fin !== undefined ? hobbs_fin : (flight.hobbs_fin ? Number(flight.hobbs_fin) : 0);
        if (hi !== null && hf !== null) {
          diff_hobbs = Number((hf - hi).toFixed(1));
        }
      }

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
        ...(up.aerodromoSalida !== undefined ? { aerodromoSalida: String(up.aerodromoSalida) } : {}),
        ...(up.aerodromoDestino !== undefined ? { aerodromoDestino: String(up.aerodromoDestino) } : {}),
        ...(up.airframe_hours !== undefined ? { airframe_hours: up.airframe_hours === '' ? null : Number(up.airframe_hours) } : {}),
        ...(up.engine_hours !== undefined ? { engine_hours: up.engine_hours === '' ? null : Number(up.engine_hours) } : {}),
        ...(up.propeller_hours !== undefined ? { propeller_hours: up.propeller_hours === '' ? null : Number(up.propeller_hours) } : {}),
      };

      // Handle tarifa and instructor_rate if explicitly edited
      if (up.tarifa !== undefined) {
        data.tarifa = up.tarifa === '' ? null : Number(up.tarifa);
      }
      if (up.instructor_rate !== undefined) {
        data.instructor_rate = up.instructor_rate === '' ? null : Number(up.instructor_rate);
      }

      // Recompute costo: if costo is explicitly set, use it. Otherwise recalculate.
      if (up.costo !== undefined) {
        data.costo = up.costo === '' ? null : Number(up.costo);
      } else {
        // Recalculate based on tarifa + instructor_rate if either was changed, or diff_hobbs changed
        const finalTarifa = data.tarifa !== undefined ? (data.tarifa || 0) : (flight.tarifa ? Number(flight.tarifa) : 0);
        const finalInstructorRate = data.instructor_rate !== undefined ? (data.instructor_rate || 0) : (flight.instructor_rate ? Number(flight.instructor_rate) : 0);
        const totalRate = finalTarifa + finalInstructorRate;
        
        if (totalRate > 0 && (up.tarifa !== undefined || up.instructor_rate !== undefined || data.diff_hobbs !== undefined)) {
          const horasVal = data.diff_hobbs ?? flight.diff_hobbs;
          if (horasVal != null) {
            data.costo = Number((totalRate * Number(horasVal)).toFixed(0));
          }
        } else if (data.diff_hobbs !== undefined) {
          // Fallback: preserve historical rate
          const pilot = flight.pilotoId ? await prisma.user.findUnique({ where: { id: flight.pilotoId } }) : null;
          const prevHoras = flight.diff_hobbs != null ? Number(flight.diff_hobbs) : 0;
          const prevCosto = flight.costo != null ? Number(flight.costo) : 0;
          const historicalRate = prevHoras > 0 ? (prevCosto / prevHoras) : Number(pilot?.tarifa_hora || 170000);
          const horasVal = data.diff_hobbs ?? flight.diff_hobbs;
          if (horasVal == null) {
            data.costo = null;
          } else {
            data.costo = Number((historicalRate * Number(horasVal)).toFixed(0));
          }
        }
      }

      await prisma.flight.update({ where: { id }, data });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Error updating flights:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Error desconocido" }, { status: 500 });
  }
}
