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
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Zap,
} from 'lucide-react';

const MAIN_NAV = [
  { href: '/dashboard', labelEs: 'Dashboard', labelEn: 'Dashboard', icon: LayoutDashboard },
  { href: '/ai-clipping', labelEs: 'AI Clipping', labelEn: 'AI Clipping', icon: Scissors, badge: 'IA' },
  { href: '/live-clipper', labelEs: 'Live Clipper', labelEn: 'Live Clipper', icon: Radio, badge: 'LIVE', badgeColor: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { href: '/ai-montage', labelEs: 'AI Story 60s & Stickman', labelEn: 'AI Story 60s', icon: Layers, badge: '24FPS', badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  { href: '/library', labelEs: 'Mi Biblioteca', labelEn: 'My Library', icon: FolderKanban },
  { href: '/game-clipping', labelEs: 'Game Clipping', labelEn: 'Game Clipping', icon: Gamepad2 },
  { href: '/find-moments', labelEs: 'Find Moments', labelEn: 'Find Moments', icon: Search },
  { href: '/editor', labelEs: 'Editor de Video', labelEn: 'Video Editor', icon: Film },
  { href: '/social', labelEs: 'Publicaciones', labelEn: 'Social Publishing', icon: Share2 },
  { href: '/templates', labelEs: 'Plantillas', labelEn: 'Templates', icon: Sparkles },
  { href: '/analytics', labelEs: 'Analíticas', labelEn: 'Analytics', icon: BarChart3 },
  { href: '/settings', labelEs: 'Configuración', labelEn: 'Settings', icon: Settings },
];

const MOBILE_BOTTOM_NAV = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
  { href: '/ai-clipping', label: 'AI Clips', icon: Scissors },
  { href: '/live-clipper', label: 'En Vivo', icon: Radio },
  { href: '/ai-montage', label: 'Story 60s', icon: Layers },
  { href: '/library', label: 'Galería', icon: FolderKanban },
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const isPublicLogin = pathname === '/login';

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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
      <div className="flex min-h-screen items-center justify-center bg-[#0B0D12] p-4 text-[#F8FAFC]">
        <div className="flex items-center gap-3.5 rounded-2xl border border-slate-800/90 bg-[#131720]/90 px-6 py-4 shadow-2xl backdrop-blur-xl">
          <div className="h-3.5 w-3.5 animate-ping rounded-full bg-[#FFD43B]" />
          <span className="text-xs sm:text-sm font-semibold tracking-wide">
            Cargando estudio privado BANANA CLIPS AI...
          </span>
        </div>
      </div>
    );
  }

  const currentNavItem =
    MAIN_NAV.find((item) => pathname === item.href || pathname.startsWith(item.href + '/')) ||
    ADMIN_NAV.find((item) => pathname === item.href);

  const renderSidebarContent = (isMobileDrawer = false) => {
    const collapsed = !isMobileDrawer && sidebarCollapsed;
    return (
      <div className="flex h-full flex-col">
        {/* Brand Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-3.5">
          <Link href="/dashboard" className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#FFD43B]/50 bg-white p-1 shadow-md shadow-[#FFD43B]/10">
              <img
                src="/banana-clips-logo.jpg"
                alt="Banana Clips Logo"
                className="h-full w-full object-contain"
              />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="truncate text-sm font-black tracking-wide bg-gradient-to-r from-[#FFD43B] via-[#FFE066] to-[#FFB703] bg-clip-text text-transparent">
                  BANANA CLIPS
                </div>
                <div className="truncate text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  AI Studio Pro 2.5
                </div>
              </div>
            )}
          </Link>

          {isMobileDrawer ? (
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-xl border border-slate-800 bg-slate-900/80 p-2 text-slate-400 hover:text-white"
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={collapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'}
              className="hidden lg:flex rounded-lg p-1.5 text-slate-400 hover:bg-slate-800/70 hover:text-white transition"
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          )}
        </div>

        {/* Primary CTA */}
        <div className="px-3.5 pt-4 pb-2">
          <button
            type="button"
            data-testid="btn-crear-clips-ia"
            onClick={() => {
              setMobileMenuOpen(false);
              setWizardOpen(true);
            }}
            className={`group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FFD43B] to-[#FFB703] ${
              collapsed ? 'px-2 py-2.5' : 'px-4 py-2.5'
            } text-xs sm:text-sm font-black text-[#0B0D12] shadow-lg shadow-[#FFD43B]/15 hover:brightness-105 active:scale-[0.99] transition`}
          >
            <Sparkles className="h-4 w-4 shrink-0 transition-transform group-hover:rotate-12" />
            {!collapsed && <span>{locale === 'es' ? 'Crear clips con IA' : 'Create AI Clips'}</span>}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {!collapsed && (
            <div className="px-2.5 pb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
              {locale === 'es' ? 'Estudio Principal' : 'Main Studio'}
            </div>
          )}
          {MAIN_NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? (locale === 'es' ? item.labelEs : item.labelEn) : undefined}
                className={`group relative flex items-center ${
                  collapsed ? 'justify-center px-2 py-2.5' : 'justify-between px-3 py-2.5'
                } rounded-xl text-xs font-medium transition-all ${
                  active
                    ? 'bg-gradient-to-r from-[#FFD43B]/20 via-[#FFD43B]/10 to-transparent text-[#FFD43B] font-bold border border-[#FFD43B]/30 shadow-sm'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-100 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-[#FFD43B]' : 'text-slate-400 group-hover:text-slate-200'}`} />
                  {!collapsed && <span className="truncate">{locale === 'es' ? item.labelEs : item.labelEn}</span>}
                </div>
                {!collapsed && item.badge && (
                  <span
                    className={`ml-2 shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                      item.badgeColor || 'border-[#FFD43B]/40 bg-[#FFD43B]/15 text-[#FFD43B]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}

          {user.role === 'SUPER_ADMIN' && (
            <>
              {!collapsed ? (
                <div className="mt-5 px-2.5 pb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-[#FFB703]/90">
                  Administración
                </div>
              ) : (
                <div className="my-3 border-t border-slate-800" />
              )}
              {ADMIN_NAV.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.labelEs : undefined}
                    className={`flex items-center ${
                      collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2'
                    } rounded-xl text-xs font-medium transition ${
                      active
                        ? 'bg-[#FFB703]/20 text-[#FFD43B] font-bold border border-[#FFB703]/30'
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-100'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.labelEs}</span>}
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        {/* User Footer */}
        <div className="border-t border-slate-800/80 bg-[#0E1118]/70 p-3.5">
          <div className={`flex items-center ${collapsed ? 'flex-col gap-2' : 'justify-between'} text-xs`}>
            {!collapsed && (
              <div className="min-w-0 pr-2">
                <div className="truncate font-bold text-slate-100">{user.fullName}</div>
                <div className="truncate text-[11px] text-slate-400">
                  @{user.username} • <span className="text-[#FFD43B] font-semibold">{user.role}</span>
                </div>
              </div>
            )}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setLocale(locale === 'es' ? 'en' : 'es')}
                title="Cambiar idioma ES/EN"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
              >
                <Globe className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                title="Cambiar tema Oscuro/Claro"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
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
                className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/15 transition"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen bg-transparent text-[#F8FAFC]">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 border-r border-slate-800/80 bg-[#131720]/95 backdrop-blur-xl transition-all duration-200 sticky top-0 h-screen ${
          sidebarCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile & Tablet Slide-Over Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 flex w-72 max-w-[85vw] flex-col border-r border-slate-800 bg-[#131720] shadow-2xl">
            {renderSidebarContent(true)}
          </aside>
        </div>
      )}

      {/* Main Content Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky Responsive Top Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-800/80 bg-[#0B0D12]/85 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="flex lg:hidden items-center justify-center rounded-xl border border-slate-800 bg-[#131720] p-2 text-slate-200 hover:border-[#FFD43B]/50"
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex lg:hidden h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#FFD43B]/40 bg-white p-0.5">
                <img src="/banana-clips-logo.jpg" alt="Logo" className="h-full w-full object-contain" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm sm:text-base font-extrabold text-white">
                  {currentNavItem
                    ? 'labelEs' in currentNavItem
                      ? locale === 'es'
                        ? currentNavItem.labelEs
                        : (currentNavItem as any).labelEn || currentNavItem.labelEs
                      : 'Estudio'
                    : 'Banana Clips Studio'}
                </div>
                <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    GPU NVIDIA T400 Activa
                  </span>
                  <span>•</span>
                  <span>Volumen Persistente /data</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Quick Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/live-clipper"
              className="hidden md:inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/20 transition"
            >
              <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
              Live Clipper
            </Link>

            <Link
              href="/ai-montage"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 transition"
            >
              <Zap className="h-3.5 w-3.5" />
              Story 60s
            </Link>

            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#FFD43B] to-[#FFB703] px-3.5 py-2 text-xs font-black text-[#0B0D12] shadow-md shadow-[#FFD43B]/10 hover:brightness-105 transition"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Crear Clips</span>
            </button>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 overflow-x-hidden px-3.5 py-4 pb-24 sm:px-6 sm:py-6 lg:pb-8 max-w-[1600px] w-full mx-auto">
          {children}
        </main>

        {/* Mobile Floating Bottom Navigation Bar */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 flex lg:hidden items-center justify-around border-t border-slate-800/90 bg-[#0B0D12]/95 px-2 py-1.5 backdrop-blur-xl">
          {MOBILE_BOTTOM_NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-bold transition ${
                  active ? 'text-[#FFD43B]' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-[#FFD43B]' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <CreateClipsWizardModal />
    </div>
  );
}
