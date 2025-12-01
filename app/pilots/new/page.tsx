"use client";
import { useState } from "react";

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
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    
    try {
      const response = await fetch('/api/pilots/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          apellido: form.apellido.trim(),
          fechaNacimiento: form.fecha_nacimiento || null,
          email: form.email.trim(),
          telefono: form.telefono.trim() || null,
          numeroLicencia: form.licencia.trim() || null,
          tipoDocumento: form.tipoDocumento,
          documento: form.documento.trim() || null,
          tarifaHora: 0
        }),
      });
      
      const res = await response.json();
      
      if (res.ok) {
        setMessage(`Piloto creado correctamente. Código asignado: ${res.codigo}`);
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
      } else {
        setMessage(res.error || "Error al crear piloto");
      }
    } catch (error) {
      setMessage("Error al conectar con el servidor");
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
          
          <form onSubmit={onSubmit} className="space-y-4 sm:space-y-5">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs sm:text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Nombre *</label>
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
                {loading?"Creando...":"Crear piloto"}
              </button>
              {message && (
                <span className="text-xs sm:text-sm px-4 py-2 rounded-lg" style={{ 
                  background: message.includes('correctamente') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: message.includes('correctamente') ? 'var(--accent-success)' : 'var(--accent-danger)',
                  border: `1px solid ${message.includes('correctamente') ? 'var(--accent-success)' : 'var(--accent-danger)'}`
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
