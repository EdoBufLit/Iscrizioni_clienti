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
        if (!cancelled) {
          if (err instanceof AuthError) navigate("/org-admin/login", { replace: true });
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

  if (loading) {
    return <Skeleton className="h-96 w-full rounded-[1.75rem]" />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <form className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm" onSubmit={handleSaveSettings}>
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Configurazione Mittente</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Gestisci le informazioni con cui i tuoi soci riceveranno le email.
            </p>
          </div>

          <div className="mt-6 space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>
                  Nome visibile (Mittente)
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
                <p className="mt-2 text-xs text-neutral-500">Es: "Segreteria Associazione"</p>
              </div>
              <div>
                <label className={labelClass}>
                  Parte iniziale dell'email (Local part)
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
                <p className="mt-2 text-xs text-neutral-500">Es: "info" per generare info@dominio.it</p>
              </div>
            </div>

            <div>
              <label className={labelClass}>
                Indirizzo per le risposte (Reply-To)
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
              <p className="mt-2 text-xs text-neutral-500">Se lasciato vuoto, le risposte andranno all'indirizzo mittente.</p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-neutral-100 pt-6">
            <button className="btn-primary py-3 px-6" type="submit" disabled={settingsSaving || communicationsLocked}>
              {communicationsLocked
                ? "Modulo bloccato"
                : settingsSaving
                  ? "Salvataggio in corso..."
                  : settingsSaved
                    ? "Salvato ✓"
                    : "Salva impostazioni"}
            </button>
            <span className="text-sm text-neutral-500">
              Dominio collegato: <strong>{settings?.mail_from_domain || "Non configurato"}</strong>
            </span>
          </div>
        </form>
      </div>

      <div className="space-y-6">
        <div className="rounded-[1.75rem] border border-neutral-200 bg-neutral-50 p-6">
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">Stato del servizio</h3>
          <div className="mt-4">
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                moduleActive
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              {moduleActive ? "Attivo e funzionante" : "Non attivo"}
            </span>
          </div>
          {!moduleActive && (
            <p className="mt-3 text-sm text-neutral-600">
              Contatta ASSONAM per abilitare il modulo comunicazioni e l'invio di email.
            </p>
          )}
        </div>

        <form className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm" onSubmit={handleSendTestEmail}>
          <h3 className="text-sm font-semibold text-neutral-900">Prova l'invio</h3>
          <p className="mt-1 text-sm text-neutral-600">Invia un'email di test per verificare che tutto funzioni.</p>
          
          <div className="mt-4">
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
          </div>
          
          <div className="mt-5">
            <button className="btn-secondary w-full" type="submit" disabled={testSending || communicationsLocked || !testEmail}>
              {testSending ? "Invio in corso..." : "Invia email di test"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
