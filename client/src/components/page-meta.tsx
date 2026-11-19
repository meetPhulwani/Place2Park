import { useEffect } from "react";

export const CANONICAL_ORIGIN = "https://www.place2park.me";

export function canonicalUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${CANONICAL_ORIGIN}${normalized}`;
}

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/** Title, description, canonical URL, and Open Graph tags for one public page. */
export function PageMeta({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}) {
  useEffect(() => {
    const url = canonicalUrl(path);
    document.title = title;
    upsertMeta("name", "description", description);
    upsertMeta("name", "robots", "index, follow");
    upsertCanonical(url);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:url", url);
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:image", canonicalUrl("/branding/place2park-mark.png"));
  }, [title, description, path]);
  return null;
}

/** Private screens stay out of the index even when a crawler receives the HTML. */
export function NoIndex() {
  useEffect(() => {
    upsertMeta("name", "robots", "noindex, nofollow");
    return () => {
      document.head.querySelector('meta[name="robots"]')?.remove();
    };
  }, []);
  return null;
}
