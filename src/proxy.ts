import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const isDefaultAdminLanding = request.nextUrl.pathname === "/admin/collections/users";
  const isSystemView = request.nextUrl.searchParams.get("system") === "1";

  if (isDefaultAdminLanding && !isSystemView) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/admin/collections/users",
};
