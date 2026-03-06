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
              <div className="flex flex-col">
                <div className="flex items-center gap-3">
                  <h1 className="truncate text-lg font-bold tracking-tight text-neutral-900 uppercase tracking-widest">
                    Governance Piattaforma
                  </h1>
                  <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700 shadow-sm">
                    Super Admin
                  </span>
                </div>
                {profile && (
                  <p className="truncate text-xs font-medium text-neutral-500 uppercase tracking-wide opacity-80 mt-0.5">
                    {profile.email}
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              <Link
                className="link-muted hidden font-semibold sm:block"
                to="/"
              >
                Sito pubblico
              </Link>
              <div className="h-4 w-px bg-neutral-200 hidden sm:block" />
              <button
                className="btn-ghost px-4 py-2 text-xs font-bold uppercase tracking-wider"
                type="button"
                onClick={handleLogout}
              >
                Esci
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="container-shell mt-1">
          <nav className="flex flex-wrap gap-2 pb-4 overflow-x-auto no-scrollbar">
            {navLinks.map((link) => {
              const isActive = location.pathname.startsWith(link.path);
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold tracking-tight transition-all duration-200 ${
                    isActive 
                      ? "bg-neutral-900 text-white shadow-md shadow-black/20 translate-y-[-1px]" 
                      : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="container-shell py-10 animate-in fade-in duration-500">
        <Outlet context={{ profile }} />
      </main>

      {/* Version footer */}
      {ver && (
        <footer className="container-shell pb-8 pt-4 text-[10px] font-bold uppercase tracking-widest text-neutral-300">
          Core Engine v{ver.version}
          {ver.git_sha ? ` [${ver.git_sha.slice(0, 7)}]` : ""}
        </footer>
      )}
    </div>
  );
};

export default SuperAdminLayout;
