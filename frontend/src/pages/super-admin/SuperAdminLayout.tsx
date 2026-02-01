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

const SuperAdminLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [profile, setProfile] = useState<SuperAdminProfile | null>(null);
  const [ver, setVer] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);

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
    { label: "Amministratori", path: "/super-admin/org-admins" },
  ];

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-50 text-neutral-500">
        Caricamento...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 font-sans text-neutral-900">
      {/* Header band */}
      <div className="border-b border-white/60 bg-white/40 backdrop-blur-sm sticky top-0 z-30">
        <div className="container-shell py-6">
          <div className="flex items-start gap-5">
            <div className="hidden shrink-0 sm:block">
              <img
                src={`${import.meta.env.BASE_URL}logo.jpg`}
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
                className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900 bg-white"
                type="button"
                onClick={handleLogout}
              >
                Esci
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="mt-8 flex gap-8 border-b border-neutral-200/50">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.path;
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`-mb-px border-b-2 pb-3 text-sm font-medium transition ${
                    isActive
                      ? "border-brand text-brand"
                      : "border-transparent text-neutral-500 hover:text-neutral-700"
                  }`}
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
