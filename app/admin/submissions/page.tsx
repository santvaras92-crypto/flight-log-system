import { prisma } from "@/lib/prisma";
import AdminSubmissions from "./submissions-client";
import DownloadDashboardButton from "./download-button";

export const revalidate = 0;

export default async function AdminSubmissionsPage() {
  const submissions = await prisma.flightSubmission.findMany({
    include: {
      imageLogs: true,
      piloto: true,
      aircraft: true,
      flight: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Panel de Revisiones OCR</h1>
          <p className="text-gray-600 mt-2">Últimas 50 submissions. Filtra y aprueba manualmente valores cuando la confianza fue baja.</p>
        </div>
        <div className="flex gap-2">
          <a href="/admin/dashboard" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition">Ver Dashboard</a>
          <DownloadDashboardButton />
        </div>
      </div>
      <AdminSubmissions initialData={submissions} />
    </div>
  );
}
