import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/lib/AppShell';

export const metadata: Metadata = {
  title: 'BANANA CLIPS AI STUDIO — Plataforma Privada de Clipping con IA',
  description: 'Transforma videos largos en clips cortos optimizados para TikTok, Reels, Shorts y Twitch con IA local.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.png', type: 'image/png', sizes: '64x64' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
