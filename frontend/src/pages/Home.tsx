import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { gsap } from "gsap";
import PublicFaqAccordion, {
  type PublicFaqItem,
} from "../components/public/PublicFaqAccordion";
import { applySeo } from "../lib/seo";

const PublicHeroThree = lazy(() => import("../components/public/PublicHeroThree.client"));

const PROCESS_STEPS = [
  {
    title: "Selezione affiliazione",
    text: "L'utente entra nella pagina pubblica dell'associazione e apre la procedura di iscrizione.",
  },
  {
    title: "Invio dati e documenti",
    text: "Compilazione guidata, consenso tracciato e caricamento documenti in un unico flusso.",
  },
  {
    title: "Verifica e attivazione",
    text: "Segreteria e socio seguono lo stato pratica fino alla conferma finale in area riservata.",
  },
] as const;

const SUPPORT_POINTS = [
  "Onboarding digitale uniforme per tutte le affiliazioni.",
  "Controllo amministrativo con stato pratica sempre verificabile.",
  "Comunicazione diretta tra segreteria e socio senza passaggi ridondanti.",
] as const;

const FAQ_ITEMS: PublicFaqItem[] = [
  {
    question: "Serve un account per iscriversi?",
    answer:
      "Si. L'account consente di monitorare stato pratica, documenti e aggiornamenti nell'area riservata.",
  },
  {
    question: "Il documento di identita e sempre obbligatorio?",
    answer:
      "No. Dipende dal regolamento dell'associazione e dal flusso richiesto per la singola adesione.",
  },
  {
    question: "Quanto tempo richiede la verifica?",
    answer:
      "La verifica amministrativa viene presa in carico in ordine di arrivo, con tempi comunicati dalla segreteria.",
  },
];

const PUBLIC_SECTION_IMAGES = {
  process: `${import.meta.env.BASE_URL}public-images/process-consulenza-web.jpg`,
  support: `${import.meta.env.BASE_URL}public-images/office-analytics.jpg`,
  faq: `${import.meta.env.BASE_URL}public-images/document-review.jpg`,
} as const;

const canUseWebGL = () => {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
};

const isLowPowerDevice = () => {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cpuVeryLow = typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 2;
  const memoryVeryLow = typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2;
  const smallViewport = window.innerWidth < 768;
  return smallViewport || cpuVeryLow || memoryVeryLow;
};

