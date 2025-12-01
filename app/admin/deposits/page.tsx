"use client";
import React, { useState } from 'react';
import CorrectionButton from './CorrectionButton';
import { updateLastDepositAmount } from './actions';

export default function DepositsPage() {
  const [showModal, setShowModal] = useState(false);
  const [newAmount, setNewAmount] = useState('');

  const handleCorrection = () => {
    setShowModal(true);
  };

  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    const amount = Number(newAmount);
    if (isNaN(amount) || amount <= 0) {
      setFormError('El monto debe ser mayor a 0');
      return;
    }
    const result = await updateLastDepositAmount(amount);
    if (!result.ok) {
      setFormError(result.error || 'Error al actualizar el monto');
    } else {
      setFormSuccess('Monto actualizado correctamente');
      setShowModal(false);
      setNewAmount('');
      // TODO: Refresh deposit list if needed
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Depósitos</h1>
      <CorrectionButton onClick={handleCorrection} />
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <form
            className="bg-white p-6 rounded shadow-md flex flex-col gap-4"
            onSubmit={handleSubmit}
          >
            <label className="font-semibold">Nuevo monto para el último depósito:</label>
            <input
              type="number"
              value={newAmount}
              onChange={e => setNewAmount(e.target.value)}
              className="border px-2 py-1 rounded"
              required
            />
            {formError && <div className="text-red-600">{formError}</div>}
            {formSuccess && <div className="text-green-600">{formSuccess}</div>}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="px-4 py-2 bg-gray-300 rounded"
                onClick={() => setShowModal(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
