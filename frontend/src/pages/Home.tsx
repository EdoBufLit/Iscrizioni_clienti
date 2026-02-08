import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { applySeo } from "../lib/seo";

const heroEase = [0.16, 1, 0.3, 1] as const;
const heroBlur = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.9, ease: heroEase, delay },
});

const Home = () => {
  useEffect(() => {
    applySeo({
      title: "ASSO.N.A.M.",
      description:
        "Portale di gestione associativa ASSO.N.A.M. — Iscrizioni digitali, raccolta documenti, contabilità e adempimenti per associazioni affiliate a Roma.",
      canonicalPath: "/",
      structuredData: [
        {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "ASSO.N.A.M. — Associazione Nazionale Arti e Mestieri",
          url: "https://assonam.it",
          logo: "https://assonam.it/logo.jpg",
          address: {
            "@type": "PostalAddress",
            streetAddress: "Via Sambucuccio d'Alando, 10",
            addressLocality: "Roma",
            postalCode: "00162",
            addressRegion: "RM",
            addressCountry: "IT",
          },
          telephone: "+390639724643",
          email: "asso.nam@email.it",
        },
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "Serve un account per iscriversi?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sì, per accedere all'area riservata e consultare stato e documenti.",
              },
            },
            {
              "@type": "Question",
              name: "Quali documenti servono per l'iscrizione?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Dipende dall'associazione: il flusso ti mostra solo ciò che è richiesto.",
              },
            },
            {
              "@type": "Question",
              name: "Come vengo aggiornato sullo stato dell'iscrizione?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Lo stato è visibile nell'area riservata. Le notifiche possono essere attivate.",
              },
            },
          ],
        },
      ],
    });
  }, []);

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden" id="top">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${import.meta.env.BASE_URL}piazza-bologna2.webp')` }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-neutral-900/90 via-neutral-900/55 to-transparent"
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <img
            src={`${import.meta.env.BASE_URL}logo-transparent.png`}
            alt=""
            decoding="async"
            className="hero-logo-bg h-full w-full object-contain"
          />
        </div>

        <div className="relative py-32 md:py-44">
          <div className="container-shell">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
                Associazione Nazionale Arti e Mestieri
              </p>
              <motion.h1
                className="mt-4 font-display text-4xl font-semibold tracking-tight leading-tight text-white md:text-5xl lg:text-[3.75rem]"
                {...heroBlur(0)}
              >
                Gestione associativa<br className="hidden md:inline" /> e portale soci integrato.
              </motion.h1>
              <motion.p
                className="mx-auto mt-6 max-w-2xl text-base leading-7 text-white/80 md:text-lg md:leading-8"
                {...heroBlur(0.12)}
              >
                Iscrizioni digitali, raccolta documenti, contabilità e
                adempimenti — tutto in un unico portale ordinato e verificabile.
              </motion.p>
              <motion.div className="mt-10 flex flex-wrap justify-center gap-4" {...heroBlur(0.22)}>
                <Link className="btn-primary px-7 py-3 text-base" to="/associazioni">
                  Diventa socio
                </Link>
                <Link
                  className="inline-flex items-center justify-center rounded-md border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:border-white/50 hover:bg-white/20 cursor-pointer"
                  to="/area-riservata"
                >
                  Area riservata
                </Link>
              </motion.div>
              <p className="mt-12 text-xs text-white/35">
                Piazza Bologna, Roma
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Servizi ──────────────────────────────────────────────── */}
      <section className="py-24" id="servizi">
        <div className="container-shell">
          <div className="surface-strong p-8 md:p-10">
          <p className="section-title">SERVIZI</p>
          <h2 className="mt-2 section-heading">Approccio da studio, non da app.</h2>
          <p className="section-subtitle">
            Ridurre errori, richieste incomplete e documenti persi: con un flusso
            guidato e controllabile.
          </p>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
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
        </div>
      </section>

      {/* ── Metodo + immagine ────────────────────────────────────── */}
      <section className="py-24" id="metodo">
        <div className="container-shell">
          <div className="surface-strong p-8 md:p-10">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <div>
              <p className="section-title">METODO</p>
              <h2 className="mt-2 section-heading">Come funziona</h2>
              <p className="section-subtitle">
                Ogni dato e documento viene acquisito in modo coerente e
                tracciabile.
              </p>
              <div className="mt-10 space-y-6">
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
                  <div key={card.step} className="flex gap-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                      {card.step}
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-neutral-900">
                        {card.title}
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-neutral-600">
                        {card.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="hidden md:block">
              <img
                src={`${import.meta.env.BASE_URL}studio-commercialista_800x504.jpg`}
                alt="Studio professionale"
                loading="lazy"
                decoding="async"
                className="rounded-lg shadow-elevated"
              />
            </div>
          </div>
          </div>
        </div>
      </section>

      {/* ── Accesso rapido ───────────────────────────────────────── */}
      <section className="py-24" id="associazioni-preview">
        <div className="container-shell">
          <div className="surface-strong p-8 md:p-10">
          <p className="section-title">ACCESSO RAPIDO</p>
          <h2 className="mt-2 section-heading">Accedi ai servizi</h2>
          <p className="section-subtitle">
            Seleziona l'area di interesse per procedere.
          </p>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            <Link
              className="surface flex flex-col p-7 text-left transition hover:border-neutral-200 hover:shadow-elevated"
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
                Apri l'elenco &rarr;
              </p>
            </Link>
            <Link
              className="surface flex flex-col p-7 text-left transition hover:border-neutral-200 hover:shadow-elevated cursor-pointer"
              to="/area-riservata"
            >
              <h3 className="text-base font-semibold text-neutral-900">
                Area riservata
              </h3>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                Verifica lo stato dell'iscrizione e consulta la documentazione
                disponibile.
              </p>
              <p className="mt-auto pt-5 text-sm font-medium text-brand">
                Accedi \u2192
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
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <section className="py-24" id="faq">
        <div className="container-shell">
          <div className="surface-strong p-8 md:p-10">
          <p className="section-title">FAQ</p>
          <h2 className="mt-2 section-heading">Domande frequenti</h2>
          <p className="section-subtitle">
            Risposte rapide per evitare dubbi e richieste incomplete.
          </p>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
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
        </div>
      </section>

      {/* ── Contatti ─────────────────────────────────────────────── */}
      <section className="py-24" id="contatti">
        <div className="container-shell">
          <div className="surface-strong p-8 md:p-10">
          <p className="section-title">CONTATTI</p>
          <h2 className="mt-2 section-heading">Riferimenti</h2>
          <p className="section-subtitle">
            Per informazioni sui servizi o sullo stato di una pratica.
          </p>
          <div className="mt-14 grid gap-8 md:grid-cols-2">
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
        </div>
      </section>
    </div>
  );
};

export default Home;
