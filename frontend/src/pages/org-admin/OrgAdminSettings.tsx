import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchOrgAdminOrganization,
  patchOrgAdminOrganization,
  uploadOrgAdminStatute,
  uploadOrgAdminWalletAssets,
  AuthError,
  type OrgAdminOrganizationDetail,
} from "../../lib/api";
import Skeleton from "../../components/ui/Skeleton";

const inputClass =
  "mt-1 w-full rounded-md border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";
const labelClass = "block text-sm font-medium text-neutral-700";

const OrgAdminSettings = () => {
  const navigate = useNavigate();
  const [org, setOrg] = useState<OrgAdminOrganizationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Form state
  const [form, setForm] = useState({
    name: "",
    description: "",
    city: "",
    province: "",
    email: "",
    phone: "",
    website: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveError, setSaveError] = useState("");

  // Statute upload
  const [statuteFile, setStatuteFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [uploadError, setUploadError] = useState("");

  // Google Wallet branding
  const [walletForm, setWalletForm] = useState({
    wallet_bg_color: "#0B3C75",
    wallet_title_override: "",
    wallet_is_test_prefix: false,
  });
  const [walletSaving, setWalletSaving] = useState(false);
  const [walletSaveMsg, setWalletSaveMsg] = useState("");
  const [walletSaveError, setWalletSaveError] = useState("");
  const [walletLogoFile, setWalletLogoFile] = useState<File | null>(null);
  const [walletHeroFile, setWalletHeroFile] = useState<File | null>(null);
  const [walletAssetsUploading, setWalletAssetsUploading] = useState(false);
  const [walletAssetsMsg, setWalletAssetsMsg] = useState("");
  const [walletAssetsError, setWalletAssetsError] = useState("");

  useEffect(() => {
    fetchOrgAdminOrganization()
      .then((data) => {
        setOrg(data);
        setForm({
          name: data.name || "",
          description: data.description || "",
          city: data.city || "",
          province: data.province || "",
          email: data.email || "",
          phone: data.phone || "",
          website: data.website || "",
        });
        setWalletForm({
          wallet_bg_color: data.wallet_bg_color || data.wallet_effective_bg_color || "#0B3C75",
          wallet_title_override:
            data.wallet_title_override || data.wallet_effective_title_override || "",
          wallet_is_test_prefix: Boolean(data.wallet_is_test_prefix),
        });
      })
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/org-admin/login", { replace: true });
        } else {
          setError("Impossibile caricare i dati dell'associazione.");
        }
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleChange =
    (field: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveMsg("");
    setSaveError("");
    try {
      await patchOrgAdminOrganization(form);
      setSaveMsg("Dati aggiornati correttamente.");
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
      } else {
        setSaveError("Errore nel salvataggio.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleStatuteUpload = async () => {
    if (!statuteFile || uploading) return;

    const hasPdfExtension = statuteFile.name.toLowerCase().endsWith(".pdf");
    const hasPdfMime = !statuteFile.type || statuteFile.type === "application/pdf";
    if (!hasPdfExtension || !hasPdfMime) {
      setUploadMsg("");
      setUploadError("Formato non valido: carica un PDF.");
      return;
    }
    if (statuteFile.size > 10 * 1024 * 1024) {
      setUploadMsg("");
      setUploadError("File troppo grande (max 10 MB).");
      return;
    }

    setUploading(true);
    setUploadMsg("");
    setUploadError("");
    try {
      const result = await uploadOrgAdminStatute(statuteFile);
      setOrg((prev) =>
        prev
          ? {
              ...prev,
              statute_version: result.statute_version,
              statute_updated_at: result.updated_at,
              statute_url: `/api/organizations/${prev.slug}/statute`,
              has_statute: true,
            }
          : prev,
      );
      setUploadMsg(`Statuto aggiornato (${result.statute_version}).`);
      setStatuteFile(null);
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
      } else {
        setUploadError(err instanceof Error ? err.message : "Errore nel caricamento del file.");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleWalletBrandingSave = async () => {
    if (walletSaving) return;
    setWalletSaving(true);
    setWalletSaveMsg("");
    setWalletSaveError("");
    try {
      const payload = {
        wallet_bg_color: walletForm.wallet_bg_color.trim() || null,
        wallet_title_override: walletForm.wallet_title_override.trim() || null,
        wallet_is_test_prefix: walletForm.wallet_is_test_prefix,
      };
      await patchOrgAdminOrganization(payload);
      setOrg((prev) =>
        prev
          ? {
              ...prev,
              ...payload,
              wallet_effective_bg_color: payload.wallet_bg_color || prev.wallet_effective_bg_color,
              wallet_effective_title_override:
                payload.wallet_title_override || prev.wallet_effective_title_override,
            }
          : prev,
      );
      setWalletSaveMsg("Branding Google Wallet salvato.");
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
      } else {
        setWalletSaveError(err instanceof Error ? err.message : "Errore nel salvataggio branding.");
      }
    } finally {
      setWalletSaving(false);
    }
  };

  const handleWalletAssetsUpload = async () => {
    if ((!walletLogoFile && !walletHeroFile) || walletAssetsUploading) return;

    const validateImage = (
      file: File | null,
      options: { label: string; maxBytes: number; allowedExt: string[]; allowedMime: string[] },
    ): string | null => {
      if (!file) return null;
      const ext = `.${(file.name.split(".").pop() || "").toLowerCase()}`;
      const hasValidExt = options.allowedExt.includes(ext);
      const hasValidMime = !file.type || options.allowedMime.includes(file.type);
      if (!hasValidExt || !hasValidMime) return `Formato non valido per ${options.label}.`;
      if (file.size > options.maxBytes) return `${options.label} troppo grande (max 2 MB).`;
      return null;
    };

    const logoError =
      validateImage(walletLogoFile, {
        label: "logo",
        maxBytes: 2 * 1024 * 1024,
        allowedExt: [".png", ".jpg", ".jpeg", ".svg"],
        allowedMime: ["image/png", "image/jpeg", "image/svg+xml"],
      }) || null;
    const heroError =
      validateImage(walletHeroFile, {
        label: "hero image",
        maxBytes: 2 * 1024 * 1024,
        allowedExt: [".png", ".jpg", ".jpeg"],
        allowedMime: ["image/png", "image/jpeg"],
      }) || null;
    const validationError = logoError || heroError;
    if (validationError) {
      setWalletAssetsMsg("");
      setWalletAssetsError(validationError);
      return;
    }

    setWalletAssetsUploading(true);
    setWalletAssetsMsg("");
    setWalletAssetsError("");
    try {
      const result = await uploadOrgAdminWalletAssets({
        logo: walletLogoFile,
        heroImage: walletHeroFile,
      });
      setOrg((prev) =>
        prev
          ? {
              ...prev,
              wallet_logo_url: result.wallet_logo_url ?? prev.wallet_logo_url,
              wallet_hero_image_url: result.wallet_hero_image_url ?? prev.wallet_hero_image_url,
              wallet_effective_logo_url:
                result.wallet_effective_logo_url ?? prev.wallet_effective_logo_url,
              wallet_effective_hero_image_url:
                result.wallet_effective_hero_image_url ?? prev.wallet_effective_hero_image_url,
            }
          : prev,
      );
      setWalletAssetsMsg("Asset Google Wallet caricati.");
      setWalletLogoFile(null);
      setWalletHeroFile(null);
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
      } else {
        setWalletAssetsError(err instanceof Error ? err.message : "Errore nel caricamento asset.");
      }
    } finally {
      setWalletAssetsUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="container-shell py-10">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="mt-3 h-4 w-96" />
        <div className="mt-8 surface p-7">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-4 h-10 w-full" />
          <Skeleton className="mt-4 h-10 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container-shell py-10">
        <div className="rounded-lg border border-red-200/60 bg-red-50 px-7 py-5">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-shell py-10">
      <h2 className="text-xl font-semibold text-neutral-900">Associazione</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Modifica i dettagli e gestisci lo statuto dell'associazione.
      </p>

      {/* Details form */}
      <form onSubmit={handleSave} className="surface mt-8 p-7">
        <h3 className="text-sm font-semibold text-neutral-900">Dettagli</h3>
        <p className="mt-1 text-sm text-neutral-500">
          Queste informazioni sono visibili nella pagina pubblica dell'associazione.
        </p>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label htmlFor="org-name" className={labelClass}>
              Nome
            </label>
            <input
              id="org-name"
              className={inputClass}
              type="text"
              value={form.name}
              onChange={handleChange("name")}
            />
          </div>
          <div>
            <label htmlFor="org-city" className={labelClass}>
              Città
            </label>
            <input
              id="org-city"
              className={inputClass}
              type="text"
              value={form.city}
              onChange={handleChange("city")}
            />
          </div>
          <div>
            <label htmlFor="org-province" className={labelClass}>
              Provincia
            </label>
            <input
              id="org-province"
              className={inputClass}
              type="text"
              maxLength={2}
              placeholder="RM"
              value={form.province}
              onChange={handleChange("province")}
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="org-description" className={labelClass}>
              Descrizione
            </label>
            <textarea
              id="org-description"
              className={inputClass}
              rows={4}
              value={form.description}
              onChange={handleChange("description")}
            />
          </div>
          <div>
            <label htmlFor="org-email" className={labelClass}>
              Email
            </label>
            <input
              id="org-email"
              className={inputClass}
              type="email"
              value={form.email}
              onChange={handleChange("email")}
            />
          </div>
          <div>
            <label htmlFor="org-phone" className={labelClass}>
              Telefono
            </label>
            <input
              id="org-phone"
              className={inputClass}
              type="tel"
              value={form.phone}
              onChange={handleChange("phone")}
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="org-website" className={labelClass}>
              Sito web
            </label>
            <input
              id="org-website"
              className={inputClass}
              type="url"
              placeholder="https://"
              value={form.website}
              onChange={handleChange("website")}
            />
          </div>
        </div>

        {saveMsg && (
          <div className="mt-5 rounded-md border border-emerald-200/60 bg-emerald-50 px-4 py-3">
            <p className="text-sm text-emerald-700">{saveMsg}</p>
          </div>
        )}
        {saveError && (
          <div className="mt-5 rounded-md border border-red-200/60 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">{saveError}</p>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button className="btn-primary" type="submit" disabled={saving}>
            {saving ? "Salvataggio..." : "Salva"}
          </button>
        </div>
      </form>

      {/* Statute management */}
      <div className="surface mt-8 p-7">
        <h3 className="text-sm font-semibold text-neutral-900">Statuto</h3>
        <p className="mt-1 text-sm text-neutral-500">
          Carica o aggiorna lo statuto dell'associazione in formato PDF.
        </p>

        {org?.has_statute && (
          <div className="mt-5 flex flex-wrap items-center gap-4 rounded-lg border border-neutral-100 bg-neutral-25 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-800">
                Statuto attuale: {org.statute_version}
              </p>
              {org.statute_updated_at && (
                <p className="mt-0.5 text-xs text-neutral-500">
                  Aggiornato il{" "}
                  {new Date(org.statute_updated_at).toLocaleDateString("it-IT", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
            <a
              href={org.statute_url!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-300 hover:text-neutral-900"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              Scarica PDF
            </a>
          </div>
        )}

        <div className="mt-5">
          <label className="block text-sm font-medium text-neutral-700">
            {org?.has_statute ? "Aggiorna statuto" : "Carica statuto"}
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".pdf"
              className="block text-sm text-neutral-600 file:mr-3 file:rounded-md file:border file:border-neutral-200 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-neutral-700 file:transition hover:file:border-neutral-300 hover:file:text-neutral-900"
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setStatuteFile(e.target.files?.[0] ?? null)
              }
            />
            <button
              type="button"
              className="btn-primary"
              disabled={!statuteFile || uploading}
              onClick={handleStatuteUpload}
            >
              {uploading ? "Caricamento..." : "Carica"}
            </button>
          </div>
          <p className="mt-2 text-xs text-neutral-400">Solo file PDF, massimo 10 MB.</p>
        </div>

        {uploadMsg && (
          <div className="mt-5 rounded-md border border-emerald-200/60 bg-emerald-50 px-4 py-3">
            <p className="text-sm text-emerald-700">{uploadMsg}</p>
          </div>
        )}
        {uploadError && (
          <div className="mt-5 rounded-md border border-red-200/60 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">{uploadError}</p>
          </div>
        )}
      </div>

      <div className="surface mt-8 p-7">
        <h3 className="text-sm font-semibold text-neutral-900">Google Wallet Branding</h3>
        <p className="mt-1 text-sm text-neutral-500">
          Personalizza logo, hero image e colore della tessera in Google Wallet (Android).
        </p>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <div>
            <label htmlFor="wallet-bg-color" className={labelClass}>
              Colore sfondo Wallet
            </label>
            <div className="mt-1 flex items-center gap-3">
              <input
                id="wallet-bg-color"
                type="color"
                className="h-10 w-14 rounded-md border border-neutral-200 bg-white p-1"
                value={
                  /^#[0-9A-Fa-f]{6}$/.test(walletForm.wallet_bg_color.trim())
                    ? walletForm.wallet_bg_color.trim()
                    : "#0B3C75"
                }
                onChange={(e) =>
                  setWalletForm((prev) => ({ ...prev, wallet_bg_color: e.target.value }))
                }
              />
              <input
                className={inputClass}
                type="text"
                placeholder="#0B3C75"
                value={walletForm.wallet_bg_color}
                onChange={(e) =>
                  setWalletForm((prev) => ({ ...prev, wallet_bg_color: e.target.value }))
                }
              />
            </div>
            {org?.wallet_effective_bg_color && !org.wallet_bg_color && (
              <p className="mt-2 text-xs text-neutral-500">
                Fallback attivo: {org.wallet_effective_bg_color} (es. Golden Age).
              </p>
            )}
          </div>

          <div>
            <label htmlFor="wallet-title" className={labelClass}>
              Titolo Wallet (override)
            </label>
            <input
              id="wallet-title"
              className={inputClass}
              type="text"
              placeholder="ASSO.N.A.M. / Golden Age Club"
              value={walletForm.wallet_title_override}
              onChange={(e) =>
                setWalletForm((prev) => ({ ...prev, wallet_title_override: e.target.value }))
              }
            />
            {org?.wallet_effective_title_override && !org.wallet_title_override && (
              <p className="mt-2 text-xs text-neutral-500">
                Fallback attivo: {org.wallet_effective_title_override}
              </p>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="inline-flex items-center gap-3 text-sm text-neutral-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-neutral-300 text-brand focus:ring-brand/30"
                checked={walletForm.wallet_is_test_prefix}
                onChange={(e) =>
                  setWalletForm((prev) => ({
                    ...prev,
                    wallet_is_test_prefix: e.target.checked,
                  }))
                }
              />
              Abilita prefisso demo ("[SOLO TEST]") solo quando `WALLET_DEMO_MODE=true`
            </label>
          </div>
        </div>

        {walletSaveMsg && (
          <div className="mt-5 rounded-md border border-emerald-200/60 bg-emerald-50 px-4 py-3">
            <p className="text-sm text-emerald-700">{walletSaveMsg}</p>
          </div>
        )}
        {walletSaveError && (
          <div className="mt-5 rounded-md border border-red-200/60 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">{walletSaveError}</p>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            className="btn-primary"
            disabled={walletSaving}
            onClick={handleWalletBrandingSave}
          >
            {walletSaving ? "Salvataggio..." : "Salva branding Wallet"}
          </button>
        </div>

        <div className="mt-8 border-t border-neutral-100 pt-6">
          <h4 className="text-sm font-semibold text-neutral-900">Asset immagini</h4>
          <p className="mt-1 text-sm text-neutral-500">
            Logo (PNG/JPG/SVG) e Hero image larga (PNG/JPG, consigliata ~1032x336).
          </p>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label className={labelClass}>Logo Wallet</label>
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
                className="mt-2 block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border file:border-neutral-200 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-neutral-700 file:transition hover:file:border-neutral-300 hover:file:text-neutral-900"
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setWalletLogoFile(e.target.files?.[0] ?? null)
                }
              />
              {(org?.wallet_logo_url || org?.wallet_effective_logo_url) && (
                <a
                  href={org.wallet_logo_url || org.wallet_effective_logo_url || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center text-xs font-medium text-brand hover:underline"
                >
                  Apri immagine logo
                </a>
              )}
            </div>

            <div>
              <label className={labelClass}>Hero image Wallet</label>
              <input
                type="file"
                accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                className="mt-2 block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border file:border-neutral-200 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-neutral-700 file:transition hover:file:border-neutral-300 hover:file:text-neutral-900"
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setWalletHeroFile(e.target.files?.[0] ?? null)
                }
              />
              {(org?.wallet_hero_image_url || org?.wallet_effective_hero_image_url) && (
                <a
                  href={org.wallet_hero_image_url || org.wallet_effective_hero_image_url || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center text-xs font-medium text-brand hover:underline"
                >
                  Apri hero image
                </a>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-primary"
              disabled={walletAssetsUploading || (!walletLogoFile && !walletHeroFile)}
              onClick={handleWalletAssetsUpload}
            >
              {walletAssetsUploading ? "Caricamento..." : "Carica asset Wallet"}
            </button>
            <p className="text-xs text-neutral-400">Max 2 MB per file. URL pubblici serviti da `/uploads`.</p>
          </div>

          {walletAssetsMsg && (
            <div className="mt-4 rounded-md border border-emerald-200/60 bg-emerald-50 px-4 py-3">
              <p className="text-sm text-emerald-700">{walletAssetsMsg}</p>
            </div>
          )}
          {walletAssetsError && (
            <div className="mt-4 rounded-md border border-red-200/60 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-700">{walletAssetsError}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrgAdminSettings;
