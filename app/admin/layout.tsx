import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin · CC-AQI",
  description: "Panel de Administración CC-AQI Flight Operations",
  manifest: "/admin-manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Admin AQI",
  },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
