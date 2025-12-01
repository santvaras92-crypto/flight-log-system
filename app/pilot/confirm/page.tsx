import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function ConfirmFlightPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const getParam = (key: string) => {
    const val = searchParams[key];
    return Array.isArray(val) ? val[0] : val || "";
  };

  const fecha = getParam("fechaVuelo") || new Date().toISOString().split("T")[0];
  const pilotoCodigo = getParam("pilotoCodigo");
  const pilotoNombre = getParam("pilotoNombre");
  const cliente = getParam("cliente");
  const copiloto = getParam("copiloto");
  const detalle = getParam("detalle");
  const hobbsInicial = getParam("hobbsInicial");
  const hobbsFinal = getParam("hobbsFinal");
  const deltaHobbs = getParam("deltaHobbs") || (hobbsInicial && hobbsFinal ? String(parseFloat(hobbsFinal) - parseFloat(hobbsInicial)) : "");
  const tachInicial = getParam("tachInicial");
  const tachFinal = getParam("tachFinal");
  const deltaTach = getParam("deltaTach") || (tachInicial && tachFinal ? String(parseFloat(tachFinal) - parseFloat(tachInicial)) : "");

  const defaultAirplaneRate = "185000";
  const defaultInstructorRate = "30000";

  return (
    <div className="executive-content px-6 py-8">
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
        <h1 className="text-2xl font-bold text-white mb-4">Confirmación de Vuelo</h1>
        <p className="text-blue-100 mb-6">Revisa el resumen y ajusta las tarifas antes de confirmar.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-white/5 rounded-xl p-4">
            <h2 className="text-white font-semibold mb-3">Resumen</h2>
            <ul className="text-blue-100 space-y-1 text-sm">
              <li><span className="text-white">Fecha:</span> {fecha}</li>
              <li><span className="text-white">Piloto:</span> {pilotoNombre} ({pilotoCodigo})</li>
              <li><span className="text-white">Cliente:</span> {cliente || "-"}</li>
              <li><span className="text-white">Copiloto/Instructor:</span> {copiloto || "-"}</li>
              <li><span className="text-white">Detalle:</span> {detalle || "-"}</li>
              <li><span className="text-white">Hobbs I / F / Δ:</span> {hobbsInicial} / {hobbsFinal} / {deltaHobbs}</li>
              <li><span className="text-white">Tach I / F / Δ:</span> {tachInicial} / {tachFinal} / {deltaTach}</li>
            </ul>
          </div>
          <form action="/api/confirm-flight" method="post" className="bg-white/5 rounded-xl p-4">
            <h2 className="text-white font-semibold mb-3">Tarifas</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-blue-100 text-sm mb-1">Airplane Rate</label>
                <input name="airplaneRate" defaultValue={defaultAirplaneRate} className="w-full rounded-lg px-3 py-2 text-sm text-white bg-white/10 border border-white/20" />
              </div>
              <div>
                <label className="block text-blue-100 text-sm mb-1">Instructor/SP Rate</label>
                <input name="instructorRate" defaultValue={defaultInstructorRate} className="w-full rounded-lg px-3 py-2 text-sm text-white bg-white/10 border border-white/20" />
              </div>
            </div>
            {/* Hidden fields to pass original data */}
            {[
              ["fechaVuelo", fecha],
              ["pilotoCodigo", pilotoCodigo],
              ["pilotoNombre", pilotoNombre],
              ["cliente", cliente],
              ["copiloto", copiloto],
              ["detalle", detalle],
              ["hobbsInicial", hobbsInicial],
              ["hobbsFinal", hobbsFinal],
              ["deltaHobbs", deltaHobbs],
              ["tachInicial", tachInicial],
              ["tachFinal", tachFinal],
              ["deltaTach", deltaTach],
            ].map(([name, value]) => (
              <input key={String(name)} type="hidden" name={String(name)} value={String(value || "")} />
            ))}
            <div className="mt-4 flex gap-3">
              <button type="submit" className="btn-executive btn-executive-primary">Confirmar y Guardar en Excel</button>
              <Link href="/" className="btn-executive btn-executive-secondary">Cancelar</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
