// frontend/src/pages/Home.tsx
import React from "react";

export default function Home() {
  return (
    <>
      {/* HERO */}
      <section className="container-shell pt-8 md:pt-10">
        <div className="surface p-8 md:p-10">
          <div className="grid gap-10 md:grid-cols-2 md:items-center">
            {/* LEFT */}
            <div>
              <p className="section-title">Studio contabile · ASSO.N.A.M.</p>

              {/* Logo piccolo sopra il titolo */}
              <div className="mt-3 flex items-center gap-2">
                <img
                  src={`${import.meta.env.BASE_URL}favicon.svg`}
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
                  href={`${import.meta.env.BASE_URL}associazioni`}
                  className="btn-primary"
                >
                  Vai alle associazioni
                </a>
                <a
                  href={`${import.meta.env.BASE_URL}login`}
                  className="btn-ghost"
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
                  src={`${import.meta.env.BASE_URL}hero-office.avif`}
                  alt="Scrivania e documenti"
                  className="block w-full opacity-[0.95]"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SERVIZI */}
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
          <div className="surface p-6">
            <h3 className="font-medium text-neutral-900">
              Gestione contabile
            </h3>
            <p className="mt-2 text-sm text-neutral-600">
              Tenuta della contabilità, rendicontazione e supporto agli
              adempimenti fiscali.
            </p>
          </div>

          <div className="surface p-6">
            <h3 className="font-medium text-neutral-900">
              Iscrizioni e tesseramento
            </h3>
            <p className="mt-2 text-sm text-neutral-600">
              Flussi digitali per l’iscrizione dei soci e la gestione delle
              tessere associative.
            </p>
          </div>

          <div className="surface p-6">
            <h3 className="font-medium text-neutral-900">
              Area riservata soci
            </h3>
            <p className="mt-2 text-sm text-neutral-600">
              Accesso controllato a documenti, comunicazioni e dati personali.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
