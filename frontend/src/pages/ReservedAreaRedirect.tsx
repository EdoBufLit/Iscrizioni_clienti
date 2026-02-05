import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchWhoAmI } from "../lib/api";

const ReservedAreaRedirect = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    const resolveAccess = async () => {
      try {
        const whoami = await fetchWhoAmI();
        if (!active) return;
        const target = whoami.authenticated && whoami.redirect_to ? whoami.redirect_to : "/login";
        navigate(target, { replace: true });
      } catch {
        if (active) {
          navigate("/login", { replace: true });
        }
      }
    };

    void resolveAccess();

    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <section className="flex min-h-[60vh] items-center justify-center py-16">
      <div className="container-shell">
        <div className="surface mx-auto max-w-md px-8 py-6 text-center">
          <p className="text-sm text-neutral-500">Verifica accesso in corso…</p>
        </div>
      </div>
    </section>
  );
};

export default ReservedAreaRedirect;
