import { useEffect } from "react";
import { applySeo } from "../lib/seo";

const SERVICES = [
  {
    title: "Contabilita e rendicontazione",
    description:
      "Gestione contabile ordinaria e straordinaria per associazioni e realta affiliate.",
    items: [
      "Registri contabili e adempimenti ricorrenti",
      "Bilancio e rendiconto annuale",
      "Supporto fiscale e dichiarativo",
      "Preparazione documentale per revisioni",
    ],
  },
  {
    title: "Gestione associativa",
    description:
      "Supporto operativo per obblighi amministrativi e procedure interne delle associazioni.",
    items: [
      "Libro soci e registri associativi",
      "Gestione assemblee e documentazione",
      "Scadenze normative e comunicazioni",
      "Supporto su statuto e policy interne",
    ],
  },
  {
    title: "Iscrizioni e tesseramento",
    description:
      "Percorsi di adesione digitali dalla raccolta dati alla validazione finale.",
    items: [
      "Flusso iscrizione guidato",
      "Consensi e informative in un unico step",
      "Verifica documentazione socio",
      "Emissione tessera e notifica pratica",
    ],
  },
  {
    title: "Supporto documentale",
    description:
      "Raccolta, verifica e archiviazione strutturata per semplificare il lavoro operativo.",
    items: [
      "Upload documenti con controllo formato",
      "Stato avanzamento per ogni pratica",
      "Tracciabilita completa delle revisioni",
      "Accesso riservato ai documenti del socio",
    ],
  },
] as const;

const Servizi = () => {
  useEffect(() => {
    applySeo({
      title: "Servizi",
      description:
        "Contabilita, gestione associativa, iscrizioni digitali e supporto documentale per associazioni affiliate ad ASSONAM.",
      canonicalPath: "/servizi",
    });
  }, []);

  return (
    <div>
      <section className="py-20" data-reveal="fade-up">
        <div className="container-shell">
          <div className="surface-strong p-8 md:p-10">
            <div className="grid items-center gap-10 md:grid-cols-2">
              <div>
                <p className="section-title">Servizi</p>
                <h1 className="section-heading">Aree operative integrate.</h1>
                <p className="mt-5 text-base leading-8 text-neutral-600">
                  Ogni servizio e disegnato per offrire continuita amministrativa e controllo
                  operativo sulle attivita associative.
                </p>
              </div>
              <div className="overflow-hidden rounded-2xl border border-white/50 shadow-premium">
                <img
                  src={`${import.meta.env.BASE_URL}hero-office.avif`}
                  alt="Ufficio professionale"
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20" data-reveal="fade-up">
        <div className="container-shell">
          <div className="surface-strong p-8 md:p-10">
            <p className="section-title">Catalogo</p>
            <h2 className="section-heading">Servizi pensati per il lavoro reale.</h2>
            <p className="section-subtitle">
              Configurabili sulle esigenze dell'associazione, con processi omogenei end-to-end.
            </p>
            <div className="mt-10 grid gap-6 md:grid-cols-2" data-reveal="stagger">
              {SERVICES.map((service) => (
                <article key={service.title} className="surface p-6" data-reveal-item>
                  <h3 className="text-lg font-semibold text-neutral-900">{service.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-neutral-600">{service.description}</p>
                  <ul className="mt-5 space-y-2 border-t border-neutral-200/70 pt-5">
                    {service.items.map((item) => (
                      <li key={item} className="text-sm leading-7 text-neutral-600">
                        - {item}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Servizi;
