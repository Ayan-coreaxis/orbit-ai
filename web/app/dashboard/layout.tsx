import { redirect } from "next/navigation";
import { Geist } from "next/font/google";
import { AppShell } from "@/components/dashboard/AppShell";
import { getBusinessSummary } from "@/lib/get-business";
import { getCurrentUser } from "@/lib/auth";
import { isEmailVerified } from "@/lib/email-verify";

const appFont = Geist({ subsets: ["latin"], variable: "--font-app", display: "swap" });

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const real = await getBusinessSummary();
  const talkBadge = !!real?.planWaiting; // a drafted growth plan is waiting to be discussed
  const emailVerified = await isEmailVerified(user.id);

  return (
    <div className={`orbit-app ${appFont.variable} relative min-h-dvh`}>
      <div className="orbit-ambient" aria-hidden>
        <span />
      </div>
      <div className="relative z-10">
        <AppShell businessName={real?.businessName} talkBadge={talkBadge} userEmail={user.email} emailVerified={emailVerified}>
          {children}
        </AppShell>
      </div>
    </div>
  );
}
