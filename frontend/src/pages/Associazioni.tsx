import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchOrganizations, type Organization } from "../lib/api";
import Skeleton from "../components/ui/Skeleton";

const inputClass =
  "mt-2 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition focus:border-neutral-300";

const DEBOUNCE_MS = 300;

const Associazioni = () => {
  const [search, setSearch] = useState("");
  const [orgs, setOrgs] = useState<Organization[]>([]);
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
              <div key={i} className="surface p-7">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="mt-5 h-8 w-24" />
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
              {orgs.map((org) => (
                <div
                  key={org.slug}
                  className="surface flex flex-col overflow-hidden transition-[border-color,box-shadow] duration-150 hover:border-neutral-200 hover:shadow-[0_2px_6px_rgba(15,23,42,0.1)]"
                >
                  <div className="h-1 bg-gradient-to-r from-brand to-brand-dark" />
                  <div className="flex flex-1 flex-col p-7">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10">
                      <svg className="h-[18px] w-[18px] text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                      </svg>
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-neutral-900">
                      {org.name}
                    </h3>
                    <div className="mt-auto flex items-center gap-3 pt-5">
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
