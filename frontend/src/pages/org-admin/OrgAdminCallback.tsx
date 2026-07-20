import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { verifyOrgAdminToken } from "../../lib/api";
import OrgAdminMfaChallenge from "./components/OrgAdminMfaChallenge";

const OrgAdminCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState(() => searchParams.get("mfa_challenge") || "");

  useEffect(() => {
    if (mfaChallenge) return;
    const token = searchParams.get("token");
    if (!token) {
      setError(true);
      return;
    }

    verifyOrgAdminToken(token)
      .then((result) => {
        if (result.mfa_required && result.challenge) {
          setMfaChallenge(result.challenge);
          return;
        }
        navigate("/org-admin", { replace: true });
      })
      .catch(() => {
        setError(true);
      });
  }, [searchParams, navigate, mfaChallenge]);

  if (mfaChallenge) {
    return (
      <section className="flex min-h-[70vh] items-center justify-center py-16">
        <div className="container-shell">
          <OrgAdminMfaChallenge
            challenge={mfaChallenge}
            onSuccess={(redirectTo) => navigate(redirectTo, { replace: true })}
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
                <Link className="btn-primary" to="/org-admin/login">
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
