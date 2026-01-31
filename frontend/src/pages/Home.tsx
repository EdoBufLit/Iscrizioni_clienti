import { useState } from "react";
import { Link } from "react-router-dom";

const Home = () => {
  const [imgError, setImgError] = useState(false);

  return (
    <div>
      <section className="bg-white py-16" id="top">
        <div className="container-shell">
          <div className="items-center gap-12 md:grid md:grid-cols-2">
            <div className="text-center md:text-left">
              <img
                src="/favicon.svg"
                alt="ASSO.N.A.M."
                className="mx-auto mb-6 h-10 md:mx-0"
              />
              <p className="section-title">STUDIO CONTABILE · ASSO.N.A.M.</p>
              <h1 className="section-heading">
                Gestione associativa, contabilità e adempimenti.
                <br />
                Con un portale soci integrato.
              </h1>
              <p className="mt-5 text-base leading-7 text-neutral-600">
                Supporto operativo per associazioni e realtà affiliate:
                iscrizioni digitali, raccolta documenti, tracciabilità e area
                riservata per i soci. Tutto in modo ordinato e verificabile.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3 md:justify-start">
                <Link className="btn-primary" to="/associazioni">
                  Vai alle associazioni
                </Link>
                <Link className="btn-ghost" to="/login">
                  Area riservata
                </Link>
              </div>
              <p className="mt-4 text-xs text-neutral-500">
                Se devi iscriverti a un'associazione affiliata, parti da
                "Associazioni".
              </p>
              <p className="mt-2 text-xs text-neutral-400">
                Le informazioni inserite saranno trattate secondo normativa
                vigente.
              </p>
            </div>

            {!imgError && (
              <div className="mt-10 md:mt-0">
                <img
                  src="/hero-office.avif"
                  alt=""
                  className="w-full rounded-lg border border-neutral-100 opacity-95 shadow-subtle"
                  onError={() => setImgError(true)}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="py-16" id="servizi">
        <div className="container-shell">
          <p className="section-title">SERVIZI</p>
          <h2 className="section-heading">Approccio da studio, non da app.</h2>
          <p className="section-subtitle">
            Ridurre errori, richieste incomplete e documenti persi: con un flusso
            guidato e controllabile.
          </p>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {[
              {
                title: "Adempimenti e gestione",
                text: "Gestione dati, tracciabilità e supporto operativo per le attività associative.",
              },
              {
                title: "Iscrizioni digitali",
                text: "Compilazione dati, accettazioni, privacy e caricamento documenti in un percorso unico.",
              },
              {
                title: "Portale soci",
                text: "Accesso riservato per consultare stato iscrizione e documenti disponibili.",
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

      <section className="bg-white py-16" id="metodo">
        <div className="container-shell">
          <p className="section-title">METODO</p>
          <h2 className="section-heading">Come funziona</h2>
          <p className="section-subtitle">
            Ogni dato e documento viene acquisito in modo coerente e
            tracciabile.
          </p>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Seleziona l'associazione",
                text: "Individua l'associazione affiliata dall'elenco e avvia la procedura di iscrizione.",
              },
              {
                step: "02",
                title: "Compila l'iscrizione",
                text: "Inserisci i dati richiesti, accetta le informative e carica i documenti necessari.",
              },
              {
                step: "03",
                title: "Ottieni la tessera",
                text: "A iscrizione confermata, la tessera e la documentazione sono disponibili nell'area riservata.",
              },
            ].map((card) => (
              <div key={card.step} className="surface p-7">
                <p className="text-xs font-medium text-neutral-400">
                  {card.step}
                </p>
                <h3 className="mt-2 text-base font-semibold text-neutral-900">
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

      <section className="py-16" id="associazioni-preview">
        <div className="container-shell">
          <p className="section-title">ACCESSO RAPIDO</p>
          <h2 className="section-heading">Accedi ai servizi</h2>
          <p className="section-subtitle">
            Seleziona l'area di interesse per procedere.
          </p>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
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

      <section className="bg-white py-16" id="faq">
        <div className="container-shell">
          <p className="section-title">FAQ</p>
          <h2 className="section-heading">Domande frequenti</h2>
          <p className="section-subtitle">
            Risposte rapide per evitare dubbi e richieste incomplete.
          </p>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
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

      <section className="py-16" id="contatti">
        <div className="container-shell">
          <p className="section-title">CONTATTI</p>
          <h2 className="section-heading">Riferimenti</h2>
          <p className="section-subtitle">
            Per informazioni sui servizi o sullo stato di una pratica.
          </p>
          <div className="mt-10 grid gap-8 md:grid-cols-2">
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

      <footer className="border-t border-neutral-100 py-8">
        <div className="container-shell">
          <p className="text-xs text-neutral-400">
            © {new Date().getFullYear()} ASSO.N.A.M. — Tutti i diritti
            riservati.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Home;
