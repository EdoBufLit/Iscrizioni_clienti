import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchCardStock,
  fetchCardMovements,
  AuthError,
  type CardStock,
  type CardMovement,
} from "../../lib/api";
import { useOrgAdmin } from "./OrgAdminLayout";
import Skeleton from "../../components/ui/Skeleton";

const REASON_LABEL: Record<string, string> = {
  card_assigned: "Tessera assegnata",
  batch_added: "Lotto aggiunto",
};

const STAT_CARDS: {
  key: keyof CardStock;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    key: "total",
    label: "Totale tessere",
    description: "Tessere caricate nei lotti.",
    icon: "M6 6.878V6a2.25 2.25 0 0 1 2.25-2.25h7.5A2.25 2.25 0 0 1 18 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 0 0 4.5 9v.878m13.5-3A2.25 2.25 0 0 1 19.5 9v.878m0 0a2.246 2.246 0 0 0-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0 1 21 12v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6c0-1.244 1.006-2.25 2.25-2.25h13.5",
  },
  {
    key: "used",
    label: "Assegnate",
    description: "Tessere già distribuite ai soci.",
    icon: "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  },
  {
    key: "remaining",
    label: "Disponibili",
    description: "Pronte per nuove assegnazioni.",
    icon: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z",
  },
];

const thClass =
  "px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-400";
const tdClass = "px-5 py-3.5 text-sm text-neutral-700";

const OrgAdminCards = () => {
  const { admin, loading: adminLoading } = useOrgAdmin();
  const navigate = useNavigate();

  const [stock, setStock] = useState<CardStock | null>(null);
  const [movements, setMovements] = useState<CardMovement[]>([]);
  const [movementsTotal, setMovementsTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (adminLoading) return;
    if (!admin) return;

    setLoading(true);
    setError(false);

    Promise.all([fetchCardStock(), fetchCardMovements()])
      .then(([stockData, movData]) => {
        setStock(stockData);
        setMovements(movData.items);
        setMovementsTotal(movData.total);
      })
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/org-admin/login", { replace: true });
        } else {
          setError(true);
        }
      })
      .finally(() => setLoading(false));
  }, [admin, adminLoading, navigate]);

  const isLoading = adminLoading || loading;

  return (
    <div className="container-shell py-10">
      <h2 className="text-xl font-semibold text-neutral-900">Tessere</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Situazione del magazzino tessere e storico movimenti.
      </p>

      {/* Summary cards */}
      {isLoading ? (
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="surface p-7">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="mt-4 h-3 w-24" />
              <Skeleton className="mt-3 h-7 w-12" />
              <Skeleton className="mt-2 h-3 w-32" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="mt-8 rounded-lg border border-red-200/60 bg-red-50 px-7 py-5">
          <div className="flex gap-4">
            <svg
              className="mt-0.5 h-5 w-5 shrink-0 text-red-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-700">
                Impossibile caricare i dati delle tessere
              </p>
              <p className="mt-1 text-sm leading-6 text-red-600">
                Si è verificato un errore. Ricarica la pagina per riprovare.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {STAT_CARDS.map((card) => (
            <div key={card.key} className="surface p-7">
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
              <p className="mt-3 text-2xl font-semibold tabular-nums text-neutral-900">
                {stock?.[card.key] ?? 0}
              </p>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                {card.description}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Movements */}
      {!isLoading && !error && (
        <>
          <h3 className="mt-10 text-lg font-semibold text-neutral-900">
            Movimenti
          </h3>
          <p className="mt-1 text-sm text-neutral-500">
            Storico delle assegnazioni e variazioni tessere.
          </p>

          {movementsTotal === 0 ? (
            <div className="surface mt-6 px-7 py-12 text-center">
              <svg
                className="mx-auto h-10 w-10 text-neutral-300"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              <p className="mt-4 text-sm font-medium text-neutral-700">
                Nessun movimento registrato
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                I movimenti verranno registrati automaticamente con le
                assegnazioni delle tessere.
              </p>
            </div>
          ) : (
            <div className="surface mt-6 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-b border-neutral-100 bg-neutral-25">
                    <tr>
                      <th className={thClass}>Data</th>
                      <th className={thClass}>Descrizione</th>
                      <th className={thClass}>Socio</th>
                      <th className={thClass}>Tessera</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((mv, i) => (
                      <tr
                        key={mv.id}
                        className={`transition hover:bg-brand/[0.02] ${
                          i % 2 === 1 ? "bg-neutral-25" : ""
                        }`}
                      >
                        <td className={`${tdClass} tabular-nums`}>
                          {mv.created_at
                            ? new Date(mv.created_at).toLocaleDateString(
                                "it-IT",
                                {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )
                            : "—"}
                        </td>
                        <td className={tdClass}>
                          {REASON_LABEL[mv.reason] ?? mv.reason}
                        </td>
                        <td className={tdClass}>
                          {mv.member_name ?? "—"}
                        </td>
                        <td className={`${tdClass} tabular-nums`}>
                          {mv.card_no ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default OrgAdminCards;
