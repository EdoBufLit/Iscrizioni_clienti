import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { gsap } from "gsap";
import MotionProvider from "./motion/MotionProvider";
import { pageVariants } from "./motion/motionPresets";
import { usePublicMotion } from "./public/usePublicMotion";
import { PUBLIC_MOTION } from "./public/motionTokens";
import InstallAppPrompt from "./public/InstallAppPrompt";
import { useTheme } from "./theme/ThemeProvider";
import ThemeToggle from "./theme/ThemeToggle";
import { fetchWhoAmI, type WhoAmIResponse } from "../lib/api";

const NAV_ITEMS = [
  { label: "Home", to: "/" },
  { label: "Servizi", to: "/servizi" },
  { label: "Affiliazioni", to: "/associazioni" },
  { label: "Contatti", to: "/contatti" },
];

const publicLinkClass = ({ isActive }: { isActive: boolean }) =>
  `public-nav-pill shrink-0 whitespace-nowrap${isActive ? " is-active" : ""}`;

let dashboardPrefetched = false;
const prefetchDashboard = () => {
  if (dashboardPrefetched) return;
  dashboardPrefetched = true;
  import("../pages/dashboard/DashboardLayout").catch(() => {});
  import("../pages/dashboard/DashboardHome").catch(() => {});
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const Layout = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [publicAuth, setPublicAuth] = useState<WhoAmIResponse>({ authenticated: false });
  const close = () => setMenuOpen(false);
  const location = useLocation();
  const { resolvedTheme } = useTheme();

  const publicHeaderRef = useRef<HTMLElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const payoffRef = useRef<HTMLParagraphElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const headerShrinkRef = useRef(false);

  const isDashboardRoute = useMemo(
    () =>
      location.pathname.startsWith("/dashboard") ||
      location.pathname.startsWith("/org-admin") ||
      location.pathname.startsWith("/super-admin") ||
      location.pathname.startsWith("/admin"),
    [location.pathname]
  );
  const isStandaloneAuthRoute =
    location.pathname === "/org-admin/login" ||
    location.pathname === "/super-admin/login";
  const showPublicChrome = !isDashboardRoute && !isStandaloneAuthRoute;

  usePublicMotion({ enabled: !isDashboardRoute, key: location.pathname });

  useEffect(() => {
    document.body.classList.toggle("dashboard-perf-mode", isDashboardRoute);
    return () => document.body.classList.remove("dashboard-perf-mode");
  }, [isDashboardRoute]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (isDashboardRoute) return;
    let active = true;

    fetchWhoAmI()
      .then((whoAmI) => {
        if (!active) return;
        setPublicAuth(whoAmI);
      })
      .catch(() => {
        if (!active) return;
        setPublicAuth({ authenticated: false });
      });

    return () => {
      active = false;
    };
  }, [isDashboardRoute, location.pathname]);

  useEffect(() => {
    if (isDashboardRoute) return;

    const headerElement = publicHeaderRef.current;
    const logoElement = logoRef.current;
    if (!headerElement || !logoElement) return;

    const animateShrinkState = (shrink: boolean) => {
      if (headerShrinkRef.current === shrink) return;
      headerShrinkRef.current = shrink;
      const rootStyles = window.getComputedStyle(document.documentElement);
      const surfaceColor = rootStyles.getPropertyValue("--theme-surface").trim() || "rgba(255,255,255,0.84)";
      const solidSurfaceColor = rootStyles.getPropertyValue("--theme-surface-solid").trim() || "#ffffff";
      const borderColor = rootStyles.getPropertyValue("--theme-border").trim() || "rgba(17,39,41,0.12)";
      const compactShadow =
        resolvedTheme === "dark"
          ? "0 14px 36px rgba(0, 0, 0, 0.38)"
          : "0 12px 35px rgba(15, 35, 38, 0.14)";

      gsap.to(headerElement, {
        backgroundColor: shrink ? solidSurfaceColor : surfaceColor,
        borderColor,
        boxShadow: shrink ? compactShadow : "0 0 0 rgba(0,0,0,0)",
        duration: PUBLIC_MOTION.ui,
        ease: PUBLIC_MOTION.ease,
        overwrite: "auto",
      });

      gsap.to(logoElement, {
        height: shrink ? "2.25rem" : "2.8rem",
        duration: PUBLIC_MOTION.ui,
        ease: PUBLIC_MOTION.ease,
        overwrite: "auto",
      });
    };

    const onScroll = () => {
      animateShrinkState(window.scrollY > 18);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      gsap.killTweensOf([headerElement, logoElement]);
      headerShrinkRef.current = false;
    };
  }, [isDashboardRoute, resolvedTheme]);

  useEffect(() => {
    if (isDashboardRoute) return;
    if (prefersReducedMotion()) {
      gsap.set([logoRef.current, payoffRef.current], { clearProps: "all" });
      return;
    }

    const timeline = gsap.timeline();
    timeline.fromTo(
      logoRef.current,
      { autoAlpha: 0, scale: 1.03 },
      { autoAlpha: 1, scale: 1, duration: 0.6, ease: "power2.out" }
    );
    timeline.fromTo(
      payoffRef.current,
      { autoAlpha: 0, y: 6 },
      { autoAlpha: 1, y: 0, duration: 0.4, ease: "power2.out" },
      0.24
    );

    return () => {
      timeline.kill();
    };
  }, [isDashboardRoute, location.pathname]);

  useEffect(() => {
    if (isDashboardRoute) return;
    const panel = mobileMenuRef.current;
    if (!panel) return;

    gsap.killTweensOf(panel);

    if (prefersReducedMotion()) {
      panel.style.display = menuOpen ? "block" : "none";
      panel.style.height = menuOpen ? "auto" : "0px";
      panel.style.opacity = menuOpen ? "1" : "0";
      return;
    }

    if (menuOpen) {
      gsap.set(panel, { display: "block", height: 0, autoAlpha: 0 });
      gsap.to(panel, {
        height: "auto",
        autoAlpha: 1,
        duration: PUBLIC_MOTION.ui,
        ease: PUBLIC_MOTION.ease,
      });
      return;
    }

    gsap.to(panel, {
      height: 0,
      autoAlpha: 0,
      duration: PUBLIC_MOTION.ui,
      ease: PUBLIC_MOTION.ease,
      onComplete: () => {
        gsap.set(panel, { display: "none" });
      },
    });
  }, [isDashboardRoute, menuOpen]);

  const publicAccessTarget =
    publicAuth.authenticated && publicAuth.redirect_to
      ? publicAuth.redirect_to
      : "/area-riservata";
  const publicAccessLabel = publicAuth.authenticated ? "Dashboard" : "Login";

  return (
    <MotionProvider>
      <div
        className={`relative min-h-screen text-neutral-800${
          isDashboardRoute ? "" : " public-shell"
        } ${isDashboardRoute ? "app-shell" : ""}`}
      >
        {isDashboardRoute ? (
          <div
            className="h-0.5 bg-gradient-to-r from-accent via-brand to-ember"
            aria-hidden="true"
          />
        ) : showPublicChrome ? (
          <>
            <div className="public-site-glow" aria-hidden="true" />
            <header className="public-header fixed top-0 left-0 right-0 z-50 transition-all" ref={publicHeaderRef}>
              <div className="container-shell public-header-inner">
                <NavLink className="public-brand" to="/" onClick={close}>
                  <img
                    ref={logoRef}
                    src={`${import.meta.env.BASE_URL}assonam-logo.svg`}
                    alt="ASSONAM"
                    className="h-8 md:h-10 w-auto transition-transform"
                  />
                  <span>
                    <span className="public-brand-name">ASSONAM</span>
                    <p ref={payoffRef} className="public-brand-payoff hidden 2xl:block">
                      Associazioni Arti e Mestieri
                    </p>
                  </span>
                </NavLink>

                <div className="hidden flex-1 items-center xl:flex">
                  <nav
                    className="flex min-w-0 flex-1 items-center justify-center gap-2 xl:gap-3 2xl:gap-4"
                    aria-label="Navigazione principale"
                  >
                    {NAV_ITEMS.map((item) => (
                      <NavLink
                        key={item.label}
                        className={publicLinkClass}
                        to={item.to}
                        end={item.to === "/"}
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </nav>
                  <div className="ml-6 flex shrink-0 items-center gap-3 2xl:gap-4">
                    <NavLink
                      className="text-sm font-bold text-slate-500 transition-colors hover:text-brand"
                      to={publicAccessTarget}
                      onMouseEnter={!publicAuth.authenticated ? prefetchDashboard : undefined}
                      onFocus={!publicAuth.authenticated ? prefetchDashboard : undefined}
                    >
                      {publicAccessLabel}
                    </NavLink>
                    <ThemeToggle />
                  </div>
                </div>

                <div className="ml-auto flex items-center gap-2 xl:hidden">
                  <ThemeToggle />
                  <button
                    className={`public-menu-toggle${menuOpen ? " is-open" : ""}`}
                    type="button"
                    aria-expanded={menuOpen}
                    aria-controls="mobile-nav-public"
                    aria-label={menuOpen ? "Chiudi menu" : "Apri menu"}
                    onClick={() => setMenuOpen((open) => !open)}
                  >
                    <span className="public-menu-toggle__icon" aria-hidden="true">
                      <span className="public-menu-toggle__line public-menu-toggle__line--top" />
                      <span className="public-menu-toggle__line public-menu-toggle__line--middle" />
                      <span className="public-menu-toggle__line public-menu-toggle__line--bottom" />
                    </span>
                    <span className="sr-only">{menuOpen ? "Chiudi menu" : "Apri menu"}</span>
                  </button>
                </div>
              </div>

              <div
                ref={mobileMenuRef}
                id="mobile-nav-public"
                className="public-mobile-panel xl:hidden"
                style={{ display: "none" }}
              >
                <nav className="container-shell py-4" aria-label="Navigazione principale mobile">
                  <div className="public-mobile-links flex flex-col gap-3 px-6 pb-6 pt-2">
                    {NAV_ITEMS.map((item) => (
                      <NavLink
                        key={item.label}
                        className="public-mobile-link py-2 text-lg font-bold"
                        to={item.to}
                        end={item.to === "/"}
                        onClick={close}
                      >
                        {item.label}
                      </NavLink>
                    ))}
                    
                    <div className="public-mobile-divider my-2"></div>
                    
                    <NavLink
                      className="public-mobile-access py-2 font-bold"
                      to={publicAccessTarget}
                      onClick={close}
                    >
                      {publicAccessLabel} &rarr;
                    </NavLink>
                  </div>
                </nav>
              </div>
            </header>
          </>
        ) : null}

        {isStandaloneAuthRoute ? (
          <div className="fixed right-4 top-4 z-50">
            <ThemeToggle />
          </div>
        ) : null}

        <main
          className={
            isDashboardRoute ? "" : isStandaloneAuthRoute ? "auth-route-main" : "public-main"
          }
        >
          {showPublicChrome ? <InstallAppPrompt hidden={menuOpen} /> : null}
          {isDashboardRoute ? (
            <Outlet />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          )}
        </main>

        {isDashboardRoute ? (
          <footer className="border-t border-white/70 bg-white/70 py-10 backdrop-blur-sm">
            <div className="container-shell flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-neutral-700">ASSO.N.A.M.</p>
                <p className="text-xs text-neutral-400">
                  Associazione Nazionale Arti e Mestieri · © {new Date().getFullYear()}{" "}
                  Tutti i diritti riservati.
                </p>
              </div>
              <div className="flex gap-4 text-xs text-neutral-400">
                <Link className="transition hover:text-neutral-600" to="/contatti">
                  Contatti
                </Link>
                <span className="text-neutral-200">·</span>
                <Link className="transition hover:text-neutral-600" to="/privacy">
                  Privacy
                </Link>
              </div>
            </div>
          </footer>
        ) : showPublicChrome ? (
          <footer className="public-footer">
            <div className="container-shell public-footer-grid">
              <div>
                <p className="public-footer-brand">ASSONAM</p>
                <p className="public-footer-copy">
                  Associazioni Arti e Mestieri · © {new Date().getFullYear()} Tutti i
                  diritti riservati.
                </p>
              </div>
              <div className="public-footer-links">
                <Link to="/associazioni">Affiliazioni</Link>
                <Link to="/servizi">Servizi</Link>
                <Link to="/contatti">Contatti</Link>
                <Link to="/privacy">Privacy</Link>
              </div>
              <div className="public-footer-side">
                <p>Via Sambucuccio d'Alando, 10 · Roma</p>
                <a href="mailto:asso.nam@email.it">asso.nam@email.it</a>
              </div>
            </div>
          </footer>
        ) : null}
      </div>
    </MotionProvider>
  );
};

export default Layout;

