'use client';

import { create } from 'zustand';

export interface BananaUser {
  id: string;
  username: string;
  email: string | null;
  fullName: string;
  role: 'SUPER_ADMIN' | 'USER';
  status: 'ACTIVE' | 'DISABLED';
  mustChangePassword: boolean;
}

interface StudioStore {
  user: BananaUser | null;
  accessToken: string | null;
  locale: 'es' | 'en';
  theme: 'dark' | 'light';
  wizardOpen: boolean;
  setAuth: (user: BananaUser | null, token: string | null) => void;
  setLocale: (locale: 'es' | 'en') => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setWizardOpen: (open: boolean) => void;
  logout: () => void;
}

export const useStudioStore = create<StudioStore>((set) => ({
  user: null,
  accessToken: null,
  locale: 'es',
  theme: 'dark',
  wizardOpen: false,
  setAuth: (user, accessToken) => {
    if (typeof window !== 'undefined') {
      if (accessToken && user) {
        localStorage.setItem('banana_access_token', accessToken);
        localStorage.setItem('banana_user', JSON.stringify(user));
      } else {
        localStorage.removeItem('banana_access_token');
        localStorage.removeItem('banana_user');
      }
    }
    set({ user, accessToken });
  },
  setLocale: (locale) => set({ locale }),
  setTheme: (theme) => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('light', theme === 'light');
    }
    set({ theme });
  },
  setWizardOpen: (wizardOpen) => set({ wizardOpen }),
  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('banana_access_token');
      localStorage.removeItem('banana_user');
    }
    set({ user: null, accessToken: null });
  },
}));

export async function apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('banana_access_token') : null;
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (!(init.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `Error HTTP ${res.status}`);
  }
  return data as T;
}
