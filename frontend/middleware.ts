import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js Edge Middleware
 * Redirects super_admin users from /admin/dashboard → /super/dashboard
 * This runs server-side on every matching request, before React renders.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const roleCookie = request.cookies.get("user_role")?.value;

  // Redirect super_admin away from /admin to /super/dashboard
  if (pathname.startsWith("/admin") && roleCookie === "super_admin") {
    return NextResponse.redirect(new URL("/super/dashboard", request.url));
  }

  // Redirect non-super-admins away from /super
  if (pathname.startsWith("/super") && roleCookie && roleCookie !== "super_admin") {
    const routes: Record<string, string> = {
      faculty: "/faculty/home",
      student: "/student/home",
      dept_admin: "/admin/dashboard",
      org_admin: "/admin/dashboard",
    };
    return NextResponse.redirect(new URL(routes[roleCookie] || "/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/super/:path*"],
};
