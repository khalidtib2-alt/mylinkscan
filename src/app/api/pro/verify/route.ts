import { verifyProKey } from "../../../../lib/pro-license";

export async function POST(request: Request) {
  const pro = await verifyProKey(request.headers);
  return Response.json({ pro }, { status: pro ? 200 : 403, headers: { "Cache-Control": "no-store" } });
}
