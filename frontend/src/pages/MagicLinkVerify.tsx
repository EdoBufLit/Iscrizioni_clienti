import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { verifyMemberToken, verifyOrgAdminToken } from "../lib/api";
import { orgAdminLoginUrl, safeOrgAdminNext } from "../lib/orgAdminNavigation";

const resolveSafeNextPath = (raw: string | null): string | null => {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  return value;
};

const MagicLinkVerify = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState("");
  const orgAdminVerification = useRef<{ key: string; promise: ReturnType<typeof verifyOrgAdminToken> } | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    const role = searchParams.get("role");
    const nextPath = resolveSafeNextPath(searchParams.get("next"));

    if (!token) {
      setErrorMessage("Link non valido: token mancante.");
      return;
    }

    let active = true;
    const verify = async () => {
      try {
        if (role === "org_admin") {
          const orgAdminNext = safeOrgAdminNext(searchParams.get("next"));
          // Share the one-use Org Admin exchange across StrictMode effects.
          // The ref lives only in this component and is keyed by token+target.
          const key = JSON.stringify([token, orgAdminNext]);
          if (orgAdminVerification.current?.key !== key) {
            orgAdminVerification.current = { key, promise: verifyOrgAdminToken(token, orgAdminNext ?? undefined) };
          }
          const result = await orgAdminVerification.current.promise;
          if (!active) return;
          if (result.mfa_required && result.challenge) {
            navigate(
              `/org-admin/callback?${new URLSearchParams({ mfa_challenge: result.challenge, ...(orgAdminNext ? { next: orgAdminNext } : {}) })}`,
              { replace: true },
            );
            return;
          }
          navigate(orgAdminNext || safeOrgAdminNext(result.redirect_to) || "/org-admin", { replace: true });
          return;
        }
        if (role === "member") {
          await verifyMemberToken(token);
          navigate(nextPath || "/dashboard", { replace: true });
          return;
        }
        setErrorMessage("Link non valido: ruolo non specificato.");
      } catch {
        if (role !== "org_admin" || active) {
          setErrorMessage("Il link di accesso non è valido o è scaduto.");
        }
      }
    };

    void verify();
    return () => { active = false; };
  }, [navigate, searchParams]);

  if (errorMessage) {
    return (
      <section className="pt-28 pb-16" data-reveal="fade-up">
        <div className="container-shell">
          <div className="surface-strong mx-auto max-w-xl p-6 sm:p-8 text-center md:p-10">
            <p className="section-title">Accesso</p>
            <h1 className="section-heading">Link non valido</h1>
            <p className="mt-4 text-sm leading-7 text-neutral-600" role="alert">{errorMessage}</p>
            <div className="mt-7">
              <Link className="btn-primary px-6 py-2.5" to={searchParams.get("role") === "org_admin" ? orgAdminLoginUrl(safeOrgAdminNext(searchParams.get("next")) || "/org-admin") : "/login"}>
                Torna al login
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="pt-28 pb-16" data-reveal="fade-up">
      <div className="container-shell">
        <div className="surface-strong mx-auto max-w-xl p-6 sm:p-8 text-center md:p-10">
          <p className="section-title">Accesso</p>
          <h1 className="section-heading">Verifica in corso</h1>
          <p className="mt-4 text-sm leading-7 text-neutral-600" role="status">
            Stiamo completando la verifica del link sicuro.
          </p>
        </div>
      </div>
    </section>
  );
};

export default MagicLinkVerify;
