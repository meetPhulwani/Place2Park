import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** Restores "new page starts at top" behaviour; respects in-page #hash links. */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);
  return null;
}
