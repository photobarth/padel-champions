import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  const adminKey = process.env.ADMIN_KEY;
  const isValid = Boolean(adminKey) && key === adminKey;

  const res = NextResponse.redirect(new URL("/", request.url));
  if (isValid) {
    res.cookies.set("padel_admin", "1", {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }
  return res;
}
