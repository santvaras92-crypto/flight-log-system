import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const get = (k: string) => {
      const v = formData.get(k);
      return v ? String(v) : "";
    };

    const fecha = get("fechaVuelo");
    const pilotoCodigo = get("pilotoCodigo");
    const pilotoNombre = get("pilotoNombre");
    const cliente = get("cliente");
    const copiloto = get("copiloto");
    const detalle = get("detalle");
    const hobbsI = get("hobbsInicial");
    const hobbsF = get("hobbsFinal");
    const dHobbs = get("deltaHobbs");
    const tachI = get("tachInicial");
    const tachF = get("tachFinal");
    const dTach = get("deltaTach");
    const airplaneRate = get("airplaneRate");
    const instructorRate = get("instructorRate");

    // Fetch current matrix
    const excel = await prisma.sheetState.findUnique({ where: { key: "flight_entries" } });
    if (!excel || !Array.isArray(excel.matrix)) {
      return NextResponse.json({ error: "Excel 'flight_entries' no disponible" }, { status: 500 });
    }

    const matrix = excel.matrix as any[][];
    if (matrix.length === 0) {
      return NextResponse.json({ error: "Matrix vacía en 'flight_entries'" }, { status: 500 });
    }

    // Compute totals (simple): airplaneRate * deltaHobbs + instructorRate
    const toNum = (s: string) => {
      if (!s) return 0;
      const n = parseFloat(s.replace(",", "."));
      return isNaN(n) ? 0 : n;
    };

    const rateA = toNum(airplaneRate);
    const rateI = toNum(instructorRate);
    const dH = toNum(dHobbs);
    const total = rateA * dH + rateI;

    // Row format: [Fecha, TACH I, TACH F, Δ TACH, HOBBS I, HOBBS F, Δ HOBBS,
    //              Piloto, Copiloto/Instructor, Cliente, Rate, Instructor/SP Rate,
    //              Total, AIRFRAME, ENGINE, PROPELLER, Detalle]
    const newRow = [
      fecha,
      tachI,
      tachF,
      dTach,
      hobbsI,
      hobbsF,
      dHobbs,
      pilotoNombre,
      copiloto || "",
      cliente || "",
      String(rateA),
      String(rateI),
      String(total),
      "", // AIRFRAME
      "", // ENGINE
      "", // PROPELLER
      detalle || "",
    ];

    // Insert at index 1 (first data row)
    matrix.splice(1, 0, newRow);

    await prisma.sheetState.update({
      where: { key: "flight_entries" },
      data: { matrix },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error confirm-flight:", err);
    return NextResponse.json({ error: "Error al confirmar vuelo" }, { status: 500 });
  }
}
