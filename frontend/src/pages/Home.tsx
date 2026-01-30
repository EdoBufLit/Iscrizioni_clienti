// frontend/src/pages/Home.tsx
import React from "react";

type QuickLink = {
  title: string;
  desc: string;
  href: string;
};

type Feature = {
  title: string;
  desc: string;
};

type Step = {
  title: string;
  desc: string;
};

const quickLinks: QuickLink[] = [
  {
    title: "Associazioni affiliate",
    desc: "Trova la tua associazione e completa l’iscrizione online con rilascio tessera.",
    href: "associazioni",
  },
  {
    title: "Area riservata",
    desc: "Accedi con le tue credenziali per consultare documenti e stato richieste.",
    href: "login",
  },
  {
    title: "Contatti",
    desc: "Richiedi informazioni sui servizi e sulle procedure di affiliazione.",
    href: "contatti",
  },
];

const features: Feature[] = [
  {
    title: "Gestione contabile",
    desc: "Supporto operativo su contabilità, rendiconti, tracciabilità e adempimenti essenziali.",
  },
  {
    title: "Iscrizioni e tesseramento",
    desc: "Flussi digitali per acquisizione dati, documenti, privacy e rilascio tessera.",
  },
  {
    title: "Area riservata soci",
    desc: "Accesso controllato a documenti, comunicazioni, ricevute e materiale associativo.",
  },
  {
    title: "Procedure ordinate",
    desc: "Processi chiari, verificabili e replicabili per ridurre errori e tempi di gestione.",
  },
  {
    title: "Conformità e trasparenza",
    desc: "Gestione strutturata della documentazione e delle richieste secondo buone pratiche.",
  },
  {
    title: "Supporto continuativo",
    desc: "Assistenza nella gestione ordinaria e nelle scadenze, con priorità alle attività critiche.",
  },
];

const steps: Step[] = [
  {
    title: "Seleziona l’associazione",
    desc: "Vai alla sezione Associazioni, scegli la sede/affiliazione e apri la scheda.",
  },
  {
    title: "Compila l’iscrizione",
    desc: "Inserisci i dati del socio e carica i documenti richiesti in modo guidato.",
  },
  {
    title: "Ottieni la tessera",
    desc: "Al termine della procedura, ricevi conferma e attivazione della tessera associativa.",
  },
];

