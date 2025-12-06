import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: Obtener código de piloto por email
export async function GET(req: NextRequest) {
  try {
    const email = req.nextUrl.searchParams.get("email");
    
    if (!email) {
      return NextResponse.json({ error: "Email requerido" }, { status: 400 });
    }
    
    const user = await prisma.user.findUnique({
      where: { email },
      select: { 
        id: true,
        codigo: true, 
        nombre: true,
        rol: true 
      }
    });
    
    if (!user) {
      return NextResponse.json({ found: false });
    }
    
    return NextResponse.json({ 
      found: true,
      id: user.id,
      codigo: user.codigo,
      nombre: user.nombre,
      role: user.rol
    });
  } catch (error) {
    console.error("Error getting pilot code:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
