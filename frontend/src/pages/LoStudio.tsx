import { useEffect } from "react";
import { applySeo } from "../lib/seo";

const APPROACH_ITEMS = [
  {
    step: "01",
    title: "Ordine documentale",
    text: "Ogni documento viene acquisito e reso disponibile con struttura chiara e controllabile.",
  },
  {
    step: "02",
    title: "Tracciabilita operativa",
    text: "Lo stato di ogni pratica resta verificabile da studio, associazione e socio.",
  },
  {
    step: "03",
    title: "Supporto diretto",
    text: "Nessun passaggio dispersivo: il contatto resta umano e orientato alla risoluzione.",
  },
] as const;

const ACTIVITY_ITEMS = [
  {
    title: "Amministrazione associativa",
    text: "Gestione iscrizioni, anagrafiche e adempimenti previsti da statuto e normativa.",
  },
  {
    title: "Contabilita e rendicontazione",
    text: "Supporto contabile continuo per bilanci, registri e documentazione fiscale.",
  },
  {
    title: "Flusso documentale",
    text: "Raccolta e verifica documenti con processo ordinato e riduzione degli errori.",
  },
  {
    title: "Esperienza socio",
    text: "Area riservata chiara per monitorare avanzamento pratica e disponibilita tessera.",
  },
] as const;

const LoStudio = () => {
  useEffect(() => {
    applySeo({
      title: "Lo Studio",
      description:
        "Studio di gestione associativa e amministrativa a Roma. Adempimenti, contabilita e supporto operativo per associazioni affiliate.",
      canonicalPath: "/lo-studio",
    });
  }, []);

  return (
    <div>
      <section className="py-20" data-reveal="fade-up">
        <div className="container-shell">
          <div className="surface-strong p-8 md:p-10">
            <div className="grid items-center gap-10 md:grid-cols-2">
              <div>
                <p className="section-title">Lo studio</p>
                <h1 className="section-heading">
                  Governance associativa con metodo professionale.
                </h1>
                <p className="mt-5 text-base leading-8 text-neutral-600">
                  ASSONAM affianca associazioni e realta affiliate nella gestione quotidiana di
                  processi amministrativi, documentali e organizzativi.
                </p>
                <p className="mt-4 text-base leading-8 text-neutral-600">
                  L'approccio e pratico: procedure chiare, tracciabilita costante e supporto
                  operativo reale per ogni fase del ciclo associativo.
                </p>
              </div>
              <div className="overflow-hidden rounded-2xl border border-white/50 shadow-premium">
                <img
                  src={`${import.meta.env.BASE_URL}Fatture-cartacee-perche-conservarle-chi-deve-farlo-1024x597.png`}
                  alt="Documentazione contabile"
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
            <p className="section-title">Approccio</p>
            <h2 className="section-heading">Come lavoriamo</h2>
            <p className="section-subtitle">
              Struttura operativa solida, con attenzione alla chiarezza di ogni passaggio.
            </p>
            <div className="mt-10 grid gap-6 md:grid-cols-3" data-reveal="stagger">
              {APPROACH_ITEMS.map((item) => (
                <article key={item.step} className="surface p-6" data-reveal-item>
                  <p className="text-xs font-semibold tracking-[0.17em] text-neutral-500">
                    STEP {item.step}
                  </p>
                  <h3 className="mt-3 text-lg font-semibold text-neutral-900">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-neutral-600">{item.text}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20" data-reveal="fade-up">
        <div className="container-shell">
          <div className="surface-strong p-8 md:p-10">
            <p className="section-title">Attivita</p>
            <h2 className="section-heading">Aree operative principali</h2>
            <p className="section-subtitle">
              Presidio completo delle funzioni strategiche per associazioni affiliate.
            </p>
            <div className="mt-10 grid gap-6 md:grid-cols-2" data-reveal="stagger">
              {ACTIVITY_ITEMS.map((item) => (
                <article key={item.title} className="surface p-6" data-reveal-item>
                  <h3 className="text-lg font-semibold text-neutral-900">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-neutral-600">{item.text}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LoStudio;
