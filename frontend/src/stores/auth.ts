import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Me } from "@/types/api";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  me: Me | null;
  setTokens: (access: string | null, refresh: string | null) => void;
  setMe: (me: Me | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      me: null,
      setTokens: (access, refresh) => set({ accessToken: access, refreshToken: refresh }),
      setMe: (me) => set({ me }),
      clear: () => set({ accessToken: null, refreshToken: null, me: null }),
    }),
    {
      name: "hrms-auth",
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    },
  ),
);

export function rolesAtLeast(role: Me["role"] | undefined, min: Me["role"]): boolean {
  // Two real roles: EMPLOYEE (1) and ADMIN (2). The legacy admin names all map
  // to the admin level so existing `min="HR_ADMIN"` / `"MANAGER"` calls keep working.
  const order: Record<Me["role"], number> = {
    EMPLOYEE: 1,
    ADMIN: 2,
    MANAGER: 2,
    HR_ADMIN: 2,
    SUPER_ADMIN: 2,
  };
  if (!role) return false;
  return order[role] >= order[min];
}
