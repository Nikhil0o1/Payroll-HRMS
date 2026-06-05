import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import type { Me } from "@/types/api";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const setMe = useAuthStore((s) => s.setMe);
  const me = useAuthStore((s) => s.me);
  const location = useLocation();

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const r = await api.get<Me>("/auth/me");
      return r.data;
    },
    enabled: !!accessToken,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (meQuery.data) setMe(meQuery.data);
  }, [meQuery.data, setMe]);

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!me && meQuery.isLoading) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  if (meQuery.isError) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function RoleGuard({
  children,
  min,
}: {
  children: React.ReactNode;
  min: "MANAGER" | "HR_ADMIN" | "SUPER_ADMIN";
}) {
  const me = useAuthStore((s) => s.me);
  const order = { EMPLOYEE: 1, MANAGER: 2, HR_ADMIN: 3, SUPER_ADMIN: 4 } as const;
  if (!me) return null;
  if (order[me.role] < order[min]) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-12 text-center">
        <p className="font-semibold">Access denied</p>
        <p className="text-sm text-muted-foreground mt-1">
          You don't have permission to view this page.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
