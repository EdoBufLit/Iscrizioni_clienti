import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { gsap } from "gsap";
import PublicFaqAccordion, {
  type PublicFaqItem,
} from "../components/public/PublicFaqAccordion";
import { trackUiEvent } from "../lib/tracking";
import { applySeo } from "../lib/seo";
import {
  fetchPlatformStats,
  type PlatformStats,
} from "../lib/api";
import MemberCardPreview from "../components/cards/MemberCardPreview";
import { useStatePlatformCapabilities } from "../hooks/useStatePlatformCapabilities";

const PublicHeroThree = lazy(() => import("../components/public/PublicHeroThree.client"));

type HeroEntry = {
  id: "association" | "member" | "account";
  title: string;
  cta: string;
  microcopy: string;
  to: string;
  recommended?: boolean;
};

const HERO_ENTRIES: HeroEntry[] = [
  {
    id: "association",
    title: "Sono un'Associazione",
    cta: "Affilia la tua Associazione",
    microcopy: "Richiede 10 minuti - Documenti - Pagamento",
    to: "/affiliazione",
    recommended: true,
  },
  {
    id: "member",
    title: "Sono un Socio",
    cta: "Diventa Socio",
    microcopy: "Iscriviti e ricevi la tessera digitale",
    to: "/associazioni",
  },
  {
    id: "account",
    title: "Ho gia un account",
    cta: "Area Riservata",
    microcopy: "Accedi come Admin o Socio",
    to: "/area-riservata",
  },
];

const EMPTY_PLATFORM_STATS: PlatformStats = {
  organizations: 0,
  members: 0,
  cities: 0,
};

const AFFILIATION_STEPS = [
  {
    title: "Dati Associazione",
    description:
      "Inserisci i riferimenti dell'associazione e conferma i contatti amministrativi principali.",
  },
  {
    title: "Documenti e Cariche",
    description:
      "Carica la documentazione richiesta e indica presidente, segreteria e responsabili operativi.",
  },
  {
    title: "Pagamento e invio",
    description:
      "Seleziona il metodo di pagamento disponibile, conferma i dati e invia la richiesta ad ASSONAM.",
  },
] as const;

const FAQ_ITEMS: PublicFaqItem[] = [
  {
    question: "Quanto tempo serve?",
    answer:
      "La compilazione completa richiede in media 10 minuti se hai gia i documenti pronti.",
  },
  {
    question: "Quali documenti servono?",
    answer:
      "Ti chiederemo i documenti associativi principali e i riferimenti delle cariche in corso.",
  },
  {
    question: "Posso pagare con bonifico o contanti?",
    answer:
      "Il pagamento viene gestito nel wizard secondo i metodi disponibili per la tua procedura.",
  },
  {
    question: "Quando viene attivato l'account?",
    answer:
      "L'attivazione avviene dopo la verifica amministrativa dei documenti inviati.",
  },
  {
    question: "Cosa succede dopo l'invio?",
    answer:
      "Ricevi una conferma immediata e potrai seguire lo stato della richiesta fino alla validazione finale.",
  },
];

