'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useStudioStore, apiFetch } from './store';
import { CreateClipsWizardModal } from './WizardModal';
import {
  LayoutDashboard,
  Scissors,
  Gamepad2,
  Search,
  Radio,
  Layers,
  Film,
  FolderKanban,
  Share2,
  Sparkles,
  BarChart3,
  Settings,
  Users,
  ShieldCheck,
  Cpu,
  HardDrive,
  FileText,
  Lock,
  Sliders,
  LogOut,
  Sun,
  Moon,
  Globe,
} from 'lucide-react';

const MAIN_NAV = [
  { href: '/dashboard', labelEs: 'Dashboard', labelEn: 'Dashboard', icon: LayoutDashboard },
  { href: '/ai-clipping', labelEs: 'AI Clipping', labelEn: 'AI Clipping', icon: Scissors },
  { href: '/game-clipping', labelEs: 'Game Clipping', labelEn: 'Game Clipping', icon: Gamepad2 },
  { href: '/find-moments', labelEs: 'Find Moments', labelEn: 'Find Moments', icon: Search },
  { href: '/live-clipper', labelEs: 'Live Clipper', labelEn: 'Live Clipper', icon: Radio },
  { href: '/ai-montage', labelEs: 'AI Story 60s & Montage', labelEn: 'AI Story 60s & Montage', icon: Layers },
  { href: '/editor', labelEs: 'Editor de Video', labelEn: 'Video Editor', icon: Film },
  { href: '/library', labelEs: 'Mi Biblioteca', labelEn: 'My Library', icon: FolderKanban },
  { href: '/social', labelEs: 'Publicaciones', labelEn: 'Social Publishing', icon: Share2 },
  { href: '/templates', labelEs: 'Plantillas', labelEn: 'Templates', icon: Sparkles },
  { href: '/analytics', labelEs: 'Analíticas', labelEn: 'Analytics', icon: BarChart3 },
  { href: '/settings', labelEs: 'Configuración', labelEn: 'Settings', icon: Settings },
];

const ADMIN_NAV = [
  { href: '/admin/users', labelEs: 'Usuarios', icon: Users },
  { href: '/admin/roles', labelEs: 'Roles y Permisos', icon: ShieldCheck },
  { href: '/admin/tasks', labelEs: 'Tareas', icon: Layers },
  { href: '/admin/workers', labelEs: 'Workers', icon: Cpu },
  { href: '/admin/storage', labelEs: 'Almacenamiento', icon: HardDrive },
  { href: '/admin/logs', labelEs: 'Logs', icon: FileText },
  { href: '/admin/security', labelEs: 'Seguridad', icon: Lock },
  { href: '/admin/ai-config', labelEs: 'Configuración IA', icon: Sparkles },
  { href: '/admin/general-config', labelEs: 'Configuración General', icon: Sliders },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, setAuth, locale, setLocale, theme, setTheme, setWizardOpen, logout } = useStudioStore();
  const [checkedAuth, setCheckedAuth] = useState(false);

  const isPublicLogin = pathname === '/login';

  useEffect(() => {
    if (isPublicLogin) {
      setCheckedAuth(true);
      return;
    }
    const storedToken = localStorage.getItem('banana_access_token');
    if (!storedToken) {
      router.replace('/login');
      return;
    }
    apiFetch<{ user: any }>('/auth/me')
      .then((res) => {
        setAuth(res.user, storedToken);
        setCheckedAuth(true);
        if (res.user?.mustChangePassword && pathname !== '/settings') {
          router.replace('/settings?forcePasswordChange=1');
        }
      })
      .catch(() => {
        logout();
        router.replace('/login');
      });
  }, [pathname, isPublicLogin]);

  if (isPublicLogin) {
    return <>{children}</>;
  }

  if (!checkedAuth || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#111318] text-[#F8FAFC]">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-[#1B1E25] px-6 py-4">
          <div className="h-4 w-4 animate-ping rounded-full bg-[#FFD43B]" />
          <span className="text-sm font-medium">Verificando sesión privada en BANANA CLIPS AI STUDIO...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#111318] text-[#F8FAFC]">
      {/* Professional Sidebar */}
      <aside className="flex w-64 flex-col border-r border-slate-800/80 bg-[#1B1E25]">
        <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#FFD43B]/40 bg-white p-1 shadow">
            <img
              src="/banana-clips-logo.jpg"
              alt="Banana Clips Logo"
              className="h-full w-full object-contain"
            />
          </div>
          <div>
            <div className="text-sm font-extrabold tracking-wide text-[#FFD43B]">BANANA CLIPS</div>
            <div className="text-[10px] font-medium uppercase tracking-widest text-[#94A3B8]">AI Studio Privado</div>
          </div>
        </div>

        <div className="px-4 pt-4">
          <button
            type="button"
            data-testid="btn-crear-clips-ia"
            onClick={() => setWizardOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FFD43B] px-4 py-2.5 text-sm font-bold text-[#111318] shadow hover:bg-[#FFB703] transition"
          >
            <Sparkles className="h-4 w-4" />
            {locale === 'es' ? 'Crear clips con IA' : 'Create AI Clips'}
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
            {locale === 'es' ? 'Estudio Principal' : 'Main Studio'}
          </div>
          {MAIN_NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium transition ${
                  active
                    ? 'bg-[#FFD43B]/15 text-[#FFD43B] font-semibold'
                    : 'text-[#94A3B8] hover:bg-slate-800/60 hover:text-[#F8FAFC]'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{locale === 'es' ? item.labelEs : item.labelEn}</span>
              </Link>
            );
          })}

          {user.role === 'SUPER_ADMIN' && (
            <>
              <div className="mt-5 px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#FFB703]">
                Administración (SUPER_ADMIN)
              </div>
              {ADMIN_NAV.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium transition ${
                      active
                        ? 'bg-[#FFB703]/20 text-[#FFD43B] font-semibold'
                        : 'text-[#94A3B8] hover:bg-slate-800/60 hover:text-[#F8FAFC]'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.labelEs}</span>
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        <div className="border-t border-slate-800 p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <div>
              <div className="font-bold text-[#F8FAFC]">{user.fullName}</div>
              <div className="text-[11px] text-[#94A3B8]">@{user.username} • {user.role}</div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setLocale(locale === 'es' ? 'en' : 'es')}
                title="Cambiar idioma ES/EN"
                className="rounded-lg p-1.5 text-[#94A3B8] hover:bg-slate-800 hover:text-white"
              >
                <Globe className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                title="Cambiar tema Oscuro/Claro"
                className="rounded-lg p-1.5 text-[#94A3B8] hover:bg-slate-800 hover:text-white"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button
                type="button"
                data-testid="btn-logout"
                onClick={async () => {
                  await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
                  logout();
                  router.replace('/login');
                }}
                title="Cerrar sesión"
                className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/10"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6">
        {children}
      </main>

      <CreateClipsWizardModal />
    </div>
  );
}
