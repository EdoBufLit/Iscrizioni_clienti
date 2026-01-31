const services = [
  {
    title: "Contabilità e rendicontazione",
    description:
      "Gestione contabile ordinaria e straordinaria per associazioni e realtà affiliate.",
    items: [
      "Tenuta dei registri contabili obbligatori",
      "Redazione del bilancio e del rendiconto annuale",
      "Adempimenti fiscali e dichiarativi",
      "Supporto per revisioni e controlli interni",
    ],
  },
  {
    title: "Gestione associativa e adempimenti",
    description:
      "Supporto operativo per gli obblighi amministrativi e statutari delle associazioni.",
    items: [
      "Aggiornamento del libro soci e dei registri associativi",
      "Gestione delle assemblee e della documentazione correlata",
      "Comunicazioni obbligatorie e scadenze normative",
      "Consulenza su statuto e regolamenti interni",
    ],
  },
  {
    title: "Iscrizioni e tesseramento",
    description:
      "Percorsi di adesione strutturati, dalla raccolta dati all'emissione della tessera.",
    items: [
      "Flusso di iscrizione digitale guidato",
      "Raccolta dati e accettazione informative",
      "Verifica della documentazione e validazione",
      "Emissione tessera e conferma di iscrizione",
    ],
  },
  {
    title: "Supporto documentale",
    description:
      "Acquisizione e gestione ordinata dei documenti necessari alle pratiche associative.",
    items: [
      "Caricamento documenti in formato digitale",
      "Controllo di completezza e conformità",
      "Archiviazione strutturata e tracciabile",
      "Accesso riservato alla documentazione per i soci",
    ],
  },
];

const Servizi = () => {
  return (
    <div>
      <section className="relative overflow-hidden bg-white py-20">
        <div className="container-shell">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <div className="max-w-xl">
              <p className="section-title">SERVIZI</p>
              <h1 className="section-heading">Aree operative</h1>
              <p className="mt-5 text-base leading-7 text-neutral-600">
                I servizi dello studio sono organizzati per rispondere alle
                esigenze amministrative e gestionali delle associazioni affiliate.
                Ogni area è gestita con procedure definite e documentazione
                tracciabile.
              </p>
            </div>
            <div className="hidden md:block">
              <img
                src={`${import.meta.env.BASE_URL}hero-office.avif`}
                alt="Ufficio professionale"
                className="rounded-lg shadow-elevated"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-warm-50 py-20">
        <div className="container-shell">
          <div className="grid gap-8 md:grid-cols-2">
            {services.map((service) => (
              <div key={service.title} className="surface p-7">
                <h2 className="text-base font-semibold text-neutral-900">
                  {service.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  {service.description}
                </p>
                <ul className="mt-4 space-y-2 border-t border-neutral-100 pt-4">
                  {service.items.map((item) => (
                    <li
                      key={item}
                      className="text-sm leading-6 text-neutral-600"
                    >
                      <span className="mr-2 text-neutral-300">—</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Servizi;
