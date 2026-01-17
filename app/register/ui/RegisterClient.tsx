'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { createFlightSubmission } from '@/app/actions/create-flight-submission';
import { createFuel } from '@/app/actions/create-fuel';
import { createDeposit } from '@/app/actions/create-deposit';
import { findOrCreatePilotByCode } from '@/app/actions/find-or-create-pilot';
import Link from 'next/link';
import ImagePreviewModal from '@/app/components/ImagePreviewModal';

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

// Parsear monto en formato chileno (ej: "105.000" -> 105000, "1.500,50" -> 1500.50)
function parseChileanMoney(value: string): number {
  if (!value) return 0;
  // Remover espacios y símbolo $
  let cleaned = value.trim().replace(/\$/g, '').replace(/\s/g, '');
  // Detectar si usa coma como decimal (formato chileno: 1.500,50)
  if (cleaned.includes(',')) {
    // Tiene coma: remover puntos de miles, luego cambiar coma por punto decimal
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    // Solo puntos: determinar si es decimal o miles
    // Si tiene un solo punto y menos de 3 dígitos después, es decimal (ej: 105.50)
    // Si tiene múltiples puntos o 3+ dígitos después, son separadores de miles (ej: 105.000)
    const parts = cleaned.split('.');
    if (parts.length === 2 && parts[1].length <= 2) {
      // Probablemente decimal (ej: 105.50) - dejarlo como está
    } else {
      // Separadores de miles (ej: 105.000 o 1.000.000)
      cleaned = cleaned.replace(/\./g, '');
    }
  }
  const result = parseFloat(cleaned);
  return isNaN(result) ? 0 : result;
}

