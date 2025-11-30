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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50">
      {/* Header con logo */}
      <div className="bg-gradient-to-r from-[#003D82] to-[#0A2F5F] shadow-xl">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
              <img 
                src="/LOGO_BLANCO.png?v=3" 
                alt="CC-AQI" 
                className="h-[6.48rem] w-auto"
              />
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Pilot Registration</h1>
              <p className="text-blue-50 text-sm font-medium mt-1">Register your details to join the system</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="bg-white/95 border-2 border-slate-200 rounded-2xl shadow-2xl p-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Información del Piloto</h2>
          <form onSubmit={onSubmit} className="space-y-4">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide">Nombre *</label>
                <input className="w-full px-4 py-3 border-2 rounded-xl" placeholder="Nombre" value={form.nombre} onChange={e=>setForm({ ...form, nombre: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide">Apellido</label>
                <input className="w-full px-4 py-3 border-2 rounded-xl" placeholder="Apellido" value={form.apellido} onChange={e=>setForm({ ...form, apellido: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide">Fecha de nacimiento</label>
                <input className="w-full px-4 py-3 border-2 rounded-xl" type="date" value={form.fecha_nacimiento} onChange={e=>setForm({ ...form, fecha_nacimiento: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide">Correo *</label>
                <input className="w-full px-4 py-3 border-2 rounded-xl" type="email" placeholder="ejemplo@correo.com" value={form.email} onChange={e=>setForm({ ...form, email: e.target.value })} required />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide">Tipo de documento</label>
                <select 
                  className="w-full px-4 py-3 border-2 rounded-xl bg-white"
                  value={form.tipoDocumento}
                  onChange={e => setForm({ ...form, tipoDocumento: e.target.value as "rut" | "pasaporte", documento: "" })}
                >
                  <option value="rut">RUT</option>
                  <option value="pasaporte">Pasaporte</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide">
                  {form.tipoDocumento === "rut" ? "RUT" : "Número de Pasaporte"}
                </label>
                <input 
                  className="w-full px-4 py-3 border-2 rounded-xl" 
                  placeholder={form.tipoDocumento === "rut" ? "12.345.678-9" : "ABC123456"}
                  value={form.documento} 
                  onChange={e=>setForm({ ...form, documento: e.target.value })} 
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide">Número de teléfono</label>
                <input className="w-full px-4 py-3 border-2 rounded-xl" placeholder="+56 9 1234 5678" value={form.telefono} onChange={e=>setForm({ ...form, telefono: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide">Número de licencia</label>
                <input className="w-full px-4 py-3 border-2 rounded-xl" type="number" placeholder="123456" value={form.licencia} onChange={e=>setForm({ ...form, licencia: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button disabled={loading} className="px-5 py-3 bg-[#003D82] hover:bg-[#0A2F5F] text-white rounded-xl disabled:opacity-40 transition-colors">{loading?"Creando...":"Crear piloto"}</button>
              {message && <span className="text-sm text-slate-700">{message}</span>}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
