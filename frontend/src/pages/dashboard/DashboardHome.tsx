import { useOutletContext } from "react-router-dom";
import Skeleton from "../../components/ui/Skeleton";
import type { DashboardContext } from "./DashboardLayout";

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  active: {
    label: "Attiva",
    color: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  pending_docs: {
    label: "In attesa documenti",
    color: "border-amber-200 bg-amber-50 text-amber-700",
  },
  pending_cards: {
    label: "In attesa tessera",
    color: "border-amber-200 bg-amber-50 text-amber-700",
  },
  pending_verification: {
    label: "In attesa di verifica",
    color: "border-blue-200 bg-blue-50 text-blue-700",
  },
};

const CARDS = [
  {
    key: "status",
    label: "Stato iscrizione",
    icon: "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  },
  {
    key: "card",
    label: "Tessera",
    icon: "M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm-1.875 6.375a3 3 0 0 0-3 3h6a3 3 0 0 0-3-3Z",
  },
  {
    key: "org",
    label: "Associazione",
    icon: "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21",
  },
] as const;

const DashboardHome = () => {
  const { user, loading } = useOutletContext<DashboardContext>();

  const statusInfo = user
    ? STATUS_STYLE[user.status] ?? { label: user.status, color: "border-neutral-200 bg-neutral-50 text-neutral-600" }
    : null;

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Riepilogo</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Panoramica dello stato dell'iscrizione e delle attività recenti.
      </p>

      {loading ? (
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="surface p-7">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="mt-4 h-3 w-20" />
              <Skeleton className="mt-3 h-5 w-36" />
              <Skeleton className="mt-2 h-3 w-full" />
            </div>
          ))}
        </div>
      ) : user ? (
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {CARDS.map((card) => (
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

              {card.key === "status" && (
                <>
                  <div className="mt-3 flex items-center gap-2">
                    <p className="text-base font-semibold text-neutral-900">
                      {statusInfo!.label}
                    </p>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${statusInfo!.color}`}
                    >
                      {user.status === "active" ? "OK" : "IN CORSO"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">
                    {user.status === "active"
                      ? "L'iscrizione è confermata e la tessera è attiva."
                      : user.status === "pending_cards"
                        ? "L'iscrizione è stata approvata. La tessera sarà assegnata a breve."
                        : "La richiesta è stata inoltrata e sarà verificata dallo studio."}
                  </p>
                </>
              )}

              {card.key === "card" && (
                <>
                  <p className="mt-3 text-base font-semibold text-neutral-900">
                    {user.card_no ? `N° ${user.card_no}` : "Non ancora assegnata"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">
                    {user.card_no
                      ? "Numero di tessera associato alla tua iscrizione."
                      : "La tessera sarà assegnata al completamento della pratica."}
                  </p>
                </>
              )}

              {card.key === "org" && (
                <>
                  <p className="mt-3 text-base font-semibold text-neutral-900">
                    {user.organization?.name ?? "—"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">
                    {user.joined_at
                      ? `Iscrizione dal ${new Date(user.joined_at).toLocaleDateString("it-IT")}`
                      : "Data di iscrizione non disponibile."}
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="surface mt-8 p-7">
          <p className="text-sm text-neutral-600">
            Impossibile caricare i dati del profilo.
          </p>
        </div>
      )}
    </div>
  );
};

export default DashboardHome;
