"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, Users, User, ShieldAlert, FileText, Building2, Camera } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface BottomNavProps {
  role: "faculty" | "student" | "dept_admin" | "org_admin" | "super_admin";
}

const facultyNav: NavItem[] = [
  { href: "/faculty/home",       label: "Home",       icon: <Home size={22} /> },
  { href: "/faculty/attendance", label: "Sessions",   icon: <Calendar size={22} /> },
  { href: "/faculty/students",   label: "Students",   icon: <Users size={22} /> },
  { href: "/faculty/profile",    label: "Profile",    icon: <User size={22} /> },
];

const studentNav: NavItem[] = [
  { href: "/student/home",       label: "Home",       icon: <Home size={22} /> },
  { href: "/student/attendance", label: "Attendance", icon: <Calendar size={22} /> },
  { href: "/student/profile",    label: "Profile",    icon: <User size={22} /> },
];

const deptAdminNav: NavItem[] = [
  { href: "/admin/dashboard",      label: "Home",     icon: <Home size={22} /> },
  { href: "/admin/students",       label: "Students", icon: <Users size={22} /> },
  { href: "/admin/face-register",  label: "Faces",    icon: <Camera size={22} /> },
  { href: "/admin/disputes",       label: "Disputes", icon: <ShieldAlert size={22} /> },
  { href: "/admin/reports",        label: "Reports",  icon: <FileText size={22} /> },
];

const orgAdminNav: NavItem[] = [
  { href: "/admin/dashboard",      label: "Home",     icon: <Home size={22} /> },
  { href: "/admin/departments",    label: "Depts",    icon: <Building2 size={22} /> },
  { href: "/admin/face-register",  label: "Faces",    icon: <Camera size={22} /> },
  { href: "/admin/disputes",       label: "Disputes", icon: <ShieldAlert size={22} /> },
  { href: "/admin/reports",        label: "Reports",  icon: <FileText size={22} /> },
];


export default function BottomNav({ role }: BottomNavProps) {
  const pathname = usePathname();

  if (role === "dept_admin" || role === "org_admin" || role === "super_admin") {
    const items = role === "dept_admin" ? deptAdminNav : orgAdminNav;
    return (
      <nav className="bottom-nav">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${pathname.startsWith(item.href) ? "active" : ""}`}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    );
  }

  const isFaculty = role === "faculty";
  const navItems = isFaculty ? facultyNav : studentNav;

  if (!isFaculty) {
    // Student: simple flat nav
    return (
      <nav className="bottom-nav">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${pathname.startsWith(item.href) ? "active" : ""}`}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    );
  }

  // Faculty: 2 + FAB + 2
  const left  = navItems.slice(0, 2);
  const right = navItems.slice(2, 4);

  return (
    <nav className="bottom-nav">
      {left.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`nav-item ${pathname.startsWith(item.href) ? "active" : ""}`}
        >
          {item.icon}
          <span>{item.label}</span>
        </Link>
      ))}

      {/* Center FAB */}
      <div className="nav-item-center">
        <Link href="/faculty/attendance/take" className="nav-fab">
          <Camera size={22} color="white" />
        </Link>
        <span style={{ fontSize: 9, color: "var(--accent-2)", fontWeight: 600, letterSpacing: 0.2 }}>Attend</span>
      </div>

      {right.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`nav-item ${pathname.startsWith(item.href) ? "active" : ""}`}
        >
          {item.icon}
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
