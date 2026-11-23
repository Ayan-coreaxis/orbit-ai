import { redirect } from "next/navigation";
import { Geist } from "next/font/google";
import { getCurrentUser } from "@/lib/auth";

const appFont = Geist({ subsets: ["latin"], variable: "--font-app", display: "swap" });

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/signup");
  return (
    <div className={`orbit-app ${appFont.variable} relative min-h-dvh`}>
      <div className="orbit-ambient" aria-hidden>
        <span />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
