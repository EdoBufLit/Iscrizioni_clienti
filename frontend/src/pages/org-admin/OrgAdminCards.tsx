import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchCardStock,
  fetchCardMovements,
  fetchOrgAdminMembers,
  fetchOrgAdminMembershipSettings,
  patchOrgAdminMembershipSettings,
  AuthError,
  type CardStock,
  type CardMovement,
  type OrgAdminMembershipSettings,
} from "../../lib/api";
import { useOrgAdmin } from "./OrgAdminLayout";
import Skeleton from "../../components/ui/Skeleton";

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
    description: "Tessere attive su soci non eliminati/scaduti.",
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

const getStatusBadgeClassName = (statusLabel: string) => {
  if (statusLabel === "Attivo") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (statusLabel === "Disattivo") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (statusLabel === "Esaurito") {
    return "border-neutral-200 bg-neutral-100 text-neutral-600";
  }
  return "border-neutral-200 bg-neutral-50 text-neutral-600";
};

const OrgAdminCards = () => {
  const { admin, loading: adminLoading } = useOrgAdmin();
  const navigate = useNavigate();

  const [stock, setStock] = useState<CardStock | null>(null);
  const [movements, setMovements] = useState<CardMovement[]>([]);
  const [movementsTotal, setMovementsTotal] = useState(0);
  const [movementsYear, setMovementsYear] = useState<number | null>(null);
  const [summaryTotal, setSummaryTotal] = useState(0);
  const [issuedMembersCount, setIssuedMembersCount] = useState(0);
  const [membershipSettings, setMembershipSettings] = useState<OrgAdminMembershipSettings | null>(null);
  const [savingMembershipSettings, setSavingMembershipSettings] = useState(false);
  const [membershipSettingsError, setMembershipSettingsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (adminLoading) return;
    if (!admin) return;

    setLoading(true);
    setError(false);

    Promise.all([
      fetchCardStock(),
      fetchCardMovements(),
      fetchOrgAdminMembershipSettings(),
      fetchOrgAdminMembers({ limit: 1, offset: 0 }),
    ])
      .then(([stockData, movData, settingsData, membersData]) => {
        setStock(stockData);
        setMovements(movData.items);
        setMovementsTotal(movData.total);
        setMovementsYear(movData.current_year ?? null);
        setMembershipSettings(settingsData);
        setSummaryTotal(membersData.summary?.total_theoretical_membership_fees ?? 0);
        setIssuedMembersCount(membersData.summary?.issued_members_count ?? 0);
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

  async function handleMembershipSettingsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setMembershipSettingsError("");
    setSavingMembershipSettings(true);
    try {
      const payload = {
        membership_fee_amount: Number(data.get("membership_fee_amount") || 0) || undefined,
        membership_fee_currency: String(data.get("membership_fee_currency") || "").trim() || undefined,
        temporary_membership_fee_amount: membershipSettings?.custom_membership_types_enabled
          ? Number(data.get("temporary_membership_fee_amount") || 0) || undefined
          : undefined,
        temporary_membership_duration_value: membershipSettings?.custom_membership_types_enabled
          ? Number(data.get("temporary_membership_duration_value") || 0) || undefined
          : undefined,
        temporary_membership_duration_unit: membershipSettings?.custom_membership_types_enabled
          ? (String(data.get("temporary_membership_duration_unit") || "").trim() as "hours" | "days")
          : undefined,
      };
      const response = await patchOrgAdminMembershipSettings(payload);
      setMembershipSettings(response.settings);
      setMembershipSettingsError("");
    } catch (err) {
      setMembershipSettingsError(
        err instanceof Error ? err.message : "Errore aggiornamento impostazioni tessera.",
      );
    } finally {
      setSavingMembershipSettings(false);
    }
  }

  const isLoading = adminLoading || loading;

  return (
    <div className="container-shell py-10" data-tour="admin-cards">
      <h2 className="text-xl font-semibold text-neutral-900">Tessere</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Situazione del magazzino tessere e lotti correnti assegnati da ASSONAM.
      </p>

      <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <div className="space-y-4">
          <div className="px-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-400">
              Riepilogo tessere
            </p>
            <h3 className="mt-2 text-[1.7rem] font-semibold tracking-tight text-neutral-950">
              Riepilogo Tessere
            </h3>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-[1.4rem] border border-neutral-200 bg-white px-5 py-5 shadow-[0_18px_36px_-30px_rgba(15,23,42,0.28)]">
              <p className="text-[0.98rem] font-medium tracking-tight text-neutral-600">
                Totale teorico
              </p>
              <p className="mt-3 text-[clamp(2.6rem,4vw,4rem)] font-black leading-none tracking-[-0.06em] text-brand">
                &euro; {summaryTotal.toFixed(2)}
              </p>
            </div>

            <div className="rounded-[1.4rem] border border-neutral-200 bg-white px-5 py-5 shadow-[0_18px_36px_-30px_rgba(15,23,42,0.28)]">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-[0.98rem] font-medium tracking-tight text-neutral-600">
                    Tessere emesse
                  </p>
                  <p className="mt-3 text-[clamp(2.3rem,3.6vw,3.25rem)] font-semibold leading-none tracking-tight text-neutral-950">
                    {issuedMembersCount}
                  </p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center text-neutral-400">
                  <svg
                    className="h-8 w-8"
                    viewBox="0 0 48 48"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="9" y="12" width="26" height="18" rx="4" />
                    <path d="M14 19h16" />
                    <path d="M14 24h9" />
                    <path d="M18 30.5 31.5 35 39 30.5V19a4 4 0 0 0-4-4h-4" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="px-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-400">
              Configurazione prezzi
            </p>
            <h3 className="mt-2 text-[1.7rem] font-semibold tracking-tight text-neutral-950">
              Impostazioni Tessera
            </h3>
          </div>

          <form
            className="rounded-[1.4rem] border border-neutral-200 bg-white px-5 py-5 shadow-[0_18px_36px_-30px_rgba(15,23,42,0.28)]"
            onSubmit={handleMembershipSettingsSubmit}
          >
            <div className="space-y-6">
              <section>
                <h4 className="text-[1.3rem] font-semibold tracking-tight text-neutral-950">
                  Listino Principale
                </h4>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium tracking-tight text-neutral-700">
                      Prezzo Annuale
                    </span>
                    <input
                      className="mt-2 h-11 w-full rounded-[0.95rem] border border-neutral-300 bg-white px-4 text-[0.98rem] text-neutral-950 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
                      type="number"
                      step="0.01"
                      min="0.01"
                      name="membership_fee_amount"
                      defaultValue={membershipSettings?.membership_fee_amount ?? ""}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium tracking-tight text-neutral-700">
                      Valuta
                    </span>
                    <input
                      className="mt-2 h-11 w-full rounded-[0.95rem] border border-neutral-300 bg-white px-4 text-[0.98rem] uppercase text-neutral-950 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
                      type="text"
                      name="membership_fee_currency"
                      maxLength={8}
                      defaultValue={membershipSettings?.membership_fee_currency ?? "EUR"}
                    />
                  </label>
                </div>
              </section>

              {membershipSettings?.custom_membership_types_enabled ? (
                <section className="border-t border-neutral-200 pt-5">
                  <h4 className="text-[1.3rem] font-semibold tracking-tight text-neutral-950">
                    Regola Tessera Temporanea
                  </h4>
                  <div className="mt-4 space-y-4">
                    <label className="block">
                      <span className="text-sm font-medium tracking-tight text-neutral-700">
                        Prezzo Temporanea
                      </span>
                      <input
                        className="mt-2 h-11 w-full rounded-[0.95rem] border border-neutral-300 bg-white px-4 text-[0.98rem] text-neutral-950 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
                        type="number"
                        step="0.01"
                        min="0.01"
                        name="temporary_membership_fee_amount"
                        defaultValue={membershipSettings?.temporary_membership_fee_amount ?? ""}
                      />
                    </label>
                    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.72fr)]">
                      <label className="block">
                        <span className="text-sm font-medium tracking-tight text-neutral-700">
                          Durata Temporanea
                        </span>
                        <input
                          className="mt-2 h-11 w-full rounded-[0.95rem] border border-neutral-300 bg-white px-4 text-[0.98rem] text-neutral-950 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
                          type="number"
                          min="1"
                          name="temporary_membership_duration_value"
                          defaultValue={membershipSettings?.temporary_membership_duration_value ?? 1}
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium tracking-tight text-neutral-700">
                          Unita
                        </span>
                        <select
                          className="mt-2 h-11 w-full rounded-[0.95rem] border border-neutral-300 bg-white px-4 text-[0.98rem] text-neutral-950 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
                          name="temporary_membership_duration_unit"
                          defaultValue={membershipSettings?.temporary_membership_duration_unit ?? "days"}
                        >
                          <option value="days">Giorni</option>
                          <option value="hours">Ore</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </section>
              ) : null}
            </div>

            {membershipSettingsError ? (
              <p className="mt-4 text-sm text-red-600">{membershipSettingsError}</p>
            ) : null}

            <div className="mt-5 flex justify-end">
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-[0.95rem] bg-brand px-5 text-sm font-semibold text-white shadow-[0_16px_30px_-18px_rgba(15,118,110,0.55)] transition hover:bg-brand/95 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={savingMembershipSettings}
              >
                {savingMembershipSettings ? "Salvataggio..." : "Salva impostazioni"}
              </button>
            </div>
          </form>
        </div>
      </section>

      <div className="mt-4 flex items-start gap-3 rounded-md border border-brand/20 bg-brand/5 px-4 py-3">
        <svg
          className="mt-0.5 h-4 w-4 shrink-0 text-brand"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
        </svg>
        <p className="text-sm leading-6 text-brand-dark">
          Lo stock tessere e i lotti annuali sono gestiti centralmente da
          ASSONAM. Questa sezione mostra solo i lotti correnti con range,
          quantita&apos; e stato.
        </p>
      </div>

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
                Si e&apos; verificato un errore. Ricarica la pagina per riprovare.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {STAT_CARDS.map((card) => {
            const value = stock?.[card.key] ?? 0;
            const exhausted =
              card.key === "remaining" && value === 0 && (stock?.total ?? 0) > 0;
            return (
              <div
                key={card.key}
                className={`surface p-7 ${exhausted ? "border-red-200 bg-red-50" : ""}`}
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                    exhausted ? "bg-red-100" : "bg-brand/10"
                  }`}
                >
                  <svg
                    className={`h-[18px] w-[18px] ${exhausted ? "text-red-500" : "text-brand"}`}
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
                <p
                  className={`mt-3 text-2xl font-semibold tabular-nums ${
                    exhausted ? "text-red-700" : "text-neutral-900"
                  }`}
                >
                  {value}
                </p>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  {card.description}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading &&
        !error &&
        stock != null &&
        stock.remaining === 0 &&
        stock.total > 0 && (
          <div className="mt-6 rounded-lg border border-red-200/60 bg-red-50 px-7 py-5">
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
                <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z" />
                <path d="M12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-red-700">
                  Limite tessere raggiunto
                </p>
                <p className="mt-1 text-sm leading-6 text-red-600">
                  Contatta ASSONAM per richiedere l&apos;estensione del pacchetto
                  tessere.
                </p>
              </div>
            </div>
          </div>
        )}

      {!isLoading && !error && (
        <>
          <h3 className="mt-10 text-lg font-semibold text-neutral-900">
            Movimenti
          </h3>
          <p className="mt-1 text-sm text-neutral-500">
            Lotti assegnati da ASSONAM per l&apos;anno corrente
            {movementsYear ? ` (${movementsYear})` : ""}. Range, quantita&apos; e
            stato si aggiornano automaticamente se ASSONAM modifica o elimina
            un lotto.
          </p>

          {movementsTotal === 0 ? (
            <div className="mt-6 px-7 py-12 text-center rounded-[1.25rem] ring-1 ring-inset ring-slate-200/60 border-dashed bg-slate-50">
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
                Nessun lotto disponibile per l&apos;anno corrente
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                I lotti assegnati da ASSONAM compariranno qui automaticamente.
              </p>
            </div>
          ) : (
            <div className="surface mt-6 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-b border-white/60 bg-white/40">
                    <tr>
                      <th className={thClass}>Data</th>
                      <th className={thClass}>Range</th>
                      <th className={thClass}>Quantita&apos;</th>
                      <th className={thClass}>Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((mv, index) => (
                      <tr
                        key={mv.id}
                        className={`transition hover:bg-brand/[0.02] ${
                          index % 2 === 1 ? "bg-white/30" : ""
                        }`}
                      >
                        <td className={`${tdClass} tabular-nums`}>
                          {mv.created_at
                            ? new Date(mv.created_at).toLocaleDateString("it-IT", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "-"}
                        </td>
                        <td className={`${tdClass} tabular-nums font-medium text-neutral-900`}>
                          {mv.range_start_label ?? mv.range_start} - {mv.range_end_label ?? mv.range_end}
                        </td>
                        <td className={`${tdClass} tabular-nums`}>
                          {mv.quantity}
                        </td>
                        <td className={tdClass}>
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${getStatusBadgeClassName(
                              mv.status_label,
                            )}`}
                          >
                            {mv.status_label}
                          </span>
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
