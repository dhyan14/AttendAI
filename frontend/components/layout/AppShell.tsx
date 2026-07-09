"use client";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home, Users, User, Building2, FileText, Camera, BookOpen,
  Calendar, BarChart3, Shield, Globe, Settings, LogOut,
  AlertTriangle, Loader2, GraduationCap, UserCog, Lock, Activity,
  Cpu,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────────── */
export type AppRole = "super_admin" | "org_admin" | "dept_admin" | "faculty" | "student";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  fab?: boolean; // highlight as primary action
}

/* ─── Nav Configs ────────────────────────────────────────── */
const superAdminNav: NavItem[] = [
  { href: "/super/dashboard",              label: "Overview",      icon: <Activity size={20} /> },
  { href: "/super/dashboard?s=orgs",       label: "Organizations", icon: <Globe size={20} /> },
  { href: "/super/dashboard?s=users",      label: "Users",         icon: <Users size={20} /> },
  { href: "/super/dashboard?s=settings",   label: "Settings",      icon: <Settings size={20} /> },
];

const orgAdminNav: NavItem[] = [
  { href: "/admin/dashboard",   label: "Dashboard",   icon: <Home size={20} /> },
  { href: "/admin/departments", label: "Departments", icon: <Building2 size={20} /> },
  { href: "/admin/students",    label: "Students",    icon: <Users size={20} /> },
  { href: "/admin/faculty",     label: "Faculty",     icon: <UserCog size={20} /> },
  { href: "/admin/subjects",    label: "Subjects",    icon: <BookOpen size={20} /> },
  { href: "/admin/reports",     label: "Reports",     icon: <BarChart3 size={20} /> },
  { href: "/admin/disputes",    label: "Disputes",    icon: <AlertTriangle size={20} /> },
];

const deptAdminNav: NavItem[] = [
  { href: "/admin/dashboard",    label: "Dashboard",  icon: <Home size={20} /> },
  { href: "/admin/students",     label: "Students",   icon: <GraduationCap size={20} /> },
  { href: "/admin/faculty",      label: "Faculty",    icon: <UserCog size={20} /> },
  { href: "/admin/subjects",     label: "Subjects",   icon: <BookOpen size={20} /> },
  { href: "/admin/face-register",label: "Faces",      icon: <Camera size={20} /> },
  { href: "/admin/attendance",   label: "Attendance", icon: <Calendar size={20} /> },
  { href: "/admin/reports",      label: "Reports",    icon: <BarChart3 size={20} /> },
  { href: "/admin/disputes",     label: "Disputes",   icon: <AlertTriangle size={20} /> },
];

const facultyNav: NavItem[] = [
  { href: "/faculty/home",           label: "Home",           icon: <Home size={20} /> },
  { href: "/faculty/attendance/take",label: "Take Attendance",icon: <Camera size={20} />, fab: true },
  { href: "/faculty/attendance",     label: "Sessions",       icon: <Calendar size={20} /> },
  { href: "/faculty/students",       label: "Students",       icon: <Users size={20} /> },
  { href: "/faculty/reports",        label: "Reports",        icon: <BarChart3 size={20} /> },
  { href: "/faculty/profile",        label: "Profile",        icon: <User size={20} /> },
];

const studentNav: NavItem[] = [
  { href: "/student/home",       label: "Home",       icon: <Home size={20} /> },
  { href: "/student/attendance", label: "Attendance", icon: <Calendar size={20} /> },
  { href: "/student/disputes",   label: "Disputes",   icon: <AlertTriangle size={20} /> },
  { href: "/student/profile",    label: "Profile",    icon: <User size={20} /> },
];

const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "Super Admin",
  org_admin:   "Org Admin",
  dept_admin:  "Dept Admin",
  faculty:     "Faculty",
  student:     "Student",
};

function getNav(role: AppRole): NavItem[] {
  switch (role) {
    case "super_admin": return superAdminNav;
    case "org_admin":   return orgAdminNav;
    case "dept_admin":  return deptAdminNav;
    case "faculty":     return facultyNav;
    case "student":     return studentNav;
  }
}

/* ─── Bottom nav items (mobile only, 5 max) ──────────────── */
function getBottomNav(role: AppRole): NavItem[] {
  switch (role) {
    case "super_admin":
      return [
        { href: "/super/dashboard",              label: "Home",    icon: <Activity size={22} /> },
        { href: "/super/dashboard?s=orgs",       label: "Orgs",    icon: <Globe size={22} /> },
        { href: "/super/dashboard?s=users",      label: "Users",   icon: <Users size={22} /> },
        { href: "/super/dashboard?s=settings",   label: "Settings",icon: <Settings size={22} /> },
      ];
    case "org_admin":
      return [
        { href: "/admin/dashboard",   label: "Home",    icon: <Home size={22} /> },
        { href: "/admin/departments", label: "Depts",   icon: <Building2 size={22} /> },
        { href: "/admin/reports",     label: "Reports", icon: <BarChart3 size={22} /> },
        { href: "/admin/disputes",    label: "Issues",  icon: <AlertTriangle size={22} /> },
      ];
    case "dept_admin":
      return [
        { href: "/admin/dashboard",    label: "Home",     icon: <Home size={22} /> },
        { href: "/admin/students",     label: "Students", icon: <Users size={22} /> },
        { href: "/admin/face-register",label: "Faces",    icon: <Camera size={22} /> },
        { href: "/admin/attendance",   label: "Attend.",  icon: <Calendar size={22} /> },
        { href: "/admin/reports",      label: "Reports",  icon: <BarChart3 size={22} /> },
      ];
    case "faculty":
      return [
        { href: "/faculty/home",           label: "Home",    icon: <Home size={22} /> },
        { href: "/faculty/attendance",     label: "Sessions",icon: <Calendar size={22} /> },
        { href: "/faculty/attendance/take",label: "Attend",  icon: <Camera size={22} />, fab: true },
        { href: "/faculty/students",       label: "Students",icon: <Users size={22} /> },
        { href: "/faculty/profile",        label: "Profile", icon: <User size={22} /> },
      ];
    case "student":
      return [
        { href: "/student/home",       label: "Home",      icon: <Home size={22} /> },
        { href: "/student/attendance", label: "Attendance",icon: <Calendar size={22} /> },
        { href: "/student/disputes",   label: "Disputes",  icon: <AlertTriangle size={22} /> },
        { href: "/student/profile",    label: "Profile",   icon: <User size={22} /> },
      ];
  }
}

