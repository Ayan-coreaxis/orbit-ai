import { Topbar } from "@/components/Topbar";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { listMedia } from "@/lib/media";
import { MediaLibrary } from "@/components/media/MediaLibrary";

export default async function MediaPage() {
  const businessId = await getActiveBusinessId();
  const media = businessId ? await listMedia(businessId) : [];
  return (
    <div>
      <Topbar title="Media library" subtitle="Photos, videos, voice notes and PDFs you have shared with Orbit" />
      <div className="px-6 py-6 lg:px-10">
        <MediaLibrary initial={media} />
      </div>
    </div>
  );
}
