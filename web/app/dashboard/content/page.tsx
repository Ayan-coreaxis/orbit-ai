import { Topbar } from "@/components/Topbar";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { Studio } from "@/components/studio/Studio";
import { RecentPosts } from "@/components/studio/RecentPosts";

export default async function ContentPage() {
  const businessId = await getActiveBusinessId();
  const business = businessId
    ? await prisma.business.findUnique({ where: { id: businessId }, select: { metaPageId: true, metaPageName: true } })
    : null;

  return (
    <div>
      <Topbar
        title="Content"
        subtitle={`Images, reels and posts · ${business?.metaPageId ? `Connected: ${business.metaPageName ?? "your Page"}` : "Facebook Page not connected yet"}`}
      />
      <div className="grid max-w-[1200px] gap-8 p-5 sm:p-8 lg:p-10">
        <Studio />
        <RecentPosts />
      </div>
    </div>
  );
}
