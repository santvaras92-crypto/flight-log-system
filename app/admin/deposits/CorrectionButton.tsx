import React from 'react';

export default function CorrectionButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
      onClick={onClick}
    >
      Corregir monto último depósito
    </button>
  );
}
