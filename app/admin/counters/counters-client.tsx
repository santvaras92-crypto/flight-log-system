"use client";

import { useState } from "react";
import { updateCounters } from "@/app/actions/update-counters";

interface Flight {
  id: number;
  fecha: Date;
  hobbs_inicio: string | null;
  hobbs_fin: string | null;
  tach_inicio: string | null;
  tach_fin: string | null;
  diff_hobbs: string | null;
  diff_tach: string | null;
  airframe_hours: string | null;
  engine_hours: string | null;
  propeller_hours: string | null;
  User: {
    nombre: string;
    codigo: string | null;
  };
}

interface Aircraft {
  matricula: string;
  hobbs_actual: string | null;
  tach_actual: string | null;
}

export default function CountersClient({ 
  lastFlight, 
  aircraft 
}: { 
  lastFlight: Flight | null;
  aircraft: Aircraft | null;
}) {
  const [hobbsInicio, setHobbsInicio] = useState(lastFlight?.hobbs_inicio || '');
  const [hobbsFin, setHobbsFin] = useState(lastFlight?.hobbs_fin || '');
  const [tachInicio, setTachInicio] = useState(lastFlight?.tach_inicio || '');
  const [tachFin, setTachFin] = useState(lastFlight?.tach_fin || '');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  if (!lastFlight) {
    return (
      <div className="rounded-xl p-8 text-center" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
        <p style={{ color: 'var(--text-secondary)' }}>No hay vuelos registrados</p>
      </div>
    );
  }

  const deltaHobbs = hobbsFin && hobbsInicio ? (parseFloat(hobbsFin) - parseFloat(hobbsInicio)).toFixed(1) : null;
  const deltaTach = tachFin && tachInicio ? (parseFloat(tachFin) - parseFloat(tachInicio)).toFixed(1) : null;

  const handleSave = async () => {
    if (!lastFlight) return;
    
    setMessage(null);
    setSaving(true);

    try {
      const result = await updateCounters({
        flightId: lastFlight.id,
        hobbs_inicio: parseFloat(hobbsInicio),
        hobbs_fin: parseFloat(hobbsFin),
        tach_inicio: parseFloat(tachInicio),
        tach_fin: parseFloat(tachFin),
      });

      if (result.success) {
        setMessage({ type: 'success', text: '✓ Contadores actualizados correctamente' });
        // Recargar la página después de 2 segundos
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setMessage({ type: 'error', text: `✗ Error: ${result.error}` });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `✗ Error: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Mensaje de resultado */}
      {message && (
        <div 
          className={`rounded-xl p-4 ${message.type === 'success' ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'} border-2`}
        >
          <p className={`text-sm font-medium ${message.type === 'success' ? 'text-green-900' : 'text-red-900'}`}>
            {message.text}
          </p>
        </div>
      )}

      {/* Información del último vuelo */}
      <div className="rounded-xl p-6" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
        <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
          Último Vuelo Registrado
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Fecha:</span>
            <p className="font-mono" style={{ color: 'var(--text-primary)' }}>
              {new Date(lastFlight.fecha).toLocaleDateString('es-CL')}
            </p>
          </div>
          <div>
            <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Piloto:</span>
            <p style={{ color: 'var(--text-primary)' }}>
              {lastFlight.User.nombre} ({lastFlight.User.codigo})
            </p>
          </div>
          <div>
            <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>ID Vuelo:</span>
            <p className="font-mono" style={{ color: 'var(--text-primary)' }}>#{lastFlight.id}</p>
          </div>
        </div>
      </div>

      {/* Formulario de edición */}
      <div className="rounded-xl p-6" style={{ background: 'var(--bg-card)', border: '2px solid var(--border-primary)' }}>
        <h2 className="text-lg font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
          Editar Contadores
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* HOBBS */}
          <div className="space-y-4 p-4 rounded-lg bg-blue-50 border border-blue-200">
            <h3 className="text-sm font-bold uppercase text-blue-900">HOBBS</h3>
            
            <div>
              <label className="block text-xs font-semibold mb-2 text-slate-700">
                HOBBS Inicio
              </label>
              <input
                type="number"
                step="0.1"
                value={hobbsInicio}
                onChange={(e) => setHobbsInicio(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 font-mono font-bold text-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-2 text-slate-700">
                HOBBS Final
              </label>
              <input
                type="number"
                step="0.1"
                value={hobbsFin}
                onChange={(e) => setHobbsFin(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 font-mono font-bold text-lg"
              />
            </div>

            {deltaHobbs && (
              <div className="p-3 bg-blue-100 rounded-lg">
                <p className="text-xs font-bold text-blue-700">Δ HOBBS</p>
                <p className="text-2xl font-mono font-bold text-blue-900">{deltaHobbs} hrs</p>
              </div>
            )}
          </div>

          {/* TACH */}
          <div className="space-y-4 p-4 rounded-lg bg-green-50 border border-green-200">
            <h3 className="text-sm font-bold uppercase text-green-900">TACH</h3>
            
            <div>
              <label className="block text-xs font-semibold mb-2 text-slate-700">
                TACH Inicio
              </label>
              <input
                type="number"
                step="0.1"
                value={tachInicio}
                onChange={(e) => setTachInicio(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 font-mono font-bold text-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-2 text-slate-700">
                TACH Final
              </label>
              <input
                type="number"
                step="0.1"
                value={tachFin}
                onChange={(e) => setTachFin(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 font-mono font-bold text-lg"
              />
            </div>

            {deltaTach && (
              <div className="p-3 bg-green-100 rounded-lg">
                <p className="text-xs font-bold text-green-700">Δ TACH</p>
                <p className="text-2xl font-mono font-bold text-green-900">{deltaTach} hrs</p>
              </div>
            )}
          </div>
        </div>

        {/* Ratio validation */}
        {deltaHobbs && deltaTach && parseFloat(deltaTach) > 0 && (
          <div className="mb-6">
            {(() => {
              const ratio = parseFloat(deltaHobbs) / parseFloat(deltaTach);
              const inRange = ratio >= 1.1 && ratio <= 1.5;
              
              return (
                <div className={`rounded-lg p-4 border-2 ${inRange ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {inRange ? (
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    )}
                    <p className={`font-bold text-sm ${inRange ? 'text-green-900' : 'text-red-900'}`}>
                      Ratio HOBBS/TACH: <span className="font-mono">{ratio.toFixed(2)}x</span>
                    </p>
                  </div>
                  <p className={`text-xs ${inRange ? 'text-green-800' : 'text-red-800'}`}>
                    {inRange 
                      ? 'El ratio está dentro del rango esperado (1.10 - 1.50)'
                      : 'El ratio está fuera del rango esperado (1.10 - 1.50). Verifica los valores.'}
                  </p>
                </div>
              );
            })()}
          </div>
        )}

        {/* Botón guardar */}
        <button
          onClick={handleSave}
          disabled={saving || !hobbsInicio || !hobbsFin || !tachInicio || !tachFin}
          className="w-full py-3 px-6 rounded-xl font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          style={{ 
            background: saving ? 'var(--text-muted)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
          }}
        >
          {saving ? 'Guardando...' : '💾 Guardar Cambios'}
        </button>
      </div>

      {/* Valores actuales de componentes */}
      {lastFlight.airframe_hours && (
        <div className="rounded-xl p-6" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
          <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
            Horas de Componentes (del vuelo)
          </h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-3 rounded-lg bg-slate-100">
              <p className="text-xs font-semibold text-slate-600 mb-1">AIRFRAME</p>
              <p className="text-xl font-mono font-bold text-slate-900">{lastFlight.airframe_hours}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-100">
              <p className="text-xs font-semibold text-slate-600 mb-1">ENGINE</p>
              <p className="text-xl font-mono font-bold text-slate-900">{lastFlight.engine_hours}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-100">
              <p className="text-xs font-semibold text-slate-600 mb-1">PROPELLER</p>
              <p className="text-xl font-mono font-bold text-slate-900">{lastFlight.propeller_hours}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
