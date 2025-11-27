"use client";
import { useState } from "react";
import { registerPilot } from "@/app/actions/register-pilot";

export default function NewPilotPage() {
  const [form, setForm] = useState({
    nombre: "",
    apellido: "",
    fecha_nacimiento: "",
    email: "",
    telefono: "",
    licencia: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const res = await registerPilot({
      nombre: form.nombre.trim(),
      apellido: form.apellido.trim(),
      fecha_nacimiento: form.fecha_nacimiento,
      email: form.email.trim(),
      telefono: form.telefono.trim(),
      licencia: form.licencia.trim(),
    });
    setLoading(false);
    if (res.ok) {
      setMessage("Piloto creado correctamente. Ver Dashboard de Pilotos.");
    } else {
      setMessage(res.error || "Error al crear piloto");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50">
      {/* Header con logo */}
      <div className="bg-gradient-to-r from-[#003D82] to-[#0A2F5F] shadow-xl">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <img 
              src="/logo-white.png" 
              alt="CC-AQI" 
              className="h-[4.04rem] w-auto"
            />
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Pilot Registration</h1>
              <p className="text-blue-50 text-sm font-medium mt-1">Add New Pilot to System</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="bg-white/95 border-2 border-slate-200 rounded-2xl shadow-2xl p-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Información del Piloto</h2>
          <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input className="px-4 py-3 border-2 rounded-xl" placeholder="Nombre" value={form.nombre} onChange={e=>setForm({ ...form, nombre: e.target.value })} required />
            <input className="px-4 py-3 border-2 rounded-xl" placeholder="Apellido" value={form.apellido} onChange={e=>setForm({ ...form, apellido: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input className="px-4 py-3 border-2 rounded-xl" type="date" placeholder="Fecha de nacimiento" value={form.fecha_nacimiento} onChange={e=>setForm({ ...form, fecha_nacimiento: e.target.value })} />
            <input className="px-4 py-3 border-2 rounded-xl" type="email" placeholder="Correo" value={form.email} onChange={e=>setForm({ ...form, email: e.target.value })} required />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input className="px-4 py-3 border-2 rounded-xl" placeholder="Número de teléfono" value={form.telefono} onChange={e=>setForm({ ...form, telefono: e.target.value })} />
            <input className="px-4 py-3 border-2 rounded-xl" placeholder="Número de licencia" value={form.licencia} onChange={e=>setForm({ ...form, licencia: e.target.value })} />
          </div>
          {/* Tarifa por hora se establece por defecto en el servidor */}
          <div className="flex items-center gap-3">
            <button disabled={loading} className="px-5 py-3 bg-[#003D82] hover:bg-[#0A2F5F] text-white rounded-xl disabled:opacity-40 transition-colors">{loading?"Creando...":"Crear piloto"}</button>
            {message && <span className="text-sm text-slate-700">{message}</span>}
          </div>
        </form>
        <div className="mt-6 pt-6 border-t border-slate-200">
          <a href="/admin/dashboard" className="text-[#003D82] hover:text-[#0A2F5F] font-semibold transition-colors">← Volver al Dashboard</a>
        </div>
      </div>
      </div>
    </div>
  );
}
