import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";
import MainNav from "./MainNav";

export const metadata: Metadata = {
  title: "Flight Log System · CC-AQI",
  description: "Professional Flight Operations Management",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
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