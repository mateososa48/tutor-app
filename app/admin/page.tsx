import { notFound } from "next/navigation";
import { AdminSessionsView } from "@/components/admin/AdminSessionsView";
import { getAdminSession } from "@/lib/admin";
import { loadAdminSessionList } from "@/lib/admin-data";

// Every session from every user, for reviewing how the tutor did (admin only;
// anyone else sees a 404, so the page's existence is not revealed).
export const dynamic = "force-dynamic";
export const metadata = { title: "Sessions · Admin" };

export default async function AdminPage() {
  if (!(await getAdminSession())) notFound();
  const sessions = await loadAdminSessionList();
  return <AdminSessionsView sessions={sessions} />;
}