const Home = () => {
  const [useWebGLScene, setUseWebGLScene] = useState(false);
  const [lowPowerDevice, setLowPowerDevice] = useState(false);
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    applySeo({
      title: "ASSO.N.A.M.",
      description:
        "Portale pubblico ASSONAM per iscrizioni digitali, gestione soci e servizi amministrativi dedicati alle associazioni affiliate.",
      canonicalPath: "/",
      structuredData: [
        {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "ASSONAM - Associazione Nazionale Arti e Mestieri",
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
      ],
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const evaluateScene = () => {
      const lowPower = isLowPowerDevice() || media.matches;
      const webglSupported = canUseWebGL();
      setLowPowerDevice(lowPower);
      setUseWebGLScene(webglSupported && !lowPower);
    };

    evaluateScene();
    window.addEventListener("resize", evaluateScene, { passive: true });
    media.addEventListener("change", evaluateScene);
    return () => {
      window.removeEventListener("resize", evaluateScene);
      media.removeEventListener("change", evaluateScene);
    };
  }, []);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.set(
        [
          "[data-hero-eyebrow]",
          "[data-hero-line]",
          "[data-hero-subtitle]",
          "[data-hero-cta]",
          "[data-hero-logo]",
        ],
        { clearProps: "all" }
      );
      return;
    }

    const context = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: "power2.out" } });
      timeline.fromTo(
        "[data-hero-eyebrow]",
        { autoAlpha: 0, y: 14 },
        { autoAlpha: 1, y: 0, duration: 0.42 }
      );
      timeline.fromTo(
        "[data-hero-line]",
        { autoAlpha: 0, y: 26 },
        { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.11 },
        0.08
      );
      timeline.fromTo(
        "[data-hero-subtitle]",
        { autoAlpha: 0, y: 14 },
        { autoAlpha: 1, y: 0, duration: 0.48 },
        0.26
      );
      timeline.fromTo(
        "[data-hero-cta]",
        { autoAlpha: 0, y: 16 },
        { autoAlpha: 1, y: 0, duration: 0.46, stagger: 0.1 },
        0.36
      );
      timeline.fromTo(
        "[data-hero-logo]",
        { autoAlpha: 0, y: 18, scale: 1.06 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.9 },
        0.24
      );
    }, heroRef);

    return () => context.revert();
  }, [useWebGLScene]);

  return (
    <div>
      <section className="public-hero" id="top" ref={heroRef}>
        <div className="public-hero-scene" aria-hidden="true">
          <div
            className="public-hero-fallback"
            style={{
              backgroundImage: `linear-gradient(142deg, rgba(255,247,218,0.24) 0%, rgba(233,241,255,0.18) 47%, rgba(219,229,255,0.26) 100%), url(${import.meta.env.BASE_URL}piazza-bologna2.webp)`,
            }}
          />
          {!useWebGLScene ? (
            <div className="public-hero-object-fallback-wrap hidden md:flex" data-hero-logo>
              <img
                src={`${import.meta.env.BASE_URL}assonam-logo.svg`}
                alt=""
                className="public-hero-object-fallback"
              />
            </div>
          ) : null}
          {useWebGLScene ? (
            <Suspense fallback={null}>
              <PublicHeroThree lowPower={lowPowerDevice} />
            </Suspense>
          ) : null}
        </div>
        <div className="public-hero-overlay" aria-hidden="true" />

        <div className="container-shell public-hero-content">
          <div className="public-hero-copy">
            <div className="hidden md:block">
              <p className="section-title" data-hero-eyebrow>
                ASSONAM · ECOSISTEMA PUBBLICO
              </p>
              <h1>
                <span className="public-hero-title-line" data-hero-line>
                  Il nuovo standard
                </span>
                <span className="public-hero-title-line" data-hero-line>
                  per iscrizioni associative
                </span>
                <span className="public-hero-title-line" data-hero-line>
                  e gestione soci.
                </span>
              </h1>
              <p className="public-hero-subtitle" data-hero-subtitle>
                Una esperienza digitale pulita e verificabile che collega affiliazioni, iscrizione
                e area riservata in un flusso unico.
              </p>
            </div>

            <div
              className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center md:hidden"
              aria-hidden="true"
            >
              <img
                src={`${import.meta.env.BASE_URL}assonam-logo.svg`}
                alt=""
                className="w-[clamp(240px,70vw,420px)] select-none opacity-[0.12]"
              />
            </div>

            <div
              className="public-hero-ctas relative z-30 flex w-full flex-col items-center justify-center gap-3 md:w-auto md:flex-row"
              data-hero-cta-group
            >
              <Link
                className="btn-primary public-hero-btn w-[min(92vw,340px)] md:w-auto"
                to="/associazioni"
                data-hero-cta
              >
                Diventa socio
              </Link>
              <Link
                className="btn-ghost public-hero-btn w-[min(92vw,340px)] md:w-auto"
                to="/area-riservata"
                data-hero-cta
              >
                Area riservata
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20" data-reveal="fade-up">
        <div className="container-shell">
          <div className="surface-strong landing-panel">
            <figure className="landing-panel-media">
              <img
                src={PUBLIC_SECTION_IMAGES.process}
                alt="Consulenza associativa su pratiche e iscrizioni"
                className="landing-panel-media-image"
                loading="lazy"
              />
            </figure>
            <p className="section-title">Flusso pubblico</p>
            <h2 className="section-heading">Iscrizione e gestione soci in tre passaggi chiari.</h2>
            <ol className="landing-process-list">
              {PROCESS_STEPS.map((step, index) => (
                <li key={step.title} className="landing-process-item">
                  <span className="landing-step-index">0{index + 1}</span>
                  <div>
                    <h3 className="landing-step-title">{step.title}</h3>
                    <p className="landing-step-text">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="py-20" data-reveal="fade-up">
        <div className="container-shell">
          <div className="surface-strong landing-panel">
            <figure className="landing-panel-media">
              <img
                src={PUBLIC_SECTION_IMAGES.support}
                alt="Dashboard operativa e analisi amministrativa"
                className="landing-panel-media-image"
                loading="lazy"
              />
            </figure>
            <p className="section-title">Supporto operativo</p>
            <h2 className="section-heading">Un presidio unico per associazioni e segreterie.</h2>
            <ul className="landing-support-list" data-reveal="stagger">
              {SUPPORT_POINTS.map((point) => (
                <li key={point} data-reveal-item>
                  {point}
                </li>
              ))}
            </ul>
            <div className="landing-inline-cta">
              <Link className="btn-primary" to="/servizi">
                Scopri i servizi
              </Link>
              <Link className="btn-ghost" to="/associazioni">
                Vai alle affiliazioni
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20" data-reveal="fade-up">
        <div className="container-shell">
          <div className="surface-strong landing-panel">
            <figure className="landing-panel-media">
              <img
                src={PUBLIC_SECTION_IMAGES.faq}
                alt="Revisione documentale e assistenza amministrativa"
                className="landing-panel-media-image"
                loading="lazy"
              />
            </figure>
            <p className="section-title">FAQ</p>
            <h2 className="section-heading">Domande frequenti</h2>
            <p className="section-subtitle">
              Risposte rapide sui passaggi di iscrizione e sulla gestione della pratica.
            </p>
            <div className="mt-8">
              <PublicFaqAccordion items={FAQ_ITEMS} />
            </div>
          </div>
        </div>
      </section>

      <section className="py-20" data-reveal="fade-up">
        <div className="container-shell">
          <div className="surface-strong landing-panel landing-final-cta">
            <p className="section-title">Contatti</p>
            <h2 className="section-heading">Parliamo del tuo flusso associativo.</h2>
            <p className="section-subtitle">
              ASSONAM supporta la configurazione del percorso pubblico e dell'area riservata in
              modo coerente con il tuo regolamento.
            </p>
            <div className="landing-inline-cta">
              <Link className="btn-primary" to="/contatti">
                Contattaci
              </Link>
              <Link className="btn-ghost" to="/associazioni">
                Esplora affiliazioni
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;


