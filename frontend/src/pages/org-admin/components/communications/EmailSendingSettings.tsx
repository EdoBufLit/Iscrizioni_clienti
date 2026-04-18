import { FormEvent, useEffect, useState } from "react";
import {
  AuthError,
  fetchOrgAdminCommunicationSettings,
  putOrgAdminCommunicationSettings,
  sendOrgAdminCommunicationTestEmail,
  type OrgAdminCommunicationSettings,
} from "../../../../lib/api";
import { useToast } from "../../../../components/ui/ToastProvider";
import { useOrgAdmin } from "../../OrgAdminLayout";
import Skeleton from "../../../../components/ui/Skeleton";
import { useNavigate } from "react-router-dom";

type EmailSendingSettingsProps = {
  communicationsLocked: boolean;
};

const inputClass =
  "mt-1 w-full rounded-[1.1rem] border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-neutral-900/40 focus:ring-2 focus:ring-neutral-900/10";
const labelClass = "block text-sm font-medium text-neutral-700";

function normalizeText(value: string | null | undefined): string | null {
  const cleaned = (value || "").trim();
  return cleaned || null;
}

export function EmailSendingSettings({ communicationsLocked }: EmailSendingSettingsProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { admin } = useOrgAdmin();

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<OrgAdminCommunicationSettings | null>(null);
  const [settingsForm, setSettingsForm] = useState({
    sender_email_local_part: "",
    email_from_name_override: "",
    reply_to_email: "",
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchOrgAdminCommunicationSettings()
      .then((settingsData) => {
        if (cancelled) return;
        setSettings(settingsData);
        setSettingsForm({
          sender_email_local_part: settingsData.sender_email_local_part || "",
          email_from_name_override: settingsData.email_from_name_override || "",
          reply_to_email: settingsData.reply_to_email || "",
        });
      })
      .catch((err) => {
        if (!cancelled && err instanceof AuthError) {
          navigate("/org-admin/login", { replace: true });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (settingsSaving || communicationsLocked) return;
    setSettingsSaving(true);
    setSettingsSaved(false);

    try {
      const response = await putOrgAdminCommunicationSettings({
        sender_email_local_part: normalizeText(settingsForm.sender_email_local_part),
        email_from_name_override: normalizeText(settingsForm.email_from_name_override),
        reply_to_email: normalizeText(settingsForm.reply_to_email),
      });
      setSettings(response.settings);
      setSettingsForm({
        sender_email_local_part: response.settings.sender_email_local_part || "",
        email_from_name_override: response.settings.email_from_name_override || "",
        reply_to_email: response.settings.reply_to_email || "",
      });
      setSettingsSaved(true);
      showToast({ title: "Impostazioni aggiornate", message: "La configurazione è stata salvata.", tone: "success" });
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
      showToast({
        title: "Errore salvataggio",
        message: err instanceof Error ? err.message : "Errore durante il salvataggio.",
        tone: "error",
      });
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleSendTestEmail = async (e: FormEvent) => {
    e.preventDefault();
    if (testSending || communicationsLocked || !testEmail) return;
    setTestSending(true);
    try {
      const response = await sendOrgAdminCommunicationTestEmail(testEmail);
      showToast({ title: "Email inviata", message: response.message, tone: "success" });
      setTestEmail("");
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
      showToast({
        title: "Errore invio",
        message: err instanceof Error ? err.message : "Impossibile inviare il test.",
        tone: "error",
      });
    } finally {
      setTestSending(false);
    }
  };

  const moduleActive = Boolean(settings?.communications_enabled);
  const effectiveSenderName = settingsForm.email_from_name_override.trim() || admin?.organization?.name || "ASSONAM";
  const effectiveLocalPart = settingsForm.sender_email_local_part.trim() || settings?.sender_email_local_part || `org-${admin?.organization?.id || "x"}`;
  const effectiveDomain = settings?.mail_from_domain || null;
  const effectiveSenderAddress = effectiveDomain
    ? `${effectiveLocalPart}@${effectiveDomain}`
    : settings?.system_email_sender?.from_email || "noreply@assonam.it";
  const effectiveReplyTo = settingsForm.reply_to_email.trim() || settings?.reply_to_email || effectiveSenderAddress;

  if (loading) {
    return <Skeleton className="h-96 w-full rounded-[1.75rem]" />;
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <form className="rounded-[1.25rem] bg-white p-8 shadow-sm ring-1 ring-inset ring-slate-200/60" onSubmit={handleSaveSettings}>
          <div className="mb-8 border-b border-slate-100 pb-6">
            <h2 className="text-2xl font-light tracking-tight text-slate-900">Mittente email</h2>
            <p className="mt-2 text-sm text-slate-500">
              Definisci come comparirà il mittente delle comunicazioni inviate dall'associazione.
            </p>
          </div>

          <div className="space-y-8">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label className={labelClass}>
                  Nome mittente
                  <input
                    className={inputClass}
                    disabled={communicationsLocked}
                    value={settingsForm.email_from_name_override}
                    onChange={(e) => {
                      setSettingsSaved(false);
                      setSettingsForm((prev) => ({ ...prev, email_from_name_override: e.target.value }));
                    }}
                    placeholder={admin?.organization?.name || "Il nome della tua associazione"}
                  />
                </label>
                <p className="mt-2 text-[11px] text-slate-500">Esempio: "Segreteria Associazione"</p>
              </div>

              <div>
                <label className={labelClass}>
                  Indirizzo mittente
                  <input
                    className={inputClass}
                    disabled={communicationsLocked}
                    value={settingsForm.sender_email_local_part}
                    onChange={(e) => {
                      setSettingsSaved(false);
                      setSettingsForm((prev) => ({ ...prev, sender_email_local_part: e.target.value }));
                    }}
                    placeholder="info"
                  />
                </label>
                <p className="mt-2 text-[11px] text-slate-500">
                  Inserisci solo la parte prima di @. Esempio: "info" per ottenere info@dominio.it.
                </p>
              </div>
            </div>

            <div>
              <label className={labelClass}>
                Email per le risposte
                <input
                  className={inputClass}
                  type="email"
                  disabled={communicationsLocked}
                  value={settingsForm.reply_to_email}
                  onChange={(e) => {
                    setSettingsSaved(false);
                    setSettingsForm((prev) => ({ ...prev, reply_to_email: e.target.value }));
                  }}
                  placeholder="segreteria@associazione.it"
                />
              </label>
              <p className="mt-2 text-[11px] text-slate-500">
                Se lasciato vuoto, le risposte andranno allo stesso indirizzo mittente.
              </p>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-6 border-t border-slate-100 pt-8">
            <button className="btn-primary !rounded-full px-8 py-3.5 text-sm font-medium" type="submit" disabled={settingsSaving || communicationsLocked}>
              {communicationsLocked
                ? "Modulo bloccato"
                : settingsSaving
                  ? "Salvataggio in corso..."
                  : settingsSaved
                    ? "Salvato ✓"
                    : "Salva impostazioni"}
            </button>
            <span className="text-sm text-slate-500">
              Dominio collegato: <strong>{settings?.mail_from_domain || "Non configurato"}</strong>
            </span>
          </div>
        </form>
      </div>

      <div className="space-y-6">
        <div className="rounded-[1.25rem] bg-slate-50 p-8 ring-1 ring-inset ring-slate-200/60">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Stato del servizio</h3>
          <div className="mt-4">
            <span
              className={`inline-flex rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] ${
                moduleActive
                  ? "bg-emerald-100/50 text-emerald-700 ring-1 ring-inset ring-emerald-500/20"
                  : "bg-amber-100/50 text-amber-700 ring-1 ring-inset ring-amber-500/20"
              }`}
            >
              {moduleActive ? "Attivo e funzionante" : "Non attivo"}
            </span>
          </div>
          {!moduleActive ? (
            <p className="mt-4 text-sm leading-relaxed text-slate-600">
              Contatta ASSONAM per abilitare il modulo comunicazioni e l'invio di email.
            </p>
          ) : null}
        </div>

        <div className="rounded-[1.25rem] bg-white p-8 shadow-sm ring-1 ring-inset ring-slate-200/60">
          <h3 className="text-lg font-medium text-slate-900">Anteprima mittente</h3>
          <div className="mt-5 space-y-4 rounded-[1.1rem] bg-slate-50 p-5 ring-1 ring-inset ring-slate-200/60">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Da</p>
              <p className="mt-2 break-all text-sm font-medium text-slate-900">
                {effectiveSenderName} &lt;{effectiveSenderAddress}&gt;
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Rispondi a</p>
              <p className="mt-2 break-all text-sm font-medium text-slate-900">{effectiveReplyTo}</p>
            </div>
          </div>
        </div>

        <form className="rounded-[1.25rem] bg-white p-8 shadow-sm ring-1 ring-inset ring-slate-200/60" onSubmit={handleSendTestEmail}>
          <h3 className="text-lg font-medium text-slate-900">Prova l'invio</h3>
          <p className="mb-6 mt-2 text-sm text-slate-500">Invia un'email di test per verificare che tutto funzioni.</p>

          <div className="space-y-6">
            <label className={labelClass}>
              Email di destinazione
              <input
                className={inputClass}
                type="email"
                disabled={communicationsLocked}
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="tua-email@esempio.it"
                required
              />
            </label>

            <button className="btn-secondary w-full !rounded-full py-3" type="submit" disabled={testSending || communicationsLocked || !testEmail}>
              {testSending ? "Invio in corso..." : "Invia email di test"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
