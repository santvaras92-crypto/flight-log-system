'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function NavLinks() {
  const pathname = usePathname()
  const isRegistro = pathname === '/register'
  
  if (isRegistro) {
    // Hide right-side tabs on Registro page
    return <div className="flex items-center gap-1 sm:gap-2" />
  }

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <Link 
        href="/" 
        className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-blue-100 hover:text-white hover:bg-white/15 rounded-lg transition-all"
      >
        Registro
      </Link>
      <Link 
        href="/admin/dashboard" 
        className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-blue-100 hover:text-white hover:bg-white/15 rounded-lg transition-all"
      >
        Dashboard
      </Link>
      <Link 
        href="/admin/submissions" 
        className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-blue-100 hover:text-white hover:bg-white/15 rounded-lg transition-all"
      >
        <span className="hidden sm:inline">Validación</span>
        <span className="sm:hidden">Valid.</span>
      </Link>
      <Link 
        href="/admin/counters" 
        className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-blue-100 hover:text-white hover:bg-white/15 rounded-lg transition-all"
      >
        <span className="hidden lg:inline">Contadores</span>
        <span className="lg:hidden">📊</span>
      </Link>
    </div>
  )
}
