'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

export default function NavLinks() {
  const pathname = usePathname()
  const isRegistro = pathname === '/register'
  
  const handleLogout = () => {
    signOut({ callbackUrl: '/login' })
  }
  
  if (isRegistro) {
    // Hide right-side tabs on Registro page
    return <div className="flex items-center gap-1 sm:gap-2" />
  }

  return (
    <div className="flex items-center gap-0.5 sm:gap-2">
      <Link 
        href="/" 
        className="px-2 sm:px-4 py-2 text-[10px] sm:text-sm font-semibold text-blue-100 hover:text-white hover:bg-white/15 rounded-lg transition-all"
      >
        <span className="hidden sm:inline">Registro</span>
        <span className="sm:hidden">✈️</span>
      </Link>
      <Link 
        href="/admin/dashboard" 
        className="px-2 sm:px-4 py-2 text-[10px] sm:text-sm font-semibold text-blue-100 hover:text-white hover:bg-white/15 rounded-lg transition-all"
      >
        <span className="hidden sm:inline">Dashboard</span>
        <span className="sm:hidden">📈</span>
      </Link>
      <Link 
        href="/admin/validacion" 
        className="px-2 sm:px-4 py-2 text-[10px] sm:text-sm font-semibold text-blue-100 hover:text-white hover:bg-white/15 rounded-lg transition-all"
      >
        <span className="hidden sm:inline">Validación</span>
        <span className="sm:hidden">✓</span>
      </Link>
      <Link 
        href="/admin/counters" 
        className="px-2 sm:px-4 py-2 text-[10px] sm:text-sm font-semibold text-blue-100 hover:text-white hover:bg-white/15 rounded-lg transition-all"
      >
        <span className="hidden sm:inline">Contadores</span>
        <span className="sm:hidden">📊</span>
      </Link>
      <button
        onClick={handleLogout}
        className="px-2 sm:px-4 py-2 text-[10px] sm:text-sm font-semibold text-red-200 hover:text-white hover:bg-red-500/30 rounded-lg transition-all"
      >
        <span className="hidden sm:inline">Cerrar Sesión</span>
        <span className="sm:hidden">🚪</span>
      </button>
    </div>
  )
}
