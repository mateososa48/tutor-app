import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin-emails";

/** The signed-in session when it belongs to an admin, otherwise null. Server only. */
export async function getAdminSession() {
  const session = await auth();
  return session?.user && isAdminEmail(session.user.email) ? session : null;
}
