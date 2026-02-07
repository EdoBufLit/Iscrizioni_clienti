import { FormEvent, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  AuthError,
  fetchSuperAdminMemberDetail,
  type SuperAdminMemberDetail,
  type SuperAdminProfile,
} from "../../lib/api";

const thClass = "text-xs font-medium uppercase tracking-[0.15em] text-neutral-400";
const tdClass = "mt-1.5 text-sm text-neutral-900";

const formatPaymentMethod = (value: string | null | undefined) => {
  if (value === "CASH") return "Contanti";
  if (value === "BONIFICO") return "Bonifico";
  return "—";
};

const SuperAdminMemberDetailPage = () => {
  const navigate = useNavigate();
  const { profile } = useOutletContext<{ profile: SuperAdminProfile | null }>();

  const [memberId, setMemberId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [member, setMember] = useState<SuperAdminMemberDetail | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMember(null);

    const parsedId = Number(memberId);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      setError("Inserisci un ID socio valido.");
      return;
    }

    setLoading(true);
    try {
      const result = await fetchSuperAdminMemberDetail(parsedId);
      setMember(result);
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/super-admin/login", { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "Errore durante il caricamento.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-neutral-900">Dettaglio socio</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Cerca un socio per ID e visualizza i dati di iscrizione.
      </p>

      <div className="surface mt-8 p-6">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleSubmit}>
          <div className="sm:w-56">
            <label htmlFor="member-id" className="block text-xs font-medium text-neutral-600">
              ID socio
            </label>
            <input
              id="member-id"
              type="number"
              min={1}
              className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              placeholder="Es. 42"
            />
          </div>
          <button className="btn-primary" type="submit" disabled={loading || !profile}>
            {loading ? "Ricerca..." : "Apri dettaglio"}
          </button>
        </form>

        {error && (
          <div className="mt-4 rounded-md border border-red-200/60 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>

      {member && (
        <div className="surface mt-6 p-6">
          <h3 className="text-lg font-semibold text-neutral-900">
            {member.first_name} {member.last_name}
          </h3>
          <p className="mt-1 text-sm text-neutral-500">
            Associazione: {member.organization?.name ?? "—"}
          </p>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div>
              <p className={thClass}>Email</p>
              <p className={tdClass}>{member.email || "—"}</p>
            </div>
            <div>
              <p className={thClass}>Telefono</p>
              <p className={tdClass}>{member.phone || "—"}</p>
            </div>
            <div>
              <p className={thClass}>Codice fiscale</p>
              <p className={tdClass}>{member.fiscal_code || "—"}</p>
            </div>
            <div>
              <p className={thClass}>Modalità di pagamento</p>
              <p className={tdClass}>{formatPaymentMethod(member.payment_method)}</p>
            </div>
            <div>
              <p className={thClass}>Stato</p>
              <p className={tdClass}>{member.status || "—"}</p>
            </div>
            <div>
              <p className={thClass}>Tessera</p>
              <p className={tdClass}>{member.card_no ?? "Non assegnata"}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminMemberDetailPage;
