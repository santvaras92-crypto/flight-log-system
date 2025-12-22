"use client";

import { useState } from "react";
import ImagePreviewModal from "@/app/components/ImagePreviewModal";
import { deleteFuelLog } from "@/app/actions/delete-fuel-log";

interface FuelLog {
  id: number;
  fecha: Date;
  litros: number | { toNumber(): number };
  monto: number | { toNumber(): number };
  detalle: string | null;
  imageUrl: string | null;
  userId: number;
  User: { nombre: string; codigo: string | null } | null;
}

interface FuelChargesTableProps {
  logs: FuelLog[];
}

function getImageUrl(imageUrl: string): string {
  if (imageUrl.startsWith('/api/uploads/fuel-image')) return imageUrl;
  if (imageUrl.startsWith('http')) return imageUrl;
  if (imageUrl.startsWith('/uploads/fuel/')) {
    return `/api/uploads/fuel-image?key=${encodeURIComponent(`fuel/${imageUrl.split('/').pop()}`)}`;
  }
  return imageUrl;
}

export default function FuelChargesTable({ logs }: FuelChargesTableProps) {
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-200 text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 border">ID</th>
              <th className="px-3 py-2 border">Fecha</th>
              <th className="px-3 py-2 border">Piloto</th>
              <th className="px-3 py-2 border">Litros</th>
              <th className="px-3 py-2 border">Monto</th>
              <th className="px-3 py-2 border">Detalle</th>
              <th className="px-3 py-2 border">Boleta</th>
              <th className="px-3 py-2 border">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => {
              const litros = typeof l.litros === 'object' && 'toNumber' in l.litros 
                ? l.litros.toNumber() 
                : Number(l.litros);
              const monto = typeof l.monto === 'object' && 'toNumber' in l.monto 
                ? l.monto.toNumber() 
                : Number(l.monto);
              
              return (
                <tr key={l.id}>
                  <td className="px-3 py-2 border">{l.id}</td>
                  <td className="px-3 py-2 border">{new Date(l.fecha).toLocaleDateString()}</td>
                  <td className="px-3 py-2 border">
                    {l.User ? `${l.User.nombre} (${l.User.codigo || '#' + l.userId})` : `#${l.userId}`}
                  </td>
                  <td className="px-3 py-2 border">{litros}</td>
                  <td className="px-3 py-2 border">${monto.toLocaleString()}</td>
                  <td className="px-3 py-2 border">{l.detalle || ''}</td>
                  <td className="px-3 py-2 border">
                    {l.imageUrl ? (
                      <button
                        onClick={() => setImageModalUrl(getImageUrl(l.imageUrl!))}
                        className="underline text-blue-600 hover:text-blue-800"
                      >
                        Ver
                      </button>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-3 py-2 border">
                    <form action={deleteFuelLog}>
                      <input type="hidden" name="fuelLogId" value={l.id} />
                      <button 
                        type="submit" 
                        className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                      >
                        Eliminar
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Image Preview Modal */}
      <ImagePreviewModal
        imageUrl={imageModalUrl}
        onClose={() => setImageModalUrl(null)}
        alt="Boleta de combustible"
      />
    </>
  );
}
