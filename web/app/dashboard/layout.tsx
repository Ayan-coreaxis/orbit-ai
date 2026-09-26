import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getBusinessSummary } from "@/lib/get-business";
import { getCurrentUser } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const real = await getBusinessSummary();
  const talkBadge = !!real?.planWaiting; // a drafted growth plan is waiting to be discussed

  return (
    <div className="flex h-dvh flex-col bg-bg lg:flex-row">
      <Sidebar
        businessName={real?.businessName}
        planLabel={real ? "Growth plan" : "No business yet"}
        talkBadge={talkBadge}
        userEmail={user.email}
      />
      <main id="main" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
