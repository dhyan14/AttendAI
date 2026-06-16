"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { Loader2 } from "lucide-react";

export default function SuperLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem("user_role");
    const token = localStorage.getItem("access_token");
    if (!token || role !== "super_admin") {
      router.replace("/login");
    } else {
      setReady(true);
    }
  }, [router]);

  if (!ready) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={30} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Super admin uses AppShell for the left sidebar on desktop.
  // AppShell's BottomNavBar is suppressed for super_admin — the dashboard has its own section-switcher nav.
  return <AppShell role="super_admin">{children}</AppShell>;
}

