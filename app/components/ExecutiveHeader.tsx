import Image from "next/image";
import Link from "next/link";

type Props = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
};

export default function ExecutiveHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="executive-header relative">
      <div className="relative z-10 px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="transition-transform hover:scale-105">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
                <Image 
                  src="/LOGO_BLANCO.png?v=3" 
                  alt="CC-AQI" 
                  width={120} 
                  height={60}
                  className="h-auto w-auto max-h-[50px]"
                  priority
                />
              </div>
            </Link>
            <div className="border-l border-white/20 pl-6">
              <h1 className="text-3xl font-bold text-white tracking-tight mb-1">
                {title}
              </h1>
              {subtitle && (
                <p className="text-blue-100/80 text-sm font-medium tracking-wide">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {actions && (
            <div className="flex items-center gap-3">
              {actions}
            </div>
          )}
        </div>
      </div>
      
      {/* Decorative bottom border */}
      <div className="h-1 bg-gradient-to-r from-blue-500 via-blue-400 to-blue-300"></div>
    </div>
  );
}
