import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  fetchSuperAdminMe,
  superAdminLogout,
  fetchVersion,
  AuthError,
  type SuperAdminProfile,
  type VersionInfo,
} from "../../lib/api";
import { applySeo } from "../../lib/seo";

const SuperAdminLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [profile, setProfile] = useState<SuperAdminProfile | null>(null);
  const [ver, setVer] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    applySeo({ title: "Super Admin", description: "Pannello super admin ASSO.N.A.M.", noindex: true });
  }, []);

  useEffect(() => {
    fetchSuperAdminMe()
      .then(setProfile)
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/super-admin/login", { replace: true });
        }
      })
      .finally(() => setLoading(false));

    fetchVersion().then(setVer).catch(() => {});
  }, [navigate]);

  const handleLogout = async () => {
    await superAdminLogout();
    navigate("/super-admin/login", { replace: true });
  };

  const navLinks = [
    { label: "Associazioni", path: "/super-admin/associazioni" },
    { label: "Affiliazioni", path: "/super-admin/affiliazioni" },
    { label: "Amministratori", path: "/super-admin/org-admins" },
    { label: "Soci", path: "/super-admin/soci" },
  ];

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-neutral-500">
        Caricamento...
      </div>
    );
  }

  return (
    <div className="min-h-screen text-neutral-900">
      {/* Header band */}
      <div className="header-band sticky top-0 z-30">
        <div className="container-shell py-6">
          <div className="flex items-start gap-5">
            <div className="hidden shrink-0 sm:block">
              <img
                src={`${import.meta.env.BASE_URL}logo-transparent.png`}
                alt="ASSO.N.A.M."
                className="h-12 rounded"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-lg font-semibold text-neutral-900">
                  Super Amministrazione
                </h1>
                <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                  Super Admin
                </span>
              </div>
              {profile && (
                <p className="mt-1 text-sm text-neutral-500">
                  {profile.email}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Link
                className="hidden text-sm font-medium text-neutral-500 transition hover:text-neutral-700 sm:block"
                to="/"
              >
                Torna al sito
              </Link>
              <button
                className="btn-ghost px-3 py-1.5 text-sm"
                type="button"
                onClick={handleLogout}
              >
                Esci
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="mt-8 flex flex-wrap gap-3 pb-5">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.path;
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`${isActive ? "nav-pill nav-pill-active" : "nav-pill nav-pill-idle"}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="container-shell py-10">
        <Outlet context={{ profile }} />
      </div>

      {/* Version footer */}
      {ver && (
        <footer className="container-shell pb-6 pt-2 text-[11px] text-neutral-400">
          v{ver.version}
          {ver.git_sha ? ` (${ver.git_sha.slice(0, 7)})` : ""}
        </footer>
      )}
    </div>
  );
};

export default SuperAdminLayout;
