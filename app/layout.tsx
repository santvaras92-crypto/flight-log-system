import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";
import MainNav from "./MainNav";

export const metadata: Metadata = {
  title: "Flight Log System · CC-AQI",
  description: "Professional Flight Operations Management",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AQI Flight",
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1e40af',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <Providers>
          <MainNav />
          {children}
        </Providers>
      </body>
    </html>
  );
}