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
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 px-6 py-8">
      <div className="max-w-2xl mx-auto bg-white/95 border-2 border-slate-200 rounded-2xl shadow-2xl p-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-4">Añadir nuevo piloto</h1>
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
            <button disabled={loading} className="px-5 py-3 bg-blue-600 text-white rounded-xl disabled:opacity-40">{loading?"Creando...":"Crear piloto"}</button>
            {message && <span className="text-sm text-slate-700">{message}</span>}
          </div>
        </form>
        <div className="mt-6">
          <a href="/admin/dashboard" className="text-blue-700 font-semibold">← Volver al Dashboard</a>
        </div>
      </div>
    </div>
  );
}
