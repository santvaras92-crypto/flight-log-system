"use client";
import { useState, useEffect, useRef } from "react";
import { searchExistingPilots, createOrUpdatePilot } from "@/app/actions/pilot-actions";

type MatchedPilot = {
  id: number;
  nombre: string;
  codigo: string | null;
  email: string | null;
  documento: string | null;
  telefono: string | null;
  licencia: string | null;
  fechaNacimiento: Date | null;
};

export default function NewPilotPublicPage() {
  const [form, setForm] = useState({
    nombre: "",
    apellido: "",
    fecha_nacimiento: "",
    email: "",
    telefono: "",
    licencia: "",
    tipoDocumento: "rut" as "rut" | "pasaporte",
    documento: "",
  });
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showConfirmNew, setShowConfirmNew] = useState(false);

  const [duplicateCheck, setDuplicateCheck] = useState<{
    exactMatch: boolean;
    matchType?: 'document' | 'name';
    pilot: MatchedPilot | null;
    suggestions: MatchedPilot[];
  }>({ exactMatch: false, pilot: null, suggestions: [] });

  const [selectedPilotId, setSelectedPilotId] = useState<number | null>(null);
  const [pilotManuallySelected, setPilotManuallySelected] = useState(false);
  const skipNextSearchRef = useRef(false); // Ref para skip inmediato

  // Búsqueda en tiempo real con debounce
  useEffect(() => {
    // Si el usuario ya seleccionó un piloto manualmente, no hacer búsqueda
    if (pilotManuallySelected || skipNextSearchRef.current) {
      skipNextSearchRef.current = false; // Reset después de usar
      return;
    }

    const timer = setTimeout(async () => {
      // Double-check después del debounce
      if (pilotManuallySelected) {
        return;
      }

      if (!form.nombre.trim()) {
        setDuplicateCheck({ exactMatch: false, pilot: null, suggestions: [] });
        setSelectedPilotId(null);
        return;
      }

      setSearching(true);
      try {
        const result = await searchExistingPilots(
          form.nombre,
          form.apellido,
          form.documento
        );
        
        // Triple-check: si mientras buscábamos se seleccionó un piloto, no actualizar
        if (pilotManuallySelected) {
          return;
        }
        
        setDuplicateCheck(result);
        
        // Auto-fill si hay match exacto por documento
        if (result.exactMatch && result.pilot) {
          setSelectedPilotId(result.pilot.id);
          setForm(prev => ({
            ...prev,
            email: result.pilot?.email || prev.email,
            telefono: result.pilot?.telefono || prev.telefono,
            licencia: result.pilot?.licencia || prev.licencia,
            fecha_nacimiento: result.pilot?.fechaNacimiento 
              ? new Date(result.pilot.fechaNacimiento).toISOString().split('T')[0]
              : prev.fecha_nacimiento
          }));
        } else {
          setSelectedPilotId(null);
        }
      } catch (err) {
        console.error('Error al buscar pilotos:', err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [form.nombre, form.apellido, form.documento, pilotManuallySelected]);

  const handleSelectSuggestion = (pilot: MatchedPilot) => {
    // Marcar ANTES de cualquier cambio de estado
    skipNextSearchRef.current = true;
    setPilotManuallySelected(true);
    setSelectedPilotId(pilot.id);
    setDuplicateCheck({ exactMatch: false, pilot: null, suggestions: [] });
    setForm(prev => ({
      ...prev,
      nombre: pilot.nombre.split(' ')[0] || prev.nombre,
      apellido: pilot.nombre.split(' ').slice(1).join(' ') || prev.apellido,
      email: pilot.email || prev.email,
      telefono: pilot.telefono || prev.telefono,
      licencia: pilot.licencia || prev.licencia,
      documento: pilot.documento || prev.documento,
      fecha_nacimiento: pilot.fechaNacimiento
        ? new Date(pilot.fechaNacimiento).toISOString().split('T')[0]
        : prev.fecha_nacimiento
    }));
    setShowConfirmNew(false);
  };

  const handleConfirmNewPilot = () => {
    setSelectedPilotId(null);
    setPilotManuallySelected(false); // Permitir búsqueda de nuevo
    setShowConfirmNew(true);
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    
    try {
      const result = await createOrUpdatePilot({
        nombre: form.nombre,
        apellido: form.apellido,
        documento: form.documento,
        tipoDocumento: form.tipoDocumento,
        email: form.email,
        telefono: form.telefono,
        licencia: form.licencia,
        fechaNacimiento: form.fecha_nacimiento,
        pilotId: selectedPilotId || undefined
      });

      if (!result.success) {
        throw new Error('Error al procesar el registro');
      }

      setMessage(result.message);
      
      // Resetear formulario si es nuevo piloto
      if (!result.isUpdate) {
        setForm({
          nombre: "",
          apellido: "",
          fecha_nacimiento: "",
          email: "",
          telefono: "",
          licencia: "",
          tipoDocumento: "rut",
          documento: "",
        });
        setDuplicateCheck({ exactMatch: false, pilot: null, suggestions: [] });
        setSelectedPilotId(null);
        setPilotManuallySelected(false); // Permitir búsqueda de nuevo
        setShowConfirmNew(false);
      }
    } catch (error: any) {
      setMessage(error.message || "Error al conectar con el servidor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="executive-card p-6 sm:p-8 shadow-lg">
          {/* Header */}
          <div className="mb-6 pb-4 border-b-2" style={{ borderColor: 'var(--border-primary)' }}>
            <h2 className="text-xl sm:text-2xl font-bold uppercase tracking-wide" style={{ color: 'var(--text-primary)' }}>Pilot Registration</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Complete the information to create a new pilot profile</p>
          </div>
          
          {/* Indicador de búsqueda */}
          {searching && (
            <div className="mb-4 p-3 rounded-lg flex items-center gap-2" style={{ 
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)'
            }}>
              <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                Buscando pilotos existentes...
              </span>
            </div>
          )}
          
          {/* Match exacto por documento */}
          {duplicateCheck.exactMatch && duplicateCheck.pilot && (
            <div className="mb-6 p-4 rounded-lg" style={{ 
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.5)'
            }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                ✓ Encontramos tu perfil: <span className="font-bold">{duplicateCheck.pilot.nombre}</span> (Código: {duplicateCheck.pilot.codigo})
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                Tus datos se actualizarán al enviar el formulario
              </p>
            </div>
          )}

          {/* Sugerencias por nombre similar */}
          {!duplicateCheck.exactMatch && duplicateCheck.suggestions.length > 0 && !showConfirmNew && (
            <div className="mb-6 p-4 rounded-lg" style={{ 
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.5)'
            }}>
              <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                ¿Eres alguno de estos pilotos?
              </p>
              <div className="space-y-2">
                {duplicateCheck.suggestions.map(pilot => (
                  <button
                    key={pilot.id}
                    type="button"
                    onClick={() => handleSelectSuggestion(pilot)}
                    className="w-full text-left p-3 rounded-lg transition-all hover:scale-[1.02]"
                    style={{
                      background: selectedPilotId === pilot.id 
                        ? 'rgba(59, 130, 246, 0.25)' 
                        : 'rgba(255, 255, 255, 0.05)',
                      border: selectedPilotId === pilot.id
                        ? '2px solid rgba(59, 130, 246, 0.8)'
                        : '1px solid rgba(255, 255, 255, 0.1)'
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                          {pilot.nombre} - <span className="text-xs opacity-75">Código: {pilot.codigo}</span>
                        </p>
                        {/* Mostrar email solo si no es @piloto.local */}
                        {pilot.email && !String(pilot.email).toLowerCase().endsWith('@piloto.local') && (
                          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                            {pilot.email}
                          </p>
                        )}
                        {(!pilot.email || String(pilot.email).toLowerCase().endsWith('@piloto.local')) && (
                          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                            Sin correo
                          </p>
                        )}
                      </div>
                      {selectedPilotId === pilot.id && (
                        <span className="text-xs px-2 py-1 rounded" style={{ 
                          background: 'rgba(59, 130, 246, 0.3)',
                          color: 'var(--text-primary)'
                        }}>
                          Seleccionado
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleConfirmNewPilot}
                className="mt-3 w-full py-2 px-4 rounded-lg text-sm font-semibold transition-all hover:scale-[1.02]"
                style={{
                  background: showConfirmNew ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                  border: showConfirmNew ? '2px solid rgba(16, 185, 129, 0.8)' : '1px solid rgba(255, 255, 255, 0.2)',
                  color: 'var(--text-primary)'
                }}
              >
                Soy un piloto nuevo
              </button>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4 sm:space-y-5">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs sm:text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  Nombre *
                </label>
                <input className="executive-input" placeholder="Nombre" value={form.nombre} onChange={e=>setForm({ ...form, nombre: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <label className="block text-xs sm:text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Apellido</label>
                <input className="executive-input" placeholder="Apellido" value={form.apellido} onChange={e=>setForm({ ...form, apellido: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs sm:text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Fecha de nacimiento</label>
                <input className="executive-input" type="date" value={form.fecha_nacimiento} onChange={e=>setForm({ ...form, fecha_nacimiento: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="block text-xs sm:text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Correo *</label>
                <input className="executive-input" type="email" placeholder="ejemplo@correo.com" value={form.email} onChange={e=>setForm({ ...form, email: e.target.value })} required />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs sm:text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Tipo de documento</label>
                <select 
                  className="executive-input"
                  value={form.tipoDocumento}
                  onChange={e => setForm({ ...form, tipoDocumento: e.target.value as "rut" | "pasaporte", documento: "" })}
                >
                  <option value="rut">RUT</option>
                  <option value="pasaporte">Pasaporte</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-xs sm:text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  {form.tipoDocumento === "rut" ? "RUT" : "Número de Pasaporte"}
                </label>
                <input 
                  className="executive-input" 
                  placeholder={form.tipoDocumento === "rut" ? "12.345.678-9" : "ABC123456"}
                  value={form.documento} 
                  onChange={e=>setForm({ ...form, documento: e.target.value })} 
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs sm:text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Número de teléfono</label>
                <input className="executive-input" placeholder="+56 9 1234 5678" value={form.telefono} onChange={e=>setForm({ ...form, telefono: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="block text-xs sm:text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Número de licencia</label>
                <input className="executive-input" type="number" placeholder="123456" value={form.licencia} onChange={e=>setForm({ ...form, licencia: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 pt-2">
              <button disabled={loading} className="btn-executive btn-executive-primary w-full sm:w-auto">
                {loading 
                  ? "Procesando..." 
                  : selectedPilotId 
                    ? "Actualizar datos" 
                    : "Crear piloto"}
              </button>
              {message && (
                <span className="text-xs sm:text-sm px-4 py-2 rounded-lg" style={{ 
                  background: message.includes('correctamente') || message.includes('creado') || message.includes('actualizado') 
                    ? 'rgba(16, 185, 129, 0.15)' 
                    : 'rgba(239, 68, 68, 0.15)',
                  color: message.includes('correctamente') || message.includes('creado') || message.includes('actualizado')
                    ? 'var(--accent-success)' 
                    : 'var(--accent-danger)',
                  border: `1px solid ${message.includes('correctamente') || message.includes('creado') || message.includes('actualizado') 
                    ? 'var(--accent-success)' 
                    : 'var(--accent-danger)'}`
                }}>
                  {message}
                </span>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
