import { useEffect } from "react";
import { applySeo } from "../lib/seo";

const LoStudio = () => {
  useEffect(() => {
    applySeo({
      title: "Lo Studio",
      description:
        "Studio di gestione associativa e amministrativa a Roma. Adempimenti, contabilità e supporto operativo per associazioni affiliate.",
      canonicalPath: "/lo-studio",
    });
  }, []);

  return (
    <div>
      <section className="bg-white py-20">
        <div className="container-shell">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <div className="max-w-xl">
              <p className="section-title">LO STUDIO</p>
              <h1 className="section-heading">
                Gestione associativa con approccio professionale
              </h1>
              <p className="mt-5 text-base leading-7 text-neutral-600">
                Lo studio opera come riferimento amministrativo e gestionale per
                associazioni e realtà affiliate. L'attività si concentra sulla
                corretta tenuta degli adempimenti, sulla raccolta documentale e
                sulla tracciabilità dei flussi associativi.
              </p>
              <p className="mt-4 text-base leading-7 text-neutral-600">
                L'obiettivo non è offrire una piattaforma, ma un servizio
                strutturato: ogni operazione segue procedure verificabili,
                coerenti con le esigenze di uno studio contabile.
              </p>
            </div>
            <div className="hidden md:block">
              <img
                src={`${import.meta.env.BASE_URL}Fatture-cartacee-perche-conservarle-chi-deve-farlo-1024x597.png`}
                alt="Documentazione contabile"
                className="rounded-lg shadow-elevated"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-warm-50 py-20">
        <div className="container-shell">
          <p className="section-title">APPROCCIO</p>
          <h2 className="section-heading">Come lavoriamo</h2>
          <p className="section-subtitle">
            Rigore operativo, senza complessità inutili.
          </p>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Ordine documentale",
                text: "Ogni documento viene acquisito, classificato e reso disponibile in modo strutturato. Nessun passaggio informale.",
              },
              {
                step: "02",
                title: "Tracciabilità",
                text: "Le operazioni sono registrate e consultabili. Lo stato di ogni pratica è sempre verificabile dallo studio e dall'associazione.",
              },
              {
                step: "03",
                title: "Assistenza diretta",
                text: "Il supporto è gestito internamente, con interlocutori definiti. Nessun ticket, nessun chatbot.",
              },
            ].map((card) => (
              <div key={card.step} className="surface p-7">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                  {card.step}
                </span>
                <h3 className="mt-3 text-base font-semibold text-neutral-900">
                  {card.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-neutral-600">
                  {card.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="container-shell">
          <p className="section-title">ATTIVITÀ</p>
          <h2 className="section-heading">Di cosa ci occupiamo</h2>
          <p className="section-subtitle">
            Le aree operative dello studio, in sintesi.
          </p>
          <div className="mt-12 grid gap-8 md:grid-cols-2">
            {[
              {
                title: "Amministrazione associativa",
                text: "Gestione dei dati associativi, delle iscrizioni e degli adempimenti previsti dallo statuto e dalla normativa.",
              },
              {
                title: "Contabilità e rendicontazione",
                text: "Tenuta contabile, bilanci e documentazione fiscale per associazioni e realtà affiliate.",
              },
              {
                title: "Raccolta e gestione documenti",
                text: "Acquisizione strutturata dei documenti necessari per iscrizioni, rinnovi e pratiche associative.",
              },
              {
                title: "Portale soci",
                text: "Area riservata per la consultazione dello stato di iscrizione e della documentazione disponibile.",
              },
            ].map((card) => (
              <div key={card.title} className="surface p-7">
                <h3 className="text-base font-semibold text-neutral-900">
                  {card.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-neutral-600">
                  {card.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default LoStudio;