const canUseWebGL = () => {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl"),
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

const ENTRY_ICON_CLASS = "h-5 w-5 max-h-6 max-w-6 shrink-0 md:h-6 md:w-6";

const EntryIcon = ({ id }: { id: HeroEntry["id"] }) => {
  if (id === "association") {
    return (
      <svg
        className={ENTRY_ICON_CLASS}
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <path d="M3.5 20.5h17M5.5 20.5V7.2l6.5-3.7 6.5 3.7v13.3" />
        <path d="M9 10.3h2.2m-2.2 3h2.2m3.6-3H17m-2.2 3H17M10.2 20.5v-3.4h3.6v3.4" />
      </svg>
    );
  }

  if (id === "member") {
    return (
      <svg
        className={ENTRY_ICON_CLASS}
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <path d="M12 12.4a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6Z" />
        <path d="M4.6 20.2a7.4 7.4 0 0 1 14.8 0" />
      </svg>
    );
  }

  return (
    <svg
      className={ENTRY_ICON_CLASS}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M6.2 10.1V7.7A5.8 5.8 0 0 1 12 2a5.8 5.8 0 0 1 5.8 5.7V10" />
      <rect x="4" y="10" width="16" height="11" rx="2.2" />
      <path d="M12 14.3v2.8" />
    </svg>
  );
};

const Home = () => {
  const { capabilities, loading: capabilitiesLoading } = useStatePlatformCapabilities();
  const [useWebGLScene, setUseWebGLScene] = useState(false);
  const [lowPowerDevice, setLowPowerDevice] = useState(false);
  const [showStickyAffilia, setShowStickyAffilia] = useState(false);
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [platformStats, setPlatformStats] = useState<PlatformStats>(EMPTY_PLATFORM_STATS);
  const [platformStatsLoaded, setPlatformStatsLoaded] = useState(false);
  const [animatedStats, setAnimatedStats] = useState<PlatformStats>(EMPTY_PLATFORM_STATS);
  const [shouldAnimateStats, setShouldAnimateStats] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const socialProofRef = useRef<HTMLElement>(null);
  const hasAnimatedStatsRef = useRef(false);
  const affiliazioneEnabled = capabilities?.affiliazioneEnabled === true;
  const showAffiliazioneCta = !capabilitiesLoading && affiliazioneEnabled;

  useEffect(() => {
    applySeo({
      title: "ASSONAM",
      description:
        "Piattaforma ASSONAM per affiliazione associazioni, iscrizioni soci e gestione area riservata.",
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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onScroll = () => {
      setShowStickyAffilia(window.scrollY > 300);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined" || !isDemoModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isDemoModalOpen]);

  useEffect(() => {
    let cancelled = false;

    const loadPlatformStats = async () => {
      try {
        const payload = await fetchPlatformStats();
        if (cancelled) return;
        setPlatformStats({
          organizations: Number.isFinite(payload.organizations) ? payload.organizations : 0,
          members: Number.isFinite(payload.members) ? payload.members : 0,
          cities: Number.isFinite(payload.cities) ? payload.cities : 0,
        });
      } catch {
        if (cancelled) return;
        setPlatformStats(EMPTY_PLATFORM_STATS);
      } finally {
        if (!cancelled) setPlatformStatsLoaded(true);
      }
    };

    void loadPlatformStats();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!socialProofRef.current) return;

    if (!("IntersectionObserver" in window)) {
      setShouldAnimateStats(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShouldAnimateStats(true);
        observer.disconnect();
      },
      { threshold: 0.2, rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(socialProofRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!platformStatsLoaded) return;
    if (!shouldAnimateStats || hasAnimatedStatsRef.current) return;

    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      hasAnimatedStatsRef.current = true;
      setAnimatedStats(platformStats);
      return;
    }

    hasAnimatedStatsRef.current = true;
    const durationMs = 1000;
    let raf = 0;
    let startAt = 0;

    const tick = (now: number) => {
      if (!startAt) startAt = now;
      const progress = Math.min((now - startAt) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedStats({
        organizations: Math.round(platformStats.organizations * eased),
        members: Math.round(platformStats.members * eased),
        cities: Math.round(platformStats.cities * eased),
      });
      if (progress < 1) {
        raf = window.requestAnimationFrame(tick);
      }
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [platformStats, platformStatsLoaded, shouldAnimateStats]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.set(
        [
          "[data-hero-eyebrow]",
          "[data-hero-line]",
          "[data-hero-subtitle]",
          "[data-hero-card]",
          "[data-hero-meta]",
          "[data-hero-logo]",
        ],
        { clearProps: "all" },
      );
      return;
    }

    const context = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: "power2.out" } });

      timeline.fromTo(
        "[data-hero-eyebrow]",
        { autoAlpha: 0, y: 12 },
        { autoAlpha: 1, y: 0, duration: 0.38 },
      );
      timeline.fromTo(
        "[data-hero-line]",
        { autoAlpha: 0, y: 22 },
        { autoAlpha: 1, y: 0, duration: 0.52 },
        0.1,
      );
      timeline.fromTo(
        "[data-hero-subtitle]",
        { autoAlpha: 0, y: 14 },
        { autoAlpha: 1, y: 0, duration: 0.44 },
        0.22,
      );
      timeline.fromTo(
        "[data-hero-card]",
        { autoAlpha: 0, y: 18, scale: 0.98 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.45, stagger: 0.08 },
        0.3,
      );
      timeline.fromTo(
        "[data-hero-meta]",
        { autoAlpha: 0, y: 10 },
        { autoAlpha: 1, y: 0, duration: 0.35, stagger: 0.08 },
        0.44,
      );
      timeline.fromTo(
        "[data-hero-logo]",
        { autoAlpha: 0, y: 16, scale: 1.05 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.8 },
        0.2,
      );
    }, heroRef);

    return () => context.revert();
  }, [useWebGLScene]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const frame = window.requestAnimationFrame(() => {
      const heroEl = heroRef.current;
      if (!heroEl) return;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const heroSvgs = heroEl.querySelectorAll("svg");
      heroSvgs.forEach((svg, index) => {
        const rect = svg.getBoundingClientRect();
        const isSafeSize = rect.width <= viewportWidth && rect.height <= viewportHeight;
        console.assert(isSafeSize, "[home-sanity] oversized svg", {
          index,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          viewportWidth,
          viewportHeight,
        });
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [useWebGLScene]);

  const handleAffiliaHeroClick = (source: string) => {
    trackUiEvent("click_affiliazione_cta_hero", { source });
  };

  const handleAffiliaStickyClick = () => {
    trackUiEvent("click_affiliazione_cta_sticky", { source: "sticky_home" });
  };

  const platformStatCards = [
    { key: "organizations", label: "Associazioni Affiliate", value: animatedStats.organizations },
    { key: "members", label: "Soci Registrati", value: animatedStats.members },
    { key: "cities", label: "Città Attive", value: animatedStats.cities },
  ] as const;
  const heroEntries = showAffiliazioneCta
    ? HERO_ENTRIES
    : HERO_ENTRIES.filter((entry) => entry.id !== "association");

  return (
    <div>
      <section className="public-hero" id="top" ref={heroRef}>
        <div className="public-hero-scene" aria-hidden="true">
          <div
            className="public-hero-fallback"
            style={{
              backgroundImage: `linear-gradient(142deg, rgba(255,247,218,0.23) 0%, rgba(233,241,255,0.16) 47%, rgba(219,229,255,0.24) 100%), url(${import.meta.env.BASE_URL}piazza-bologna2.webp)`,
            }}
          />
          <div className="public-hero-gradient-drift" />
          <div className="public-hero-soft-grid" />
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

        <div className="public-hero-overlay bg-gradient-to-b from-neutral-900/60 via-neutral-900/80 to-neutral-900/95" aria-hidden="true" />

        <div className="container-shell public-hero-content">
          <div className="public-hero-copy affiliazione-hero-copy">
            <p className="text-sm font-semibold tracking-widest text-white/80 mb-4" data-hero-eyebrow>
              ASSONAM - ACCESSO RAPIDO
            </p>
            <h1 data-hero-line className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight drop-shadow-md">
              La piattaforma digitale per Associazioni e Soci
            </h1>
            <p className="mt-6 text-lg md:text-xl text-white/90 max-w-2xl mx-auto drop-shadow-sm font-medium" data-hero-subtitle>
              Tessere, iscrizioni, gestione soci e affiliazione - tutto in un unico sistema semplice e sicuro.
            </p>

            <div className="mt-10 flex flex-col md:flex-row items-center justify-center gap-4" data-hero-meta>
              {showAffiliazioneCta ? (
                <div className="flex flex-col items-center">
                  <Link
                    className="btn-primary min-h-[48px] px-6"
                    to="/affiliazione"
                    onClick={() => handleAffiliaHeroClick("hero_desktop_primary")}
                  >
                    Affilia la tua Associazione
                  </Link>
                  <p className="mt-2 text-xs font-medium text-white/75">Richiede circa 10 minuti</p>
                </div>
              ) : null}
              <Link className="btn-ghost min-h-[48px] px-6 text-white border-white/40 hover:bg-white/10" to="/associazioni">
                Diventa Socio
              </Link>
              <Link className="text-sm font-semibold text-white/80 hover:text-white underline underline-offset-4 mt-2 md:mt-0 md:ml-2" to="/area-riservata">
                Accedi all'Area Riservata
              </Link>
            </div>

            <div
              className={`mt-16 grid grid-cols-1 gap-6 ${heroEntries.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}
              role="list"
              aria-label="Scegli il percorso corretto"
            >
              {heroEntries.map((entry) => (
                <Link
                  to={entry.to}
                  key={entry.id}
                  role="listitem"
                  className="rounded-xl border border-white/20 bg-white/5 backdrop-blur-md p-5 flex flex-col text-left transition hover:bg-white/10 hover:border-white/40 group"
                  onClick={
                    entry.id === "association"
                      ? showAffiliazioneCta
                        ? () => handleAffiliaHeroClick("hero_card")
                        : undefined
                      : undefined
                  }
                  data-hero-card
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-white/90 bg-white/10 p-2 rounded-lg group-hover:bg-white/20 transition">
                      <EntryIcon id={entry.id} />
                    </span>
                    <h2 className="text-base font-bold text-white">{entry.title}</h2>
                  </div>
                  <p className="text-sm text-white/80 mt-1 flex-grow">{entry.microcopy}</p>
                  <span className="mt-4 text-xs font-semibold uppercase tracking-wider text-white/70 flex items-center gap-1 group-hover:text-white transition">
                    {entry.cta} <span aria-hidden="true">&rarr;</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        className="py-20"
        data-reveal="fade-up"
        id="platform-social-proof"
        ref={socialProofRef}
      >
        <div className="container-shell">
          <div className="surface-strong landing-panel flex flex-col items-center text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand mb-3">La Nostra Rete</p>
            <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-4">Già scelto da associazioni in tutta Italia</h2>
            <p className="text-lg text-neutral-600 max-w-2xl mb-10">
              Unisciti a una rete in continua crescita. Migliaia di soci usano ogni giorno le tessere digitali ASSONAM per accedere ai propri vantaggi.
            </p>
            <div className="w-full grid grid-cols-2 md:grid-cols-3 gap-6 mt-2">
              {platformStatCards.map((card) => (
                <article key={card.key} className="platform-proof-card bg-white rounded-2xl p-6 shadow-sm border border-neutral-100 flex flex-col items-center text-center">
                  <p className="text-xs md:text-sm font-bold tracking-wider text-neutral-500 uppercase mb-2">{card.label}</p>
                  <p className="text-4xl md:text-5xl font-extrabold text-brand tracking-tight">
                    {(platformStatsLoaded ? card.value : 0).toLocaleString("it-IT")}+
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20" data-reveal="fade-up" id="membership-demo">
        <div className="container-shell">
          <div className="surface-strong landing-panel membership-demo-panel">
            <p className="section-title">Demo Tessera</p>
            <h2 className="section-heading">Scopri come funziona una tessera digitale</h2>
            <p className="section-subtitle">
              Le associazioni affiliate gestiscono i soci con tessere digitali integrate con Apple
              Wallet e Google Wallet.
            </p>

            <div className="membership-demo-layout mt-8 grid md:grid-cols-2 gap-12 items-center">
              <div>
                <ul className="space-y-6">
                  <li className="flex gap-4">
                    <span className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-brand/10 text-brand font-bold text-sm">1</span>
                    <div>
                      <h3 className="font-bold text-lg text-neutral-900">Integrazione Wallet</h3>
                      <p className="text-neutral-600 mt-1">Aggiungi la tessera ad Apple Wallet e Google Wallet con un solo tap.</p>
                    </div>
                  </li>
                  <li className="flex gap-4">
                    <span className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-brand/10 text-brand font-bold text-sm">2</span>
                    <div>
                      <h3 className="font-bold text-lg text-neutral-900">Verifica QR Sicura</h3>
                      <p className="text-neutral-600 mt-1">Ogni tessera include un QR code dinamico per la verifica istantanea.</p>
                    </div>
                  </li>
                  <li className="flex gap-4">
                    <span className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-brand/10 text-brand font-bold text-sm">3</span>
                    <div>
                      <h3 className="font-bold text-lg text-neutral-900">Dati sempre aggiornati</h3>
                      <p className="text-neutral-600 mt-1">Stato socio e validità sono sincronizzati in tempo reale.</p>
                    </div>
                  </li>
                </ul>
                <div className="mt-8 flex gap-4">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setIsDemoModalOpen(true)}
                  >
                    Vedi una demo
                  </button>
                  <Link className="btn-ghost" to="/associazioni">
                    Diventa Socio
                  </Link>
                </div>
              </div>

              <div className="membership-demo-card-wrap flex justify-center">
                <div className="w-full max-w-[28rem] drop-shadow-2xl">
                  <MemberCardPreview
                    cardData={{
                      firstName: "Mario",
                      lastName: "Rossi",
                      fullName: "Mario Rossi",
                      organizationName: "Golden Age Fitness",
                      cardNumber: "GA-00123",
                      cardStatus: "active",
                      cardYear: new Date().getFullYear().toString(),
                      verificationUrl: "https://assonam.it/verify/GA-00123",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20" data-reveal="fade-up" id="affiliazione-passaggi">
        <div className="container-shell">
          <div className="surface-strong landing-panel">
            <p className="section-title">Percorso Associazione</p>
            <h2 className="section-heading">Affiliazione in 3 passaggi</h2>
            <p className="section-subtitle">
              Procedura guidata e lineare: completi il modulo, alleghi i documenti e invii in pochi
              minuti.
            </p>

            <div className="affiliazione-steps-grid mt-8" data-reveal="stagger">
              {AFFILIATION_STEPS.map((step, index) => (
                <article key={step.title} className="surface affiliazione-step-card" data-reveal-item>
                  <span className="affiliazione-step-index">{index + 1}</span>
                  <h3 className="affiliazione-step-title">{step.title}</h3>
                  <p className="affiliazione-step-description">{step.description}</p>
                </article>
              ))}
            </div>

            <div className="landing-inline-cta">
              {showAffiliazioneCta ? (
                <Link
                  className="btn-primary"
                  to="/affiliazione"
                  onClick={() => handleAffiliaHeroClick("below_fold_section")}
                >
                  Inizia Affiliazione
                </Link>
              ) : null}
              <Link className="btn-ghost" to="/affiliazione-info">
                Vedi dettagli affiliazione
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20" data-reveal="fade-up">
        <div className="container-shell">
          <div className="surface-strong landing-panel">
            <p className="section-title">FAQ Affiliazione</p>
            <h2 className="section-heading">Domande frequenti</h2>
            <p className="section-subtitle">
              Le risposte principali prima di iniziare la procedura di affiliazione.
            </p>
            <div className="mt-8">
              <PublicFaqAccordion items={FAQ_ITEMS} />
            </div>
          </div>
        </div>
      </section>

      {showAffiliazioneCta ? (
        <div className={`affiliazione-sticky-cta${showStickyAffilia ? " is-visible" : ""}`}>
          <Link
            className="btn-primary affiliazione-sticky-button"
            to="/affiliazione"
            onClick={handleAffiliaStickyClick}
          >
            Affilia la tua Associazione
          </Link>
        </div>
      ) : null}

      {isDemoModalOpen && (
        <div
          className="membership-demo-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="membership-demo-modal-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsDemoModalOpen(false);
          }}
        >
          <div className="modal-panel membership-demo-modal">
            <button
              type="button"
              className="membership-demo-modal-close"
              onClick={() => setIsDemoModalOpen(false)}
              aria-label="Chiudi finestra demo"
            >
              Chiudi
            </button>
            <h3 id="membership-demo-modal-title" className="membership-demo-modal-title">
              Questa è una demo.
            </h3>
            <p className="membership-demo-modal-text">
              Le associazioni affiliate ad ASSONAM possono emettere tessere digitali per tutti i
              soci.
            </p>
            <div className="membership-demo-modal-actions">
              {showAffiliazioneCta ? (
                <Link className="btn-primary" to="/affiliazione" onClick={() => setIsDemoModalOpen(false)}>
                  Affilia la tua Associazione
                </Link>
              ) : null}
              <Link className="btn-ghost" to="/affiliazione-info" onClick={() => setIsDemoModalOpen(false)}>
                Scopri di più
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;

