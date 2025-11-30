"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("admin@aeroclub.com");
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
    setLoading(false);
    if (res?.error) {
      setError("Credenciales inválidas");
    } else {
      // Get user session to check role
      const session = await fetch('/api/auth/session').then(r => r.json());
      if (session?.user?.rol === 'ADMIN') {
        router.push("/admin/submissions");
      } else {
        router.push("/pilot/dashboard");
      }
    }
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
        <p className="text-xs text-gray-500">Usa admin@aeroclub.com / admin123 para pruebas.</p>
      </form>
      </div>
    </div>
  );
}
