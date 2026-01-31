import { useEffect, useState } from "react";
import Skeleton from "../../components/ui/Skeleton";

const STAT_CARDS = [
  {
    label: "Iscrizioni recenti",
    value: "12",
    description: "Negli ultimi 30 giorni.",
    icon: "M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM4 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 10.374 21c-2.331 0-4.512-.645-6.374-1.766Z",
  },
  {
    label: "Associazioni attive",
    value: "8",
    description: "Affiliate e operative.",
    icon: "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21",
  },
  {
    label: "Pratiche in corso",
    value: "3",
    description: "In attesa di completamento o verifica.",
    icon: "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  },
];

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
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="surface p-7">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="mt-4 h-3 w-24" />
                <Skeleton className="mt-3 h-7 w-10" />
                <Skeleton className="mt-2 h-3 w-28" />
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
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
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {STAT_CARDS.map((card) => (
              <div key={card.label} className="surface p-7">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10">
                  <svg
                    className="h-[18px] w-[18px] text-brand"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={card.icon} />
                  </svg>
                </div>
                <p className="mt-4 text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
                  {card.label}
                </p>
                <p className="mt-3 text-2xl font-semibold text-neutral-900">
                  {card.value}
                </p>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  {card.description}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="surface overflow-hidden">
              <div className="border-b border-white/60 bg-white/40 px-7 py-4">
                <div className="flex items-center gap-2.5">
                  <svg
                    className="h-4 w-4 text-neutral-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
                    Attività recenti
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-center px-7 py-10 text-center">
                <p className="text-sm text-neutral-500">
                  Nessuna attività registrata di recente.
                </p>
              </div>
            </div>

            <div className="surface overflow-hidden">
              <div className="border-b border-white/60 bg-white/40 px-7 py-4">
                <div className="flex items-center gap-2.5">
                  <svg
                    className="h-4 w-4 text-neutral-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                  </svg>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
                    Scadenze prossime
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-center px-7 py-10 text-center">
                <p className="text-sm text-neutral-500">
                  Nessuna scadenza imminente.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminHome;
