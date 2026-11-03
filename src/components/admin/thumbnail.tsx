import Image from "next/image";
import { mediaUrl } from "@/lib/media";

export function AdminThumbnail({
  image,
}: {
  image?: { path: string; alt?: string } | null;
}) {
  return image ? (
    <Image
      src={mediaUrl(image.path)}
      alt={image.alt ?? ""}
      width={56}
      height={56}
      className="size-14 rounded border border-black/10 bg-white object-cover"
    />
  ) : (
    <span
      aria-label="No image"
      className="text-muted flex size-14 items-center justify-center rounded border border-black/10 bg-black/5 text-xs"
    >
      —
    </span>
  );
}
