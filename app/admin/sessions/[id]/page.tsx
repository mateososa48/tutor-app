import { notFound } from "next/navigation";
import { SessionReplay } from "@/components/admin/SessionReplay";
import { getAdminSession } from "@/lib/admin";
import { loadAdminSession } from "@/lib/admin-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Session replay · Admin" };

export default async function AdminSessionPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) notFound();
  const { id } = await params;
  const data = await loadAdminSession(id);
  if (!data) notFound();
  return <SessionReplay session={data.session} events={data.events} frames={data.frames} />;
}
