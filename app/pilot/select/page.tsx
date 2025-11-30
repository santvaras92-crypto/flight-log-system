import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function PilotSelectPage() {
  // Obtener todos los clientes únicos de los vuelos
  const clientes = await prisma.vuelo.findMany({
    select: {
      cliente: true,
    },
    distinct: ['cliente'],
    orderBy: {
      cliente: 'asc',
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        {/* Logo Header */}
        <div className="flex justify-center mb-8 bg-gradient-to-r from-[#003D82] to-[#0A2F5F] rounded-lg py-6">
          <img src="/LOGO_BLANCO.png" alt="CC-AQI" className="h-[6.48rem] w-auto" />
        </div>
        
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Selecciona tu Nombre
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Elige tu nombre para ver tu cuenta de vuelo
          </p>
        </div>

        <div className="bg-white shadow rounded-lg divide-y divide-gray-200">
          {clientes.map((item) => (
            <Link
              key={item.cliente}
              href={`/pilot/dashboard?codigo=${encodeURIComponent(item.cliente)}`}
              className="block px-6 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="text-lg font-medium text-gray-900">
                {item.cliente}
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            ← Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
