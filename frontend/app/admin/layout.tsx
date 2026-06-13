"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "@/components/layout/BottomNav";
import { Loader2 } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const userRole = localStorage.getItem("user_role");
      const token = localStorage.getItem("access_token");

      if (!token || !userRole || !["dept_admin", "org_admin", "super_admin"].includes(userRole)) {
        router.replace("/login");
      } else {
        setRole(userRole);
        setLoading(false);
      }
    }
  }, [router]);

  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <Loader2 className="animate-spin" size={36} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Authenticating admin session...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <>
      {children}
      {role && <BottomNav role={role as any} />}
    </>
  );
}
