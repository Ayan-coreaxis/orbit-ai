import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getRealPlan } from "@/lib/get-business";
import { getCurrentUser } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const real = await getRealPlan();
  const talkBadge = !!real && real.wantsToDiscuss && real.lastSeenReportId !== real.reportId;

  return (
    <div className="flex h-screen bg-bg">
      <Sidebar
        businessName={real?.businessName}
        planLabel={real ? "Growth plan" : "No business yet"}
        talkBadge={talkBadge}
        userEmail={user.email}
      />
      <main className="scrollbar-thin h-screen flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
