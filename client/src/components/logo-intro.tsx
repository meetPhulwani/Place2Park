import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { LOGO_INTRO_KEY, logoIntroSrc, shouldPlayLogoIntro } from "@/lib/logo-intro";

/** Opaque artwork inside the 1024 square. Windows stay in the file's own alignment. */
const FRAME = { x: 8, y: 416, w: 998, h: 200 };
const SYMBOL = { x: 0, y: 0, w: 176, h: 200 };
const WORD = { x: 180, y: 24, w: 818, h: 120 };
const TAGLINE = { x: 382, y: 160, w: 318, h: 40 };
const KEYS = { x: 698, y: 160, w: 84, h: 40 };

const EASE = [0.22, 1, 0.36, 1] as const;
/** The full logo is together near 2.9s, then holds for about 2 seconds. */
const HOLD_THEN_FADE = 4.9;

let started = false;

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function Piece({
  box,
  delay,
  reveal,
}: {
  box: { x: number; y: number; w: number; h: number };
  delay: number;
  reveal: "diagonal" | "slide" | "fade";
}) {
  return (
    <motion.div
      className="absolute overflow-hidden"
      style={{
        left: `${(box.x / FRAME.w) * 100}%`,
        top: `${(box.y / FRAME.h) * 100}%`,
        width: `${(box.w / FRAME.w) * 100}%`,
        height: `${(box.h / FRAME.h) * 100}%`,
      }}
      initial={
        reveal === "diagonal"
          ? { clipPath: "polygon(0% 100%, 0% 100%, 0% 100%)" }
          : reveal === "slide"
            ? { opacity: 0, x: -12 }
            : { opacity: 0 }
      }
      animate={
        reveal === "diagonal"
          ? { clipPath: "polygon(0% 120%, 180% -20%, -10% -30%)" }
          : reveal === "slide"
            ? { opacity: 1, x: 0 }
            : { opacity: 1 }
      }
      transition={{
        delay,
        duration: reveal === "diagonal" ? 1.1 : reveal === "slide" ? 0.65 : 0.5,
        ease: reveal === "diagonal" ? [0.65, 0, 0.35, 1] : EASE,
      }}
    >
      <img
        src={logoIntroSrc(import.meta.env.BASE_URL)}
        alt=""
        width={1024}
        height={1024}
        draggable={false}
        decoding="async"
        className="absolute max-w-none select-none"
        style={{
          width: `calc(100% * ${1024 / box.w})`,
          height: "auto",
          left: `calc(100% * ${-(FRAME.x + box.x) / box.w})`,
          top: `calc(100% * ${-(FRAME.y + box.y) / box.h})`,
        }}
      />
      {reveal === "diagonal" && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-1/3"
          style={{ background: "linear-gradient(100deg, transparent, rgba(255,255,255,0.42), transparent)" }}
          initial={{ x: "-140%", opacity: 0 }}
          animate={{ x: "280%", opacity: [0, 0.8, 0] }}
          transition={{ delay: delay + 0.4, duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
        />
      )}
    </motion.div>
  );
}

/**
 * Full-screen reveal on the homepage. The page stays mounted underneath.
 * One play per tab. Click or Escape dismisses it.
 */
export function LogoIntro() {
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (started) return;
    if (!shouldPlayLogoIntro(pathname, reducedMotion(), sessionStorage.getItem(LOGO_INTRO_KEY))) return;
    started = true;
    sessionStorage.setItem(LOGO_INTRO_KEY, "1");
    setVisible(true);
  }, [pathname]);

  useEffect(() => {
    if (!visible) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const skip = (event: KeyboardEvent) => {
      if (event.key === "Escape") setVisible(false);
    };
    const timer = window.setTimeout(() => setVisible(false), (HOLD_THEN_FADE + 0.75) * 1000);
    window.addEventListener("keydown", skip);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", skip);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-white"
      style={{ backgroundColor: "#FFFFFF" }}
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ delay: HOLD_THEN_FADE, duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
      onPointerDown={() => setVisible(false)}
      aria-hidden
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-[18%] top-1/2 h-[42vh] w-[36vw] -translate-x-1/2 -translate-y-1/2"
        style={{ background: "radial-gradient(ellipse at center, rgba(21,84,181,0.10), rgba(255,255,255,0) 68%)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.8, ease: EASE }}
      />
      <div className="relative w-[min(94vw,920px)]" style={{ aspectRatio: `${FRAME.w} / ${FRAME.h}` }}>
        <Piece box={SYMBOL} delay={0.45} reveal="diagonal" />
        <Piece box={KEYS} delay={1.7} reveal="slide" />
        <Piece box={TAGLINE} delay={2.45} reveal="fade" />
        <Piece box={WORD} delay={2.45} reveal="fade" />
      </div>
    </motion.div>
  );
}
