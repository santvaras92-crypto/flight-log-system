import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    return NextResponse.json({ user: null });
  }

  // Get full user data including rol
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      nombre: true,
      email: true,
      rol: true,
      codigo: true,
    },
  });

  return NextResponse.json({
    user: user ? {
      ...session.user,
      rol: user.rol,
      codigo: user.codigo,
    } : null,
  });
}
