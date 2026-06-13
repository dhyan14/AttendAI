"use client";
import { useRouter } from "next/navigation";
import { ChevronLeft, SlidersHorizontal } from "lucide-react";

interface TopBarProps {
  title: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
  showFilter?: boolean;
  onFilter?: () => void;
}

export default function TopBar({ title, showBack, rightAction, showFilter, onFilter }: TopBarProps) {
  const router = useRouter();
  return (
    <header className="top-bar">
      {showBack ? (
        <button className="top-bar-back" onClick={() => router.back()}>
          <ChevronLeft size={24} />
          {title}
        </button>
      ) : (
        <h1 className="top-bar-title">{title}</h1>
      )}
      {rightAction && rightAction}
      {showFilter && (
        <button className="btn-ghost" style={{ padding: 8 }} onClick={onFilter}>
          <SlidersHorizontal size={20} color="var(--text-secondary)" />
        </button>
      )}
    </header>
  );
}
