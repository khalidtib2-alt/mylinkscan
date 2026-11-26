import { NextResponse } from "next/server";
import { ADMIN_COOKIE, createAdminSession, requestHasSameOrigin, verifyAdminPassword } from "../../../../lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!requestHasSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (body?.action === "logout") {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  }
  if (!verifyAdminPassword(body?.secret)) return NextResponse.json({ error: "Invalid admin credentials." }, { status: 401 });
  try {
    const session = createAdminSession();
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_COOKIE, session.value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: new Date(session.expires) });
    return response;
  } catch {
    return NextResponse.json({ error: "Admin authentication is not configured." }, { status: 503 });
  }
}
