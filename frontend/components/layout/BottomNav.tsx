"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, Users, User } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface BottomNavProps {
  role: "faculty" | "student" | "dept_admin" | "org_admin";
}

const facultyNav: NavItem[] = [
  { href: "/faculty/home",       label: "Home",       icon: <Home size={20} /> },
  { href: "/faculty/attendance", label: "Attendance", icon: <Calendar size={20} /> },
  { href: "/faculty/students",   label: "Students",   icon: <Users size={20} /> },
  { href: "/faculty/profile",    label: "Profile",    icon: <User size={20} /> },
];

const studentNav: NavItem[] = [
  { href: "/student/home",       label: "Home",       icon: <Home size={20} /> },
  { href: "/student/attendance", label: "Attendance", icon: <Calendar size={20} /> },
  { href: "/student/subjects",   label: "Subjects",   icon: <Users size={20} /> },
  { href: "/student/profile",    label: "Profile",    icon: <User size={20} /> },
];

export default function BottomNav({ role }: BottomNavProps) {
  const pathname = usePathname();
  const isFaculty = role === "faculty" || role === "dept_admin";
  const navItems = isFaculty ? facultyNav : studentNav;

  // Split into 2 + center + 2
  const left  = navItems.slice(0, 2);
  const right = navItems.slice(2, 4);
  const takeAttendancePath = isFaculty ? "/faculty/attendance/take" : null;

  return (
    <nav className="bottom-nav">
      {/* Left 2 items */}
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

      {/* Center FAB — Take Attendance (faculty) or placeholder (student) */}
      {isFaculty && takeAttendancePath ? (
        <div className="nav-item-center">
          <Link href={takeAttendancePath} className="nav-fab">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
              <circle cx="9" cy="7" r="4"/>
              <path d="M3 21v-2a4 4 0 0 1 4-4h4"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              <path d="m21 21-3-3m0 0a4 4 0 1 0-5.66-5.66A4 4 0 0 0 18 18z"/>
            </svg>
          </Link>
          <span style={{ fontSize: 10, color: "var(--accent)", marginTop: 2 }}>Take Att.</span>
        </div>
      ) : (
        <div style={{ flex: 1 }} />
      )}

      {/* Right 2 items */}
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
