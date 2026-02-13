import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { verifyMemberToken, verifyOrgAdminToken } from "../lib/api";

const MagicLinkVerify = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    const role = searchParams.get("role");

    if (!token) {
      setErrorMessage("Link non valido: token mancante.");
      return;
    }

    const verify = async () => {
      try {
        if (role === "org_admin") {
          await verifyOrgAdminToken(token);
          navigate("/org-admin", { replace: true });
          return;
        }
        if (role === "member") {
          await verifyMemberToken(token);
          navigate("/dashboard", { replace: true });
          return;
        }
        setErrorMessage("Link non valido: ruolo non specificato.");
      } catch {
        setErrorMessage("Il link di accesso non e valido o e scaduto.");
      }
    };

    void verify();
  }, [navigate, searchParams]);

  if (errorMessage) {
    return (
      <section className="py-16" data-reveal="fade-up">
        <div className="container-shell">
          <div className="surface-strong mx-auto max-w-xl p-8 text-center md:p-10">
            <p className="section-title">Accesso</p>
            <h1 className="section-heading">Link non valido</h1>
            <p className="mt-4 text-sm leading-7 text-neutral-600">{errorMessage}</p>
            <div className="mt-7">
              <Link className="btn-primary px-6 py-2.5" to="/login">
                Torna al login
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16" data-reveal="fade-up">
      <div className="container-shell">
        <div className="surface-strong mx-auto max-w-xl p-8 text-center md:p-10">
          <p className="section-title">Accesso</p>
          <h1 className="section-heading">Verifica in corso</h1>
          <p className="mt-4 text-sm leading-7 text-neutral-600">
            Stiamo completando la verifica del link sicuro.
          </p>
        </div>
      </div>
    </section>
  );
};

export default MagicLinkVerify;
