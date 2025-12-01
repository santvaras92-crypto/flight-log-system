"use client";
import { useState, useEffect } from "react";
import ExecutiveHeader from "@/app/components/ExecutiveHeader";
import ExecutiveNav from "@/app/components/ExecutiveNav";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";

export default function DepositsPage() {
  const [deposits, setDeposits] = useState<any[]>([]);
  const [pilots, setPilots] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ 
    userId: "", 
    amount: "", 
    date: new Date().toISOString().split('T')[0], 
    description: "", 
    reference: "" 
  });

  useEffect(() => {
    fetchDeposits();
    fetchPilots();
  }, []);

  async function fetchDeposits() {
    const res = await fetch("/api/deposits");
    const json = await res.json();
    setDeposits(json.deposits ?? []);
  }

  async function fetchPilots() {
    const res = await fetch("/api/pilots/list");
    const json = await res.json();
    setPilots(json.pilots ?? []);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/deposits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ userId: "", amount: "", date: new Date().toISOString().split('T')[0], description: "", reference: "" });
    setShowForm(false);
    fetchDeposits();
  }

  async function handleDelete(id: number) {
    if (!confirm("¿Confirmar eliminación del depósito?")) return;
    await fetch(`/api/deposits/${id}`, { method: "DELETE" });
    fetchDeposits();
  }

  const totalDeposits = deposits.reduce((sum, d) => sum + d.amount, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-gray-50">
      <ExecutiveHeader 
        title="Gestión de Depósitos"
        subtitle="Financial Operations • Client Deposits"
        actions={
          <button 
            onClick={() => setShowForm(!showForm)}
            className="btn-executive btn-executive-primary"
          >
            <PlusIcon className="w-5 h-5" />
            Nuevo Depósito
          </button>
        }
      />
      
      <ExecutiveNav />

      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 animate-slide-in">
          <div className="stat-card">
            <div className="stat-icon">💰</div>
            <div className="stat-value">${totalDeposits.toLocaleString('es-CL')}</div>
            <div className="stat-label">Total Depositado</div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon">📊</div>
            <div className="stat-value">{deposits.length}</div>
            <div className="stat-label">Transacciones</div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon">👥</div>
            <div className="stat-value">{new Set(deposits.map(d => d.userId)).size}</div>
            <div className="stat-label">Clientes Activos</div>
          </div>
        </div>

        {showForm && (
          <div className="executive-card mb-6 p-6 animate-slide-in">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Registrar Depósito</h3>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
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
                <label className="block text-sm font-semibold text-gray-700 mb-2">Monto (CLP)</label>
                <input 
                  type="number" 
                  className="executive-input" 
                  value={form.amount} 
                  onChange={e => setForm({...form, amount: e.target.value})} 
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
                <label className="block text-sm font-semibold text-gray-700 mb-2">Referencia</label>
                <input 
                  type="text" 
                  className="executive-input" 
                  value={form.reference} 
                  onChange={e => setForm({...form, reference: e.target.value})} 
                  placeholder="N° Transferencia"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Descripción</label>
                <input 
                  type="text" 
                  className="executive-input" 
                  value={form.description} 
                  onChange={e => setForm({...form, description: e.target.value})} 
                  placeholder="Opcional"
                />
              </div>

              <div className="col-span-2 flex gap-3 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="btn-executive btn-executive-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn-executive btn-executive-primary">
                  Registrar Depósito
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
                <th className="text-right">Monto</th>
                <th>Descripción</th>
                <th>Referencia</th>
                <th className="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {deposits.map(d => (
                <tr key={d.id}>
                  <td className="font-mono">{new Date(d.date).toLocaleDateString('es-CL')}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                        {d.User.codigo?.substring(0, 2) || "??"}
                      </div>
                      <div>
                        <div className="font-semibold">{d.User.nombre}</div>
                        <div className="text-xs text-gray-500">{d.User.codigo}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-right font-mono font-semibold text-green-600">
                    ${d.amount.toLocaleString('es-CL')}
                  </td>
                  <td className="text-gray-600">{d.description || "—"}</td>
                  <td className="font-mono text-sm text-gray-500">{d.reference || "—"}</td>
                  <td className="text-center">
                    <button 
                      onClick={() => handleDelete(d.id)} 
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
