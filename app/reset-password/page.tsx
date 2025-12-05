"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [userName, setUserName] = useState("");
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    async function verifyToken() {
      if (!token) {
        setVerifying(false);
        setTokenValid(false);
        return;
      }

      try {
        const res = await fetch(`/api/auth/reset-password?token=${token}`);
        const data = await res.json();
        
        setTokenValid(data.valid);
        if (data.userName) {
          setUserName(data.userName);
        }
      } catch {
        setTokenValid(false);
      } finally {
        setVerifying(false);
      }
    }

    verifyToken();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Las contraseñas no coinciden.' });
      return;
    }

    if (password.length < 6) {
      setMessage({ type: 'error', text: 'La contraseña debe tener al menos 6 caracteres.' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: 'success', text: data.message });
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error de conexión. Intenta de nuevo.' });
    } finally {
      setLoading(false);
    }
  }

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="text-gray-500">Verificando link...</div>
      </div>
    );
  }

  if (!token || !tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex justify-center">
            <img src="/logo.png" alt="CC-AQI" className="h-[8.162rem] w-auto" />
          </div>
          <div className="bg-white shadow rounded p-6 space-y-4 text-center">
            <h1 className="text-xl font-semibold text-red-600">Link Inválido</h1>
            <p className="text-sm text-gray-600">
              El link ha expirado o no es válido. Por favor solicita uno nuevo.
            </p>
            <Link 
              href="/forgot-password" 
              className="inline-block bg-[#003D82] text-white py-2 px-4 rounded text-sm hover:bg-[#0A2F5F]"
            >
              Solicitar Nuevo Link
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (message?.type === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex justify-center">
            <img src="/logo.png" alt="CC-AQI" className="h-[8.162rem] w-auto" />
          </div>
          <div className="bg-white shadow rounded p-6 space-y-4 text-center">
            <div className="text-green-500 text-5xl mb-2">✓</div>
            <h1 className="text-xl font-semibold text-green-600">¡Contraseña Actualizada!</h1>
            <p className="text-sm text-gray-600">{message.text}</p>
            <Link 
              href="/login" 
              className="inline-block bg-[#003D82] text-white py-2 px-4 rounded text-sm hover:bg-[#0A2F5F]"
            >
              Ir al Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <img src="/logo.png" alt="CC-AQI" className="h-[8.162rem] w-auto" />
        </div>
        <form onSubmit={handleSubmit} className="bg-white shadow rounded p-6 space-y-4">
          <h1 className="text-xl font-semibold text-gray-700">Nueva Contraseña</h1>
          {userName && (
            <p className="text-sm text-gray-500">
              Hola <strong>{userName}</strong>, ingresa tu nueva contraseña.
            </p>
          )}
          <div className="space-y-2">
            <label className="block text-sm font-medium">Nueva Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="Mínimo 6 caracteres"
              required
              minLength={6}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium">Confirmar Contraseña</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="Repite la contraseña"
              required
            />
          </div>
          {message?.type === 'error' && (
            <p className="text-sm text-red-600">{message.text}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#003D82] text-white py-2 rounded text-sm hover:bg-[#0A2F5F] disabled:opacity-50"
          >
            {loading ? "Guardando..." : "Guardar Nueva Contraseña"}
          </button>
        </form>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="text-gray-500">Cargando...</div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
