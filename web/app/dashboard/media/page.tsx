import { Topbar } from "@/components/Topbar";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { listMedia } from "@/lib/media";
import { MediaLibrary } from "@/components/media/MediaLibrary";

export default async function MediaPage() {
  const businessId = await getActiveBusinessId();
  const media = businessId ? await listMedia(businessId) : [];
  return (
    <div>
      <Topbar title="Media library" subtitle="Every photo, video, voice note and PDF you've given Orbit — your agents use these with your Orchestrator's permission" />
      <div className="px-6 py-6 lg:px-10">
        <MediaLibrary initial={media} />
      </div>
    </div>
  );
}
