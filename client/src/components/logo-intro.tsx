import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { LOGO_INTRO_KEY, logoIntroSrc, shouldPlayLogoIntro } from "@/lib/logo-intro";

/** Opaque arrow inside the 1024 square. The frame keeps the original proportions. */
const MARK = { x: 310, y: 303, w: 404, h: 412 };

const EASE = [0.65, 0, 0.35, 1] as const;
/** Reveal starts at 0.4s and lasts 0.95s. The finished icon then holds for 1.5s. */
const HOLD_THEN_FADE = 2.85;

let started = false;

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * White-screen reveal of the blue half-arrow only.
 * The homepage stays mounted underneath. One play per tab.
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
    const timer = window.setTimeout(() => setVisible(false), (HOLD_THEN_FADE + 0.5) * 1000);
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
      transition={{ delay: HOLD_THEN_FADE, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      onPointerDown={() => setVisible(false)}
      aria-hidden
    >
      <motion.div
        className="relative w-[min(24vw,96px)] overflow-hidden md:w-[168px]"
        style={{ aspectRatio: `${MARK.w} / ${MARK.h}` }}
        initial={{ opacity: 0, scale: 0.96, clipPath: "polygon(0% 100%, 0% 100%, 0% 100%)" }}
        animate={{ opacity: 1, scale: 1, clipPath: "polygon(0% 120%, 180% -20%, -10% -30%)" }}
        transition={{ delay: 0.4, duration: 0.95, ease: EASE }}
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
            width: `calc(100% * ${1024 / MARK.w})`,
            height: "auto",
            left: `calc(100% * ${-MARK.x / MARK.w})`,
            top: `calc(100% * ${-MARK.y / MARK.h})`,
          }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-[28%]"
          style={{ backgroundColor: "rgba(21, 84, 181, 0.16)" }}
          initial={{ x: "-160%", opacity: 0 }}
          animate={{ x: "420%", opacity: [0, 1, 0] }}
          transition={{ delay: 0.7, duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
        />
      </motion.div>
    </motion.div>
  );
}
