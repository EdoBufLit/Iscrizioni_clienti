import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchOrganizations, type OrganizationListItem } from "../lib/api";
import Skeleton from "../components/ui/Skeleton";

const inputClass =
  "mt-2 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition focus:border-neutral-300";

const DEBOUNCE_MS = 300;

const COVER_PATTERNS = [
  `radial-gradient(circle at 75% 30%, rgba(255,255,255,0.08) 0%, transparent 50%),
   radial-gradient(ellipse at 20% 80%, rgba(138,152,128,0.3) 0%, transparent 50%),
   linear-gradient(135deg, #1a4068 0%, #1f4b7a 40%, #295c94 100%)`,
  `radial-gradient(circle at 25% 60%, rgba(255,255,255,0.06) 0%, transparent 45%),
   radial-gradient(ellipse at 85% 20%, rgba(41,92,148,0.4) 0%, transparent 45%),
   linear-gradient(160deg, #173557 0%, #1f4b7a 60%, #1a4068 100%)`,
  `radial-gradient(circle at 60% 80%, rgba(255,255,255,0.07) 0%, transparent 40%),
   radial-gradient(ellipse at 10% 20%, rgba(138,152,128,0.25) 0%, transparent 50%),
   linear-gradient(145deg, #1f4b7a 0%, #295c94 50%, #173557 100%)`,
  `radial-gradient(circle at 40% 10%, rgba(255,255,255,0.09) 0%, transparent 55%),
   radial-gradient(ellipse at 90% 70%, rgba(41,92,148,0.35) 0%, transparent 50%),
   linear-gradient(170deg, #173557 0%, #1f4b7a 70%, #1a4068 100%)`,
];

const Associazioni = () => {
  const [search, setSearch] = useState("");
  const [orgs, setOrgs] = useState<OrganizationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

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
    <section className="py-16">
      <div className="container-shell">
        <div className="max-w-3xl">
          <p className="section-title">ASSOCIAZIONI</p>
          <h1 className="section-heading">Trova la tua associazione</h1>
          <p className="section-subtitle">
            Seleziona l'affiliata corretta per avviare l'iscrizione o accedere
            ai servizi dedicati.
          </p>
        </div>

        <div className="surface mt-10 p-7">
          <div className="flex flex-col gap-6 md:flex-row md:items-end">
            <div className="flex-1">
              <label
                htmlFor="search-field"
                className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500"
              >
                Ricerca
              </label>
              <input
                id="search-field"
                className={inputClass}
                type="search"
                placeholder="Nome dell'associazione…"
                value={search}
                onChange={handleSearch}
              />
            </div>
            {search && (
              <button
                className="text-xs font-medium text-neutral-500 transition hover:text-neutral-800"
                type="button"
                onClick={() => setSearch("")}
              >
                Azzera
              </button>
            )}
          </div>
        </div>

        {error ? (
          <div className="surface mt-6 p-7">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : loading ? (
          <div className="mt-6 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="surface-strong overflow-hidden">
                <Skeleton className="h-24 w-full rounded-none" />
                <div className="p-7 pt-5">
                  <Skeleton className="h-9 w-9 rounded-lg" />
                  <Skeleton className="mt-4 h-5 w-48" />
                  <Skeleton className="mt-5 h-8 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : orgs.length === 0 ? (
          <div className="surface mt-6 p-7">
            <h3 className="text-base font-semibold text-neutral-900">
              Nessun risultato
            </h3>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Nessuna associazione corrisponde ai criteri selezionati. Prova a
              modificare la ricerca.
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
              {orgs.length === 1
                ? "1 associazione trovata"
                : `${orgs.length} associazioni trovate`}
            </p>
            <div className="mt-6 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {orgs.map((org, i) => (
                <div
                  key={org.slug}
                  className="surface-strong flex flex-col overflow-hidden transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-px hover:shadow-[0_6px_24px_rgba(15,23,42,0.10)]"
                >
                  {/* Cover pattern */}
                  <div
                    className="relative h-24"
                    style={{
                      background: COVER_PATTERNS[i % COVER_PATTERNS.length],
                    }}
                  >
                    <div
                      className="absolute inset-0 opacity-[0.07]"
                      style={{
                        backgroundImage:
                          "radial-gradient(circle, #fff 1px, transparent 1px)",
                        backgroundSize: "14px 14px",
                      }}
                    />
                    <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white/70" />
                  </div>

                  <div className="flex flex-1 flex-col p-7 pt-5">
                    <div className="flex items-start justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand/10 overflow-hidden">
                        {org.logo_url ? (
                           <img src={org.logo_url} alt={org.name} className="h-full w-full object-contain" />
                        ) : (
                          <svg className="h-6 w-6 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                          </svg>
                        )}
                      </div>
                      {(org.city || org.province) && (
                        <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-800">
                          {org.city}{org.province ? ` (${org.province})` : ""}
                        </span>
                      )}
                    </div>

                    <h3 className="mt-4 text-lg font-semibold text-neutral-900 leading-snug">
                      {org.name}
                    </h3>

                    {org.description_short && (
                       <p className="mt-2 text-sm text-neutral-600 line-clamp-3">
                         {org.description_short}
                       </p>
                    )}

                    <div className="mt-auto flex flex-wrap items-center gap-3 pt-6">
                      <Link
                        className="btn-primary"
                        to={`/associazioni/${org.slug}/iscrizione`}
                      >
                        Diventa Socio
                      </Link>
                      <Link
                        className="link-muted"
                        to={`/associazioni/${org.slug}`}
                      >
                        Dettagli
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default Associazioni;