export default function RegisterClient({ 
  pilots,
  lastCounters = { hobbs: null, tach: null },
  lastComponents = { airframe: null, engine: null, propeller: null },
  lastAerodromoDestino = 'SCCV'
}: { 
  pilots: PilotOpt[];
  lastCounters?: LastCounters;
  lastComponents?: LastComponents;
  lastAerodromoDestino?: string;
}) {
  const [pilotNameLoaded, setPilotNameLoaded] = React.useState(false);
  const [pilotValue, setPilotValue] = useState<string>('');
  const [mode, setMode] = useState<'flight' | 'fuel' | 'deposit'>('flight');
  const [submitting, setSubmitting] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  // Estado para contadores actualizados (inicia con los valores del servidor)
  const [currentCounters, setCurrentCounters] = useState<LastCounters>(lastCounters);
  const [currentComponents, setCurrentComponents] = useState<LastComponents>(lastComponents);

  // Detectar si hay sesión activa para mostrar botón de volver y pre-seleccionar piloto
  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch('/api/auth/session');
        const session = await res.json();
        if (session?.user) {
          const role = session.user.role || session.role;
          const email = session.user.email;
          setUserRole(role);
          
          // Si es piloto, buscar su código por email y pre-seleccionar
          if (email && (role === 'PILOTO' || role === 'PILOT')) {
            const pilotRes = await fetch(`/api/pilot-code?email=${encodeURIComponent(email)}`);
            const pilotData = await pilotRes.json();
            
            if (pilotData.found && pilotData.codigo) {
              // Buscar por código primero (funciona para CSV y registrados)
              let matchingPilot = pilots.find(p => 
                String(p.value).toUpperCase() === pilotData.codigo.toUpperCase()
              );
              
              // Si no encuentra por código, buscar por ID (fallback)
              if (!matchingPilot && pilotData.userId) {
                matchingPilot = pilots.find(p => 
                  String(p.value) === String(pilotData.userId)
                );
              }
              
              if (matchingPilot) {
                setPilotValue(matchingPilot.value);
              }
            }
          }
        }
      } catch {
        // No session
      }
      setSessionChecked(true);
      setPilotNameLoaded(true);
    }
    checkSession();
  }, [pilots]);
  
  // Flight form fields
  const [fecha, setFecha] = useState<string>(new Date().toISOString().split('T')[0]);
  const [hobbsFin, setHobbsFin] = useState<string>('');
  const [tachFin, setTachFin] = useState<string>('');
  const [copiloto, setCopiloto] = useState<string>('');
  const [detalle, setDetalle] = useState<string>('');
  const [aerodromoSalida, setAerodromoSalida] = useState<string>(lastAerodromoDestino);
  const [aerodromoDestino, setAerodromoDestino] = useState<string>('SCCV');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);
  
  // Fuel form fields
  const [fuelLitros, setFuelLitros] = useState<string>('');
  const [fuelMonto, setFuelMonto] = useState<string>('');
  
  // Image preview states
  const [fuelImagePreview, setFuelImagePreview] = useState<string | null>(null);
  const [depositImagePreview, setDepositImagePreview] = useState<string | null>(null);
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null);
  const fuelFileInputRef = useRef<HTMLInputElement>(null);
  const depositFileInputRef = useRef<HTMLInputElement>(null);
  
  // Calculate fuel price per liter
  const precioLitro = useMemo(() => {
    const litros = parseFloat(fuelLitros);
    const monto = parseFloat(fuelMonto);
    if (!litros || !monto || litros <= 0 || monto <= 0) return null;
    return Math.round(monto / litros);
  }, [fuelLitros, fuelMonto]);
  
  const selectedPilot = useMemo(() => pilots.find(p => p.value === pilotValue), [pilotValue, pilots]);

  // Calcular deltas en tiempo real para modo flight
  const deltaHobbs = useMemo(() => {
    if (mode !== 'flight' || !hobbsFin || currentCounters.hobbs === null) return null;
    const val = parseFloat(hobbsFin) - currentCounters.hobbs;
    return isNaN(val) || val <= 0 ? null : Number(val.toFixed(1));
  }, [mode, hobbsFin, currentCounters.hobbs]);

  const deltaTach = useMemo(() => {
    if (mode !== 'flight' || !tachFin || currentCounters.tach === null) return null;
    const val = parseFloat(tachFin) - currentCounters.tach;
    return isNaN(val) || val <= 0 ? null : Number(val.toFixed(1));
  }, [mode, tachFin, currentCounters.tach]);

  // Validar ratio entre deltaHobbs y deltaTach (esperado: ~1.25x basado en análisis de 1,328 vuelos)
  const hobbsTachRatio = useMemo(() => {
    if (deltaHobbs === null || deltaTach === null || deltaTach === 0) return null;
    return deltaHobbs / deltaTach;
  }, [deltaHobbs, deltaTach]);

  // El ratio esperado es 1.25 (rango P5-P95: 1.00 - 1.70)
  const ratioWarning = useMemo(() => {
    if (hobbsTachRatio === null) return null;
    const expectedRatio = 1.25;
    const minRatio = 1.00;
    const maxRatio = 1.70;
    
    if (hobbsTachRatio < minRatio || hobbsTachRatio > maxRatio) {
      return {
        ratio: hobbsTachRatio,
        expected: expectedRatio,
        outOfRange: true
      };
    }
    return null;
  }, [hobbsTachRatio]);

  // Handle file input change for image preview
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'fuel' | 'deposit') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        if (type === 'fuel') {
          setFuelImagePreview(result);
        } else {
          setDepositImagePreview(result);
        }
      };
      reader.readAsDataURL(file);
    } else {
      if (type === 'fuel') {
        setFuelImagePreview(null);
      } else {
        setDepositImagePreview(null);
      }
    }
  };

  // Clear image preview
  const clearImagePreview = (type: 'fuel' | 'deposit') => {
    if (type === 'fuel') {
      setFuelImagePreview(null);
      if (fuelFileInputRef.current) {
        fuelFileInputRef.current.value = '';
      }
    } else {
      setDepositImagePreview(null);
      if (depositFileInputRef.current) {
        depositFileInputRef.current.value = '';
      }
    }
  };

  // Calcular nuevas horas de componentes para vista previa
  const newComponents = useMemo(() => {
    if (!deltaTach) return null;
    return {
      airframe: currentComponents.airframe !== null ? currentComponents.airframe + deltaTach : null,
      engine: currentComponents.engine !== null ? currentComponents.engine + deltaTach : null,
      propeller: currentComponents.propeller !== null ? currentComponents.propeller + deltaTach : null,
    };
  }, [deltaTach, currentComponents]);

  // Handler for initial form submit - validates and shows modal for flights
  const onFormSubmit = async (formData: FormData) => {
    if (!pilotValue) return;
    setFormError(null);
    setFormSuccess(null);
    
    if (mode === 'flight') {
      // Validar que los contadores cumplan con los mínimos
      const hobbsVal = Number(hobbsFin);
      const tachVal = Number(tachFin);
      
      // HOBBS: puede ser igual o mayor al último registrado
      if (currentCounters.hobbs !== null && hobbsVal < currentCounters.hobbs) {
        setFormError(`HOBBS Final debe ser mayor o igual a ${currentCounters.hobbs.toFixed(1)} (último registrado)`);
        return;
      }
      
      // TACH: debe ser estrictamente mayor al último registrado
      if (currentCounters.tach !== null && tachVal <= currentCounters.tach) {
        setFormError(`TACH Final debe ser mayor a ${currentCounters.tach.toFixed(1)} (último registrado)`);
        return;
      }
      
      // Show confirmation modal for flights
      setPendingFormData(formData);
      setShowConfirmModal(true);
      return;
    }
    
    // For fuel and deposit, submit directly
    flushSync(() => {
      setSubmitting(true);
    });
    try {
      // Execute submission and ensure spinner is visible for at least 1 second
      const [_, result] = await Promise.all([
        new Promise(resolve => setTimeout(resolve, 1000)), // Minimum 1 second
        executeSubmit(formData)
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  // Execute actual submission
  const executeSubmit = async (formData: FormData) => {
    if (!pilotValue) return;
    setFormError(null);
    setFormSuccess(null);
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
        const hobbsVal = Number(hobbsFin);
        const tachVal = Number(tachFin);
        
        console.log('Creating flight submission:', { resolvedPilotId, fecha, hobbsFin, tachFin, aerodromoSalida, aerodromoDestino });
        const result = await createFlightSubmission({
          pilotoId: resolvedPilotId,
          fecha,
          hobbs_fin: hobbsVal || NaN,
          tach_fin: tachVal || NaN,
          copiloto: copiloto || undefined,
          detalle: detalle || undefined,
          aerodromoSalida: aerodromoSalida || 'SCCV',
          aerodromoDestino: aerodromoDestino || 'SCCV',
        });
        console.log('Flight submission created:', result);
        if (!result.ok) {
          setFormError('Error creando vuelo');
          return;
        }
      } else if (mode === 'fuel') {
        const rawFile = formData.get('file') as File | null;
        let uploadPayload: { name: string; base64: string } | null = null;
        if (rawFile) {
          try {
            const base64 = await new Promise<string>((resolve, reject) => {
              const fr = new FileReader();
              fr.onload = () => {
                const res = fr.result as string; // data URL
                const b64 = res.split(',')[1] || '';
                resolve(b64);
              };
              fr.onerror = () => reject(fr.error);
              fr.readAsDataURL(rawFile);
            });
            uploadPayload = { name: rawFile.name, base64 };
          } catch (e) {
            console.warn('Error leyendo archivo combustible, se omitirá:', e);
          }
        }
        const result: { ok: boolean; id?: number; error?: string } = await createFuel({
          pilotoId: resolvedPilotId,
          fecha: fecha,
          litros: Number(formData.get('litros') || 0),
          monto: Number(formData.get('monto') || 0),
          detalle: String(formData.get('detalle') || '') || undefined,
          file: uploadPayload,
        });
        if (!result.ok) {
          setFormError(result.error || 'Error creando registro de combustible');
          return;
        }
      } else {
        const rawFile = formData.get('file') as File | null;
        if (!rawFile) {
          setFormError('Debe adjuntar imagen del comprobante.');
          return;
        }
        let uploadPayload: { name: string; base64: string } | null = null;
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => {
              const res = fr.result as string; // data URL
              const b64 = res.split(',')[1] || '';
              resolve(b64);
            };
            fr.onerror = () => reject(fr.error);
            fr.readAsDataURL(rawFile);
          });
          uploadPayload = { name: rawFile.name, base64 };
        } catch (e) {
          console.warn('Error leyendo archivo depósito:', e);
          setFormError('No se pudo leer la imagen del comprobante');
          return;
        }
        const result = await createDeposit({
          pilotoId: resolvedPilotId,
          fecha: fecha,
          monto: parseChileanMoney(String(formData.get('monto') || '')),
          detalle: String(formData.get('detalle') || '') || undefined,
          file: uploadPayload,
        });
        if (!result.ok) {
          setFormError(result.error || 'Error creando depósito');
          return;
        }
      }
      setFormSuccess('Registro enviado correctamente.');
      
      // Si fue un vuelo, refetch contadores actualizados
      if (mode === 'flight') {
        try {
          const flightRes = await fetch('/api/last-flight');
          if (flightRes.ok) {
            const flightData = await flightRes.json();
            setCurrentCounters(flightData.lastCounters);
            setCurrentComponents(flightData.lastComponents);
            setAerodromoSalida(flightData.lastAerodromoDestino || 'SCCV');
          }
        } catch (e) {
          console.warn('Error actualizando contadores:', e);
        }
      }

      // Esperar 800ms para que el usuario vea el feedback visual (spinner + mensaje de éxito)
      await new Promise(resolve => setTimeout(resolve, 800));

      // Reset form
      setPilotValue('');
      setFecha(new Date().toISOString().split('T')[0]);
      setHobbsFin('');
      setTachFin('');
      setCopiloto('');
      setDetalle('');
      setFuelLitros('');
      setFuelMonto('');
      // Para fuel/deposit, el nuevo aeródromo de salida es el destino que acabamos de registrar
      if (mode !== 'flight') {
        setAerodromoSalida(aerodromoDestino);
      }
      setAerodromoDestino('SCCV');
      (document.getElementById('registro-form') as HTMLFormElement)?.reset();
    } catch (e: any) {
      console.error('Error guardando registro:', e);
      setFormError(e.message || 'Error desconocido guardando registro');
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="rounded-2xl border shadow-sm bg-white">
        <div className="p-4 sm:p-6 border-b">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl sm:text-2xl font-semibold">Registro</h2>
              <p className="text-sm mt-1 text-slate-600">Selecciona piloto y tipo de registro.</p>
            </div>
            {userRole && (
              <Link 
                href={userRole === 'ADMIN' ? '/admin/dashboard' : '/pilot/dashboard'}
                className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 shrink-0"
              >
                <span>←</span>
                <span className="hidden sm:inline">{userRole === 'ADMIN' ? 'Dashboard' : 'Portal Piloto'}</span>
                <span className="sm:hidden">Volver</span>
              </Link>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col text-sm">
              <span className="mb-1 font-medium">Piloto</span>
              {userRole === 'PILOTO' || userRole === 'PILOT' ? (
                // Si es piloto logueado, mostrar su nombre como texto fijo
                <div className="rounded-xl border px-3 py-3 bg-slate-100 text-slate-700 font-medium">
                  {!pilotNameLoaded 
                    ? 'Cargando...' 
                    : (pilots.find(p => p.value === pilotValue)?.label || 'Nombre no encontrado')
                  }
                </div>
              ) : (
                // Si es admin o sin sesión, mostrar dropdown
                <select
                  className="rounded-xl border px-3 py-3 bg-slate-50"
                  value={pilotValue}
                  onChange={e => setPilotValue(e.target.value)}
                >
                  <option value="" disabled>Selecciona piloto</option>
                  {pilots.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              )}
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

          <form id="registro-form" action={onFormSubmit} className="space-y-4">
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
                {/* Aeródromos */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="flex flex-col text-sm">
                    <span className="mb-1 font-medium">Aeródromo de Salida</span>
                    <input 
                      value={aerodromoSalida}
                      onChange={(e) => setAerodromoSalida(e.target.value.toUpperCase())}
                      placeholder="SCCV"
                      className="rounded-xl border px-3 py-3 bg-slate-50 font-mono uppercase" 
                    />
                    <span className="text-xs text-slate-500 mt-1">Destino del último vuelo: {lastAerodromoDestino}</span>
                  </label>
                  <label className="flex flex-col text-sm">
                    <span className="mb-1 font-medium">Aeródromo de Destino</span>
                    <input 
                      value={aerodromoDestino}
                      onChange={(e) => setAerodromoDestino(e.target.value.toUpperCase())}
                      placeholder="SCCV"
                      className="rounded-xl border px-3 py-3 bg-slate-50 font-mono uppercase" 
                    />
                  </label>
                </div>

                {/* Copiloto / Detalle */}
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

                {/* Últimos contadores registrados */}
                {(currentCounters.hobbs !== null || currentCounters.tach !== null) && (
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
                          {currentCounters.hobbs !== null ? currentCounters.hobbs.toFixed(1) : "N/A"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-600">TACH:</span>
                        <span className="font-mono font-bold text-blue-600">
                          {currentCounters.tach !== null ? currentCounters.tach.toFixed(1) : "N/A"}
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
                        min={currentCounters.hobbs !== null ? currentCounters.hobbs : 0}
                        placeholder={currentCounters.hobbs !== null ? `≥ ${currentCounters.hobbs.toFixed(1)}` : "Ej: 2058.5"}
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
                        min={currentCounters.tach !== null ? currentCounters.tach + 0.1 : 0}
                        placeholder={currentCounters.tach !== null ? `Mayor a ${currentCounters.tach.toFixed(1)}` : "Ej: 570.5"}
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
                            Se espera un ratio de aproximadamente <strong className="font-mono">1.25x</strong> (rango: 1.00 - 1.70).
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
                            <td className="border border-slate-300 px-2 py-2 text-center font-mono whitespace-nowrap">{fecha.split('-').reverse().map((p, i) => i === 2 ? p.slice(-2) : p).join('-')}</td>
                            <td className="border border-slate-300 px-2 py-2 text-center font-mono font-bold">{hobbsFin}</td>
                            <td className="border border-slate-300 px-2 py-2 text-center font-mono font-bold text-blue-600">{deltaHobbs.toFixed(1)}</td>
                            <td className="border border-slate-300 px-2 py-2 text-center font-mono font-bold">{tachFin}</td>
                            <td className="border border-slate-300 px-2 py-2 text-center font-mono font-bold text-blue-600">{deltaTach.toFixed(1)}</td>
                            <td className="border border-slate-300 px-2 py-2 text-center font-mono">{newComponents?.airframe?.toFixed(1) || '--'}</td>
                            <td className="border border-slate-300 px-2 py-2 text-center font-mono">{newComponents?.engine?.toFixed(1) || '--'}</td>
                            <td className="border border-slate-300 px-2 py-2 text-center font-mono">{newComponents?.propeller?.toFixed(1) || '--'}</td>
                            <td className="border border-slate-300 px-2 py-2 text-center">{selectedPilot?.label.split('(')[0]?.trim() || '--'}</td>
                            <td className="border border-slate-300 px-2 py-2 text-center">{copiloto || '--'}</td>
                            <td className="border border-slate-300 px-2 py-2 text-center font-mono">{aerodromoSalida || 'SCCV'}-{aerodromoDestino || 'SCCV'}</td>
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

                <p className="text-xs text-slate-500">Tras enviar, pasa a Validación para ingresar Airplane Rate e Instructor/SP Rate.</p>
              </>
            )}

            {mode === 'fuel' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <label className="flex flex-col text-sm">
                    <span className="mb-1">Litros</span>
                    <input 
                      name="litros" 
                      type="number" 
                      step="0.001" 
                      required 
                      value={fuelLitros}
                      onChange={(e) => setFuelLitros(e.target.value)}
                      className="rounded-xl border px-3 py-3 bg-slate-50" 
                    />
                  </label>
                  <label className="flex flex-col text-sm">
                    <span className="mb-1">Monto</span>
                    <input 
                      name="monto" 
                      type="number" 
                      step="0.001" 
                      required 
                      value={fuelMonto}
                      onChange={(e) => setFuelMonto(e.target.value)}
                      className="rounded-xl border px-3 py-3 bg-slate-50" 
                    />
                  </label>
                  <div className="flex flex-col text-sm">
                    <span className="mb-1">Foto boleta</span>
                    <input 
                      ref={fuelFileInputRef}
                      name="file" 
                      type="file" 
                      accept="image/*" 
                      required 
                      className="rounded-xl border px-3 py-2 bg-slate-50" 
                      onChange={(e) => handleFileChange(e, 'fuel')}
                    />
                  </div>
                </div>
                
                {/* Fuel Image Preview */}
                {fuelImagePreview && (
                  <div className="relative rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-slate-600 font-medium">Vista previa de boleta</span>
                      <button
                        type="button"
                        onClick={() => clearImagePreview('fuel')}
                        className="text-red-500 hover:text-red-700 text-xs font-medium"
                      >
                        Eliminar
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setImageModalUrl(fuelImagePreview)}
                      className="w-full"
                    >
                      <img 
                        src={fuelImagePreview} 
                        alt="Preview boleta" 
                        className="max-h-32 mx-auto rounded-lg object-contain cursor-pointer hover:opacity-80 transition-opacity"
                      />
                      <span className="text-xs text-blue-600 mt-1 block">Tocar para ampliar</span>
                    </button>
                  </div>
                )}
                
                {/* AVGAS Price per Liter display */}
                {precioLitro !== null && (
                  <div className="rounded-lg p-3 bg-emerald-50 border border-emerald-200">
                    <p className="text-sm text-emerald-800 font-medium">
                      ⛽ Precio AVGAS: <span className="text-lg font-bold">${precioLitro.toLocaleString('es-CL')}</span> /litro
                    </p>
                  </div>
                )}
                
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
                                <input 
                                  name="monto" 
                                  type="text" 
                                  inputMode="numeric"
                                  placeholder="Ej: 105.000"
                                  required 
                                  className="rounded-xl border px-3 py-3 bg-slate-50" 
                                />
                                <span className="mt-1 text-[11px] text-slate-500">Ingrese el monto (ej: 105.000 o 105000)</span>
                              </label>
                              <div className="flex flex-col text-sm">
                                <span className="mb-1 font-medium">Comprobante (imagen) *</span>
                                <input 
                                  ref={depositFileInputRef}
                                  name="file" 
                                  type="file" 
                                  accept="image/*" 
                                  required 
                                  className="rounded-xl border px-3 py-2 bg-slate-50" 
                                  onChange={(e) => handleFileChange(e, 'deposit')}
                                />
                                <span className="mt-1 text-[11px] text-slate-500">La imagen del comprobante es obligatoria.</span>
                              </div>
                            </div>
                            
                            {/* Deposit Image Preview */}
                            {depositImagePreview && (
                              <div className="relative rounded-xl border border-slate-200 bg-slate-50 p-2">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs text-slate-600 font-medium">Vista previa de comprobante</span>
                                  <button
                                    type="button"
                                    onClick={() => clearImagePreview('deposit')}
                                    className="text-red-500 hover:text-red-700 text-xs font-medium"
                                  >
                                    Eliminar
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setImageModalUrl(depositImagePreview)}
                                  className="w-full"
                                >
                                  <img 
                                    src={depositImagePreview} 
                                    alt="Preview comprobante" 
                                    className="max-h-32 mx-auto rounded-lg object-contain cursor-pointer hover:opacity-80 transition-opacity"
                                  />
                                  <span className="text-xs text-blue-600 mt-1 block">Tocar para ampliar</span>
                                </button>
                              </div>
                            )}
                            
                            <label className="flex flex-col text-sm">
                              <span className="mb-1">Detalle (opcional)</span>
                              <input name="detalle" className="rounded-xl border px-3 py-3 bg-slate-50" />
                            </label>
                          </>
                        )}

            {/* Success/Error messages near the submit button */}
            {formError && (
              <div className="rounded-lg p-3 border border-red-400 bg-red-50 text-sm text-red-800 font-medium">
                ⚠️ {formError}
              </div>
            )}
            {formSuccess && (
              <div className="rounded-lg p-3 border border-green-500 bg-green-50 text-sm text-green-800 font-medium">
                ✅ {formSuccess}
              </div>
            )}

            <div className="pt-2">
              <button 
                type="submit" 
                disabled={!pilotValue || submitting} 
                className={`rounded-xl px-6 py-4 text-white w-full sm:w-auto disabled:cursor-not-allowed flex items-center justify-center gap-3 font-bold text-lg transition-all shadow-lg ${
                  submitting 
                    ? 'bg-slate-400 cursor-wait animate-pulse' 
                    : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
                }`}
              >
                {submitting && (
                  <svg className="animate-spin h-6 w-6 sm:h-7 sm:w-7" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                {submitting ? '⏳ Procesando...' : '✓ Enviar a validación'}
              </button>
            </div>
          </form>

          {selectedPilot && (
            <p className="text-xs text-slate-500">Piloto seleccionado: <span className="font-medium">{selectedPilot.label}</span></p>
          )}
        </div>
      </div>

      {/* Modal de confirmación para vuelos */}
      {showConfirmModal && deltaHobbs !== null && deltaTach !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b bg-slate-100 rounded-t-2xl">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                CONFIRMAR REGISTRO DE VUELO
              </h2>
              <p className="text-sm text-slate-600 mt-1">Revisa los datos antes de enviar a validación.</p>
            </div>
            
            <div className="p-6">
              <div className="rounded-xl border-2 border-blue-500 bg-blue-50 p-4 mb-6">
                <h3 className="text-sm font-bold text-blue-900 mb-4 flex items-center gap-2">
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
                        <td className="border border-slate-300 px-2 py-2 text-center font-mono whitespace-nowrap">{fecha.split('-').reverse().map((p, i) => i === 2 ? p.slice(-2) : p).join('-')}</td>
                        <td className="border border-slate-300 px-2 py-2 text-center font-mono font-bold">{hobbsFin}</td>
                        <td className="border border-slate-300 px-2 py-2 text-center font-mono font-bold text-blue-600">{deltaHobbs.toFixed(1)}</td>
                        <td className="border border-slate-300 px-2 py-2 text-center font-mono font-bold">{tachFin}</td>
                        <td className="border border-slate-300 px-2 py-2 text-center font-mono font-bold text-blue-600">{deltaTach.toFixed(1)}</td>
                        <td className="border border-slate-300 px-2 py-2 text-center font-mono">{newComponents?.airframe?.toFixed(1) || '--'}</td>
                        <td className="border border-slate-300 px-2 py-2 text-center font-mono">{newComponents?.engine?.toFixed(1) || '--'}</td>
                        <td className="border border-slate-300 px-2 py-2 text-center font-mono">{newComponents?.propeller?.toFixed(1) || '--'}</td>
                        <td className="border border-slate-300 px-2 py-2 text-center">{selectedPilot?.label.split('(')[0]?.trim() || '--'}</td>
                        <td className="border border-slate-300 px-2 py-2 text-center">{copiloto || '--'}</td>
                        <td className="border border-slate-300 px-2 py-2 text-center font-mono">{aerodromoSalida || 'SCCV'}-{aerodromoDestino || 'SCCV'}</td>
                        <td className="border border-slate-300 px-2 py-2 text-center text-[10px]">{detalle || 'S/Obs'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-blue-700 mt-3">
                  Base A/E/P: {lastComponents.airframe?.toFixed(1) || 'N/A'} / {lastComponents.engine?.toFixed(1) || 'N/A'} / {lastComponents.propeller?.toFixed(1) || 'N/A'} 
                  &nbsp;| Δ Tach: {deltaTach.toFixed(1)} | Δ Hobbs: {deltaHobbs.toFixed(1)}
                </p>
              </div>

              {/* Ratio warning in modal if applicable */}
              {ratioWarning && (
                <div className="mb-6 rounded-xl p-4 bg-red-50 border-2 border-red-400">
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-red-900 mb-1">⚠️ RATIO HOBBS/TACH FUERA DE RANGO</h4>
                      <p className="text-sm text-red-800">
                        Ratio: <strong className="font-mono">{ratioWarning.ratio.toFixed(2)}x</strong> (esperado: 1.25x, rango 1.00-1.70)
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirmModal(false);
                    setPendingFormData(null);
                  }}
                  className="px-6 py-3 rounded-xl border-2 border-slate-300 bg-slate-100 text-slate-700 font-medium hover:bg-slate-200 transition-colors"
                >
                  ← Volver
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={async () => {
                    if (pendingFormData) {
                      flushSync(() => {
                        setSubmitting(true);
                      });
                      try {
                        // Execute submission and ensure spinner is visible for at least 1 second
                        await Promise.all([
                          new Promise(resolve => setTimeout(resolve, 1000)), // Minimum 1 second
                          executeSubmit(pendingFormData)
                        ]);
                      } finally {
                        setSubmitting(false);
                      }
                      setShowConfirmModal(false);
                      setPendingFormData(null);
                    }
                  }}
                  className="px-6 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Enviando...
                    </>
                  ) : (
                    <>✓ Confirmar y Enviar</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      <ImagePreviewModal
        imageUrl={imageModalUrl}
        onClose={() => setImageModalUrl(null)}
        alt="Vista previa"
      />
    </div>
  );
}
