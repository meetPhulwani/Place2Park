import { mediaUrl } from "@/lib/media-url";

/** Drop-in replacement for next/image: plain <img> with lazy loading. */
interface ImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
  sizes?: string;
}

export default function Image({ fill, priority, unoptimized: _u, sizes: _s, className, style, alt = "", src, ...rest }: ImageProps) {
  return (
    <img
      alt={alt}
      src={typeof src === "string" ? mediaUrl(src) : src}
      loading={priority ? "eager" : "lazy"}
      className={className}
      style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", ...style } : style}
      {...rest}
    />
  );
}
