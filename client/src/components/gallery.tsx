import * as React from "react";
import Image from "@/components/image";
import { cn } from "@/lib/utils";

export function Gallery({ images, title }: { images: { url: string; alt: string }[]; title: string }) {
  const [active, setActive] = React.useState(0);
  if (images.length === 0) {
    return <div className="flex h-72 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">No photos yet</div>;
  }
  return (
    <div>
      <div className="relative h-64 overflow-hidden rounded-2xl bg-slate-100 sm:h-96">
        <Image
          src={images[active].url}
          alt={images[active].alt || title}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 60vw"
          className="object-cover"
        />
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Photos">
          {images.map((img, i) => (
            <button
              key={img.url + i}
              role="tab"
              aria-selected={i === active}
              aria-label={`Photo ${i + 1}`}
              onClick={() => setActive(i)}
              className={cn(
                "relative h-16 w-24 shrink-0 overflow-hidden rounded-xl border-2 transition-all",
                i === active ? "border-brand-600" : "border-transparent opacity-70 hover:opacity-100"
              )}
            >
              <Image src={img.url} alt="" fill sizes="96px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
