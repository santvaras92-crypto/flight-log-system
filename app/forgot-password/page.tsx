"use client";
import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: 'success', text: data.message || 'Si el email existe, recibirás un link para restablecer tu contraseña.' });
        setEmail("");
      } else {
        setMessage({ type: 'error', text: data.error || 'Error al procesar la solicitud.' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error de conexión. Intenta de nuevo.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <img src="/logo.png" alt="CC-AQI" className="h-[8.162rem] w-auto" />
        </div>
        <form onSubmit={handleSubmit} className="bg-white shadow rounded p-6 space-y-4">
          <h1 className="text-xl font-semibold text-gray-700">Recuperar Contraseña</h1>
          <p className="text-sm text-gray-500">
            Ingresa tu email y te enviaremos un link para restablecer tu contraseña.
          </p>
          <div className="space-y-2">
            <label className="block text-sm font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="tu@email.com"
              required
            />
          </div>
          {message && (
            <p className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {message.text}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#003D82] text-white py-2 rounded text-sm hover:bg-[#0A2F5F] disabled:opacity-50"
          >
            {loading ? "Enviando..." : "Enviar Link de Recuperación"}
          </button>
          <div className="text-center">
            <Link href="/login" className="text-sm text-[#003D82] hover:underline">
              Volver al Login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
