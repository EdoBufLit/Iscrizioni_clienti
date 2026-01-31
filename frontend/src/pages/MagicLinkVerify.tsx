import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { verifyMemberToken, verifyOrgAdminToken } from "../lib/api";

const MagicLinkVerify = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    const role = searchParams.get("role"); // "org_admin" or "member"

    if (!token) {
      setError(true);
      setErrorMessage("Link non valido: token mancante");
      return;
    }

    const verify = async () => {
      try {
        if (role === "org_admin") {
          await verifyOrgAdminToken(token);
          navigate("/org-admin", { replace: true });
        } else if (role === "member") {
          await verifyMemberToken(token);
          navigate("/dashboard", { replace: true });
        } else {
            // Require role parameter
            setError(true);
            setErrorMessage("Link non valido: ruolo non specificato");
        }
      } catch (err) {
        console.error(err);
        setError(true);
        setErrorMessage("Il link di accesso non è valido o è scaduto.");
      }
    };

    verify();
  }, [searchParams, navigate]);

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
                {errorMessage}
              </p>
              <div className="mt-6">
                <Link className="btn-primary" to="/login">
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

export default MagicLinkVerify;
