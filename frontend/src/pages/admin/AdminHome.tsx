import { useEffect, useState } from "react";
import Skeleton from "../../components/ui/Skeleton";

const AdminHome = () => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setLoading(false), 1200);
    return () => clearTimeout(id);
  }, []);

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Panoramica</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Stato operativo e riepilogo delle attività in corso.
      </p>

      {loading ? (
        <>
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="surface p-7">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-7 w-10" />
                <Skeleton className="mt-2 h-3 w-28" />
              </div>
            ))}
          </div>
          <div className="mt-8 grid gap-8 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="surface p-7">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-2 h-3 w-full" />
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            <div className="surface p-7">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
                Iscrizioni recenti
              </p>
              <p className="mt-3 text-2xl font-semibold text-neutral-900">12</p>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                Negli ultimi 30 giorni.
              </p>
            </div>

            <div className="surface p-7">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
                Associazioni attive
              </p>
              <p className="mt-3 text-2xl font-semibold text-neutral-900">8</p>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                Affiliate e operative.
              </p>
            </div>

            <div className="surface p-7">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
                Pratiche in corso
              </p>
              <p className="mt-3 text-2xl font-semibold text-neutral-900">3</p>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                In attesa di completamento o verifica.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-8 md:grid-cols-2">
            <div className="surface p-7">
              <p className="text-base font-semibold text-neutral-900">
                Attività recenti
              </p>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                Nessuna attività registrata di recente.
              </p>
            </div>

            <div className="surface p-7">
              <p className="text-base font-semibold text-neutral-900">
                Scadenze prossime
              </p>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                Nessuna scadenza imminente.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminHome;
