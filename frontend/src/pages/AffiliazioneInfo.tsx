import { useEffect } from "react";
import { Link } from "react-router-dom";
import { applySeo } from "../lib/seo";

const REQUIRED_DOCS = [
  "Atto costitutivo o documento equivalente",
  "Statuto aggiornato",
  "Documento del legale rappresentante",
  "Codice fiscale o partita IVA dell'associazione",
  "Riferimenti email e telefono per segreteria",
] as const;

const AffiliazioneInfo = () => {
  useEffect(() => {
    applySeo({
      title: "Informazioni Affiliazione",
      description:
        "Scopri documenti richiesti, passaggi e condizioni per avviare l'affiliazione della tua associazione ad ASSONAM.",
      canonicalPath: "/affiliazione-info",
    });
  }, []);

  return (
    <div className="space-y-16 py-16">
      <section data-reveal="fade-up">
        <div className="container-shell">
          <div className="surface-strong landing-panel">
            <p className="section-title">Affiliazione Club</p>
            <h1 className="section-heading">Attiva la tua associazione su ASSONAM</h1>
            <p className="section-subtitle">
              Procedura rapida, documenti verificati e onboarding operativo per segreteria e soci.
            </p>
            <div className="landing-inline-cta">
              <Link className="btn-primary" to="/affiliazione">
                Inizia Affiliazione
              </Link>
              <Link className="btn-ghost" to="/contatti">
                Parla con il team
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section data-reveal="fade-up">
        <div className="container-shell">
          <div className="surface-strong landing-panel">
            <p className="section-title">Checklist Documenti</p>
            <h2 className="section-heading">Prepara questi documenti prima di iniziare</h2>
            <ul className="landing-support-list mt-8">
              {REQUIRED_DOCS.map((doc) => (
                <li key={doc}>{doc}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section data-reveal="fade-up">
        <div className="container-shell">
          <div className="surface-strong landing-panel">
            <p className="section-title">Pricing</p>
            <h2 className="section-heading">Quota e conferma finale nel wizard</h2>
            <p className="section-subtitle">
              L'importo viene mostrato in modo trasparente nel percorso di affiliazione in base al
              profilo dell'associazione.
            </p>
            <div className="mt-8 rounded-2xl border border-neutral-200/70 bg-white/80 p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-neutral-500">
                Include
              </p>
              <ul className="mt-4 space-y-2 text-sm text-neutral-700">
                <li>Attivazione account associazione</li>
                <li>Gestione iscrizioni soci e tessere digitali</li>
                <li>Verifica amministrativa iniziale</li>
              </ul>
            </div>
            <div className="landing-inline-cta">
              <Link className="btn-primary" to="/affiliazione">
                Vai al Wizard di Affiliazione
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AffiliazioneInfo;
