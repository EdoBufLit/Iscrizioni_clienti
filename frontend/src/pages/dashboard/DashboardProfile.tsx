import { FormEvent, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import Skeleton from "../../components/ui/Skeleton";
import {
  cancelMemberContactChange,
  changePassword,
  fetchMemberContactChanges,
  requestMemberContactChange,
  resendMemberContactChange,
  type MemberContactChange,
} from "../../lib/api";
import type { DashboardContext } from "./DashboardLayout";

const PERSONAL_FIELDS = [
  { key: "first_name", label: "Nome" },
  { key: "last_name", label: "Cognome" },
  { key: "email", label: "Email" },
  { key: "fiscal_code", label: "Codice fiscale" },
  { key: "phone", label: "Telefono" },
] as const;

const DashboardProfile = () => {
  const { user, loading, reloadProfile } = useOutletContext<DashboardContext>();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Il Tuo Profilo</h1>
        <p className="mt-1 text-sm font-medium text-neutral-500">
          Visualizza i tuoi dati anagrafici e gestisci la sicurezza dell'account.
        </p>
      </div>

      <div className="surface overflow-hidden border-neutral-200/60 shadow-premium-lg">
        {/* Card header */}
        <div className="border-b border-neutral-100 bg-neutral-50/50 px-7 py-5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-brand/5 text-brand flex items-center justify-center border border-brand/10">
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400">
              Dati Anagrafici
            </p>
          </div>
        </div>

        {/* Card body */}
        <div className="p-8">
          {loading ? (
            <div className="grid gap-8 md:grid-cols-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i}>
                  <Skeleton className="h-3 w-20 rounded" />
                  <Skeleton className="mt-2.5 h-5 w-48 rounded" />
                </div>
              ))}
            </div>
          ) : user ? (
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {PERSONAL_FIELDS.map((field) => {
                const value = user[field.key];
                return (
                  <div key={field.key} className="group">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 group-hover:text-neutral-500 transition-colors">
                      {field.label}
                    </p>
                    <p className="mt-1.5 text-base font-bold text-neutral-900">
                      {value ?? "—"}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="text-sm font-bold text-red-500 uppercase tracking-widest">
                Errore sincronizzazione dati
              </p>
            </div>
          )}
        </div>

        {/* Association section */}
        {!loading && user && (
          <>
            <div className="border-t border-neutral-100 bg-neutral-50/50 px-7 py-5">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center border border-accent/20">
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                  </svg>
                </div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400">
                  Sede Associativa
                </p>
              </div>
            </div>
            <div className="p-8">
              <div className="grid gap-8 md:grid-cols-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                    Denominazione Sede
                  </p>
                  <p className="mt-1.5 text-base font-bold text-neutral-900 group-hover:text-brand transition-colors">
                    {user.organization?.name ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                    Data Iscrizione Ufficiale
                  </p>
                  <p className="mt-1.5 text-base font-bold text-neutral-900 tabular-nums">
                    {user.joined_at
                      ? new Date(user.joined_at).toLocaleDateString("it-IT", { day: 'numeric', month: 'long', year: 'numeric' })
                      : "—"}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {!loading && user ? (
        <ContactChangeSection
          email={user.email}
          phone={user.phone}
          reloadProfile={reloadProfile}
        />
      ) : null}

      {/* Password section */}
      {!loading && user && <ChangePasswordSection />}
    </div>
  );
};

const ContactChangeSection = ({
  email,
  phone,
  reloadProfile,
}: {
  email: string;
  phone: string | null;
  reloadProfile: () => Promise<void>;
}) => {
  const [field, setField] = useState<"email" | "phone">("email");
  const [value, setValue] = useState("");
  const [items, setItems] = useState<MemberContactChange[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setItems(await fetchMemberContactChanges());
    } catch {
      // The profile remains usable if the request history is temporarily unavailable.
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await requestMemberContactChange(field, value.trim());
      setValue("");
      setMessage(
        field === "email"
          ? "Controlla il nuovo indirizzo email e conferma dal link ricevuto."
          : "Controlla l'email attuale e conferma il nuovo numero dal link ricevuto.",
      );
      await load();
      await reloadProfile();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Richiesta non riuscita");
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: "resend" | "cancel", id: number) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (action === "resend") {
        await resendMemberContactChange(id);
        setMessage("Email di conferma inviata nuovamente.");
      } else {
        await cancelMemberContactChange(id);
        setMessage("Richiesta annullata.");
      }
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Operazione non riuscita");
    } finally {
      setBusy(false);
    }
  };

  const pending = items.filter((item) => item.status === "pending" || item.status === "expired");

  return (
    <section className="surface overflow-hidden border-neutral-200/60 shadow-premium-lg" aria-labelledby="contacts-heading">
      <div className="border-b border-neutral-100 bg-neutral-50/50 px-7 py-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400">Contatti verificati</p>
        <h2 id="contacts-heading" className="mt-1 text-lg font-bold text-neutral-950">Modifica email o telefono</h2>
      </div>
      <div className="grid gap-7 p-7 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
        <form className="space-y-4" onSubmit={submit}>
          <p className="text-sm leading-6 text-neutral-600">Il dato attuale non cambia finché non confermi il link monouso ricevuto via email.</p>
          <fieldset className="flex gap-2" disabled={busy}>
            <legend className="sr-only">Contatto da modificare</legend>
            <button type="button" aria-pressed={field === "email"} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${field === "email" ? "border-brand bg-brand/5 text-brand" : "border-neutral-200 text-neutral-600"}`} onClick={() => { setField("email"); setValue(""); }}>Email</button>
            <button type="button" aria-pressed={field === "phone"} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${field === "phone" ? "border-brand bg-brand/5 text-brand" : "border-neutral-200 text-neutral-600"}`} onClick={() => { setField("phone"); setValue(""); }}>Telefono</button>
          </fieldset>
          <div>
            <label className="text-sm font-semibold text-neutral-800" htmlFor="new-contact-value">Nuovo {field === "email" ? "indirizzo email" : "numero di telefono"}</label>
            <input id="new-contact-value" className="premium-select mt-1 w-full !bg-white !px-4 !py-3" type={field === "email" ? "email" : "tel"} autoComplete={field === "email" ? "email" : "tel"} value={value} placeholder={field === "email" ? email : phone || "+39…"} onChange={(event) => setValue(event.target.value)} required />
          </div>
          {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{message}</p> : null}
          {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
          <button className="btn-primary px-5 py-3 text-sm" disabled={busy || !value.trim()} type="submit">{busy ? "Invio…" : "Invia conferma"}</button>
        </form>
        <div>
          <h3 className="text-sm font-bold text-neutral-900">Richieste recenti</h3>
          {pending.length ? <ul className="mt-3 space-y-3">{pending.map((item) => <li className="rounded-xl border border-neutral-200 p-3" key={item.id}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-neutral-900">{item.field === "email" ? "Email" : "Telefono"}: {item.masked_new_value}</p><p className="mt-1 text-xs text-neutral-500">{item.status === "expired" ? "Link scaduto" : `Scade il ${item.expires_at ? new Date(item.expires_at).toLocaleString("it-IT") : "-"}`}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${item.status === "expired" ? "bg-neutral-100 text-neutral-600" : "bg-amber-50 text-amber-800"}`}>{item.status === "expired" ? "Scaduta" : "Da confermare"}</span></div><div className="mt-3 flex gap-3"><button className="text-xs font-semibold text-brand hover:underline" type="button" disabled={busy} onClick={() => void act("resend", item.id)}>Reinvia</button>{item.status === "pending" ? <button className="text-xs font-semibold text-red-700 hover:underline" type="button" disabled={busy} onClick={() => void act("cancel", item.id)}>Annulla</button> : null}</div></li>)}</ul> : <p className="mt-3 text-sm text-neutral-500">Nessuna modifica in attesa.</p>}
        </div>
      </div>
    </section>
  );
};

const ChangePasswordSection = () => {
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const canSubmit = newPw.length >= 8 && newPw === confirmPw && !submitting;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      await changePassword(newPw);
      setSuccess("Password aggiornata con successo.");
      setNewPw("");
      setConfirmPw("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel cambio password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="surface overflow-hidden border-neutral-200/60 shadow-premium-lg">
      <div className="border-b border-neutral-100 bg-neutral-50/50 px-7 py-5">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-neutral-100 text-neutral-500 flex items-center justify-center border border-neutral-200">
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400">
            Sicurezza Account
          </p>
        </div>
      </div>
      <div className="p-8">
        <p className="text-sm font-medium text-neutral-500 max-w-md leading-relaxed">
          Aggiorna regolarmente la tua password per garantire la massima protezione del tuo profilo digitale.
        </p>

        {success && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3 animate-in slide-in-from-top-2">
            <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            <p className="text-sm font-bold text-emerald-900">{success}</p>
          </div>
        )}
        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 flex items-center gap-3 animate-in slide-in-from-top-2">
            <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <p className="text-sm font-bold text-red-900">{error}</p>
          </div>
        )}

        <form className="mt-8 grid gap-6 sm:grid-cols-2" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label htmlFor="new-pw" className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 ml-1">
              Nuova password
            </label>
            <input
              id="new-pw"
              className="premium-select w-full !px-4 !py-3 !font-bold tracking-tight !bg-white focus:!ring-brand/5"
              type="password"
              autoComplete="new-password"
              placeholder="Minimo 8 caratteri"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="confirm-pw" className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 ml-1">
              Conferma password
            </label>
            <input
              id="confirm-pw"
              className={`premium-select w-full !px-4 !py-3 !font-bold tracking-tight focus:!ring-brand/5 ${
                confirmPw && confirmPw !== newPw
                  ? "!border-red-300 !bg-red-50/30 focus:!border-red-400"
                  : "!border-neutral-200 !bg-white"
              }`}
              type="password"
              autoComplete="new-password"
              placeholder="Ripeti la password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2 pt-2">
            <button
              className="btn-primary w-full sm:w-auto min-w-[200px] !py-3 !text-xs font-bold uppercase tracking-widest shadow-xl disabled:opacity-30 disabled:translate-y-0"
              type="submit"
              disabled={!canSubmit}
            >
              {submitting ? "Salvataggio in corso..." : "Aggiorna Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DashboardProfile;
