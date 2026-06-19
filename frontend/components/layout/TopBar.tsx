"use client";
import { useRouter } from "next/navigation";
import { ChevronLeft, SlidersHorizontal } from "lucide-react";

interface TopBarProps {
  title: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
  showFilter?: boolean;
  onFilter?: () => void;
  onBack?: () => void;
  subtitle?: string;
}

export default function TopBar({ title, showBack, rightAction, showFilter, onFilter, subtitle, onBack }: TopBarProps) {
  const router = useRouter();
  return (
    <header className="top-bar">
      <div style={{ flex: 1 }}>
        {showBack ? (
          <button className="top-bar-back" onClick={onBack || (() => router.back())}>
            <ChevronLeft size={22} />
            {title}
          </button>
        ) : (
          <>
            <h1 className="top-bar-title">{title}</h1>
            {subtitle && (
              <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2, paddingLeft: 0 }}>{subtitle}</p>
            )}
          </>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {showFilter && (
          <button
            className="btn-ghost"
            style={{ width: 36, height: 36, borderRadius: "var(--r-sm)", background: "var(--bg-card-2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={onFilter}
          >
            <SlidersHorizontal size={18} color="var(--text-secondary)" />
          </button>
        )}
        {rightAction && rightAction}
      </div>
    </header>
  );
}
