import Link from "@/components/link";
import { cn } from "@/lib/utils";

const rawBase = typeof import.meta.env?.BASE_URL === "string" ? import.meta.env.BASE_URL : "/";
const brandBase = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;

/** Icon only. Used for the favicon, collapsed navigation, and small marks. */
export const BRAND_MARK_SRC = `${brandBase}branding/place2park-mark.png`;
/** Icon plus the word, kept on disk. The interface draws this lockup as the icon plus type. */
export const BRAND_LOCKUP_SRC = `${brandBase}branding/place2park-lockup.png`;
/** Word only, kept on disk. The interface draws this word in Bricolage Grotesque ExtraBold. */
export const BRAND_WORDMARK_SRC = `${brandBase}branding/place2park-wordmark.png`;
/**
 * Icon, word, and the “Never hand over your keys” line.
 * Keep this file for an explicit request. Do not place it in the product UI otherwise.
 */
export const BRAND_TAGLINE_SRC = `${brandBase}branding/place2park-tagline.png`;

const BOX = {
  xs: "size-7",
  sm: "size-9",
  md: "size-11",
  lg: "size-16",
} as const;

export type LogoSize = keyof typeof BOX;
export type LogoVariant = "lockup" | "wordmark" | "mark" | "tagline" | "nav";

type ArtworkVariant = "tagline" | "mark";

/** Opaque artwork inside the 1024 square, plus a few pixels so edges are not clipped. */
const FRAME: Record<ArtworkVariant, { src: string; x: number; y: number; w: number; h: number }> = {
  tagline: { src: BRAND_TAGLINE_SRC, x: 196, y: 443, w: 673, h: 144 },
  mark: { src: BRAND_MARK_SRC, x: 310, y: 303, w: 404, h: 412 },
};

/** Icon height to word size. The arrow is taller than the letters, matching the lockup file. */
function lockupType(iconHeight: number) {
  return {
    font: Math.max(14, Math.round(iconHeight * 0.68)),
    gap: Math.max(6, Math.round(iconHeight * 0.2)),
  };
}

const HEIGHT: Record<LogoSize, number> = { xs: 16, sm: 20, md: 28, lg: 36 };

/** Standalone symbol. Proportions stay inside the box with object-contain. */
export function BrandMark({
  size = "md",
  plate = false,
  className,
  alt = "",
}: {
  size?: LogoSize;
  plate?: boolean;
  className?: string;
  alt?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden",
        BOX[size],
        plate && "rounded-xl bg-white",
        className
      )}
    >
      <img
        src={BRAND_MARK_SRC}
        alt={alt}
        width={1024}
        height={1024}
        draggable={false}
        decoding="async"
        className="h-full w-full object-contain"
      />
    </span>
  );
}

function Artwork({
  variant,
  height,
  alt,
}: {
  variant: ArtworkVariant;
  height: number;
  alt: string;
}) {
  const frame = FRAME[variant];
  const scale = height / frame.h;
  const rendered = 1024 * scale;
  return (
    <span className="relative inline-block shrink-0 overflow-hidden" style={{ width: frame.w * scale, height }}>
      <img
        src={frame.src}
        alt={alt}
        width={1024}
        height={1024}
        draggable={false}
        decoding="async"
        className="absolute max-w-none object-contain"
        style={{ width: rendered, height: rendered, left: -frame.x * scale, top: -frame.y * scale }}
      />
    </span>
  );
}

function Word({ size, className, light }: { size: number; className?: string; light?: boolean }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap font-display font-extrabold leading-none tracking-[-0.03em]",
        light ? "text-white" : "text-ink",
        className
      )}
      style={{ fontSize: size }}
    >
      Place2Park
    </span>
  );
}

/**
 * `lockup` is the icon plus the word in Bricolage Grotesque ExtraBold.
 * `wordmark` is that word alone. `nav` hides the icon below the tablet breakpoint.
 * `mark` is the icon only. `tagline` stays the stored file and is not placed unless requested.
 * `plate` puts the lockup on a white chip so the dark word stays readable on a dark surface.
 */
export function Logo({
  className,
  variant = "lockup",
  size = "md",
  height,
  plate = false,
  tone = "ink",
  href = "/",
  label = "Place2Park home",
}: {
  className?: string;
  variant?: LogoVariant;
  size?: LogoSize;
  height?: number;
  plate?: boolean;
  /** `light` keeps the blue symbol and draws the word in white on a dark surface. */
  tone?: "ink" | "light";
  href?: string | null;
  label?: string;
}) {
  const visualHeight = height ?? HEIGHT[size];
  const imageAlt = href ? "" : "Place2Park";
  const typed = variant === "nav" || variant === "lockup" || variant === "wordmark";
  const metrics = lockupType(variant === "nav" ? 32 : visualHeight);
  const wordSize = variant === "nav" ? 18 : variant === "wordmark" ? visualHeight : metrics.font;
  const art =
    variant === "mark" ? (
      <BrandMark size={size} plate={plate} alt={imageAlt} />
    ) : variant === "tagline" ? (
      <Artwork variant="tagline" height={visualHeight} alt={imageAlt} />
    ) : (
      <>
        {variant !== "wordmark" && (
          <span className={variant === "nav" ? "hidden md:inline-flex" : "inline-flex"}>
            <Artwork variant="mark" height={variant === "nav" ? 32 : visualHeight} alt="" />
          </span>
        )}
        <Word
          size={wordSize}
          light={tone === "light"}
          className={variant === "nav" ? "text-[1.125rem] md:!text-[1.25rem]" : undefined}
        />
      </>
    );
  const framed = plate && variant !== "mark" ? (
    <span className="inline-flex items-center rounded-xl bg-white px-2.5 py-1.5" style={{ gap: typed ? metrics.gap : undefined }}>
      {art}
    </span>
  ) : (
    art
  );
  const row = cn("inline-flex min-w-0 items-center", className);
  const rowStyle = typed && !plate ? { gap: metrics.gap } : undefined;
  if (!href) return <span className={row} style={rowStyle}>{framed}</span>;
  return (
    <Link href={href} className={row} style={rowStyle} aria-label={label}>
      {framed}
    </Link>
  );
}
