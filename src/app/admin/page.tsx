import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyAdminSession } from "../../lib/admin-auth";
import AdminDashboard from "./view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Owner Dashboard | MyLinkscan", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const cookieStore = await cookies();
  const authenticated = verifyAdminSession(cookieStore.get(ADMIN_COOKIE)?.value);
  return <AdminDashboard authenticated={authenticated} />;
}
