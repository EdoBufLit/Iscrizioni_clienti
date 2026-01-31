import { Link } from "react-router-dom";

const contactBlocks = [
  {
    label: "Email",
    value: "segreteria@asso-nam.it",
    note: "Per comunicazioni generali e richieste di informazioni.",
  },
  {
    label: "Telefono",
    value: "+39 0371 000 000",
    note: "Attivo negli orari di apertura dello studio.",
  },
  {
    label: "Sede operativa",
    value: "Via Roma 12, 26900 Lodi (LO)",
    note: "Ricevimento su appuntamento.",
  },
  {
    label: "Orari",
    value: "Lunedì – Venerdì, 9:00 – 13:00 / 14:30 – 18:00",
    note: "Chiuso nei giorni festivi.",
  },
];

const Contatti = () => {
  return (
    <div>
      <section className="bg-white py-16">
        <div className="container-shell">
          <div className="max-w-3xl">
            <p className="section-title">CONTATTI</p>
            <h1 className="section-heading">Riferimenti e recapiti</h1>
            <p className="mt-5 text-base leading-7 text-neutral-600">
              Per informazioni sui servizi, sulle affiliazioni o sullo stato di
              una pratica, è possibile contattare lo studio attraverso i
              riferimenti indicati. Le richieste vengono gestite in ordine di
              ricezione, di norma entro due giorni lavorativi.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container-shell">
          <div className="grid gap-8 md:grid-cols-2">
            {contactBlocks.map((block) => (
              <div key={block.label} className="surface p-7">
                <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
                  {block.label}
                </h2>
                <p className="mt-3 text-base font-semibold text-neutral-900">
                  {block.value}
                </p>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  {block.note}
                </p>
              </div>
            ))}
          </div>

          <div className="surface mt-8 p-7">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-semibold text-neutral-900">
                  Per le iscrizioni
                </h2>
                <p className="mt-1 text-sm text-neutral-600">
                  Se devi iscriverti a un'associazione affiliata, il percorso
                  inizia dalla pagina Affiliazioni.
                </p>
              </div>
              <Link className="btn-primary shrink-0" to="/associazioni">
                Vai alle affiliazioni
              </Link>
            </div>
          </div>

          <p className="mt-6 text-xs text-neutral-400">
            I recapiti indicati sono riservati all'attività dello studio. Per
            questioni urgenti relative a pratiche in corso, fare riferimento
            alla comunicazione ricevuta via email.
          </p>
        </div>
      </section>
    </div>
  );
};

export default Contatti;
