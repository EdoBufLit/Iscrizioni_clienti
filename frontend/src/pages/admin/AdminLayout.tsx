import { Link, NavLink, Outlet } from "react-router-dom";

const NAV_ITEMS = [
  {
    label: "Panoramica",
    to: "/admin",
    end: true,
    icon: "M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z",
  },
  {
    label: "Affiliazioni",
    to: "/admin/affiliazioni",
    end: false,
    icon: "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21",
  },
];

const sidebarLinkBase =
  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition";
const sidebarLinkActive = `${sidebarLinkBase} border border-white/70 bg-white/70 text-brand shadow-subtle`;
const sidebarLinkIdle = `${sidebarLinkBase} text-neutral-600 hover:bg-white/60 hover:text-neutral-900`;

const tabBase =
  "whitespace-nowrap px-3 py-2 text-sm font-medium transition border-b-2";
const tabActive = `${tabBase} border-accent text-brand`;
const tabIdle = `${tabBase} border-transparent text-neutral-500 hover:text-neutral-700`;

const linkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? sidebarLinkActive : sidebarLinkIdle;

const tabClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? tabActive : tabIdle;

const AdminLayout = () => {
  return (
    <div>
      {/* Header band */}
      <div className="header-band">
        <div className="container-shell py-8">
          <div className="flex items-start gap-5">
            <div className="hidden shrink-0 sm:block">
              <img
                src={`${import.meta.env.BASE_URL}logo.jpg`}
                alt="ASSO.N.A.M."
                className="h-12 rounded logo-mark"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-lg font-semibold text-neutral-900">
                  Amministrazione
                </h1>
                <span className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                  Admin
                </span>
              </div>
              <p className="mt-1 text-sm text-neutral-500">
                Gestione associazioni, iscrizioni e pratiche.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="container-shell py-10">
        <div className="md:flex md:gap-10">
          {/* Sidebar — desktop */}
          <aside className="hidden w-56 shrink-0 md:block">
            <div className="surface p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
                Navigazione
              </p>
              <nav
                className="mt-3 flex flex-col gap-0.5"
                aria-label="Amministrazione"
              >
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.label}
                    className={linkClass}
                    to={item.to}
                    end={item.end}
                  >
                    <svg
                      className="h-4 w-4 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d={item.icon} />
                    </svg>
                    {item.label}
                  </NavLink>
                ))}
              </nav>

              <div className="mt-8 border-t border-white/70 pt-4">
                <Link
                  className="flex items-center gap-2 text-sm font-medium text-neutral-500 transition hover:text-neutral-700"
                  to="/"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                  </svg>
                  Torna al sito
                </Link>
              </div>
            </div>
          </aside>

          {/* Tabs — mobile */}
          <nav
            className="flex gap-1 border-b border-neutral-100 md:hidden"
            aria-label="Amministrazione"
          >
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.label}
                className={tabClass}
                to={item.to}
                end={item.end}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-6 min-w-0 flex-1 md:mt-0">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLayout;
