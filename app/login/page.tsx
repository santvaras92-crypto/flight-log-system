"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <img src="/logo.png" alt="CC-AQI" className="h-[8.162rem] w-auto" />
          
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
