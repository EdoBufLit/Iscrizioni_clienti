import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchOrganizations, type OrganizationListItem } from "../lib/api";
import { applySeo } from "../lib/seo";

const DEBOUNCE_MS = 280;

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
    <section className="associations-page py-12 md:py-20 min-h-screen" data-reveal="fade-up">
      <div className="container-shell max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="surface-strong overflow-hidden">
          
          <div className="p-6 md:p-10 border-b border-slate-200">
            <div className="max-w-3xl">
              <div className="associations-hero-icon inline-flex items-center justify-center w-12 h-12 rounded-lg bg-brand/10 text-brand mb-5">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Trova la tua associazione</h1>
              <p className="text-lg text-slate-600 max-w-2xl leading-relaxed">
                Cerca l'associazione a cui vuoi iscriverti, consulta i dettagli e procedi con il tesseramento in modo semplice e veloce.
              </p>
            </div>

            <div className="mt-10 max-w-2xl relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <label className="sr-only" htmlFor="search-field">Nome dell'associazione</label>
              <input
                id="search-field"
                className="theme-input block w-full pl-11 pr-12 py-3 text-base placeholder:text-slate-400"
                type="search"
                placeholder="Inserisci il nome dell'associazione..."
                value={search}
                onChange={handleSearch}
              />
              {search && (
                <div className="absolute inset-y-0 right-0 pr-2 flex items-center">
                  <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-lg hover:bg-slate-100" type="button" onClick={() => setSearch("")} aria-label="Azzera filtro">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="p-6 md:p-10">
            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-6 flex items-start gap-4" role="alert">
                <svg className="w-6 h-6 text-red-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <div className="text-red-800 font-medium">{error}</div>
              </div>
            ) : loading ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <div key={index} className="surface overflow-hidden animate-pulse">
                    <div className="h-28 bg-slate-100"></div>
                    <div className="p-6">
                      <div className="h-14 w-14 rounded-lg bg-slate-200 -mt-12 mb-4 border-4 border-white"></div>
                      <div className="h-5 w-3/4 bg-slate-200 rounded mb-3"></div>
                      <div className="h-4 w-full bg-slate-100 rounded mb-2"></div>
                      <div className="h-4 w-4/5 bg-slate-100 rounded mb-6"></div>
                      <div className="flex gap-3">
                         <div className="h-10 w-28 bg-slate-200 rounded-lg"></div>
                         <div className="h-10 w-24 bg-slate-100 rounded-lg"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : orgs.length === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-slate-100 text-slate-400 mb-6">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-2">Nessun risultato</h3>
                <p className="text-slate-600 max-w-md mx-auto mb-8">
                  Nessuna associazione corrisponde alla tua ricerca "{search}". Prova a usare termini diversi.
                </p>
                <button className="btn-secondary px-8" onClick={() => setSearch("")}>
                  Mostra tutte
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-600 mb-6" aria-live="polite">
                  {orgs.length === 1 ? "1 risultato trovato" : `${orgs.length} risultati trovati`}
                </p>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-reveal="stagger">
                  {orgs.map((org) => (
                    <article key={org.slug} className="association-card surface group flex flex-col overflow-hidden hover:border-brand/50 transition-colors" data-reveal-item>
                      <div className="relative h-24 shrink-0 bg-brand/10">
                        
                        {(org.city || org.province) && (
                          <div className="absolute top-4 right-4">
                            <span className="inline-flex items-center rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-slate-800">
                              {org.city}
                              {org.province ? ` (${org.province})` : ""}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <div className="association-card-body flex flex-1 flex-col p-6 relative z-10">
                        <div className="association-logo-plate flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-white border border-slate-200 -mt-12 mb-4 ring-4 ring-white">
                          {org.logo_url ? (
                            <img
                              src={org.logo_url}
                              alt={org.name}
                              loading="lazy"
                              decoding="async"
                              className="h-full w-full object-contain p-2"
                            />
                          ) : (
                            <svg
                              className="association-placeholder-icon h-8 w-8 text-brand/40"
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

                        <h3 className="text-lg font-semibold leading-snug text-slate-900 line-clamp-2">{org.name}</h3>
                        
                        {org.description_short ? (
                          <p className="mt-2 text-base leading-relaxed text-slate-600 line-clamp-3">
                            {org.description_short}
                          </p>
                        ) : (
                          <p className="mt-2 text-sm text-slate-400 italic">Nessuna descrizione disponibile.</p>
                        )}

                        <div className="mt-auto pt-6 flex items-center gap-3">
                          <Link className="btn-primary flex-1 px-4 text-sm" to={`/associazioni/${org.slug}/iscrizione`}>
                            Iscriviti
                          </Link>
                          <Link className="btn-secondary px-4 text-sm" to={`/associazioni/${org.slug}`}>
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
      </div>
    </section>
  );

};

export default Associazioni;
