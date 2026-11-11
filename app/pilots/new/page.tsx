"use client";
import { useState } from "react";
import { submitPilotRegistration } from "../../actions/pilot-actions";

const EMPTY_FORM = {
  nombre: "",
  apellido: "",
  fecha_nacimiento: "",
  email: "",
  telefono: "",
  licencia: "",
  tipoDocumento: "rut" as "rut" | "pasaporte",
  documento: "",
};

export default function NewPilotPublicPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const result = await submitPilotRegistration({
        nombre: form.nombre,
        apellido: form.apellido,
        documento: form.documento,
        tipoDocumento: form.tipoDocumento,
        email: form.email,
        telefono: form.telefono,
        licencia: form.licencia,
        fechaNacimiento: form.fecha_nacimiento,
      });
      setMessage({ ok: result.success, text: result.message });
      if (result.success) setForm(EMPTY_FORM);
    } catch (error: any) {
      setMessage({ ok: false, text: error?.message || "Error al conectar con el servidor" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-muted">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-10 sm:w-16 sm:h-12 shrink-0">
              <img
                src="/LOGO_BLANCO.png"
                alt="Logo"
                className="h-full w-full object-contain"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-white font-bold text-base sm:text-lg tracking-tight">CC-AQI</span>
              <span className="text-blue-200 text-[10px] sm:text-xs font-medium tracking-wider uppercase">Flight Operations</span>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="executive-card p-6 sm:p-8 shadow-lg bg-white dark:bg-card rounded-2xl">
          {/* Form Header */}
          <div className="mb-6 pb-4 border-b-2 border-gray-200 dark:border-edge">
            <h2 className="text-xl sm:text-2xl font-bold uppercase tracking-wide text-gray-800 dark:text-foreground">Pilot Registration</h2>
            <p className="text-sm mt-1 text-gray-600 dark:text-foreground-soft">Complete the information to request your pilot profile. An administrator will review it.</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 sm:space-y-5">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs sm:text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  Nombre *
                </label>
                <input className="executive-input" placeholder="Nombre" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <label className="block text-xs sm:text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Apellido</label>
                <input className="executive-input" placeholder="Apellido" value={form.apellido} onChange={e => setForm({ ...form, apellido: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs sm:text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Fecha de nacimiento</label>
                <input className="executive-input" type="date" value={form.fecha_nacimiento} onChange={e => setForm({ ...form, fecha_nacimiento: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="block text-xs sm:text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Correo *</label>
                <input className="executive-input" type="email" placeholder="ejemplo@correo.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
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
                  onChange={e => setForm({ ...form, documento: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs sm:text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Número de teléfono</label>
                <input className="executive-input" placeholder="+56 9 1234 5678" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="block text-xs sm:text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Número de licencia</label>
                <input className="executive-input" type="number" placeholder="123456" value={form.licencia} onChange={e => setForm({ ...form, licencia: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 pt-2">
              <button disabled={loading} className="btn-executive btn-executive-primary w-full sm:w-auto">
                {loading ? "Enviando..." : "Enviar solicitud"}
              </button>
              {message && (
                <span className="text-xs sm:text-sm px-4 py-2 rounded-lg" style={{
                  background: message.ok ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: message.ok ? 'var(--accent-success)' : 'var(--accent-danger)',
                  border: `1px solid ${message.ok ? 'var(--accent-success)' : 'var(--accent-danger)'}`
                }}>
                  {message.text}
                </span>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
