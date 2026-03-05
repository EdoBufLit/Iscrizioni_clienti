import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { gsap } from "gsap";
import MotionProvider from "./motion/MotionProvider";
import { pageVariants } from "./motion/motionPresets";
import { usePublicMotion } from "./public/usePublicMotion";
import { PUBLIC_MOTION } from "./public/motionTokens";
import { trackUiEvent } from "../lib/tracking";
import { useStatePlatformCapabilities } from "../hooks/useStatePlatformCapabilities";

const NAV_ITEMS = [
  { label: "Home", to: "/" },
  { label: "Lo Studio", to: "/lo-studio" },
  { label: "Servizi", to: "/servizi" },
  { label: "Affiliazioni", to: "/associazioni" },
  { label: "Contatti", to: "/contatti" },
];

const dashboardLinkBase = "nav-pill";
const dashboardLinkActive = `${dashboardLinkBase} nav-pill-active`;
const dashboardLinkIdle = `${dashboardLinkBase} nav-pill-idle`;
const dashboardLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? dashboardLinkActive : dashboardLinkIdle;

const publicLinkClass = ({ isActive }: { isActive: boolean }) =>
  `public-nav-pill${isActive ? " is-active" : ""}`;

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
  const close = () => setMenuOpen(false);
  const location = useLocation();

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
  const { capabilities } = useStatePlatformCapabilities();
  const affiliazioneEnabled = capabilities?.affiliazioneEnabled === true;

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

    const headerElement = publicHeaderRef.current;
    const logoElement = logoRef.current;
    if (!headerElement || !logoElement) return;

    const animateShrinkState = (shrink: boolean) => {
      if (headerShrinkRef.current === shrink) return;
      headerShrinkRef.current = shrink;

      gsap.to(headerElement, {
        backgroundColor: shrink ? "rgba(246, 250, 250, 0.94)" : "rgba(242, 246, 247, 0.84)",
        borderColor: shrink ? "rgba(17, 39, 41, 0.12)" : "rgba(255, 255, 255, 0.5)",
        boxShadow: shrink ? "0 12px 35px rgba(15, 35, 38, 0.14)" : "0 0 0 rgba(0,0,0,0)",
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
  }, [isDashboardRoute]);

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

  return (
    <MotionProvider>
      <div
        className={`relative min-h-screen text-neutral-800${
          isDashboardRoute ? "" : " public-shell"
        }`}
      >
        {isDashboardRoute ? (
          <>
            <div
              className="h-0.5 bg-gradient-to-r from-accent via-brand to-ember"
              aria-hidden="true"
            />
            <header className="header-band">
              <div className="container-shell flex items-center justify-between py-4">
                <NavLink className="flex items-center gap-3" to="/" onClick={close}>
                  <img
                    src={`${import.meta.env.BASE_URL}logo-transparent.png`}
                    alt="ASSO.N.A.M."
                    className="h-11 rounded"
                  />
                  <div>
                    <p className="text-base font-bold tracking-tight text-neutral-900">
                      ASSO.N.A.M.
                    </p>
                    <p className="text-[11px] leading-tight text-neutral-500">
                      Associazione Nazionale Arti e Mestieri
                    </p>
                  </div>
                </NavLink>

                <nav
                  className="hidden items-center gap-1 md:flex"
                  aria-label="Navigazione principale"
                >
                  {NAV_ITEMS.map((item) => (
                    <NavLink
                      key={item.label}
                      className={dashboardLinkClass}
                      to={item.to}
                      end={item.to === "/"}
                    >
                      {item.label}
                    </NavLink>
                  ))}
                  <NavLink
                    className="ml-3 btn-ghost px-4 py-1.5 text-sm"
                    to="/area-riservata"
                    onMouseEnter={prefetchDashboard}
                    onFocus={prefetchDashboard}
                  >
                    Area riservata
                  </NavLink>
                </nav>

                <button
                  className="inline-flex items-center rounded-md border border-neutral-200 bg-white/60 px-3 py-2 text-sm font-medium text-neutral-600 transition hover:border-neutral-300 md:hidden"
                  type="button"
                  aria-expanded={menuOpen}
                  aria-controls="mobile-nav-dashboard"
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  {menuOpen ? "Chiudi" : "Menu"}
                </button>
              </div>

              {menuOpen && (
                <nav
                  className="border-t border-white/70 bg-white/80 backdrop-blur-md md:hidden"
                  id="mobile-nav-dashboard"
                  aria-label="Navigazione principale"
                >
                  <div className="container-shell flex flex-col gap-1 py-4">
                    {NAV_ITEMS.map((item) => (
                      <NavLink
                        key={item.label}
                        className={dashboardLinkClass}
                        to={item.to}
                        end={item.to === "/"}
                        onClick={close}
                      >
                        {item.label}
                      </NavLink>
                    ))}
                    <NavLink
                      className="mt-2 btn-ghost text-center text-sm"
                      to="/area-riservata"
                      onClick={close}
                      onMouseEnter={prefetchDashboard}
                      onFocus={prefetchDashboard}
                    >
                      Area riservata
                    </NavLink>
                  </div>
                </nav>
              )}
            </header>
          </>
        ) : (
          <>
            <div className="public-site-glow" aria-hidden="true" />
            <header className="public-header" ref={publicHeaderRef}>
              <div className="container-shell public-header-inner">
                <NavLink className="public-brand" to="/" onClick={close}>
                  <img
                    ref={logoRef}
                    src={`${import.meta.env.BASE_URL}logo-transparent.png`}
                    alt="ASSONAM"
                    className="public-brand-logo"
                  />
                  <span>
                    <span className="public-brand-name">ASSONAM</span>
                    <p ref={payoffRef} className="public-brand-payoff">
                      Associazioni Arti e Mestieri
                    </p>
                  </span>
                </NavLink>

                <nav className="public-desktop-nav" aria-label="Navigazione principale">
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
                  <div className="public-nav-cta-group">
                    {affiliazioneEnabled ? (
                      <>
                        <span className="public-affilia-nav-badge" aria-label="Per Associazioni">
                          Per Associazioni
                        </span>
                        <NavLink
                          className="btn-primary public-affilia-nav-btn"
                          to="/affiliazione"
                          onClick={() =>
                            trackUiEvent("click_affiliazione_cta_nav", { placement: "desktop_nav" })
                          }
                        >
                          <span>Affilia la tua Associazione</span>
                          <span className="public-affilia-nav-arrow" aria-hidden="true">
                            &rarr;
                          </span>
                        </NavLink>
                      </>
                    ) : null}
                    <NavLink className="btn-ghost public-socio-nav-btn" to="/associazioni">
                      Diventa Socio
                    </NavLink>
                    <NavLink
                      className="btn-ghost public-access-btn"
                      to="/area-riservata"
                      onMouseEnter={prefetchDashboard}
                      onFocus={prefetchDashboard}
                    >
                      Area Riservata
                    </NavLink>
                  </div>
                </nav>

                <button
                  className="public-menu-toggle md:hidden"
                  type="button"
                  aria-expanded={menuOpen}
                  aria-controls="mobile-nav-public"
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  {menuOpen ? "Chiudi" : "Menu"}
                </button>
              </div>

              <div
                ref={mobileMenuRef}
                id="mobile-nav-public"
                className="public-mobile-panel md:hidden"
                style={{ display: "none" }}
              >
                <nav className="container-shell py-4" aria-label="Navigazione principale mobile">
                  <div className="public-mobile-links">
                    {affiliazioneEnabled ? (
                      <NavLink
                        className="btn-primary public-mobile-affilia-btn w-full justify-center text-center"
                        to="/affiliazione"
                        onClick={() => {
                          trackUiEvent("click_affiliazione_cta_nav", {
                            placement: "mobile_menu",
                          });
                          close();
                        }}
                      >
                        Affilia la tua Associazione
                      </NavLink>
                    ) : null}
                    <NavLink className="btn-ghost text-center" to="/associazioni" onClick={close}>
                      Diventa Socio
                    </NavLink>
                    <NavLink
                      className="btn-ghost text-center"
                      to="/area-riservata"
                      onClick={close}
                      onMouseEnter={prefetchDashboard}
                      onFocus={prefetchDashboard}
                    >
                      Area Riservata
                    </NavLink>
                    {NAV_ITEMS.map((item) => (
                      <NavLink
                        key={item.label}
                        className={publicLinkClass}
                        to={item.to}
                        end={item.to === "/"}
                        onClick={close}
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                </nav>
              </div>
            </header>
          </>
        )}

        <main className={isDashboardRoute ? "" : "public-main"}>
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
        ) : (
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
        )}
      </div>
    </MotionProvider>
  );
};

export default Layout;

