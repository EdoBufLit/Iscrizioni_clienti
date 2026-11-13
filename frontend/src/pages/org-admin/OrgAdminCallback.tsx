import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { verifyOrgAdminToken } from "../../lib/api";
import OrgAdminMfaChallenge from "./components/OrgAdminMfaChallenge";
import { orgAdminLoginUrl, safeOrgAdminNext } from "../../lib/orgAdminNavigation";

const OrgAdminCallback = () => {
  const [searchParams] = useSearchParams();
  const nextPath = safeOrgAdminNext(searchParams.get("next"));
  const navigate = useNavigate();
  const [error, setError] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState(() => searchParams.get("mfa_challenge") || "");
  const verification = useRef<{ key: string; promise: ReturnType<typeof verifyOrgAdminToken> } | null>(null);

  useEffect(() => {
    if (mfaChallenge) return;
    const token = searchParams.get("token");
    if (!token) {
      setError(true);
      return;
    }

    let active = true;
    // StrictMode replays effects. Share this component's one-use exchange,
    // while keeping tokens out of a global cache and ignoring stale results.
    const key = JSON.stringify([token, nextPath]);
    if (verification.current?.key !== key) {
      verification.current = { key, promise: verifyOrgAdminToken(token, nextPath ?? undefined) };
    }
    verification.current.promise
      .then((result) => {
        if (!active) return;
        if (result.mfa_required && result.challenge) {
          setMfaChallenge(result.challenge);
          return;
        }
        navigate(nextPath || safeOrgAdminNext(result.redirect_to) || "/org-admin", { replace: true });
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => { active = false; };
  }, [searchParams, navigate, mfaChallenge, nextPath]);

  if (mfaChallenge) {
    return (
      <section className="flex min-h-[70vh] items-center justify-center py-16">
        <div className="container-shell">
          <OrgAdminMfaChallenge
            challenge={mfaChallenge}
            nextPath={nextPath ?? undefined}
            onSuccess={(redirectTo) => navigate(nextPath || safeOrgAdminNext(redirectTo) || "/org-admin", { replace: true })}
          />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="flex min-h-[60vh] items-center justify-center py-16">
        <div className="container-shell">
          <div className="mx-auto max-w-md">
            <div className="surface p-8 text-center">
              <h1 className="text-xl font-semibold text-neutral-900">
                Link non valido
              </h1>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                Il link di accesso non è valido o è scaduto. Richiedi un nuovo
                link dalla pagina di accesso.
              </p>
              <div className="mt-6">
                <Link className="btn-primary" to={orgAdminLoginUrl(nextPath || "/org-admin")}>
                  Torna al login
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-[60vh] items-center justify-center py-16">
      <div className="container-shell">
        <div className="surface mx-auto max-w-md px-8 py-6 text-center">
          <p className="text-sm text-neutral-500">Verifica in corso…</p>
        </div>
      </div>
    </section>
  );
};

export default OrgAdminCallback;
