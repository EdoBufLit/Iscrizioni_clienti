import { createContext, useContext, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  fetchOrgAdminMe,
  fetchVersion,
  orgAdminLogout,
  AuthError,
  type OrgAdminProfile,
  type VersionInfo,
} from "../../lib/api";
import { applySeo } from "../../lib/seo";
import Skeleton from "../../components/ui/Skeleton";
import { OnboardingTour, ReviewGuideButton } from "../../components/onboarding";

type OrgAdminCtx = {
  admin: OrgAdminProfile | null;
  loading: boolean;
};

const Ctx = createContext<OrgAdminCtx>({ admin: null, loading: true });
export const useOrgAdmin = () => useContext(Ctx);

const NAV_ITEMS = [
  { to: "/org-admin", label: "Panoramica", end: true },
  { to: "/org-admin/inviti", label: "Inviti", end: false },
  { to: "/org-admin/soci", label: "Soci", end: false },
  { to: "/org-admin/tessere", label: "Tessere", end: false },
  { to: "/org-admin/associazione", label: "Associazione", end: false },
];

const OrgAdminLayout = () => {
  const [admin, setAdmin] = useState<OrgAdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [ver, setVer] = useState<VersionInfo | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    applySeo({ title: "Admin Associazione", description: "Pannello admin associazione ASSO.N.A.M.", noindex: true });
  }, []);

  useEffect(() => {
    fetchOrgAdminMe()
      .then(setAdmin)
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/org-admin/login", { replace: true });
        }
      })
      .finally(() => setLoading(false));
    fetchVersion().then(setVer).catch(() => {});
  }, [navigate]);

  const handleLogout = async () => {
    await orgAdminLogout();
    navigate("/org-admin/login", { replace: true });
  };

  return (
    <Ctx.Provider value={{ admin, loading }}>
      <div className="min-h-screen bg-[#f8f9fa]/50">
        {/* Header band */}
        <header className="header-band sticky top-0 z-30">
          <div className="container-shell py-5">
            <div className="flex items-center gap-6">
              <div className="hidden shrink-0 sm:block">
                <Link to="/" className="block transition-transform hover:scale-95">
                  <img
                    src={`${import.meta.env.BASE_URL}logo-transparent.png`}
                    alt="ASSO.N.A.M."
                    className="h-10 w-auto rounded object-contain"
                  />
                </Link>
              </div>
              <div className="min-w-0 flex-1">
                {loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                ) : admin ? (
                  <div className="flex flex-col">
                    <div className="flex items-center gap-3">
                      <h1 className="truncate text-lg font-bold tracking-tight text-neutral-900">
                        {admin.organization?.name ?? "Gestione associazione"}
                      </h1>
                      <span className="inline-flex items-center rounded-full border border-brand/20 bg-brand/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">
                        Gestore locale
                      </span>
                    </div>
                    <p className="truncate text-xs font-medium text-neutral-500 uppercase tracking-wide opacity-80 mt-0.5">
                      {admin.email}
                    </p>
                  </div>
                ) : (
                  <h1 className="text-lg font-bold tracking-tight text-neutral-900 uppercase tracking-widest">
                    Gestione associazione
                  </h1>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-4">
                {!loading && admin && <ReviewGuideButton className="hidden md:flex" />}
                <Link
                  className="link-muted hidden font-semibold sm:block"
                  to="/"
                >
                  Sito pubblico
                </Link>
                <div className="h-4 w-px bg-neutral-200 hidden sm:block" />
                {!loading && admin && (
                  <button
                    className="btn-ghost px-4 py-2 text-xs font-bold uppercase tracking-wider"
                    type="button"
                    onClick={handleLogout}
                  >
                    Esci
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Nav tabs */}
          {!loading && admin && (
            <div className="container-shell mt-1">
              <nav className="flex flex-wrap gap-2 pb-4 overflow-x-auto no-scrollbar">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold tracking-tight transition-all duration-200 ${
                        isActive 
                          ? "bg-brand text-white shadow-md shadow-brand/20 translate-y-[-1px]" 
                          : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          )}
        </header>

        {/* Content */}
        <main className="animate-in fade-in duration-500">
          <Outlet />
        </main>

        {/* Version footer */}
        {ver && (
          <footer className="container-shell pb-8 pt-12 text-[10px] font-bold uppercase tracking-widest text-neutral-300">
            Piattaforma ASSO.N.A.M. v{ver.version}
            {ver.git_sha ? ` [${ver.git_sha.slice(0, 7)}]` : ""}
          </footer>
        )}

        {!loading && admin && <OnboardingTour role="org_admin" />}
      </div>
    </Ctx.Provider>
  );
};

export default OrgAdminLayout;
