import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { gsap } from "gsap";
import PublicFaqAccordion, {
  type PublicFaqItem,
} from "../components/public/PublicFaqAccordion";
import { trackUiEvent } from "../lib/tracking";
import { applySeo } from "../lib/seo";
import { type PlatformStats } from "../lib/api";
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
    title: "Ho già un account",
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

const SHOWCASE_PLATFORM_STATS: PlatformStats = {
  organizations: 300,
  members: 9000,
  cities: 24,
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
      "La compilazione completa richiede in media 10 minuti se hai già i documenti pronti.",
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
  const [platformStats] = useState<PlatformStats>(SHOWCASE_PLATFORM_STATS);
  const [platformStatsLoaded] = useState(true);
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
    <div className="bg-slate-50/50 font-sans text-slate-900">
      {/* HERO SECTION - LIGHT PREMIUM */}
      <section className="relative overflow-hidden pt-20 pb-24 md:pt-32 md:pb-32" id="top" ref={heroRef}>
        {/* Background Canvas / Elements */}
        <div className="absolute inset-0 z-0 pointer-events-none bg-slate-50">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
          <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-brand opacity-20 blur-[100px]"></div>
          {!useWebGLScene ? (
            <div className="absolute inset-0 hidden items-center justify-center opacity-5 mix-blend-multiply md:flex" data-hero-logo>
              <img src={`${import.meta.env.BASE_URL}assonam-logo.svg`} alt="" className="w-2/3 max-w-2xl" />
            </div>
          ) : (
            <div className="absolute inset-0 opacity-40 mix-blend-multiply">
               <Suspense fallback={null}>
                <PublicHeroThree lowPower={lowPowerDevice} />
               </Suspense>
            </div>
          )}
        </div>

        <div className="container-shell relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <div className="relative">
              {!useWebGLScene ? (
                <div
                  className="pointer-events-none absolute left-1/2 top-[-6.75rem] z-0 flex w-full -translate-x-1/2 justify-center md:hidden"
                  data-hero-logo
                  aria-hidden="true"
                >
                  <img
                    src={`${import.meta.env.BASE_URL}assonam-logo.svg`}
                    alt=""
                    className="w-[min(82vw,20rem)] opacity-[0.04] blur-[1.2px]"
                  />
                </div>
              ) : null}
              <div className="relative z-10">
                <p className="inline-flex items-center justify-center px-3 py-1 mb-6 text-xs font-bold uppercase tracking-widest text-brand bg-brand/10 rounded-full" data-hero-eyebrow>
                  ASSONAM - Accesso Rapido
                </p>
                <h1 data-hero-line className="text-4xl md:text-6xl lg:text-7xl font-extrabold text-slate-900 tracking-tight leading-[1.1]">
                  La piattaforma digitale per <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand to-brand-light">Associazioni e Soci</span>
                </h1>
                <p className="mt-6 text-lg md:text-xl text-slate-600 max-w-2xl mx-auto font-medium leading-relaxed" data-hero-subtitle>
                  Tessere, iscrizioni, gestione soci e affiliazione. Tutto in un unico ecosistema semplice, istituzionale e sicuro.
                </p>
              </div>
            </div>

            <div className="mt-10 mx-auto flex max-w-md flex-col items-center justify-center gap-4" data-hero-meta>
              {affiliazioneEnabled ? (
                <Link
                  className="btn-primary !h-14 !w-full !rounded-xl !px-8 !text-base"
                  to="/affiliazione"
                  onClick={() => handleAffiliaHeroClick("hero_desktop_primary")}
                >
                  Affilia la tua Associazione
                </Link>
              ) : null}
            </div>
            <div className="mt-4" data-hero-meta>
               <Link className="text-sm font-semibold text-slate-500 hover:text-brand underline underline-offset-4" to="/area-riservata">
                Sei già registrato? Accedi all'Area Riservata
              </Link>
            </div>

            <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 text-left" role="list" aria-label="Scegli il percorso corretto">
              {heroEntries.map((entry) => (
                <Link
                  to={entry.to}
                  key={entry.id}
                  role="listitem"
                  className="group relative bg-white rounded-2xl p-6 border border-slate-200 shadow-xl shadow-slate-200/40 hover:shadow-2xl hover:-translate-y-1 hover:border-brand/30 transition-all flex flex-col"
                  onClick={
                    entry.id === "association"
                      ? () => handleAffiliaHeroClick("hero_card")
                      : undefined
                  }
                  data-hero-card
                >
                  <div className="flex items-center gap-4 mb-4">
                    <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-slate-50 text-brand group-hover:bg-brand group-hover:text-white transition-colors border border-slate-100">
                      <EntryIcon id={entry.id} />
                    </span>
                    <h2 className="text-lg font-bold text-slate-900">{entry.title}</h2>
                  </div>
                  <p className="text-sm text-slate-500 font-medium flex-grow leading-relaxed">{entry.microcopy}</p>
                  <span className="mt-6 text-xs font-bold uppercase tracking-wider text-brand flex items-center gap-1 group-hover:gap-2 transition-all">
                    {entry.cta} <span aria-hidden="true">&rarr;</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* STATS SECTION */}
      <section
        className="py-20 bg-white border-y border-slate-100"
        data-reveal="fade-up"
        id="platform-social-proof"
        ref={socialProofRef}
      >
        <div className="container-shell">
          <div className="flex flex-col items-center text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">La Nostra Rete</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">Migliaia di utenti in tutta Italia</h2>
            <p className="text-lg text-slate-500 max-w-2xl mb-12 font-medium">
              Unisciti a una rete in continua crescita. Semplifica la gestione e offri ai tuoi soci un'esperienza digitale all'avanguardia.
            </p>
            <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-8">
              {platformStatCards.map((card) => (
                <article key={card.key} className="flex flex-col items-center">
                  <p className="text-5xl md:text-6xl font-extrabold text-brand tracking-tighter drop-shadow-sm mb-2">
                    {(platformStatsLoaded ? card.value : 0).toLocaleString("it-IT")}+
                  </p>
                  <p className="text-sm font-bold tracking-widest text-slate-500 uppercase">{card.label}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* DIGITAL CARD SECTION */}
      <section className="py-24 bg-slate-50/50" data-reveal="fade-up" id="membership-demo">
        <div className="container-shell">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            
            {/* Left Copy */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-brand mb-3">Innovazione</p>
              <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-6 leading-tight">
                La tua tessera digitale,<br/>sempre in tasca.
              </h2>
              <p className="text-lg text-slate-600 mb-10 leading-relaxed">
                Le associazioni affiliate emettono tessere digitali istantanee, pronte per essere salvate nei wallet nativi degli smartphone.
              </p>
              
              <ul className="space-y-8">
                <li className="flex gap-5">
                  <span className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-white shadow-sm border border-slate-100 text-brand font-bold text-sm">1</span>
                  <div>
                    <h3 className="font-bold text-lg text-slate-900">Integrazione Nativa</h3>
                    <p className="text-slate-500 mt-1.5 leading-relaxed">Aggiungi la tessera ad Apple Wallet e Google Wallet con un solo tap. Nessuna app di terze parti richiesta.</p>
                  </div>
                </li>
                <li className="flex gap-5">
                  <span className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-white shadow-sm border border-slate-100 text-brand font-bold text-sm">2</span>
                  <div>
                    <h3 className="font-bold text-lg text-slate-900">Verifica QR Sicura</h3>
                    <p className="text-slate-500 mt-1.5 leading-relaxed">Ogni tessera include un QR code univoco per la verifica istantanea dello stato del socio.</p>
                  </div>
                </li>
                <li className="flex gap-5">
                  <span className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-white shadow-sm border border-slate-100 text-brand font-bold text-sm">3</span>
                  <div>
                    <h3 className="font-bold text-lg text-slate-900">Sincronizzazione Cloud</h3>
                    <p className="text-slate-500 mt-1.5 leading-relaxed">Rinnovi e decadenze si aggiornano in tempo reale direttamente sul telefono del socio.</p>
                  </div>
                </li>
              </ul>
              
              <div className="mt-10 flex flex-wrap gap-4">
                <button
                  type="button"
                  className="inline-flex items-center justify-center h-12 px-8 rounded-xl bg-brand hover:bg-brand-light text-white font-bold shadow-md shadow-brand/20 transition-all"
                  onClick={() => setIsDemoModalOpen(true)}
                >
                  Vedi una demo
                </button>
              </div>
            </div>

            {/* Right Card */}
            <div className="relative flex justify-center lg:justify-end">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 bg-brand/10 rounded-full blur-3xl pointer-events-none"></div>
              <div className="w-full max-w-[28rem] drop-shadow-2xl hover:-translate-y-2 transition-transform duration-500 relative z-10">
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
      </section>

      {/* HOW IT WORKS WIZARD */}
      <section className="py-24 bg-white" data-reveal="fade-up" id="affiliazione-passaggi">
        <div className="container-shell text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Onboarding Semplificato</p>
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-6">Affiliazione in 3 passaggi</h2>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto mb-16 font-medium">
            Abbiamo eliminato la burocrazia cartacea. Completi il modulo online, alleghi i PDF e invii in pochi minuti.
          </p>

          <div className="grid md:grid-cols-3 gap-8" data-reveal="stagger">
            {AFFILIATION_STEPS.map((step, index) => (
              <article key={step.title} className="bg-slate-50 rounded-3xl p-8 border border-slate-100 text-left relative overflow-hidden group" data-reveal-item>
                <div className="absolute top-0 right-0 p-6 text-8xl font-black text-slate-200/50 -mt-10 -mr-6 group-hover:scale-110 transition-transform pointer-events-none select-none">
                  {index + 1}
                </div>
                <div className="relative z-10">
                  <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white shadow-sm border border-slate-200 text-brand font-bold text-xl mb-6">
                    {index + 1}
                  </span>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{step.title}</h3>
                  <p className="text-slate-500 leading-relaxed font-medium">{step.description}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-16 flex flex-col sm:flex-row items-center justify-center gap-4">
            {affiliazioneEnabled ? (
              <Link
                className="btn-primary !h-14 !rounded-xl !px-8"
                to="/affiliazione"
                onClick={() => handleAffiliaHeroClick("below_fold_section")}
              >
                Inizia Affiliazione Ora
              </Link>
            ) : (
              <Link className="btn-primary !h-14 !rounded-xl !px-8" to="/contatti">
                Contatta ASSONAM
              </Link>
            )}
            <Link className="btn-ghost !h-14 !rounded-xl !px-8" to="/affiliazione-info">
              Scopri i dettagli tecnici
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section className="py-24 bg-slate-50/50 border-t border-slate-100" data-reveal="fade-up">
        <div className="container-shell max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold text-slate-900 mb-4">Domande Frequenti</h2>
            <p className="text-slate-500 text-lg">Tutto quello che devi sapere prima di iniziare.</p>
          </div>
          <div className="surface-strong rounded-3xl p-6 md:p-10">
            <PublicFaqAccordion items={FAQ_ITEMS} />
          </div>
        </div>
      </section>

      {/* STICKY CTA */}
      <div className={`fixed bottom-6 left-0 right-0 z-50 flex justify-center transition-all duration-300 pointer-events-none ${showStickyAffilia ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <Link
          className="btn-primary pointer-events-auto !h-14 !rounded-full !px-10 !text-lg hover:!scale-105"
          to="/affiliazione"
          onClick={handleAffiliaStickyClick}
        >
          Affilia la tua Associazione
        </Link>
      </div>

      {/* MODAL DEMO */}
      {isDemoModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="membership-demo-modal-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsDemoModalOpen(false);
          }}
        >
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 id="membership-demo-modal-title" className="text-2xl font-extrabold text-slate-900">
                Modalità Demo
              </h3>
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                onClick={() => setIsDemoModalOpen(false)}
                aria-label="Chiudi"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <p className="text-slate-600 mb-8 leading-relaxed">
              Questa è solo un'anteprima visiva. Le associazioni affiliate ad ASSONAM possono emettere istantaneamente tessere digitali reali per tutti i loro soci tramite l'Area Riservata.
            </p>
            
            <div className="flex flex-col gap-3">
              {affiliazioneEnabled ? (
                <Link className="btn-primary !h-12 !w-full !rounded-xl" to="/affiliazione" onClick={() => setIsDemoModalOpen(false)}>
                  Affilia l'Associazione
                </Link>
              ) : null}
              <Link className="btn-ghost !h-12 !w-full !rounded-xl" to="/affiliazione-info" onClick={() => setIsDemoModalOpen(false)}>
                Scopri di più sul sistema
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );

};

export default Home;
