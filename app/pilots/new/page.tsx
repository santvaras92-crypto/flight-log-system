"use client";
import { useState } from "react";
import ExecutiveHeader from "@/app/components/ExecutiveHeader";
import ExecutiveNav from "@/app/components/ExecutiveNav";

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
    <div className="min-h-screen">
      <ExecutiveHeader 
        title="Pilot Registration"
        subtitle="Register your details to join the system"
      />
      <ExecutiveNav />

      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="executive-card p-8">
          <h2 className="text-2xl font-bold text-navy-950 mb-6">Información del Piloto</h2>
          <form onSubmit={onSubmit} className="space-y-4">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Nombre *</label>
                <input className="executive-input" placeholder="Nombre" value={form.nombre} onChange={e=>setForm({ ...form, nombre: e.target.value })} required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Apellido</label>
                <input className="executive-input" placeholder="Apellido" value={form.apellido} onChange={e=>setForm({ ...form, apellido: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Fecha de nacimiento</label>
                <input className="executive-input" type="date" value={form.fecha_nacimiento} onChange={e=>setForm({ ...form, fecha_nacimiento: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Correo *</label>
                <input className="executive-input" type="email" placeholder="ejemplo@correo.com" value={form.email} onChange={e=>setForm({ ...form, email: e.target.value })} required />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo de documento</label>
                <select 
                  className="executive-input"
                  value={form.tipoDocumento}
                  onChange={e => setForm({ ...form, tipoDocumento: e.target.value as "rut" | "pasaporte", documento: "" })}
                >
                  <option value="rut">RUT</option>
                  <option value="pasaporte">Pasaporte</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
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
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Número de teléfono</label>
                <input className="executive-input" placeholder="+56 9 1234 5678" value={form.telefono} onChange={e=>setForm({ ...form, telefono: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Número de licencia</label>
                <input className="executive-input" type="number" placeholder="123456" value={form.licencia} onChange={e=>setForm({ ...form, licencia: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button disabled={loading} className="btn-executive btn-executive-primary">{loading?"Creando...":"Crear piloto"}</button>
              {message && <span className="text-sm text-gray-700">{message}</span>}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
