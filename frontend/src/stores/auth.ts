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
  const order: Record<Me["role"], number> = {
    EMPLOYEE: 1,
    MANAGER: 2,
    HR_ADMIN: 3,
    SUPER_ADMIN: 4,
  };
  if (!role) return false;
  return order[role] >= order[min];
}
