import { useEffect } from "react";
import { Link } from "react-router-dom";
import { applySeo } from "../lib/seo";

const NotFound = () => {
  useEffect(() => {
    applySeo({
      title: "Pagina non trovata",
      description: "La pagina richiesta non esiste o non è più disponibile.",
      noindex: true,
    });
  }, []);

  return (
    <section className="py-16">
      <div className="container-shell">
        <div className="surface mx-auto max-w-2xl p-7">
          <p className="text-xs font-medium text-neutral-400">404</p>
          <h1 className="mt-2 text-base font-semibold text-neutral-900">
            Pagina non trovata
          </h1>
          <p className="mt-3 text-sm leading-6 text-neutral-600">
            La pagina richiesta non esiste o non è più disponibile.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="btn-primary" to="/">
              Vai alla home
            </Link>
            <Link className="btn-ghost" to="/associazioni">
              Associazioni
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default NotFound;
