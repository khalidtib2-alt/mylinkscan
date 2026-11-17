import { findManagedLink } from "../../../../lib/shield-links";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  const url = new URL(request.url);
  const token = (request.headers.get("x-manage-token") ?? url.searchParams.get("token") ?? "").trim();
  if (!token) return Response.json({ error: "Manage token required." }, { status: 400, headers });

  try {
    const { slug } = await params;
    const link = await findManagedLink(slug, token);
    if (!link) return Response.json({ error: "Shield Link not found." }, { status: 404, headers });
    return Response.json({ ...link, shieldUrl: new URL("/go/" + link.slug, url).href }, { headers });
  } catch {
    return Response.json({ error: "Stats are temporarily unavailable." }, { status: 502, headers });
  }
}
