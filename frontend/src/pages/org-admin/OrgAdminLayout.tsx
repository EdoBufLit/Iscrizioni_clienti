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
      <div>
        {/* Header band */}
        <div className="header-band">
          <div className="container-shell py-8">
            <div className="flex items-start gap-5">
              <div className="hidden shrink-0 sm:block">
                <img
                src={`${import.meta.env.BASE_URL}logo-transparent.png`}
                alt="ASSO.N.A.M."
                className="h-12 rounded"
              />
              </div>
              <div className="min-w-0 flex-1">
                {loading ? (
                  <>
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="mt-2 h-3.5 w-64" />
                  </>
                ) : admin ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h1 className="text-lg font-semibold text-neutral-900">
                        {admin.organization?.name ?? "Gestione associazione"}
                      </h1>
                      <span className="inline-flex items-center rounded-full border border-brand/20 bg-brand/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
                        Org Admin
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-neutral-500">
                      {admin.email}
                    </p>
                  </>
                ) : (
                  <h1 className="text-lg font-semibold text-neutral-900">
                    Gestione associazione
                  </h1>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {!loading && admin && <ReviewGuideButton />}
                <Link
                  className="hidden text-sm font-medium text-neutral-500 transition hover:text-neutral-700 sm:block"
                  to="/"
                >
                  Torna al sito
                </Link>
                {!loading && admin && (
                  <button
                    className="btn-ghost px-3 py-1.5 text-sm"
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
            <div className="container-shell">
              <nav className="flex flex-wrap gap-3 pb-5">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `${isActive ? "nav-pill nav-pill-active" : "nav-pill nav-pill-idle"}`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          )}
        </div>

        {/* Content */}
        <Outlet />

        {/* Version footer */}
        {ver && (
          <footer className="container-shell pb-6 pt-12 text-[11px] text-neutral-400">
            v{ver.version}
            {ver.git_sha ? ` (${ver.git_sha.slice(0, 7)})` : ""}
          </footer>
        )}

        {!loading && admin && <OnboardingTour role="org_admin" />}
      </div>
    </Ctx.Provider>
  );
};

export default OrgAdminLayout;
