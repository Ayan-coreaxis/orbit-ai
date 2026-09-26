import { Topbar } from "@/components/Topbar";
import { Card, Pill } from "@/components/ui";
import { getRealPlan } from "@/lib/get-business";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { FacebookIcon } from "@/components/icons/BrandIcons";
import { Studio } from "@/components/studio/Studio";
import { RecentPosts } from "@/components/studio/RecentPosts";

export default async function ContentPage() {
  const plan = await getRealPlan();
  const businessId = await getActiveBusinessId();
  const business = businessId
    ? await prisma.business.findUnique({ where: { id: businessId }, select: { metaPageId: true, metaPageName: true } })
    : null;

  const contentTask = plan?.tasks.find((t) => t.agent === "Content Agent");
  const published = contentTask?.task.includes("Also published a real post");

  return (
    <div>
      <Topbar
        title="Content"
        subtitle={`Images, reels and posts · ${business?.metaPageId ? `Connected: ${business.metaPageName ?? "your Page"}` : "Facebook Page not connected yet"}`}
      />
      <div className="grid max-w-[1200px] gap-8 p-10">
        <Studio />
        <RecentPosts />
        {contentTask && (
          <Card className="p-7">
            <div className="flex items-center gap-2">
              <FacebookIcon size={16} />
              <span className="text-[13px] font-semibold uppercase tracking-[0.04em] text-text-dim">
                This cycle&apos;s Content Agent task
              </span>
              {published ? (
                <Pill tone="good">Published to Facebook</Pill>
              ) : business?.metaPageId ? (
                <Pill tone="warn">Auto-apply off</Pill>
              ) : (
                <Pill tone="neutral">Advisory only</Pill>
              )}
            </div>
            <p className="mt-3 text-[13.5px] leading-relaxed text-text-dim">{contentTask.task}</p>
            {!business?.metaPageId && (
              <p className="mt-4 text-[12px] text-text-faint">
                Connect a real Facebook Page in Settings, and turn on this agent&apos;s auto-apply, to
                let it actually publish captions instead of only drafting them.
              </p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
