import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchWhoAmI } from "../lib/api";

const ReservedAreaRedirect = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    const resolveAccess = async () => {
      try {
        const whoAmI = await fetchWhoAmI();
        if (!active) return;
        const target = whoAmI.authenticated && whoAmI.redirect_to ? whoAmI.redirect_to : "/login";
        navigate(target, { replace: true });
      } catch {
        if (active) navigate("/login", { replace: true });
      }
    };

    void resolveAccess();

    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <section className="py-16" data-reveal="fade-up">
      <div className="container-shell">
        <div className="surface-strong mx-auto max-w-xl p-8 text-center md:p-10">
          <p className="section-title">Area riservata</p>
          <h1 className="section-heading">Verifica accesso in corso</h1>
          <p className="mt-4 text-sm leading-7 text-neutral-600">
            Ti stiamo reindirizzando al percorso corretto.
          </p>
        </div>
      </div>
    </section>
  );
};

export default ReservedAreaRedirect;
