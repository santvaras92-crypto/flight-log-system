import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: { key: string } }
) {
  const { key } = params;
  
  try {
    const state = await prisma.sheetState.findUnique({ where: { key } });
    
    if (state) {
      return NextResponse.json({ 
        matrix: state.matrix, 
        namedExpressions: state.namedExpressions 
      });
    }
    
    // Si no existe, devuelve estructura inicial según key
    const initial = getInitialMatrix(key);
    return NextResponse.json(initial);
  } catch (error) {
    console.error('Error fetching grid:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { key: string } }
) {
  const { key } = params;
  
  try {
    const { matrix, formulas, namedExpressions } = await req.json();

    await prisma.sheetState.upsert({
      where: { key },
      update: { matrix, formulas, namedExpressions },
      create: { key, matrix, formulas, namedExpressions },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error saving grid:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

function getInitialMatrix(key: string) {
  switch (key) {
    case "flight_entries":
      return {
        matrix: [
          ["Fecha","Hobbs Ini","Hobbs Fin","Δ Hobbs","Tach Ini","Tach Fin","Δ Tach","Block","Cliente","Ruta","Costo Avión","Costo Instructor","Obs"],
        ],
        namedExpressions: [
          { name: "rate", expression: "185000" }, 
          { name: "instrRate", expression: "30000" }
        ],
      };
    case "pilot_directory":
      return {
        matrix: [["Código","Nombre","Email","Teléfono","Estado","Observaciones"]],
        namedExpressions: [],
      };
    case "pilots_account":
      return {
        matrix: [["Fecha","Tipo","Descripción","Monto","Balance","Observaciones"]],
        namedExpressions: [],
      };
    case "maintenance":
      return {
        matrix: [["Componente","Horas Acumuladas","TBO","Horas Restantes","Next Inspection"]],
        namedExpressions: [{ name: "currentHobbs", expression: "2058" }],
      };
    default:
      return { matrix: [[""]], namedExpressions: [] };
  }
}
