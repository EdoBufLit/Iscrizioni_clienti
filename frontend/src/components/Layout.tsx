import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import MotionProvider from "./motion/MotionProvider";
import { pageVariants } from "./motion/motionPresets";
import SceneBackground from "./SceneBackground";

const NAV_ITEMS = [
  { label: "Home", to: "/" },
  { label: "Lo Studio", to: "/lo-studio" },
  { label: "Servizi", to: "/servizi" },
  { label: "Affiliazioni", to: "/associazioni" },
  { label: "Contatti", to: "/contatti" },
];

const linkBase = "nav-pill";
const linkActive = `${linkBase} nav-pill-active`;
const linkIdle = `${linkBase} nav-pill-idle`;

const linkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? linkActive : linkIdle;

let dashboardPrefetched = false;
const prefetchDashboard = () => {
  if (dashboardPrefetched) return;
  dashboardPrefetched = true;
  import("../pages/dashboard/DashboardLayout").catch(() => {});
  import("../pages/dashboard/DashboardHome").catch(() => {});
};


const Layout = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);
  const location = useLocation();

  return (
    <MotionProvider>
      <div className="relative min-h-screen text-neutral-800">
        <SceneBackground />
        <div className="h-0.5 bg-gradient-to-r from-accent via-brand to-ember" aria-hidden="true" />
        <header className="header-band">
          <div className="container-shell flex items-center justify-between py-4">
            <NavLink
              className="flex items-center gap-3"
              to="/"
              onClick={close}
            >
              <img src={`${import.meta.env.BASE_URL}logo-transparent.png`} alt="ASSO.N.A.M." className="h-11 rounded" />
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
                  className={linkClass}
                  to={item.to}
                  end={item.to === "/"}
                >
                  {item.label}
                </NavLink>
              ))}
              <NavLink
                className="ml-3 btn-ghost px-4 py-1.5 text-sm"
                to="/dashboard"
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
              aria-controls="mobile-nav"
              onClick={() => setMenuOpen((o) => !o)}
              data-component="header-menu-toggle"
            >
              {menuOpen ? "Chiudi" : "Menu"}
            </button>
          </div>

          {menuOpen && (
            <nav
              className="border-t border-white/70 bg-white/80 backdrop-blur-md md:hidden"
              id="mobile-nav"
              aria-label="Navigazione principale"
            >
              <div className="container-shell flex flex-col gap-1 py-4">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.label}
                    className={linkClass}
                    to={item.to}
                    end={item.to === "/"}
                    onClick={close}
                  >
                    {item.label}
                  </NavLink>
                ))}
                <NavLink
                  className="mt-2 btn-ghost text-center text-sm"
                  to="/dashboard"
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

        <main>
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
        </main>

        <footer className="border-t border-white/70 bg-white/70 py-10 backdrop-blur-sm">
          <div className="container-shell flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-neutral-700">ASSO.N.A.M.</p>
              <p className="text-xs text-neutral-400">
                Associazione Nazionale Arti e Mestieri · © {new Date().getFullYear()} Tutti i diritti riservati.
              </p>
            </div>
            <div className="flex gap-4 text-xs text-neutral-400">
              <Link
                className="transition hover:text-neutral-600"
                to="/contatti"
              >
                Contatti
              </Link>
              <span className="text-neutral-200">·</span>
              <span>Privacy</span>
            </div>
          </div>
        </footer>
      </div>
    </MotionProvider>
  );
};

export default Layout;
