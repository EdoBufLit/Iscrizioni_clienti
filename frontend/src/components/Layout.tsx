import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import MotionProvider from "./motion/MotionProvider";
import { pageVariants } from "./motion/motionPresets";

const NAV_ITEMS = [
  { label: "Home", to: "/" },
  { label: "Lo Studio", to: "/lo-studio" },
  { label: "Servizi", to: "/servizi" },
  { label: "Affiliazioni", to: "/associazioni" },
  { label: "Contatti", to: "/contatti" },
];

const linkBase = "rounded-md px-3 py-2 text-sm font-medium transition";
const linkActive = `${linkBase} text-brand`;
const linkIdle = `${linkBase} text-neutral-600 hover:text-neutral-900`;

const linkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? linkActive : linkIdle;

let dashboardPrefetched = false;
const prefetchDashboard = () => {
  if (dashboardPrefetched) return;
  dashboardPrefetched = true;
  import("../pages/dashboard/DashboardLayout").catch(() => {});
  import("../pages/dashboard/DashboardHome").catch(() => {});
};

let adminPrefetched = false;
const prefetchAdmin = () => {
  if (adminPrefetched) return;
  adminPrefetched = true;
  import("../pages/admin/AdminLayout").catch(() => {});
  import("../pages/admin/AdminHome").catch(() => {});
};

const Layout = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);
  const location = useLocation();

  return (
    <MotionProvider>
      <div className="min-h-screen bg-neutral-25 text-neutral-800">
        <header className="border-b border-neutral-100 bg-white">
          <div className="container-shell flex items-center justify-between py-4">
            <NavLink
              className="flex items-center gap-3"
              to="/"
              onClick={close}
            >
              <img src="/favicon.svg" alt="ASSO.N.A.M." className="h-7" />
              <div>
                <p className="text-sm font-semibold text-neutral-900">
                  ASSO.N.A.M.
                </p>
                <p className="text-[11px] leading-tight text-neutral-500">
                  Studio contabile
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
                className="ml-3 inline-flex items-center justify-center rounded-md border border-neutral-200 px-4 py-1.5 text-sm font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
                to="/dashboard"
                onMouseEnter={prefetchDashboard}
                onFocus={prefetchDashboard}
              >
                Area riservata
              </NavLink>
            </nav>

            <button
              className="inline-flex items-center rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-600 transition hover:border-neutral-300 md:hidden"
              type="button"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? "Chiudi" : "Menu"}
            </button>
          </div>

          {menuOpen && (
            <nav
              className="border-t border-neutral-100 bg-white md:hidden"
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
                  className="mt-2 rounded-md border border-neutral-200 px-3 py-2 text-center text-sm font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
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

        <footer className="border-t border-neutral-100 py-8">
          <div className="container-shell flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-neutral-400">
              © {new Date().getFullYear()} ASSO.N.A.M. — Tutti i diritti
              riservati.
            </p>
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
