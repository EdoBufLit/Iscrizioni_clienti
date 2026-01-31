import { Link, NavLink, Outlet } from "react-router-dom";

const NAV_ITEMS = [
  { label: "Panoramica", to: "/admin", end: true },
  { label: "Affiliazioni", to: "/admin/affiliazioni", end: false },
];

const sidebarLinkBase =
  "block rounded-md px-3 py-2 text-sm font-medium transition";
const sidebarLinkActive = `${sidebarLinkBase} bg-neutral-50 text-brand`;
const sidebarLinkIdle = `${sidebarLinkBase} text-neutral-600 hover:text-neutral-900`;

const tabBase =
  "whitespace-nowrap px-3 py-2 text-sm font-medium transition border-b-2";
const tabActive = `${tabBase} border-brand text-brand`;
const tabIdle = `${tabBase} border-transparent text-neutral-500 hover:text-neutral-700`;

const linkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? sidebarLinkActive : sidebarLinkIdle;

const tabClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? tabActive : tabIdle;

const AdminLayout = () => {
  return (
    <div className="container-shell py-10">
      <div className="md:flex md:gap-10">
        <aside className="hidden w-56 shrink-0 md:block">
          <div className="flex items-center gap-2">
            <span className="section-title">AMMINISTRAZIONE</span>
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              Admin
            </span>
          </div>

          <nav className="mt-6 flex flex-col gap-1" aria-label="Amministrazione">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.label}
                className={linkClass}
                to={item.to}
                end={item.end}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-8 border-t border-neutral-100 pt-4">
            <Link
              className="text-sm font-medium text-neutral-500 transition hover:text-neutral-700"
              to="/"
            >
              Torna al sito
            </Link>
          </div>
        </aside>

        <div className="md:hidden">
          <div className="flex items-center gap-2">
            <span className="section-title">AMMINISTRAZIONE</span>
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              Admin
            </span>
          </div>
          <nav
            className="mt-4 flex gap-1 border-b border-neutral-100"
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
        </div>

        <div className="mt-6 min-w-0 flex-1 md:mt-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default AdminLayout;
