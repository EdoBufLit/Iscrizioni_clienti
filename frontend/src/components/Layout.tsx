import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

const Layout = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const activeLink = "text-neutral-900 border-b border-neutral-900";
  const inactiveLink = "text-neutral-600 hover:text-neutral-900";
  const baseUrl = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;

  return (
    <div className="min-h-screen bg-neutral-25 text-neutral-800">
      <header className="border-b border-neutral-100 bg-white">
        <div className="container-shell flex items-center justify-between py-4">
          <div className="flex items-center gap-4">
            <img
              src={`${baseUrl}favicon.svg`}
              alt="ASSO.N.A.M."
              className="h-9 w-9"
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                ASSO.N.A.M.
              </p>
              <p className="text-lg font-semibold text-neutral-900">
                Studio contabile · Portale associativo
              </p>
            </div>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
            <NavLink
              className={({ isActive }) =>
                `${isActive ? activeLink : inactiveLink} border-b pb-1`
              }
              to="/"
            >
              Home
            </NavLink>
            <a className={`${inactiveLink} border-b border-transparent pb-1`} href="/app/#metodo">
              Lo Studio
            </a>
            <a className={`${inactiveLink} border-b border-transparent pb-1`} href="/app/#servizi">
              Servizi
            </a>
            <NavLink
              className={({ isActive }) =>
                `${isActive ? activeLink : inactiveLink} border-b pb-1`
              }
              to="/associazioni"
            >
              Affiliazioni
            </NavLink>
            <a className={`${inactiveLink} border-b border-transparent pb-1`} href="/app/#contatti">
              Contatti
            </a>
            <a className={`${inactiveLink} border-b border-transparent pb-1`} href="/app/#contatti">
              Area riservata
            </a>
          </nav>
          <button
            className="inline-flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-600 md:hidden"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            Menu
          </button>
        </div>
        {menuOpen ? (
          <div className="border-t border-neutral-100 bg-white md:hidden" id="mobile-nav">
            <div className="container-shell flex flex-col gap-4 py-4 text-sm font-medium">
              <NavLink
                className={({ isActive }) => (isActive ? activeLink : inactiveLink)}
                to="/"
                onClick={() => setMenuOpen(false)}
              >
                Home
              </NavLink>
              <a className={inactiveLink} href="/app/#metodo" onClick={() => setMenuOpen(false)}>
                Lo Studio
              </a>
              <a className={inactiveLink} href="/app/#servizi" onClick={() => setMenuOpen(false)}>
                Servizi
              </a>
              <NavLink
                className={({ isActive }) => (isActive ? activeLink : inactiveLink)}
                to="/associazioni"
                onClick={() => setMenuOpen(false)}
              >
                Affiliazioni
              </NavLink>
              <a className={inactiveLink} href="/app/#contatti" onClick={() => setMenuOpen(false)}>
                Contatti
              </a>
              <a className={inactiveLink} href="/app/#contatti" onClick={() => setMenuOpen(false)}>
                Area riservata
              </a>
            </div>
          </div>
        ) : null}
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="mt-16 bg-neutral-900 text-neutral-200">
        <div className="container-shell py-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-lg font-semibold">ASSO.N.A.M.</p>
              <p className="text-sm text-neutral-400">
                Studio contabile · Portale associativo
              </p>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-neutral-400">
              <a className="hover:text-white" href="/app/#servizi">
                Servizi
              </a>
              <a className="hover:text-white" href="/app/#metodo">
                Metodo
              </a>
              <a className="hover:text-white" href="/app/#associazioni-preview">
                Associazioni
              </a>
              <a className="hover:text-white" href="/app/#faq">
                FAQ
              </a>
              <a className="hover:text-white" href="/app/#contatti">
                Contatti
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
