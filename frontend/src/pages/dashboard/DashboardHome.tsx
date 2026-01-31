import { useOutletContext } from "react-router-dom";
import Skeleton from "../../components/ui/Skeleton";
import type { DashboardContext } from "./DashboardLayout";

const STATUS_LABELS: Record<string, string> = {
  active: "Attiva",
  pending_docs: "In attesa documenti",
  pending_cards: "In attesa tessera",
  pending_verification: "In attesa di verifica",
};

const DashboardHome = () => {
  const { user, loading } = useOutletContext<DashboardContext>();

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Riepilogo</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Panoramica dello stato dell'iscrizione e delle attività recenti.
      </p>

      {loading ? (
        <div className="mt-8 grid gap-8 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="surface p-7">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-5 w-36" />
              <Skeleton className="mt-2 h-3 w-full" />
            </div>
          ))}
        </div>
      ) : user ? (
        <div className="mt-8 grid gap-8 md:grid-cols-3">
          <div className="surface p-7">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
              Stato tessera
            </p>
            <p className="mt-3 text-base font-semibold text-neutral-900">
              {STATUS_LABELS[user.status] ?? user.status}
            </p>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              {user.status === "active"
                ? "L'iscrizione è confermata e la tessera è attiva."
                : "La richiesta è stata inoltrata e sarà verificata dallo studio."}
            </p>
          </div>

          <div className="surface p-7">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
              Tessera
            </p>
            <p className="mt-3 text-base font-semibold text-neutral-900">
              {user.card_no ? `N° ${user.card_no}` : "Non ancora assegnata"}
            </p>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              {user.card_no
                ? "Numero di tessera associato alla tua iscrizione."
                : "La tessera sarà assegnata al completamento della pratica."}
            </p>
          </div>

          <div className="surface p-7">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
              Associazione
            </p>
            <p className="mt-3 text-base font-semibold text-neutral-900">
              {user.organization?.name ?? "—"}
            </p>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              {user.joined_at
                ? `Iscrizione dal ${new Date(user.joined_at).toLocaleDateString("it-IT")}`
                : "Data di iscrizione non disponibile."}
            </p>
          </div>
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
