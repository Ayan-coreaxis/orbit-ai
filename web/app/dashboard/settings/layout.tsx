import { Topbar } from "@/components/Topbar";
import { SettingsNav } from "@/components/dashboard/SettingsNav";
import { getBusinessSummary } from "@/lib/get-business";

/** Settings: one menu on the left, one topic per page on the right. */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const real = await getBusinessSummary();
  return (
    <div>
      <Topbar title="Settings" subtitle={real?.businessName ?? "No business yet"} />
      <div className="mx-auto max-w-[1200px] p-5 sm:p-8 lg:flex lg:gap-10 lg:p-10">
        <SettingsNav />
        <div className="min-w-0 flex-1 pt-5 lg:pt-0">{children}</div>
      </div>
    </div>
  );
}
