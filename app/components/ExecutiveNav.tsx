"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  HomeIcon, 
  ClipboardDocumentListIcon, 
  UserGroupIcon, 
  CurrencyDollarIcon,
  WrenchScrewdriverIcon,
  ChartBarIcon,
  Cog6ToothIcon
} from "@heroicons/react/24/outline";

const navItems = [
  { href: "/admin/dashboard", label: "Dashboard", icon: HomeIcon },
  { href: "/grids/flight-entries", label: "Flight Log", icon: ChartBarIcon },
  { href: "/grids/pilots-account", label: "Pilots Account", icon: UserGroupIcon },
  { href: "/grids/pilot-directory", label: "Pilot Directory", icon: UserGroupIcon },
  { href: "/grids/maintenance", label: "Maintenance", icon: WrenchScrewdriverIcon },
  { href: "/admin/deposits", label: "Depósitos", icon: CurrencyDollarIcon },
  { href: "/admin/fuel-charges", label: "Combustible", icon: Cog6ToothIcon },
  { href: "/admin/submissions", label: "Aprobaciones", icon: ClipboardDocumentListIcon },
];

export default function ExecutiveNav() {
  const pathname = usePathname();

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="px-6">
        <div className="flex space-x-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-2 px-5 py-4 text-sm font-semibold
                  transition-all duration-200 border-b-2 relative
                  ${isActive 
                    ? 'text-blue-600 border-blue-600' 
                    : 'text-gray-600 border-transparent hover:text-gray-900 hover:border-gray-300'
                  }
                `}
              >
                <Icon className="w-5 h-5" />
                <span className="tracking-wide">{item.label}</span>
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-blue-600"></div>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
