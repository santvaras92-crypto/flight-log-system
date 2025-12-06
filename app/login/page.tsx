"use client";
import { signIn } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const DEVICE_TOKEN_KEY = "aqi_device_token";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoLoginLoading, setAutoLoginLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Intentar auto-login al cargar la página
  useEffect(() => {
    async function tryAutoLogin() {
      const savedToken = localStorage.getItem(DEVICE_TOKEN_KEY);
      if (!savedToken) {
        setAutoLoginLoading(false);
        return;
      }

      try {
        const res = await fetch('/api/auth/device-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceToken: savedToken }),
        });
        
        const data = await res.json();
        
        if (data.success && data.redirectUrl) {
          router.push(data.redirectUrl);
          return;
        } else {
          // Token inválido o expirado, eliminarlo
          localStorage.removeItem(DEVICE_TOKEN_KEY);
        }
      } catch (err) {
        console.error("Auto-login error:", err);
        localStorage.removeItem(DEVICE_TOKEN_KEY);
      }
      
      setAutoLoginLoading(false);
    }
    
    tryAutoLogin();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    const res = await signIn("credentials", {
      redirect: false,
      email,
      password,
    });
    
    if (res?.error) {
      setError("Credenciales inválidas");
      setLoading(false);
      return;
    }
    
    // Fetch session to get role and redirect accordingly
    try {
      const sessionRes = await fetch('/api/auth/session');
      const session = await sessionRes.json();
      const role = session?.user?.role || session?.role;
      const userId = session?.userId;
      
      // Si "Recordar dispositivo" está activo, crear device token
      if (rememberDevice && userId) {
        try {
          const tokenRes = await fetch('/api/device-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              userId,
              deviceInfo: navigator.userAgent 
            }),
          });
          const tokenData = await tokenRes.json();
          if (tokenData.success && tokenData.token) {
            localStorage.setItem(DEVICE_TOKEN_KEY, tokenData.token);
          }
        } catch (err) {
          console.error("Error saving device token:", err);
        }
      }
      
      if (role === "ADMIN") {
        router.push("/admin/dashboard");
      } else if (role === "PILOTO") {
        router.push("/pilot/dashboard");
      } else {
        // Default fallback
        router.push("/admin/dashboard");
      }
    } catch {
      router.push("/admin/dashboard");
    }
    
    setLoading(false);
  }

  // Mostrar loading mientras intenta auto-login
  if (autoLoginLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700 mx-auto mb-2"></div>
          <p className="text-gray-500 text-sm">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <div className="bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 rounded-xl p-4 shadow-lg">
            <img src="/logo.png" alt="CC-AQI" className="h-[8.162rem] w-auto" />
          </div>
        </div>
        <form onSubmit={handleSubmit} className="bg-white shadow rounded p-6 space-y-4">
          <h1 className="text-xl font-semibold text-gray-700">Ingreso</h1>
        <div className="space-y-2">
          <label className="block text-sm font-medium">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
            required
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
            required
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="rememberDevice"
            checked={rememberDevice}
            onChange={(e) => setRememberDevice(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="rememberDevice" className="text-sm text-gray-600">
            Recordar este dispositivo
          </label>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#003D82] text-white py-2 rounded text-sm hover:bg-[#0A2F5F] disabled:opacity-50"
        >
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
        <div className="text-center">
          <Link href="/forgot-password" className="text-sm text-[#003D82] hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
      </form>
      </div>
    </div>
  );
}
