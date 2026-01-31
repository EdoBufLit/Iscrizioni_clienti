import { Link } from "react-router-dom";

const Home = () => {
  return (
    <div>
      <section className="bg-white py-20 md:py-28" id="top">
        <div className="container-shell">
          <div className="items-center gap-16 md:grid md:grid-cols-2">
            <div className="text-center md:text-left">
              <img
                src="/favicon.svg"
                alt="ASSO.N.A.M."
                className="mx-auto mb-6 h-10 md:mx-0"
              />
              <p className="section-title">STUDIO CONTABILE · ASSO.N.A.M.</p>
              <h1 className="mt-2 section-heading">
                Gestione associativa, contabilità e adempimenti.
                <br />
                Con un portale soci integrato.
              </h1>
              <p className="mt-5 text-base leading-7 text-neutral-600">
                Supporto operativo per associazioni e realtà affiliate:
                iscrizioni digitali, raccolta documenti, tracciabilità e area
                riservata per i soci. Tutto in modo ordinato e verificabile.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3 md:justify-start">
                <Link className="btn-primary" to="/associazioni">
                  Vai alle associazioni
                </Link>
                <Link className="btn-ghost" to="/login">
                  Area riservata
                </Link>
              </div>
              <p className="mt-5 text-xs text-neutral-500">
                Se devi iscriverti a un'associazione affiliata, parti da
                "Associazioni".
              </p>
            </div>

            <div className="mt-12 md:mt-0">
              <img
                src="/hero-office.avif"
                alt="Scrivania e documenti presso lo studio"
                className="aspect-[4/3] w-full rounded-xl border border-neutral-100 object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-neutral-50 py-20" id="servizi">
        <div className="container-shell">
          <p className="section-title">SERVIZI</p>
          <h2 className="mt-2 section-heading">Approccio da studio, non da app.</h2>
          <p className="section-subtitle">
            Ridurre errori, richieste incomplete e documenti persi: con un flusso
            guidato e controllabile.
          </p>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              {
                icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m-6 9 2 2 4-4",
                title: "Adempimenti e gestione",
                text: "Gestione dati, tracciabilità e supporto operativo per le attività associative.",
              },
              {
                icon: "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
                title: "Iscrizioni digitali",
                text: "Compilazione dati, accettazioni, privacy e caricamento documenti in un percorso unico.",
              },
              {
                icon: "M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z",
                title: "Portale soci",
                text: "Accesso riservato per consultare stato iscrizione e documenti disponibili.",
              },
            ].map((card) => (
              <div key={card.title} className="surface p-7">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10">
                  <svg
                    className="h-5 w-5 text-brand"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={card.icon} />
                  </svg>
                </div>
                <h3 className="mt-4 text-base font-semibold text-neutral-900">
                  {card.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  {card.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-20" id="metodo">
        <div className="container-shell">
          <p className="section-title">METODO</p>
          <h2 className="mt-2 section-heading">Come funziona</h2>
          <p className="section-subtitle">
            Ogni dato e documento viene acquisito in modo coerente e
            tracciabile.
          </p>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              {
                step: "01",
                icon: "m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z",
                title: "Seleziona l'associazione",
                text: "Individua l'associazione affiliata dall'elenco e avvia la procedura di iscrizione.",
              },
              {
                step: "02",
                icon: "m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10",
                title: "Compila l'iscrizione",
                text: "Inserisci i dati richiesti, accetta le informative e carica i documenti necessari.",
              },
              {
                step: "03",
                icon: "M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm-1.875 6.375a3 3 0 0 0-3 3h6a3 3 0 0 0-3-3Z",
                title: "Ottieni la tessera",
                text: "A iscrizione confermata, la tessera e la documentazione sono disponibili nell'area riservata.",
              },
            ].map((card) => (
              <div key={card.step} className="surface p-7">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-500">
                    {card.step}
                  </span>
                  <svg
                    className="h-5 w-5 text-neutral-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={card.icon} />
                  </svg>
                </div>
                <h3 className="mt-4 text-base font-semibold text-neutral-900">
                  {card.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  {card.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-neutral-50 py-20" id="associazioni-preview">
        <div className="container-shell">
          <p className="section-title">ACCESSO RAPIDO</p>
          <h2 className="mt-2 section-heading">Accedi ai servizi</h2>
          <p className="section-subtitle">
            Seleziona l'area di interesse per procedere.
          </p>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            <Link
              className="surface flex flex-col p-7 text-left transition hover:border-neutral-200"
              to="/associazioni"
            >
              <h3 className="text-base font-semibold text-neutral-900">
                Elenco associazioni
              </h3>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                Consulta le associazioni affiliate e avvia la richiesta di
                iscrizione.
              </p>
              <p className="mt-auto pt-5 text-sm font-medium text-brand">
                Apri l'elenco
              </p>
            </Link>
            <Link
              className="surface flex flex-col p-7 text-left transition hover:border-neutral-200"
              to="/login"
            >
              <h3 className="text-base font-semibold text-neutral-900">
                Area riservata
              </h3>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                Verifica lo stato dell'iscrizione e consulta la documentazione
                disponibile.
              </p>
              <p className="mt-auto pt-5 text-sm font-medium text-brand">
                Accedi
              </p>
            </Link>
            <div className="surface flex flex-col p-7">
              <h3 className="text-base font-semibold text-neutral-900">
                Iscrizione guidata
              </h3>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                Il percorso si adatta ai requisiti e ai documenti richiesti
                dall'associazione scelta.
              </p>
              <p className="mt-auto pt-5 text-xs text-neutral-400">
                I dati raccolti sono utilizzati esclusivamente per la gestione
                dell'iscrizione.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-20" id="faq">
        <div className="container-shell">
          <p className="section-title">FAQ</p>
          <h2 className="mt-2 section-heading">Domande frequenti</h2>
          <p className="section-subtitle">
            Risposte rapide per evitare dubbi e richieste incomplete.
          </p>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              {
                title: "Serve un account?",
                text: "Sì, per accedere all'area riservata e consultare stato e documenti.",
              },
              {
                title: "Quali documenti servono?",
                text: "Dipende dall'associazione: il flusso ti mostra solo ciò che è richiesto.",
              },
              {
                title: "Come vengo aggiornato?",
                text: "Lo stato è visibile nell'area riservata. Le notifiche possono essere attivate.",
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

      <section className="bg-neutral-50 py-20" id="contatti">
        <div className="container-shell">
          <p className="section-title">CONTATTI</p>
          <h2 className="mt-2 section-heading">Riferimenti</h2>
          <p className="section-subtitle">
            Per informazioni sui servizi o sullo stato di una pratica.
          </p>
          <div className="mt-12 grid gap-8 md:grid-cols-2">
            <div className="surface p-7">
              <h3 className="text-base font-semibold text-neutral-900">
                Studio
              </h3>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                Per comunicazioni generali, richieste e informazioni sulle
                attività dello studio.
              </p>
              <div className="mt-5">
                <Link className="btn-ghost" to="/contatti">
                  Vai ai contatti
                </Link>
              </div>
            </div>
            <div className="surface p-7">
              <h3 className="text-base font-semibold text-neutral-900">
                Per i soci
              </h3>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                Per iscriversi a un'associazione affiliata, il percorso inizia
                dalla pagina Affiliazioni.
              </p>
              <div className="mt-5">
                <Link className="btn-primary" to="/associazioni">
                  Vai alle affiliazioni
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
