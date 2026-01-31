import { useOutletContext } from "react-router-dom";
import Skeleton from "../../components/ui/Skeleton";
import type { DashboardContext } from "./DashboardLayout";

const DashboardProfile = () => {
  const { user, loading } = useOutletContext<DashboardContext>();

  const fields = user
    ? [
        { label: "Nome", value: user.first_name },
        { label: "Cognome", value: user.last_name },
        { label: "Email", value: user.email },
        { label: "Codice fiscale", value: user.fiscal_code ?? "—" },
        { label: "Telefono", value: user.phone ?? "—" },
        { label: "Associazione", value: user.organization?.name ?? "—" },
      ]
    : [];

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Profilo</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Dati personali associati all'iscrizione. Per modifiche, contattare lo
        studio.
      </p>

      <div className="surface mt-8 p-7">
        {loading ? (
          <div className="grid gap-6 md:grid-cols-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i}>
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-2 h-4 w-40" />
              </div>
            ))}
          </div>
        ) : user ? (
          <div className="grid gap-6 md:grid-cols-2">
            {fields.map((field) => (
              <div key={field.label}>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
                  {field.label}
                </p>
                <p className="mt-1.5 text-sm text-neutral-900">
                  {field.value}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-600">
            Impossibile caricare i dati del profilo.
          </p>
        )}
      </div>
    </div>
  );
};

export default DashboardProfile;
