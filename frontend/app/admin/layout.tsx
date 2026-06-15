"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell, { AppRole } from "@/components/layout/AppShell";
import { Loader2 } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [role, setRole] = useState<AppRole | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const userRole = localStorage.getItem("user_role") as AppRole;
      const token = localStorage.getItem("access_token");
      if (!token || !["dept_admin", "org_admin", "super_admin"].includes(userRole)) {
        router.replace("/login");
      } else {
        setRole(userRole);
      }
    }
  }, [router]);

  if (!role) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
        <Loader2 size={32} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Authenticating...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <AppShell role={role}>
      {children}
    </AppShell>
  );
}
