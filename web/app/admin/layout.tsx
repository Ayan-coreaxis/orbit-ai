import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/AdminSidebar";
import { isAdminAuthenticated } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authed = await isAdminAuthenticated();
  if (!authed) redirect("/admin-login");

  return (
    <div className="flex h-screen bg-bg">
      <AdminSidebar />
      <main className="scrollbar-thin h-screen flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
