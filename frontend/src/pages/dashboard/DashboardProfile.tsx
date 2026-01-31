import { useOutletContext } from "react-router-dom";
import Skeleton from "../../components/ui/Skeleton";
import type { DashboardContext } from "./DashboardLayout";

const PERSONAL_FIELDS = [
  { key: "first_name", label: "Nome" },
  { key: "last_name", label: "Cognome" },
  { key: "email", label: "Email" },
  { key: "fiscal_code", label: "Codice fiscale" },
  { key: "phone", label: "Telefono" },
] as const;

const DashboardProfile = () => {
  const { user, loading } = useOutletContext<DashboardContext>();

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Profilo</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Dati personali associati all'iscrizione. Per modifiche, contattare lo
        studio.
      </p>

      <div className="surface mt-8 overflow-hidden">
        {/* Card header */}
        <div className="border-b border-neutral-100 bg-neutral-25 px-7 py-4">
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
              <path d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
              Dati personali
            </p>
          </div>
        </div>

        {/* Card body */}
        <div className="p-7">
          {loading ? (
            <div className="grid gap-6 md:grid-cols-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i}>
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="mt-2 h-4 w-40" />
                </div>
              ))}
            </div>
          ) : user ? (
            <div className="grid gap-6 md:grid-cols-2">
              {PERSONAL_FIELDS.map((field) => {
                const value = user[field.key];
                return (
                  <div key={field.key}>
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
                      {field.label}
                    </p>
                    <p className="mt-1.5 text-sm text-neutral-900">
                      {value ?? "—"}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-neutral-600">
              Impossibile caricare i dati del profilo.
            </p>
          )}
        </div>

        {/* Association section */}
        {!loading && user && (
          <>
            <div className="border-t border-neutral-100 bg-neutral-25 px-7 py-4">
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
                  <path d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                </svg>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
                  Associazione
                </p>
              </div>
            </div>
            <div className="p-7">
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
                    Associazione
                  </p>
                  <p className="mt-1.5 text-sm text-neutral-900">
                    {user.organization?.name ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
                    Data iscrizione
                  </p>
                  <p className="mt-1.5 text-sm text-neutral-900">
                    {user.joined_at
                      ? new Date(user.joined_at).toLocaleDateString("it-IT")
                      : "—"}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DashboardProfile;
