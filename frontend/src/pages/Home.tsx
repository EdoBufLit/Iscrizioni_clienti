import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { gsap } from "gsap";
import PublicFaqAccordion, {
  type PublicFaqItem,
} from "../components/public/PublicFaqAccordion";
import { trackUiEvent } from "../lib/tracking";
import { applySeo } from "../lib/seo";
import { fetchPlatformStats, type PlatformStats } from "../lib/api";
import { AFFILIAZIONE_ENABLED } from "../lib/features";

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

const MEMBERSHIP_DEMO = {
  association: "Golden Age Fitness",
  member: "Mario Rossi",
  id: "GA-00123",
} as const;

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

const EntryIcon = ({ id }: { id: HeroEntry["id"] }) => {
  if (id === "association") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M3.5 20.5h17M5.5 20.5V7.2l6.5-3.7 6.5 3.7v13.3" />
        <path d="M9 10.3h2.2m-2.2 3h2.2m3.6-3H17m-2.2 3H17M10.2 20.5v-3.4h3.6v3.4" />
      </svg>
    );
  }

  if (id === "member") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M12 12.4a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6Z" />
        <path d="M4.6 20.2a7.4 7.4 0 0 1 14.8 0" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M6.2 10.1V7.7A5.8 5.8 0 0 1 12 2a5.8 5.8 0 0 1 5.8 5.7V10" />
      <rect x="4" y="10" width="16" height="11" rx="2.2" />
      <path d="M12 14.3v2.8" />
    </svg>
  );
};

