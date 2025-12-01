"use client";
import { useState, useEffect } from "react";
import ExecutiveHeader from "@/app/components/ExecutiveHeader";
import ExecutiveNav from "@/app/components/ExecutiveNav";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";

export default function FuelChargesPage() {
  const [charges, setCharges] = useState<any[]>([]);
  const [pilots, setPilots] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ 
    userId: "", 
    liters: "", 
    pricePerLiter: "", 
    date: new Date().toISOString().split('T')[0], 
    location: "", 
    reference: "" 
  });

  useEffect(() => {
    fetchCharges();
    fetchPilots();
  }, []);

  async function fetchCharges() {
    const res = await fetch("/api/fuel-charges");
    const json = await res.json();
    setCharges(json.fuelCharges ?? []);
  }

  async function fetchPilots() {
    const res = await fetch("/api/pilots/list");
    const json = await res.json();
    setPilots(json.pilots ?? []);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/fuel-charges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ userId: "", liters: "", pricePerLiter: "", date: new Date().toISOString().split('T')[0], location: "", reference: "" });
    setShowForm(false);
    fetchCharges();
  }

  async function handleDelete(id: number) {
    if (!confirm("¿Eliminar cargo de combustible?")) return;
    await fetch(`/api/fuel-charges/${id}`, { method: "DELETE" });
    fetchCharges();
  }

  const totalSpent = charges.reduce((sum, c) => sum + c.totalAmount, 0);
  const totalLiters = charges.reduce((sum, c) => sum + c.liters, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-gray-50">
      <ExecutiveHeader 
        title="Gestión de Combustible"
        subtitle="Fuel Operations • Cost Tracking"
        actions={
          <button 
            onClick={() => setShowForm(!showForm)}
            className="btn-executive btn-executive-primary"
          >
            <PlusIcon className="w-5 h-5" />
            Nuevo Cargo
          </button>
        }
      />
      
      <ExecutiveNav />

      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 animate-slide-in">
          <div className="stat-card">
            <div className="stat-icon">⛽</div>
            <div className="stat-value">{totalLiters.toFixed(1)}</div>
            <div className="stat-label">Litros Totales</div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon">💸</div>
            <div className="stat-value">${totalSpent.toLocaleString('es-CL')}</div>
            <div className="stat-label">Total Gastado</div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon">📋</div>
            <div className="stat-value">{charges.length}</div>
            <div className="stat-label">Transacciones</div>
          </div>
        </div>

        {showForm && (
          <div className="executive-card mb-6 p-6 animate-slide-in">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Registrar Cargo de Combustible</h3>
            <form onSubmit={handleSubmit} className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Cliente</label>
                <select 
                  className="executive-input" 
                  value={form.userId} 
                  onChange={e => setForm({...form, userId: e.target.value})} 
                  required
                >
                  <option value="">Seleccionar Piloto</option>
                  {pilots.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.codigo} - {p.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Litros</label>
                <input 
                  type="number" 
                  step="0.1"
                  className="executive-input" 
                  value={form.liters} 
                  onChange={e => setForm({...form, liters: e.target.value})} 
                  required 
                  placeholder="0.0"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Precio/Litro (CLP)</label>
                <input 
                  type="number" 
                  className="executive-input" 
                  value={form.pricePerLiter} 
                  onChange={e => setForm({...form, pricePerLiter: e.target.value})} 
                  required 
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Fecha</label>
                <input 
                  type="date" 
                  className="executive-input" 
                  value={form.date} 
                  onChange={e => setForm({...form, date: e.target.value})} 
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Ubicación</label>
                <input 
                  type="text" 
                  className="executive-input" 
                  value={form.location} 
                  onChange={e => setForm({...form, location: e.target.value})} 
                  placeholder="Aeródromo"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Referencia</label>
                <input 
                  type="text" 
                  className="executive-input" 
                  value={form.reference} 
                  onChange={e => setForm({...form, reference: e.target.value})} 
                  placeholder="N° Factura"
                />
              </div>

              <div className="col-span-3 flex gap-3 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="btn-executive btn-executive-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn-executive btn-executive-primary">
                  Registrar Cargo
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="executive-card overflow-hidden">
          <table className="executive-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th className="text-right">Litros</th>
                <th className="text-right">Precio/L</th>
                <th className="text-right">Total</th>
                <th>Ubicación</th>
                <th>Referencia</th>
                <th className="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {charges.map(c => (
                <tr key={c.id}>
                  <td className="font-mono">{new Date(c.date).toLocaleDateString('es-CL')}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                        {c.User.codigo?.substring(0, 2) || "??"}
                      </div>
                      <div>
                        <div className="font-semibold">{c.User.nombre}</div>
                        <div className="text-xs text-gray-500">{c.User.codigo}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-right font-mono">{c.liters.toFixed(1)}L</td>
                  <td className="text-right font-mono text-sm">${c.pricePerLiter.toLocaleString('es-CL')}</td>
                  <td className="text-right font-mono font-semibold text-red-600">
                    ${c.totalAmount.toLocaleString('es-CL')}
                  </td>
                  <td className="text-gray-600">{c.location || "—"}</td>
                  <td className="font-mono text-sm text-gray-500">{c.reference || "—"}</td>
                  <td className="text-center">
                    <button 
                      onClick={() => handleDelete(c.id)} 
                      className="text-red-600 hover:text-red-700 transition-colors p-2 rounded-lg hover:bg-red-50"
                      title="Eliminar"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
