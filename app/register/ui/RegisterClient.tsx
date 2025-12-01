'use client';

import { useMemo, useState } from 'react';
import { createFlightSubmission } from '@/app/actions/create-flight-submission';
import { createFuel } from '@/app/actions/create-fuel';
import { createDeposit } from '@/app/actions/create-deposit';
import { findOrCreatePilotByCode } from '@/app/actions/find-or-create-pilot';

type PilotOpt = { id: string | number; value: string; label: string };

interface LastCounters {
  hobbs: number | null;
  tach: number | null;
}

interface LastComponents {
  airframe: number | null;
  engine: number | null;
  propeller: number | null;
}

export default function RegisterClient({ 
  pilots,
  lastCounters = { hobbs: null, tach: null },
  lastComponents = { airframe: null, engine: null, propeller: null }
}: { 
  pilots: PilotOpt[];
  lastCounters?: LastCounters;
  lastComponents?: LastComponents;
}) {
  const [pilotValue, setPilotValue] = useState<string>('');
  const [mode, setMode] = useState<'flight' | 'fuel' | 'deposit'>('flight');
  const [submitting, setSubmitting] = useState(false);
  
  // Flight form fields
  const [fecha, setFecha] = useState<string>(new Date().toISOString().split('T')[0]);
  const [hobbsFin, setHobbsFin] = useState<string>('');
  const [tachFin, setTachFin] = useState<string>('');
  const [copiloto, setCopiloto] = useState<string>('');
  const [detalle, setDetalle] = useState<string>('');
  
  const selectedPilot = useMemo(() => pilots.find(p => p.value === pilotValue), [pilotValue, pilots]);

  // Calcular deltas en tiempo real para modo flight
  const deltaHobbs = useMemo(() => {
    if (mode !== 'flight' || !hobbsFin || lastCounters.hobbs === null) return null;
    const val = parseFloat(hobbsFin) - lastCounters.hobbs;
    return isNaN(val) || val <= 0 ? null : Number(val.toFixed(1));
  }, [mode, hobbsFin, lastCounters.hobbs]);

  const deltaTach = useMemo(() => {
    if (mode !== 'flight' || !tachFin || lastCounters.tach === null) return null;
    const val = parseFloat(tachFin) - lastCounters.tach;
    return isNaN(val) || val <= 0 ? null : Number(val.toFixed(1));
  }, [mode, tachFin, lastCounters.tach]);

  // Validar ratio entre deltaHobbs y deltaTach (esperado: ~1.3x)
  const hobbsTachRatio = useMemo(() => {
    if (deltaHobbs === null || deltaTach === null || deltaTach === 0) return null;
    return deltaHobbs / deltaTach;
  }, [deltaHobbs, deltaTach]);

  // El ratio esperado es 1.3 ± 0.2 (rango: 1.1 - 1.5)
  const ratioWarning = useMemo(() => {
    if (hobbsTachRatio === null) return null;
    const expectedRatio = 1.3;
    const tolerance = 0.2;
    const minRatio = expectedRatio - tolerance;
    const maxRatio = expectedRatio + tolerance;
    
    if (hobbsTachRatio < minRatio || hobbsTachRatio > maxRatio) {
      return {
        ratio: hobbsTachRatio,
        expected: expectedRatio,
        outOfRange: true
      };
    }
    return null;
  }, [hobbsTachRatio]);

  // Calcular nuevas horas de componentes para vista previa
  const newComponents = useMemo(() => {
    if (!deltaTach) return null;
    return {
      airframe: lastComponents.airframe !== null ? lastComponents.airframe + deltaTach : null,
      engine: lastComponents.engine !== null ? lastComponents.engine + deltaTach : null,
      propeller: lastComponents.propeller !== null ? lastComponents.propeller + deltaTach : null,
    };
  }, [deltaTach, lastComponents]);

  const onSubmit = async (formData: FormData) => {
    if (!pilotValue) return;
    setSubmitting(true);
    try {
      // Resolve pilot ID (if it's a code from CSV, find or create the user)
      let resolvedPilotId: number;
      if (isNaN(Number(pilotValue))) {
        // It's a code, need to find or create
        resolvedPilotId = await findOrCreatePilotByCode(pilotValue);
      } else {
        resolvedPilotId = Number(pilotValue);
      }
      
      if (mode === 'flight') {
        console.log('Creating flight submission:', { resolvedPilotId, fecha, hobbsFin, tachFin });
        const result = await createFlightSubmission({
          pilotoId: resolvedPilotId,
          fecha,
          hobbs_fin: Number(hobbsFin) || NaN,
          tach_fin: Number(tachFin) || NaN,
          copiloto: copiloto || undefined,
          detalle: detalle || undefined,
        });
        console.log('Flight submission created:', result);
      } else if (mode === 'fuel') {
        const file = formData.get('file') as File | null;
        await createFuel({
          pilotoId: resolvedPilotId,
          fecha: fecha, // Use state instead of formData
          litros: Number(formData.get('litros') || 0),
          monto: Number(formData.get('monto') || 0),
          detalle: String(formData.get('detalle') || '') || undefined,
          file,
        });
      } else {
        const file = formData.get('file') as File | null;
        await createDeposit({
          pilotoId: resolvedPilotId,
          fecha: fecha, // Use state instead of formData
          monto: Number(formData.get('monto') || 0),
          detalle: String(formData.get('detalle') || '') || undefined,
          file,
        });
      }
      alert('Registro enviado a validación.');
      // Reset form
      setPilotValue('');
      setFecha(new Date().toISOString().split('T')[0]);
      setHobbsFin('');
      setTachFin('');
      setCopiloto('');
      setDetalle('');
      (document.getElementById('registro-form') as HTMLFormElement)?.reset();
    } catch (e: any) {
      console.error('Error guardando registro:', e);
      alert(`Hubo un error guardando el registro: ${e.message || 'Error desconocido'}`);
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
                value={pilotValue}
                onChange={e => setPilotValue(e.target.value)}
              >
                <option value="" disabled>Selecciona piloto</option>
                {pilots.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
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
                <input 
                  name="fecha"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  type="date" 
                  required 
                  className="rounded-xl border px-3 py-3 bg-slate-50" 
                />
              </label>
              {mode === 'flight' && (
                <div className="text-sm text-slate-600 flex items-end">Avión: <span className="ml-1 font-medium">CC-AQI</span></div>
              )}
            </div>

            {mode === 'flight' && (
              <>
                {/* Últimos contadores registrados */}
                {(lastCounters.hobbs !== null || lastCounters.tach !== null) && (
                  <div className="rounded-xl p-4 bg-amber-50 border border-amber-200">
                    <h3 className="text-sm font-bold text-amber-900 mb-2 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      ÚLTIMOS CONTADORES REGISTRADOS
                    </h3>
                    <div className="flex gap-6">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-600">HOBBS:</span>
                        <span className="font-mono font-bold text-blue-600">
                          {lastCounters.hobbs !== null ? lastCounters.hobbs.toFixed(1) : "N/A"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-600">TACH:</span>
                        <span className="font-mono font-bold text-blue-600">
                          {lastCounters.tach !== null ? lastCounters.tach.toFixed(1) : "N/A"}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-amber-700 mt-2">Los nuevos valores deben ser mayores a estos</p>
                  </div>
                )}

                {/* Contadores finales */}
                <div className="rounded-xl p-4 bg-emerald-50 border border-emerald-200">
                  <h3 className="text-sm font-bold text-emerald-900 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    CONTADORES FINALES (OBLIGATORIO)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-xs font-bold uppercase tracking-wide text-slate-700">
                        Hobbs Final *
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={hobbsFin}
                        onChange={(e) => setHobbsFin(e.target.value)}
                        min={lastCounters.hobbs !== null ? lastCounters.hobbs + 0.1 : 0}
                        placeholder={lastCounters.hobbs !== null ? `Mayor a ${lastCounters.hobbs.toFixed(1)}` : "Ej: 2058.5"}
                        required
                        className="w-full rounded-xl border px-3 py-3 bg-white font-mono font-bold text-lg"
                      />
                      {deltaHobbs !== null && (
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-100">
                          <span className="text-xs font-bold uppercase text-blue-700">Δ Hobbs:</span>
                          <span className="font-mono font-bold text-blue-600">{deltaHobbs.toFixed(1)} hrs</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-bold uppercase tracking-wide text-slate-700">
                        Tach Final *
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={tachFin}
                        onChange={(e) => setTachFin(e.target.value)}
                        min={lastCounters.tach !== null ? lastCounters.tach + 0.1 : 0}
                        placeholder={lastCounters.tach !== null ? `Mayor a ${lastCounters.tach.toFixed(1)}` : "Ej: 570.5"}
                        required
                        className="w-full rounded-xl border px-3 py-3 bg-white font-mono font-bold text-lg"
                      />
                      {deltaTach !== null && (
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-100">
                          <span className="text-xs font-bold uppercase text-blue-700">Δ Tach:</span>
                          <span className="font-mono font-bold text-blue-600">{deltaTach.toFixed(1)} hrs</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Alerta de ratio HOBBS/TACH fuera de rango */}
                  {ratioWarning && (
                    <div className="mt-4 rounded-xl p-4 bg-red-50 border-2 border-red-400">
                      <div className="flex items-start gap-3">
                        <svg className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div className="flex-1">
                          <h4 className="text-sm font-bold text-red-900 mb-1">⚠️ RATIO HOBBS/TACH FUERA DE RANGO</h4>
                          <p className="text-sm text-red-800 mb-2">
                            El ratio calculado es <strong className="font-mono">{ratioWarning.ratio.toFixed(2)}x</strong> 
                            {' '}(Δ HOBBS: {deltaHobbs?.toFixed(1)} hrs ÷ Δ TACH: {deltaTach?.toFixed(1)} hrs)
                          </p>
                          <p className="text-sm text-red-800">
                            Se espera un ratio de aproximadamente <strong className="font-mono">1.30x ± 0.20</strong> (rango: 1.10 - 1.50).
                            Por favor verifica que los valores ingresados sean correctos.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Vista previa de la bitácora */}
                {deltaHobbs !== null && deltaTach !== null && hobbsFin && tachFin && (
                  <div className="rounded-xl border-2 border-blue-500 p-4 bg-blue-50">
                    <h3 className="text-sm font-bold text-blue-900 mb-3 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      VISTA PREVIA - BITÁCORA CC-AQI
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-700 text-white">
                            <th className="border border-slate-400 px-2 py-2 text-center font-bold" rowSpan={2}>DATE</th>
                            <th className="border border-slate-400 px-2 py-2 text-center font-bold" rowSpan={2}>HOBBS</th>
                            <th className="border border-slate-400 px-2 py-2 text-center font-bold" rowSpan={2}>BLOCK<br/>TIME</th>
                            <th className="border border-slate-400 px-2 py-2 text-center font-bold" rowSpan={2}>TAC</th>
                            <th className="border border-slate-400 px-2 py-2 text-center font-bold" rowSpan={2}>TACH.<br/>TIME</th>
                            <th className="border border-slate-400 px-2 py-2 text-center font-bold" colSpan={3}>TOTAL TIME IN SERVICE</th>
                            <th className="border border-slate-400 px-2 py-2 text-center font-bold" rowSpan={2}>PILOT</th>
                            <th className="border border-slate-400 px-2 py-2 text-center font-bold" rowSpan={2}>INSTRUCTOR/<br/>COPILOT</th>
                            <th className="border border-slate-400 px-2 py-2 text-center font-bold" rowSpan={2}>ROUTE</th>
                            <th className="border border-slate-400 px-2 py-2 text-center font-bold" rowSpan={2}>REMARKS<br/>SIGNATURE</th>
                          </tr>
                          <tr className="bg-slate-700 text-white">
                            <th className="border border-slate-400 px-2 py-1 text-center text-[10px]">AIRFRAME</th>
                            <th className="border border-slate-400 px-2 py-1 text-center text-[10px]">ENGINE</th>
                            <th className="border border-slate-400 px-2 py-1 text-center text-[10px]">PROPELLER</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white">
                          <tr className="hover:bg-gray-50">
                            <td className="border border-slate-300 px-2 py-2 text-center font-mono whitespace-nowrap">{fecha}</td>
                            <td className="border border-slate-300 px-2 py-2 text-center font-mono font-bold">{hobbsFin}</td>
                            <td className="border border-slate-300 px-2 py-2 text-center font-mono font-bold text-blue-600">{deltaHobbs.toFixed(1)}</td>
                            <td className="border border-slate-300 px-2 py-2 text-center font-mono font-bold">{tachFin}</td>
                            <td className="border border-slate-300 px-2 py-2 text-center font-mono font-bold text-blue-600">{deltaTach.toFixed(1)}</td>
                            <td className="border border-slate-300 px-2 py-2 text-center font-mono">{newComponents?.airframe?.toFixed(1) || '--'}</td>
                            <td className="border border-slate-300 px-2 py-2 text-center font-mono">{newComponents?.engine?.toFixed(1) || '--'}</td>
                            <td className="border border-slate-300 px-2 py-2 text-center font-mono">{newComponents?.propeller?.toFixed(1) || '--'}</td>
                            <td className="border border-slate-300 px-2 py-2 text-center">{selectedPilot?.label.split('(')[0]?.trim() || '--'}</td>
                            <td className="border border-slate-300 px-2 py-2 text-center">{copiloto || '--'}</td>
                            <td className="border border-slate-300 px-2 py-2 text-center">LOCAL</td>
                            <td className="border border-slate-300 px-2 py-2 text-center text-[10px]">{detalle || 'S/Obs'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-blue-700 mt-2">
                      * Los valores mostrados son una vista previa. Se confirmarán al aprobar el vuelo.
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Base A/E/P: {lastComponents.airframe?.toFixed(1) || 'N/A'} / {lastComponents.engine?.toFixed(1) || 'N/A'} / {lastComponents.propeller?.toFixed(1) || 'N/A'} 
                      &nbsp;Δ Tach usado: {deltaTach.toFixed(1)} &nbsp;Δ Hobbs: {deltaHobbs.toFixed(1)}
                    </p>
                  </div>
                )}

                {/* Información adicional */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="flex flex-col text-sm">
                    <span className="mb-1">Copiloto / Instructor (opcional)</span>
                    <input 
                      value={copiloto}
                      onChange={(e) => setCopiloto(e.target.value)}
                      className="rounded-xl border px-3 py-3 bg-slate-50" 
                    />
                  </label>
                  <label className="flex flex-col text-sm">
                    <span className="mb-1">Detalle (opcional)</span>
                    <input 
                      value={detalle}
                      onChange={(e) => setDetalle(e.target.value)}
                      className="rounded-xl border px-3 py-3 bg-slate-50" 
                    />
                  </label>
                </div>
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
                    <span className="mb-1">Comprobante (imagen) - Opcional</span>
                    <input name="file" type="file" accept="image/*" className="rounded-xl border px-3 py-2 bg-slate-50" />
                  </label>
                </div>
                <label className="flex flex-col text-sm">
                  <span className="mb-1">Detalle (opcional)</span>
                  <input name="detalle" className="rounded-xl border px-3 py-3 bg-slate-50" />
                </label>
              </>
            )}

            <div className="pt-2">
              <button type="submit" disabled={!pilotValue || submitting} className="rounded-xl px-4 py-3 bg-blue-600 text-white w-full sm:w-auto disabled:opacity-60">
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
