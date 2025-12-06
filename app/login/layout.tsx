import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Portal Piloto · CC-AQI",
  description: "Iniciar sesión en Portal Piloto CC-AQI",
  manifest: "/pilot-manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Portal Piloto",
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
