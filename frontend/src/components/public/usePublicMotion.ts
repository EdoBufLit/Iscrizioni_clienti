import { useLayoutEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { PUBLIC_MOTION } from "./motionTokens";

let scrollTriggerRegistered = false;

const ensureScrollTrigger = () => {
  if (scrollTriggerRegistered || typeof window === "undefined") return;
  gsap.registerPlugin(ScrollTrigger);
  scrollTriggerRegistered = true;
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Options = {
  enabled: boolean;
  key: string;
};

export const usePublicMotion = ({ enabled, key }: Options) => {
  useLayoutEffect(() => {
    if (!enabled || prefersReducedMotion()) return;

    ensureScrollTrigger();
    let refreshTimer = 0;

    const context = gsap.context(() => {
      const fadeElements = gsap.utils.toArray<HTMLElement>('[data-reveal="fade-up"]');
      gsap.set(fadeElements, { autoAlpha: 0, y: 20 });

      fadeElements.forEach((element) => {
          gsap.fromTo(
            element,
            { autoAlpha: 0, y: 20 },
            {
              autoAlpha: 1,
              y: 0,
              duration: PUBLIC_MOTION.sectionReveal,
              ease: PUBLIC_MOTION.ease,
              scrollTrigger: {
                trigger: element,
                start: "top 88%",
                toggleActions: "play none none none",
                once: true,
              },
            }
          );
        });

      gsap.utils.toArray<HTMLElement>('[data-reveal="stagger"]').forEach((container) => {
          const items = container.querySelectorAll<HTMLElement>(
            "[data-reveal-item]"
          );
          if (!items.length) return;

          gsap.set(items, { autoAlpha: 0, y: 18 });

          gsap.fromTo(
            items,
            { autoAlpha: 0, y: 18 },
            {
              autoAlpha: 1,
              y: 0,
              duration: PUBLIC_MOTION.sectionReveal,
              stagger: 0.1,
              ease: PUBLIC_MOTION.ease,
              scrollTrigger: {
                trigger: container,
                start: "top 86%",
                toggleActions: "play none none none",
                once: true,
              },
            }
          );
        });
    });

    refreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), 40);

    return () => {
      window.clearTimeout(refreshTimer);
      context.revert();
    };
  }, [enabled, key]);
};
