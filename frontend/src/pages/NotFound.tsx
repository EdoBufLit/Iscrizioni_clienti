import { useEffect } from "react";
import { Link } from "react-router-dom";
import { applySeo } from "../lib/seo";

const NotFound = () => {
  useEffect(() => {
    applySeo({
      title: "Pagina non trovata",
      description: "La pagina richiesta non esiste o non ? piè disponibile.",
      noindex: true,
    });
  }, []);

  return (
    <section className="py-16" data-reveal="fade-up">
      <div className="container-shell">
        <div className="surface-strong mx-auto max-w-2xl p-8 md:p-10">
          <p className="section-title">Errore 404</p>
          <h1 className="section-heading">Pagina non trovata</h1>
          <p className="mt-4 text-sm leading-7 text-neutral-600">
            Il percorso richiesto non esiste o non ? piè disponibile.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="btn-primary px-6 py-2.5" to="/">
              Vai alla home
            </Link>
            <Link className="btn-ghost px-6 py-2.5" to="/associazioni">
              Vedi affiliazioni
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default NotFound;
