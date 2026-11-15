/** Plays once per tab. Cleared when the tab closes. */
export const LOGO_INTRO_KEY = "p2p_logo_intro_7";

/** Icon only. The intro does not use the wordmark or the tagline file. */
export function logoIntroSrc(base = "/"): string {
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}branding/place2park-mark.png`;
}

/** Homepage only, and never when the visitor asked for less motion or already saw it. */
export function shouldPlayLogoIntro(pathname: string, reducedMotion: boolean, stored: string | null): boolean {
  return pathname === "/" && !reducedMotion && stored !== "1";
}
