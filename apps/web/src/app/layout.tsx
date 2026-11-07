import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/lib/AppShell';

export const metadata: Metadata = {
  title: 'BANANA CLIPS AI STUDIO — Plataforma Privada de Clipping con IA',
  description: 'Transforma videos largos en clips cortos optimizados para TikTok, Reels, Shorts y Twitch con IA local.',
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
