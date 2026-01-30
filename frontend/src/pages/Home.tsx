const Home = () => {
  const baseUrl = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;

  return (
    <div>
      <section className="bg-white py-10" id="top">
        <div className="container-shell">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div className="surface px-8 py-10">
              <img
                src={`${baseUrl}favicon.svg`}
                alt="ASSO.N.A.M."
                className="h-8 w-8"
              />
              <p className="section-title mt-6">STUDIO CONTABILE · ASSO.N.A.M.</p>
              <h1 className="mt-4 text-3xl font-semibold text-neutral-900 md:text-4xl">
                Gestione associativa, contabilità e adempimenti.
                <br />
                Con un portale soci integrato.
              </h1>
              <p className="mt-5 text-base leading-7 text-neutral-600">
                Supporto operativo per associazioni e realtà affiliate: iscrizioni digitali,
                raccolta documenti, tracciabilità e area riservata per i soci. Tutto in
                modo ordinato e verificabile.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a className="btn-primary" href="/app/#associazioni-preview">
                  Vai alle associazioni
                </a>
                <a className="btn-ghost" href="/app/#contatti">
                  Area riservata
                </a>
              </div>
              <p className="mt-4 text-xs text-neutral-500">
                Se devi iscriverti a un’associazione affiliata, parti da “Associazioni”.
              </p>
            </div>
            <div className="flex justify-center md:justify-end md:pl-2">
              <img
                src={`${baseUrl}hero-office.avif`}
                alt="Documenti e ufficio per la gestione associativa"
                className="w-full max-w-xl rounded-lg border border-neutral-200 object-cover opacity-95 md:mt-1 md:h-[360px]"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-12" id="servizi">
        <div className="container-shell">
          <p className="section-title">SERVIZI</p>
          <h2 className="section-heading">Un’impostazione “da studio”, non da app.</h2>
          <p className="section-subtitle">
            L’obiettivo è ridurre errori, richieste incomplete e documenti persi: con un
            flusso guidato e controllabile.
          </p>
          <div className="mt-8 grid-cards">
            {[
              {
                title: "Adempimenti e gestione",
                text: "Gestione dati, tracciabilità e supporto operativo per le attività associative.",
              },
              {
                title: "Iscrizioni digitali",
                text: "Compilazione dati, accettazioni (privacy/statuto) e caricamento documenti in un percorso unico.",
              },
              {
                title: "Portale soci",
                text: "Accesso riservato per consultare stato iscrizione e documenti disponibili (se previsti).",
              },
            ].map((card) => (
              <div key={card.title} className="surface p-6">
                <h3 className="text-lg font-semibold text-neutral-900">{card.title}</h3>
                <p className="mt-3 text-sm leading-6 text-neutral-600">{card.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-12" id="metodo">
        <div className="container-shell">
          <p className="section-title">METODO</p>
          <h2 className="section-heading">Come funziona (senza frizioni)</h2>
          <p className="section-subtitle">
            Un processo semplice, ma “studio-proof”: ogni dato e documento viene acquisito
            in modo coerente e tracciabile.
          </p>
          <div className="mt-8 grid-cards">
            {[
              {
                title: "1) Seleziona l’associazione",
                text: "Apri la pagina dell’affiliata corretta e avvia la richiesta.",
              },
              {
                title: "2) Compila e carica",
                text: "Inserisci i dati, carica i documenti richiesti e invia.",
              },
              {
                title: "3) Area riservata",
                text: "Accedi per verificare lo stato e consultare la documentazione disponibile.",
              },
            ].map((card) => (
              <div key={card.title} className="surface p-6">
                <h3 className="text-lg font-semibold text-neutral-900">{card.title}</h3>
                <p className="mt-3 text-sm leading-6 text-neutral-600">{card.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12" id="associazioni-preview">
        <div className="container-shell">
          <p className="section-title">ASSOCIAZIONI</p>
          <h2 className="section-heading">Trova la tua affiliata</h2>
          <p className="section-subtitle">
            Entra nell’elenco e scegli l’associazione corretta: ogni scheda ti porta al
            percorso di iscrizione.
          </p>
          <div className="mt-8 grid-cards">
            <a
              className="surface flex flex-col justify-between p-6 text-left transition hover:border-neutral-200"
              href="/app/#associazioni-preview"
            >
              <div>
                <h3 className="text-lg font-semibold text-neutral-900">Esplora l’elenco</h3>
                <p className="mt-3 text-sm leading-6 text-neutral-600">
                  Ricerca rapida e schede chiare per partire subito.
                </p>
              </div>
              <p className="mt-6 text-sm font-semibold text-brand">Apri /associazioni →</p>
            </a>
            <div className="surface p-6">
              <h3 className="text-lg font-semibold text-neutral-900">Cards “simpatica” ma seria</h3>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                Preview pulite, micro-dettagli e CTA chiare (senza effetto “dashboard”).
              </p>
            </div>
            <div className="surface p-6">
              <h3 className="text-lg font-semibold text-neutral-900">Iscrizione guidata</h3>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                Il percorso si adatta ai documenti richiesti dall’associazione.
              </p>
            </div>
          </div>
          <div className="mt-8 flex justify-center">
            <a className="btn-primary" href="/app/#associazioni-preview">
              Vai alle associazioni
            </a>
          </div>
        </div>
      </section>

      <section className="bg-white py-12" id="faq">
        <div className="container-shell">
          <p className="section-title">FAQ</p>
          <h2 className="section-heading">Domande frequenti</h2>
          <p className="section-subtitle">Risposte rapide per evitare dubbi e “giri a vuoto”.</p>
          <div className="mt-8 grid-cards">
            {[
              {
                title: "Serve un account?",
                text: "Sì, per accedere all’area riservata e consultare stato/documenti.",
              },
              {
                title: "Quali documenti servono?",
                text: "Dipende dall’associazione: il flusso ti mostra solo ciò che è richiesto.",
              },
              {
                title: "Come vengo aggiornato?",
                text: "Lo stato è visibile in area riservata. (Notifiche possono essere attivate.)",
              },
            ].map((card) => (
              <div key={card.title} className="surface p-6">
                <h3 className="text-lg font-semibold text-neutral-900">{card.title}</h3>
                <p className="mt-3 text-sm leading-6 text-neutral-600">{card.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12" id="contatti">
        <div className="container-shell">
          <p className="section-title">CONTATTI</p>
          <h2 className="section-heading">Parliamo di operatività</h2>
          <p className="section-subtitle">
            Se sei un’associazione o un referente e vuoi capire come strutturare il flusso, contattaci.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="surface p-6">
              <h3 className="text-lg font-semibold text-neutral-900">Studio</h3>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                Inserisci qui indirizzo / email / telefono quando vuoi.
              </p>
              <p className="mt-2 text-xs text-neutral-500">
                Suggerimento: metti contatti reali + orari.
              </p>
            </div>
            <div className="surface p-6">
              <h3 className="text-lg font-semibold text-neutral-900">Per i soci</h3>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                Per iscrizioni: vai su “Associazioni” e scegli quella corretta.
              </p>
              <div className="mt-4">
                <a className="btn-primary" href="/app/#associazioni-preview">
                  Apri elenco
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
