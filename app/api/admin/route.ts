import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  const adminKey = process.env.ADMIN_KEY;

  if (!adminKey) {
    return new NextResponse(
      "Admin-Modus ist nicht konfiguriert: ADMIN_KEY fehlt in den Vercel-Umgebungsvariablen.",
      { status: 500 }
    );
  }

  if (key !== adminKey) {
    return new NextResponse("Ungültiger Admin-Key.", { status: 403 });
  }

  const res = NextResponse.redirect(new URL("/", request.url));
  res.cookies.set("padel_admin", "1", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return res;
}
