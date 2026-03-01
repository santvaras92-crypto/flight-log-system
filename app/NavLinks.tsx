'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useEffect, useState } from 'react'

export default function NavLinks() {
  const pathname = usePathname()
  const isRegistro = pathname === '/register'
  const [pendingCount, setPendingCount] = useState(0)

  // Fetch pending validation count every 30 seconds
  useEffect(() => {
    if (isRegistro) return

    const fetchCount = async () => {
      try {
        const res = await fetch('/api/pending-count', { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          setPendingCount(data.count || 0)
        }
      } catch {}
    }

    fetchCount()
    const interval = setInterval(fetchCount, 30000)
    return () => clearInterval(interval)
  }, [isRegistro])

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
        className="relative px-2 sm:px-4 py-2 text-[10px] sm:text-sm font-semibold text-blue-100 hover:text-white hover:bg-white/15 rounded-lg transition-all"
      >
        <span className="hidden sm:inline">Validación</span>
        <span className="sm:hidden">✓</span>
        {pendingCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 shadow-lg animate-pulse">
            {pendingCount > 99 ? '99+' : pendingCount}
          </span>
        )}
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
