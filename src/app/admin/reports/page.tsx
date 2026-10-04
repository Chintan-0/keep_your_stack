import { redirect } from "next/navigation";
import { isCurrentUserAdmin } from "@/lib/data/admin-auth";
import { ShareReportsQueue } from "@/components/admin/share-reports-queue";

// Same server-side gate as /admin: a non-admin is redirected, never shown the queue.
export default async function AdminReportsPage() {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) redirect("/home");
  return <ShareReportsQueue />;
}
