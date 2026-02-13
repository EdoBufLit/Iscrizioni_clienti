import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchOrganizations, type OrganizationListItem } from "../lib/api";
import { applySeo } from "../lib/seo";
import Skeleton from "../components/ui/Skeleton";

const DEBOUNCE_MS = 280;

const COVER_PATTERNS = [
  `radial-gradient(circle at 78% 28%, rgba(255,255,255,0.10) 0%, transparent 54%),
   radial-gradient(ellipse at 18% 80%, rgba(210,176,113,0.28) 0%, transparent 50%),
   linear-gradient(145deg, #16383f 0%, #1f5e63 52%, #194a50 100%)`,
  `radial-gradient(circle at 26% 62%, rgba(255,255,255,0.08) 0%, transparent 50%),
   radial-gradient(ellipse at 84% 22%, rgba(31,94,99,0.42) 0%, transparent 46%),
   linear-gradient(160deg, #133238 0%, #1f5358 58%, #173d42 100%)`,
  `radial-gradient(circle at 62% 84%, rgba(255,255,255,0.09) 0%, transparent 44%),
   radial-gradient(ellipse at 14% 20%, rgba(210,176,113,0.24) 0%, transparent 52%),
   linear-gradient(150deg, #1a4248 0%, #245d64 48%, #17393d 100%)`,
];

const Associazioni = () => {
  const [search, setSearch] = useState("");
  const [orgs, setOrgs] = useState<OrganizationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    applySeo({
      title: "Associazioni affiliate",
      description:
        "Elenco associazioni affiliate ad ASSONAM. Trova la tua associazione e avvia l'iscrizione online.",
      canonicalPath: "/associazioni",
    });
  }, []);

  useEffect(() => {
    clearTimeout(timerRef.current);
    const delay = search ? DEBOUNCE_MS : 0;
    timerRef.current = setTimeout(() => {
      setError("");
      setLoading(true);
      fetchOrganizations(search || undefined)
        .then(setOrgs)
        .catch(() => setError("Errore nel caricamento delle associazioni."))
        .finally(() => setLoading(false));
    }, delay);
    return () => clearTimeout(timerRef.current);
  }, [search]);

  const handleSearch = (event: ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
  };

  return (
    <section className="py-16" data-reveal="fade-up">
      <div className="container-shell">
        <div className="surface-strong p-8 md:p-10">
          <div className="max-w-3xl">
            <p className="section-title">Affiliazioni</p>
            <h1 className="section-heading">Trova la tua associazione</h1>
            <p className="section-subtitle">
              Seleziona l'affiliata corretta per avviare iscrizione, consultare dettagli e
              procedere in modo guidato.
            </p>
          </div>

          <div className="surface mt-8 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="flex-1">
                <label
                  htmlFor="search-field"
                  className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500"
                >
                  Ricerca associazione
                </label>
                <input
                  id="search-field"
                  className="mt-2 w-full px-4 py-2.5 text-sm"
                  type="search"
                  placeholder="Inserisci nome associazione..."
                  value={search}
                  onChange={handleSearch}
                />
              </div>
              {search && (
                <button className="btn-ghost px-4 py-2 text-sm" type="button" onClick={() => setSearch("")}>
                  Azzera filtro
                </button>
              )}
            </div>
          </div>

          {error ? (
            <div className="surface mt-6 p-6">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          ) : loading ? (
            <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <div key={index} className="surface overflow-hidden">
                  <Skeleton className="h-24 w-full rounded-none" />
                  <div className="p-6">
                    <Skeleton className="h-10 w-10 rounded-xl" />
                    <Skeleton className="mt-4 h-5 w-44" />
                    <Skeleton className="mt-3 h-4 w-full" />
                    <Skeleton className="mt-2 h-4 w-4/5" />
                    <Skeleton className="mt-6 h-9 w-32 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : orgs.length === 0 ? (
            <div className="surface mt-6 p-6">
              <h3 className="text-base font-semibold text-neutral-900">Nessun risultato</h3>
              <p className="mt-2 text-sm leading-7 text-neutral-600">
                Nessuna associazione corrisponde al filtro attuale. Prova con un nome differente.
              </p>
              <div className="mt-5">
                <Link className="btn-ghost" to="/">
                  Torna alla home
                </Link>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-6 text-sm text-neutral-500">
                {orgs.length === 1 ? "1 associazione trovata" : `${orgs.length} associazioni trovate`}
              </p>
              <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3" data-reveal="stagger">
                {orgs.map((org, index) => (
                  <article key={org.slug} className="surface flex flex-col overflow-hidden" data-reveal-item>
                    <div
                      className="relative h-24"
                      style={{ background: COVER_PATTERNS[index % COVER_PATTERNS.length] }}
                    >
                      <div className="absolute inset-0 opacity-[0.08] [background-image:radial-gradient(circle,_#fff_1px,_transparent_1px)] [background-size:13px_13px]" />
                    </div>
                    <div className="flex flex-1 flex-col p-6">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-brand/10">
                          {org.logo_url ? (
                            <img
                              src={org.logo_url}
                              alt={org.name}
                              loading="lazy"
                              decoding="async"
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <svg
                              className="h-6 w-6 text-brand"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.5}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                            </svg>
                          )}
                        </div>
                        {(org.city || org.province) && (
                          <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-700">
                            {org.city}
                            {org.province ? ` (${org.province})` : ""}
                          </span>
                        )}
                      </div>

                      <h3 className="mt-4 text-lg font-semibold leading-snug text-neutral-900">{org.name}</h3>
                      {org.description_short && (
                        <p className="mt-2 text-sm leading-7 text-neutral-600 line-clamp-2">
                          {org.description_short}
                        </p>
                      )}

                      <div className="mt-auto flex flex-wrap items-center gap-3 pt-6">
                        <Link className="btn-primary" to={`/associazioni/${org.slug}/iscrizione`}>
                          Diventa socio
                        </Link>
                        <Link className="btn-ghost px-4 py-2" to={`/associazioni/${org.slug}`}>
                          Dettagli
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
};

export default Associazioni;
