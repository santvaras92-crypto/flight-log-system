import type { Metadata } from "next";
import "./globals.css";
import Image from "next/image";
import Link from "next/link";
import NavLinks from "./NavLinks";

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
        {/* Clean Professional Navigation */}
        <nav className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 border-b border-blue-600/30 backdrop-blur-md shadow-lg">
          <div className="max-w-[1920px] mx-auto px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center justify-between">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-3 sm:gap-4 group">
                <div className="relative w-12 h-10 sm:w-16 sm:h-12 transition-transform group-hover:scale-105">
                  <Image
                    src="/LOGO_BLANCO.png"
                    alt="Logo"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
                <div className="hidden md:flex flex-col">
                  <span className="text-white font-bold text-base sm:text-lg tracking-tight">CC-AQI</span>
                  <span className="text-blue-200 text-xs font-medium tracking-wider uppercase">Flight Operations</span>
                </div>
              </Link>
              
              {/* Navigation Links - Mobile Responsive */}
              <NavLinks />
            </div>
          </div>
        </nav>
        
        {/* Main Content with top padding for fixed nav */}
        <main className="pt-20 sm:pt-24">
          {children}
        </main>
      </body>
    </html>
  );
}

