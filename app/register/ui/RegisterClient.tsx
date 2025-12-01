'use client';

import { useMemo, useState } from 'react';
import { createFlightSubmission } from '@/app/actions/create-flight-submission';
import { createFuel } from '@/app/actions/create-fuel';
import { createDeposit } from '@/app/actions/create-deposit';

type PilotOpt = { id: number; value: string; label: string };

export default function RegisterClient({ pilots }: { pilots: PilotOpt[] }) {
  const [pilotId, setPilotId] = useState<number | null>(null);
  const [mode, setMode] = useState<'flight' | 'fuel' | 'deposit'>('flight');
  const [submitting, setSubmitting] = useState(false);
  const selectedPilot = useMemo(() => pilots.find(p => p.id === (pilotId ?? -1)), [pilotId, pilots]);

  const onSubmit = async (formData: FormData) => {
    if (!pilotId) return;
    setSubmitting(true);
    try {
      const fecha = String(formData.get('fecha'));
      if (mode === 'flight') {
        await createFlightSubmission({
          pilotoId: pilotId,
          fecha,
          hobbs_fin: Number(formData.get('hobbs_fin') || '') || NaN,
          tach_fin: Number(formData.get('tach_fin') || '') || NaN,
          copiloto: String(formData.get('copiloto') || '') || undefined,
          detalle: String(formData.get('detalle') || '') || undefined,
        });
      } else if (mode === 'fuel') {
        const file = formData.get('file') as File | null;
        await createFuel({
          pilotoId: pilotId,
          fecha,
          litros: Number(formData.get('litros') || 0),
          monto: Number(formData.get('monto') || 0),
          detalle: String(formData.get('detalle') || '') || undefined,
          file,
        });
      } else {
        const file = formData.get('file') as File | null;
        await createDeposit({
          pilotoId: pilotId,
          fecha,
          monto: Number(formData.get('monto') || 0),
          detalle: String(formData.get('detalle') || '') || undefined,
          file,
        });
      }
      alert('Registro enviado a validación.');
      (document.getElementById('registro-form') as HTMLFormElement)?.reset();
    } catch (e) {
      console.error(e);
      alert('Hubo un error guardando el registro.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="rounded-2xl border shadow-sm bg-white">
        <div className="p-4 sm:p-6 border-b">
          <h2 className="text-xl sm:text-2xl font-semibold">Registro</h2>
          <p className="text-sm mt-1">Selecciona piloto y tipo de registro.</p>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col text-sm">
              <span className="mb-1 font-medium">Piloto</span>
              <select
                className="rounded-xl border px-3 py-3 bg-slate-50"
                value={pilotId ?? ''}
                onChange={e => setPilotId(Number(e.target.value))}
              >
                <option value="" disabled>Selecciona piloto</option>
                {pilots.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>

            <label className="flex flex-col text-sm">
              <span className="mb-1 font-medium">Tipo</span>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => setMode('flight')}
                  className={`rounded-lg px-3 py-2 border ${mode==='flight'?'bg-blue-600 text-white':'bg-slate-50'}`}>Vuelo</button>
                <button type="button" onClick={() => setMode('fuel')}
                  className={`rounded-lg px-3 py-2 border ${mode==='fuel'?'bg-amber-600 text-white':'bg-slate-50'}`}>Combustible</button>
                <button type="button" onClick={() => setMode('deposit')}
                  className={`rounded-lg px-3 py-2 border ${mode==='deposit'?'bg-emerald-600 text-white':'bg-slate-50'}`}>Depósito</button>
              </div>
            </label>
          </div>

          <form id="registro-form" action={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="flex flex-col text-sm">
                <span className="mb-1 font-medium">Fecha</span>
                <input name="fecha" type="date" required className="rounded-xl border px-3 py-3 bg-slate-50" />
              </label>
              {mode === 'flight' && (
                <div className="text-sm text-slate-600 flex items-end">Avión: <span className="ml-1 font-medium">CC-AQI</span></div>
              )}
            </div>

            {mode === 'flight' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <label className="flex flex-col text-sm">
                    <span className="mb-1">Hobbs F</span>
                    <input name="hobbs_fin" type="number" step="0.1" required className="rounded-xl border px-3 py-3 bg-slate-50" />
                  </label>
                  <label className="flex flex-col text-sm">
                    <span className="mb-1">Tach F</span>
                    <input name="tach_fin" type="number" step="0.1" required className="rounded-xl border px-3 py-3 bg-slate-50" />
                  </label>
                  <label className="flex flex-col text-sm">
                    <span className="mb-1">Copiloto (opcional)</span>
                    <input name="copiloto" className="rounded-xl border px-3 py-3 bg-slate-50" />
                  </label>
                </div>
                <label className="flex flex-col text-sm">
                  <span className="mb-1">Detalle (opcional)</span>
                  <input name="detalle" className="rounded-xl border px-3 py-3 bg-slate-50" />
                </label>
                <p className="text-xs text-slate-500">Tras enviar, pasa a Validación para ingresar Airplane Rate e Instructor/SP Rate.</p>
              </>
            )}

            {mode === 'fuel' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <label className="flex flex-col text-sm">
                    <span className="mb-1">Litros</span>
                    <input name="litros" type="number" step="0.001" required className="rounded-xl border px-3 py-3 bg-slate-50" />
                  </label>
                  <label className="flex flex-col text-sm">
                    <span className="mb-1">Monto</span>
                    <input name="monto" type="number" step="0.001" required className="rounded-xl border px-3 py-3 bg-slate-50" />
                  </label>
                  <label className="flex flex-col text-sm">
                    <span className="mb-1">Foto boleta</span>
                    <input name="file" type="file" accept="image/*" required className="rounded-xl border px-3 py-2 bg-slate-50" />
                  </label>
                </div>
                <label className="flex flex-col text-sm">
                  <span className="mb-1">Detalle (opcional)</span>
                  <input name="detalle" className="rounded-xl border px-3 py-3 bg-slate-50" />
                </label>
              </>
            )}

            {mode === 'deposit' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="flex flex-col text-sm">
                    <span className="mb-1">Monto</span>
                    <input name="monto" type="number" step="0.001" required className="rounded-xl border px-3 py-3 bg-slate-50" />
                  </label>
                  <label className="flex flex-col text-sm">
                    <span className="mb-1">Comprobante (imagen)</span>
                    <input name="file" type="file" accept="image/*" required className="rounded-xl border px-3 py-2 bg-slate-50" />
                  </label>
                </div>
                <label className="flex flex-col text-sm">
                  <span className="mb-1">Detalle (opcional)</span>
                  <input name="detalle" className="rounded-xl border px-3 py-3 bg-slate-50" />
                </label>
              </>
            )}

            <div className="pt-2">
              <button type="submit" disabled={!pilotId || submitting} className="rounded-xl px-4 py-3 bg-blue-600 text-white w-full sm:w-auto disabled:opacity-60">
                {submitting ? 'Enviando...' : 'Enviar a validación'}
              </button>
            </div>
          </form>

          {selectedPilot && (
            <p className="text-xs text-slate-500">Piloto seleccionado: <span className="font-medium">{selectedPilot.label}</span></p>
          )}
        </div>
      </div>
    </div>
  );
}