export default function Home() {
  const base = import.meta.env.BASE_URL || "/";

  return (
    <>
      {/* HERO */}
      <section className="container-shell pt-8 md:pt-10">
        <div className="surface p-8 md:p-10">
          <div className="grid gap-10 md:grid-cols-2 md:items-center">
            {/* LEFT */}
            <div>
              <p className="section-title">Studio contabile · ASSO.N.A.M.</p>

              <div className="mt-3 flex items-center gap-2">
                <img
                  src={`${base}favicon.svg`}
                  alt="ASSO.N.A.M."
                  className="h-6 w-6"
                />
                <span className="text-sm font-medium text-neutral-600">
                  ASSO.N.A.M.
                </span>
              </div>

              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-neutral-900 md:text-5xl">
                Gestione associativa, contabilità
                <br />
                e adempimenti normativi.
              </h1>

              <p className="section-subtitle mt-5">
                Supporto operativo per associazioni e realtà affiliate:
                iscrizioni digitali, raccolta documenti, tracciabilità e area
                riservata per i soci. Tutto in modo ordinato, verificabile e
                conforme.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <a
                  href={`${base}associazioni`}
                  className="btn-primary"
                  aria-label="Vai alla pagina associazioni"
                >
                  Vai alle associazioni
                </a>
                <a
                  href={`${base}login`}
                  className="btn-ghost"
                  aria-label="Accedi all'area riservata"
                >
                  Area riservata
                </a>
              </div>

              <p className="mt-4 text-xs text-neutral-500">
                Se devi iscriverti a un’associazione affiliata, parti dalla
                sezione “Associazioni”.
              </p>
            </div>

            {/* RIGHT */}
            <div className="hidden md:block">
              <div className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
                <img
                  src={`${base}hero-office.avif`}
                  alt="Scrivania e documenti"
                  className="block w-full opacity-[0.95]"
                  loading="lazy"
                />
              </div>
              <p className="mt-3 text-xs text-neutral-500">
                Ambiente di lavoro e documentazione: impostazione sobria e
                professionale.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* QUICK LINKS */}
      <section className="container-shell mt-14">
        <p className="section-title">Accesso rapido</p>
        <h2 className="section-heading mt-2">Inizia da qui</h2>
        <p className="section-subtitle mt-4 max-w-2xl">
          Percorsi essenziali per soci e associazioni: scegli l’azione più
          adatta e procedi.
        </p>

        <div className="grid-cards mt-10">
          {quickLinks.map((q) => (
            <a
              key={q.title}
              href={`${base}${q.href}`}
              className="surface block p-6 transition hover:border-neutral-300 hover:bg-neutral-50"
              style={{ borderRadius: 12 }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-medium text-neutral-900">
                    {q.title}
                  </h3>
                  <p className="mt-2 text-sm text-neutral-600">{q.desc}</p>
                </div>
                <span className="text-sm font-medium text-neutral-700">
                  Apri →
                </span>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* SERVICES / FEATURES */}
      <section className="container-shell mt-16">
        <p className="section-title">Servizi</p>
        <h2 className="section-heading mt-2">
          Supporto completo per associazioni
        </h2>
        <p className="section-subtitle mt-4 max-w-2xl">
          Dalla gestione amministrativa alla digitalizzazione dei processi,
          affianchiamo le associazioni in ogni fase operativa.
        </p>

        <div className="grid-cards mt-10">
          {features.map((f) => (
            <div key={f.title} className="surface p-6">
              <h3 className="text-base font-medium text-neutral-900">
                {f.title}
              </h3>
              <p className="mt-2 text-sm text-neutral-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* METHOD */}
      <section className="container-shell mt-16">
        <div className="surface p-8 md:p-10">
          <p className="section-title">Metodo</p>
          <h2 className="section-heading mt-2">Processi chiari e verificabili</h2>
          <p className="section-subtitle mt-4 max-w-2xl">
            Riduciamo ambiguità e passaggi manuali: ogni step è tracciabile e
            replicabile, con documentazione ordinata.
          </p>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {steps.map((s, idx) => (
              <div
                key={s.title}
                className="rounded-xl border border-neutral-200 bg-white p-6"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-sm font-semibold text-neutral-800">
                    {idx + 1}
                  </span>
                  <h3 className="text-base font-medium text-neutral-900">
                    {s.title}
                  </h3>
                </div>
                <p className="mt-3 text-sm text-neutral-600">{s.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            <a href={`${base}associazioni`} className="btn-primary">
              Consulta le associazioni
            </a>
            <a href={`${base}login`} className="btn-ghost">
              Accedi
            </a>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="container-shell mt-16 pb-16">
        <div className="surface p-8 md:p-10">
          <div className="grid gap-8 md:grid-cols-2 md:items-center">
            <div>
              <p className="section-title">Affiliazioni</p>
              <h2 className="section-heading mt-2">
                Iscrizione socio e tessera: online
              </h2>
              <p className="section-subtitle mt-4">
                Seleziona l’associazione affiliata, compila la richiesta e
                completa la procedura. Riceverai conferma e attivazione della
                tessera secondo le regole dell’affiliazione.
              </p>
            </div>

            <div className="flex flex-wrap justify-start gap-3 md:justify-end">
              <a href={`${base}associazioni`} className="btn-primary">
                Vai alle associazioni
              </a>
              <a href={`${base}contatti`} className="btn-ghost">
                Richiedi info
              </a>
            </div>
          </div>

          <div className="mt-8 border-t border-neutral-200 pt-6 text-xs text-neutral-500">
            © {new Date().getFullYear()} ASSO.N.A.M. — Pagina informativa.
          </div>
        </div>
      </section>
    </>
  );
}
