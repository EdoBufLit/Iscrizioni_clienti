import { useEffect } from "react";
import { Link } from "react-router-dom";
import { applySeo } from "../lib/seo";

const CONTACT_BLOCKS = [
  {
    label: "Email",
    value: "asso.nam@email.it",
    note: "Per richieste operative e informazioni sui servizi.",
  },
  {
    label: "Telefono",
    value: "+39 06 3972 4643",
    note: "Attivo negli orari di apertura della segreteria.",
  },
  {
    label: "Sede operativa",
    value: "Via Sambucuccio d'Alando, 10 - 00162 Roma (RM)",
    note: "Ricevimento esclusivamente su appuntamento.",
  },
  {
    label: "Orari",
    value: "Lunedi - Venerdi, 9:00 - 13:00 / 14:30 - 18:00",
    note: "Chiusura nei festivi nazionali.",
  },
] as const;

const Contatti = () => {
  useEffect(() => {
    applySeo({
      title: "Contatti",
      description:
        "Contatta lo studio ASSONAM a Roma per iscrizioni, affiliazioni e stato pratiche.",
      canonicalPath: "/contatti",
      structuredData: {
        "@context": "https://schema.org",
        "@type": "ContactPage",
        name: "Contatti ASSONAM",
        url: "https://assonam.it/contatti",
      },
    });
  }, []);

  return (
    <div>
      <section className="py-16" data-reveal="fade-up">
        <div className="container-shell">
          <div className="surface-strong p-8 md:p-10">
            <div className="max-w-3xl">
              <p className="section-title">Contatti</p>
              <h1 className="section-heading">Riferimenti e recapiti operativi</h1>
              <p className="mt-5 text-base leading-8 text-neutral-600">
                Per informazioni su servizi, iscrizioni o pratiche in corso puoi contattare lo
                studio attraverso i canali indicati di seguito.
              </p>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-2" data-reveal="stagger">
              {CONTACT_BLOCKS.map((block) => (
                <article key={block.label} className="surface p-6" data-reveal-item>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    {block.label}
                  </p>
                  <p className="mt-3 text-base font-semibold text-neutral-900">{block.value}</p>
                  <p className="mt-2 text-sm leading-7 text-neutral-600">{block.note}</p>
                </article>
              ))}
            </div>

            <div className="surface mt-8 p-6">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900">Vuoi avviare un'iscrizione?</h2>
                  <p className="mt-2 text-sm leading-7 text-neutral-600">
                    Il percorso pubblico inizia dalla sezione affiliazioni con ricerca guidata.
                  </p>
                </div>
                <Link className="btn-primary shrink-0 px-6 py-3" to="/associazioni">
                  Vai alle affiliazioni
                </Link>
              </div>
            </div>

            <p className="mt-6 text-xs text-neutral-500">
              Le richieste vengono gestite in ordine cronologico. In caso di urgenze su pratiche
              attive, fai riferimento alla comunicazione ricevuta via email.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Contatti;