const Home = () => {
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
  const membershipDemoCardRef = useRef<HTMLDivElement>(null);
  const hasAnimatedStatsRef = useRef(false);

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
    if (!AFFILIAZIONE_ENABLED) {
      setShowStickyAffilia(false);
      return;
    }

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

  const handleAffiliaHeroClick = (source: string) => {
    trackUiEvent("click_affiliazione_cta_hero", { source });
  };

  const handleAffiliaStickyClick = () => {
    trackUiEvent("click_affiliazione_cta_sticky", { source: "sticky_home" });
  };

  const handleMembershipDemoTilt = (event: React.MouseEvent<HTMLDivElement>) => {
    const card = membershipDemoCardRef.current;
    if (!card || typeof window === "undefined") return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const rect = card.getBoundingClientRect();
    const pointerX = (event.clientX - rect.left) / rect.width;
    const pointerY = (event.clientY - rect.top) / rect.height;
    const rotateY = (pointerX - 0.5) * 10;
    const rotateX = (0.5 - pointerY) * 10;
    card.style.setProperty("--demo-rotate-x", `${rotateX.toFixed(2)}deg`);
    card.style.setProperty("--demo-rotate-y", `${rotateY.toFixed(2)}deg`);
  };

  const resetMembershipDemoTilt = () => {
    const card = membershipDemoCardRef.current;
    if (!card) return;
    card.style.setProperty("--demo-rotate-x", "0deg");
    card.style.setProperty("--demo-rotate-y", "0deg");
  };

  const platformStatCards = [
    { key: "organizations", label: "Associazioni Affiliate", value: animatedStats.organizations },
    { key: "members", label: "Soci Registrati", value: animatedStats.members },
    { key: "cities", label: "Città Attive", value: animatedStats.cities },
  ] as const;
  const heroEntries = useMemo(
    () =>
      AFFILIAZIONE_ENABLED
        ? HERO_ENTRIES
        : HERO_ENTRIES.filter((entry: HeroEntry) => entry.id !== "association"),
    [],
  );

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

        <div className="public-hero-overlay" aria-hidden="true" />

        <div className="container-shell public-hero-content">
          <div className="public-hero-copy affiliazione-hero-copy">
            <p className="section-title" data-hero-eyebrow>
              ASSONAM - ACCESSO RAPIDO
            </p>
            <h1 data-hero-line>La piattaforma digitale per Associazioni e Soci</h1>
            <p className="public-hero-subtitle" data-hero-subtitle>
              Tessere, iscrizioni, gestione soci e affiliazione - tutto in un unico sistema.
            </p>

            <div className="hero-entry-grid" role="list" aria-label="Scegli il percorso corretto">
              {heroEntries.map((entry) => (
                <article
                  key={entry.id}
                  role="listitem"
                  className={`hero-entry-card${entry.recommended ? " is-primary" : ""}`}
                  data-hero-card
                >
                  {entry.recommended ? <span className="hero-entry-tag">Consigliato</span> : null}
                  <span className="hero-entry-icon">
                    <EntryIcon id={entry.id} />
                  </span>
                  <h2 className="hero-entry-title">{entry.title}</h2>
                  <p className="hero-entry-microcopy">{entry.microcopy}</p>
                  <Link
                    className={`${entry.recommended ? "btn-primary" : "btn-ghost"} hero-entry-button`}
                    to={entry.to}
                    onClick={
                      entry.id === "association"
                        ? () => handleAffiliaHeroClick("hero_card")
                        : undefined
                    }
                  >
                    {entry.cta}
                  </Link>
                  {entry.id === "association" ? (
                    <p className="hero-entry-under-cta">Richiede circa 10 minuti</p>
                  ) : null}
                </article>
              ))}
            </div>

            {AFFILIAZIONE_ENABLED ? (
              <>
                <div className="hero-entry-timeline" data-hero-meta>
                  <span>1 Compila</span>
                  <span>2 Carica documenti</span>
                  <span>3 Paga e invia</span>
                </div>

                <div className="hero-trust-badges" data-hero-meta>
                  <span>Verifica documenti</span>
                  <span>Pagamenti sicuri</span>
                  <span>Attivazione dopo conferma</span>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </section>

      <section
        className="py-14"
        data-reveal="fade-up"
        id="platform-social-proof"
        ref={socialProofRef}
      >
        <div className="container-shell">
          <div className="surface-strong landing-panel">
            <h2 className="section-heading">Già scelto da associazioni in tutta Italia</h2>
            <div className="platform-proof-grid mt-7">
              {platformStatCards.map((card) => (
                <article key={card.key} className="platform-proof-card">
                  <p className="platform-proof-label">{card.label}</p>
                  <p className="platform-proof-value">
                    {(platformStatsLoaded ? card.value : 0).toLocaleString("it-IT")}
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

            <div className="membership-demo-layout mt-8">
              <div className="membership-demo-card-wrap">
                <article
                  ref={membershipDemoCardRef}
                  className="membership-demo-card"
                  onMouseMove={handleMembershipDemoTilt}
                  onMouseLeave={resetMembershipDemoTilt}
                >
                  <p className="membership-demo-kicker">ASSONAM DIGITAL CARD</p>
                  <div className="membership-demo-grid">
                    <p className="membership-demo-label">Association</p>
                    <p className="membership-demo-value">{MEMBERSHIP_DEMO.association}</p>
                    <p className="membership-demo-label">Member</p>
                    <p className="membership-demo-value">{MEMBERSHIP_DEMO.member}</p>
                    <p className="membership-demo-label">ID</p>
                    <p className="membership-demo-value">{MEMBERSHIP_DEMO.id}</p>
                  </div>
                  <div className="membership-demo-qr-wrap">
                    <div className="membership-demo-qr" aria-hidden="true" />
                  </div>
                  <button
                    type="button"
                    className="btn-primary membership-demo-wallet-btn"
                    onClick={() => setIsDemoModalOpen(true)}
                  >
                    Aggiungi a Wallet
                  </button>
                </article>
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
              {AFFILIAZIONE_ENABLED ? (
                <>
                  <Link
                    className="btn-primary"
                    to="/affiliazione"
                    onClick={() => handleAffiliaHeroClick("below_fold_section")}
                  >
                    Inizia Affiliazione
                  </Link>
                  <Link className="btn-ghost" to="/affiliazione-info">
                    Vedi dettagli affiliazione
                  </Link>
                </>
              ) : (
                <Link className="btn-ghost" to="/contatti">
                  Contatta ASSONAM
                </Link>
              )}
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

      {AFFILIAZIONE_ENABLED ? (
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
              {AFFILIAZIONE_ENABLED ? (
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

