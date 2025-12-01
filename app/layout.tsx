import type { Metadata } from "next";
import "./globals.css";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Flight Log System · CC-AQI",
  description: "Professional Flight Operations Management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        {/* Minimal Executive Navigation */}
        <nav className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-[#0A2540] via-[#0D3A65] to-[#1E4976] border-b border-gray-700/50 backdrop-blur-sm">
          <div className="max-w-[1920px] mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-4 group">
                <div className="relative w-16 h-12 transition-transform group-hover:scale-105">
                  <Image
                    src="/LOGO_BLANCO.png"
                    alt="Logo"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
                <div className="hidden md:flex flex-col">
                  <span className="text-white font-bold text-lg tracking-tight">CC-AQI</span>
                  <span className="text-blue-300 text-xs font-medium tracking-wider uppercase">Flight Operations</span>
                </div>
              </Link>
              
              {/* Minimal Navigation Links */}
              <div className="flex items-center gap-2">
                <Link 
                  href="/" 
                  className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                >
                  Registro
                </Link>
                <Link 
                  href="/admin/dashboard" 
                  className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                >
                  Dashboard
                </Link>
                <Link 
                  href="/admin/submissions" 
                  className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                >
                  Validación
                </Link>
                <Link 
                  href="/pilots/new" 
                  className="px-4 py-2 text-sm font-medium text-blue-400 hover:text-white hover:bg-blue-600/20 rounded-lg transition-all border border-blue-500/30"
                >
                  Nuevo Piloto
                </Link>
              </div>
            </div>
          </div>
        </nav>
        
        {/* Main Content with top padding for fixed nav */}
        <main className="pt-20">
          {children}
        </main>
      </body>
    </html>
  );
}