/* ═══════════════════════════════════════════════════════════
   SIDEBAR COMPONENT (PC)
   ═══════════════════════════════════════════════════════════ */
function Sidebar({
  role, email, onLogout,
}: {
  role: AppRole; email: string; onLogout: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navItems = getNav(role);
  const initial = email?.[0]?.toUpperCase() ?? "?";

  const currentSection = searchParams.get("s") || "overview";

  function isItemActive(item: NavItem): boolean {
    const [itemPath, itemQuery] = item.href.split("?");
    if (!pathname.startsWith(itemPath)) return false;
    if (role === "super_admin") {
      const itemSection = new URLSearchParams(itemQuery || "").get("s") || "overview";
      return itemSection === currentSection;
    }
    return !(item.href === "/faculty/attendance" && pathname === "/faculty/attendance/take");
  }

  return (
    <aside className="app-sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <Cpu size={18} color="#ffffff" />
        </div>
        <div>
          <div className="sidebar-brand-text">AttendAI</div>
          <div className="sidebar-brand-sub">by Youdex</div>
        </div>
      </div>

      {/* Role badge */}
      <div style={{ padding: "8px 16px 4px" }}>
        <span style={{
          fontSize: 11, fontWeight: 600, color: "var(--text-secondary)",
          background: "#f3f4f6",
          border: "1px solid var(--border)",
          padding: "3px 10px",
          borderRadius: 99,
          fontFamily: "inherit",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}>
          {ROLE_LABEL[role]}
        </span>
      </div>

      {/* Nav items */}
      <nav className="sidebar-nav" style={{ marginTop: 8 }}>
        {navItems.map((item, idx) => {
          const isActive = isItemActive(item);

          if (item.fab) {
            return (
              <Link
                key={item.href}
                href={item.href}
                className="sidebar-fab"
                style={{ animationDelay: `${idx * 0.04}s` }}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-nav-item${isItemActive(item) ? " active" : ""}`}
              style={{ animationDelay: `${idx * 0.04}s` }}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Neon divider */}
      <div className="neon-divider" style={{ margin: "12px 16px" }} />

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-user-card">
          <div className="sidebar-avatar">{initial}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sidebar-user-name">{email || "User"}</div>
            <div className="sidebar-user-role">{ROLE_LABEL[role]}</div>
          </div>
        </div>
        <button className="sidebar-logout" onClick={onLogout}>
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </aside>
  );
}

/* ═══════════════════════════════════════════════════════════
   BOTTOM NAV (MOBILE)
   ═══════════════════════════════════════════════════════════ */
function BottomNavBar({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const items = getBottomNav(role);

  // For super_admin: hide the bottom nav when inside an org/dept drill-down
  if (role === "super_admin" && searchParams.get("orgId")) {
    return null;
  }

  function isItemActive(item: NavItem): boolean {
    if (role === "super_admin") {
      // Match based on pathname + query param "s"
      const [itemPath, itemQuery] = item.href.split("?");
      if (!pathname.startsWith(itemPath)) return false;
      const itemSection = new URLSearchParams(itemQuery || "").get("s") || "overview";
      const currentSection = searchParams.get("s") || "overview";
      return itemSection === currentSection;
    }
    return (
      pathname.startsWith(item.href) &&
      !(item.href === "/faculty/attendance" && pathname === "/faculty/attendance/take")
    );
  }

  return (
    <nav className="bottom-nav">
      {items.map((item) => {
        const active = isItemActive(item);

        if (item.fab) {
          return (
            <div key={item.href} className="nav-item-center">
              <Link href={item.href} className="nav-fab">
                {item.icon}
              </Link>
              <span>{item.label}</span>
            </div>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item${active ? " active" : ""}`}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/* ═══════════════════════════════════════════════════════════
   APP SHELL — MAIN EXPORT
   ═══════════════════════════════════════════════════════════ */
interface AppShellProps {
  children: React.ReactNode;
  role: AppRole;
}

export default function AppShell({ children, role }: AppShellProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setEmail(localStorage.getItem("user_email") || "");
    }
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    router.replace("/login");
  };

  return (
    <div className="app-shell">
      {/* Sidebar — visible on PC */}
      <Sidebar role={role} email={email} onLogout={handleLogout} />

      {/* Main content */}
      <main className="app-main">
        {children}
      </main>

      {/* Bottom Nav — visible on mobile */}
      <BottomNavBar role={role} />
    </div>
  );
}
