import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AuthError,
  fetchCardMovements,
  fetchCardStock,
  fetchOrgAdminMembers,
  fetchOrgAdminMembershipSettings,
  fetchOrgAdminMetrics,
  patchOrgAdminMembershipSettings,
  uploadOrgAdminCardAssets,
  type CardMovement,
  type CardStock,
  type OrgAdminCardStyle,
  type OrgAdminMembershipSettings,
  type OrgAdminMetrics,
} from "../../lib/api";
import Skeleton from "../../components/ui/Skeleton";
import { EmptyState, KpiCard, PageHeader, SectionPanel, StatusChip } from "./components/OrgAdminPrimitives";
import { useOrgAdmin } from "./OrgAdminLayout";

const thClass = "px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400";
const tdClass = "px-5 py-3.5 text-sm text-slate-700";

const defaultCardStyle: OrgAdminCardStyle = {
  primary_color: "#5A001F",
  secondary_color: "#2A0010",
  accent_color: "#D4B45C",
  text_color: "#FFFFFF",
  muted_text_color: "#F5D66D",
  font_family: "classic",
  surface_pattern: "geometric",
  logo_mode: "watermark",
  logo_position: "top-right",
  logo_opacity: 0.18,
  logo_blend: "normal",
  remove_logo_background: false,
  back_title: "Verifica tessera",
  back_body: "",
  back_show_member: true,
};

function normalizeCardStyle(style?: Partial<OrgAdminCardStyle> | null): OrgAdminCardStyle {
  return { ...defaultCardStyle, ...(style || {}) };
}

function CardDesignPreview({
  style,
  logoUrl,
  orgName,
  side,
}: {
  style: OrgAdminCardStyle;
  logoUrl?: string | null;
  orgName?: string | null;
  side: "front" | "back";
}) {
  const pattern =
    style.surface_pattern === "none"
      ? "none"
      : style.surface_pattern === "soft"
        ? "radial-gradient(circle at 70% 18%, rgba(212,180,92,.15), transparent 26rem)"
        : "linear-gradient(135deg, rgba(212,180,92,.12) 1px, transparent 1px), linear-gradient(45deg, rgba(212,180,92,.08) 1px, transparent 1px)";
  const logo = logoUrl ? (
    <img
      src={logoUrl}
      alt=""
      className={`card-builder-preview__org-logo card-builder-preview__org-logo--${style.logo_position}`}
      style={{
        opacity: style.logo_mode === "watermark" ? style.logo_opacity : 0.96,
        mixBlendMode: style.logo_blend === "multiply" ? "multiply" : style.logo_blend === "soft" ? "soft-light" : "normal",
      }}
    />
  ) : null;
  return (
    <div
      className="card-builder-preview"
      style={{
        color: style.text_color,
        background:
          `radial-gradient(circle at 82% 82%, ${style.accent_color}24, transparent 18rem), linear-gradient(135deg, ${style.primary_color}, ${style.secondary_color})`,
      }}
    >
      <span className="card-builder-preview__pattern" style={{ backgroundImage: pattern }} />
      {style.logo_mode !== "none" ? logo : null}
      <span className="card-builder-preview__assonam">ASSONAM</span>
      {side === "front" ? (
        <>
          <div className="card-builder-preview__year">
            <span style={{ color: style.muted_text_color }}>TESSERA SOCIO</span>
            <strong style={{ color: style.accent_color }}>2026</strong>
            <em>ATTIVA</em>
          </div>
          <div className="card-builder-preview__identity">
            <span style={{ color: style.muted_text_color }}>NOME E COGNOME</span>
            <strong>Ed Aa</strong>
            <span style={{ color: style.muted_text_color }}>ASSOCIAZIONE</span>
            <p>{orgName || "Golden Filippini Qualificati SRLS"}</p>
          </div>
          <div className="card-builder-preview__footer">
            <span style={{ color: style.muted_text_color }}>N. TESSERA</span>
            <strong style={{ color: style.accent_color }}>2</strong>
          </div>
          <span className="card-builder-preview__chip" />
        </>
      ) : (
        <>
          <div className="card-builder-preview__back-copy">
            <span style={{ color: style.muted_text_color }}>{style.back_title}</span>
            {style.back_body.trim() ? <p>{style.back_body}</p> : null}
          </div>
          <div className="card-builder-preview__qr">QR</div>
          <div className="card-builder-preview__back-data">
            <span>N. Tessera <strong>2</strong></span>
            <span>Anno <strong>2026</strong></span>
            <span>Stato <strong>Attiva</strong></span>
          </div>
        </>
      )}
    </div>
  );
}

function movementTone(statusLabel: string): "success" | "warning" | "danger" | "info" | "muted" {
  if (statusLabel === "Attivo") return "success";
  if (statusLabel === "Disattivo") return "warning";
  if (statusLabel === "Esaurito") return "danger";
  if (statusLabel === "Pronto") return "info";
  return "muted";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const OrgAdminCards = () => {
  const { admin, loading: adminLoading } = useOrgAdmin();
  const navigate = useNavigate();

  const [stock, setStock] = useState<CardStock | null>(null);
  const [movements, setMovements] = useState<CardMovement[]>([]);
  const [movementsTotal, setMovementsTotal] = useState(0);
  const [movementsYear, setMovementsYear] = useState<number | null>(null);
  const [summaryTotal, setSummaryTotal] = useState(0);
  const [issuedMembersCount, setIssuedMembersCount] = useState(0);
  const [metrics, setMetrics] = useState<OrgAdminMetrics | null>(null);
  const [membershipSettings, setMembershipSettings] = useState<OrgAdminMembershipSettings | null>(null);
  const [cardStyleDraft, setCardStyleDraft] = useState<OrgAdminCardStyle>(defaultCardStyle);
  const [cardLogoPreviewUrl, setCardLogoPreviewUrl] = useState<string | null>(null);
  const [cardLogoFile, setCardLogoFile] = useState<File | null>(null);
  const [savingMembershipSettings, setSavingMembershipSettings] = useState(false);
  const [savingCardDesign, setSavingCardDesign] = useState(false);
  const [membershipSettingsError, setMembershipSettingsError] = useState("");
  const [movementStatusFilter, setMovementStatusFilter] = useState("");
  const [movementIdFilter, setMovementIdFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (adminLoading || !admin) return;

    setLoading(true);
    setError(false);

    Promise.all([
      fetchCardStock(),
      fetchCardMovements(),
      fetchOrgAdminMembershipSettings(),
      fetchOrgAdminMembers({ limit: 1, offset: 0 }),
      fetchOrgAdminMetrics(),
    ])
      .then(([stockData, movData, settingsData, membersData, metricsData]) => {
        setStock(stockData);
        setMovements(movData.items);
        setMovementsTotal(movData.total);
        setMovementsYear(movData.current_year ?? null);
        setMembershipSettings(settingsData);
        setCardStyleDraft(normalizeCardStyle(settingsData.card_style));
        setCardLogoPreviewUrl(settingsData.card_logo_url || null);
        setSummaryTotal(membersData.summary?.total_theoretical_membership_fees ?? 0);
        setIssuedMembersCount(membersData.summary?.issued_members_count ?? 0);
        setMetrics(metricsData);
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
      const membersData = await fetchOrgAdminMembers({ limit: 1, offset: 0 });
      setMembershipSettings(response.settings);
      setSummaryTotal(membersData.summary?.total_theoretical_membership_fees ?? 0);
      setIssuedMembersCount(membersData.summary?.issued_members_count ?? 0);
      setMembershipSettingsError("");
    } catch (err) {
      setMembershipSettingsError(err instanceof Error ? err.message : "Errore aggiornamento impostazioni tessera.");
    } finally {
      setSavingMembershipSettings(false);
    }
  }

  async function handleCardDesignSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (membershipSettings?.card_style_locked) return;
    setMembershipSettingsError("");
    setSavingCardDesign(true);
    try {
      let nextSettings = membershipSettings;
      if (cardLogoFile) {
        const uploadResponse = await uploadOrgAdminCardAssets({
          logo: cardLogoFile,
          removeBackground: cardStyleDraft.remove_logo_background,
        });
        nextSettings = uploadResponse.settings;
        setCardLogoPreviewUrl(uploadResponse.card_logo_url);
        setCardLogoFile(null);
      }
      const response = await patchOrgAdminMembershipSettings({ card_style: cardStyleDraft });
      setMembershipSettings(response.settings);
      setCardStyleDraft(normalizeCardStyle(response.settings.card_style));
      setCardLogoPreviewUrl(response.settings.card_logo_url || nextSettings?.card_logo_url || null);
    } catch (err) {
      setMembershipSettingsError(err instanceof Error ? err.message : "Errore salvataggio design tessera.");
    } finally {
      setSavingCardDesign(false);
    }
  }

  function updateCardStyle<K extends keyof OrgAdminCardStyle>(key: K, value: OrgAdminCardStyle[K]) {
    setCardStyleDraft((current) => ({ ...current, [key]: value }));
  }

  const isLoading = adminLoading || loading;
  const usagePercent = useMemo(() => {
    if (!stock?.total) return 0;
    return Math.min(100, Math.round(((stock.used ?? 0) / stock.total) * 100));
  }, [stock]);
  const pendingWithoutCardCount = Math.max(metrics?.pending_requests_count ?? 0, 0);
  const visibleMovements = useMemo(
    () =>
      movements.filter((movement) => {
        if (movementStatusFilter && movement.status_label !== movementStatusFilter) return false;
        if (movementIdFilter && String(movement.id) !== movementIdFilter) return false;
        return true;
      }),
    [movementIdFilter, movementStatusFilter, movements],
  );

  return (
    <div className="container-shell org-admin-mobile-page org-admin-cards-page py-10 space-y-6" data-tour="admin-cards">
      <PageHeader
        eyebrow="Soci e tessere"
        title="Tessere"
        subtitle="Gestisci l'emissione delle tessere, il monitoraggio dei lotti e le regole quota."
        actions={
          <a href="/api/org-admin/members.csv" className="btn-secondary">
            Esporta elenco
          </a>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="surface p-6">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-4 h-9 w-20" />
              <Skeleton className="mt-3 h-4 w-32" />
            </div>
          ))}
        </div>
      ) : error ? (
        <SectionPanel>
          <EmptyState title="Impossibile caricare i dati delle tessere" description="Ricarica la pagina per riprovare." />
        </SectionPanel>
      ) : (
        <>
          <div className="org-admin-mobile-stats-strip" aria-label="Riepilogo tessere">
            <span><strong>{stock?.used ?? issuedMembersCount}</strong> Tessere attive</span>
            <span><strong>{pendingWithoutCardCount}</strong> In scadenza</span>
            <span><strong>{metrics?.cards_remaining === 0 && (metrics?.cards_total ?? 0) > 0 ? "Stop" : 0}</strong> Scadute</span>
            <span><strong>{movementsTotal || 0}</strong> Lotti</span>
          </div>

          <div className="org-admin-desktop-kpi-grid grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Tessere attive" value={stock?.used ?? issuedMembersCount} hint="+12% vs mese scorso" tone="success" />
            <KpiCard label="In scadenza" value={pendingWithoutCardCount} hint="Richieste senza tessera" tone="warning" />
            <KpiCard label="Scadute" value={metrics?.cards_remaining === 0 && (metrics?.cards_total ?? 0) > 0 ? "Stock esaurito" : 0} hint="Da rinnovare" tone={(stock?.remaining ?? 0) === 0 && (stock?.total ?? 0) > 0 ? "danger" : "muted"} />
            <KpiCard label="Lotti disponibili" value={movementsTotal || 0} hint="Con disponibilità" tone="info" />
          </div>

          {(stock?.remaining ?? 0) === 0 && (stock?.total ?? 0) > 0 ? (
            <div className="rounded-[0.85rem] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
              Limite tessere raggiunto. Contatta ASSONAM per richiedere l'estensione del pacchetto tessere.
            </div>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
            <SectionPanel title="Registro movimenti tessere" eyebrow={movementsYear ? `Anno ${movementsYear}` : "Lotti"} className="org-admin-mobile-filter-panel">
              <div className="org-admin-mobile-filter-grid mb-4 grid gap-3 md:grid-cols-4">
                <select className="premium-select" value={movementStatusFilter} onChange={(event) => setMovementStatusFilter(event.target.value)}>
                  <option value="">Tutti gli stati</option>
                  {Array.from(new Set(movements.map((movement) => movement.status_label))).map((statusLabel) => (
                    <option key={statusLabel} value={statusLabel}>{statusLabel}</option>
                  ))}
                </select>
                <select className="premium-select" value={movementIdFilter} onChange={(event) => setMovementIdFilter(event.target.value)}>
                  <option value="">Tutti i lotti</option>
                  {movements.map((movement) => (
                    <option key={movement.id} value={movement.id}>
                      {movement.range_start_label ?? movement.range_start} - {movement.range_end_label ?? movement.range_end}
                    </option>
                  ))}
                </select>
                <div className="rounded-[0.75rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                  {movementsYear ? `Anno ${movementsYear}` : "Tutti gli anni"}
                </div>
                <button type="button" className="btn-secondary justify-center" onClick={() => { setMovementStatusFilter(""); setMovementIdFilter(""); }}>
                  Reset
                </button>
              </div>

              {movementsTotal === 0 ? (
                <EmptyState title="Nessun lotto disponibile" description="I lotti assegnati da ASSONAM comparirànno qui automaticamente." />
              ) : (
                <div className="org-admin-mobile-table-shell overflow-hidden rounded-[0.85rem] border border-slate-200 bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="border-b border-slate-200 bg-slate-50">
                        <tr>
                          <th className={thClass}>Data</th>
                          <th className={thClass}>Lotto / Range</th>
                          <th className={thClass}>Quantita</th>
                          <th className={thClass}>Stato</th>
                          <th className={thClass}>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleMovements.map((movement, index) => (
                          <tr key={movement.id} className={index % 2 === 1 ? "bg-slate-50/50" : "bg-white"}>
                            <td className={`${tdClass} tabular-nums`}>{formatDateTime(movement.created_at)}</td>
                            <td className={`${tdClass} font-semibold text-slate-900 tabular-nums`}>
                              {movement.range_start_label ?? movement.range_start} - {movement.range_end_label ?? movement.range_end}
                            </td>
                            <td className={`${tdClass} tabular-nums`}>{movement.quantity}</td>
                            <td className={tdClass}>
                              <StatusChip tone={movementTone(movement.status_label)}>{movement.status_label}</StatusChip>
                            </td>
                            <td className={tdClass}>Lotto gestito da ASSONAM</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </SectionPanel>

            <aside className="org-admin-mobile-secondary-panels space-y-5">
              <SectionPanel title="Builder tessera" eyebrow="Design standard">
                <form className="card-builder space-y-5" onSubmit={handleCardDesignSubmit}>
                  {membershipSettings?.card_style_locked ? (
                    <div className="rounded-[0.85rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                      Design bloccato per questa associazione: la tessera Golden Age Club resta invariata.
                    </div>
                  ) : null}
                  <div className="grid gap-3">
                    <CardDesignPreview style={cardStyleDraft} logoUrl={cardLogoPreviewUrl} orgName={admin?.organization?.name} side="front" />
                    <CardDesignPreview style={cardStyleDraft} logoUrl={cardLogoPreviewUrl} orgName={admin?.organization?.name} side="back" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    {([
                      ["primary_color", "Bordeaux"],
                      ["secondary_color", "Profondita"],
                      ["accent_color", "Oro"],
                      ["muted_text_color", "Etichette"],
                    ] as const).map(([key, label]) => (
                      <label key={key} className="card-builder-field">
                        <span>{label}</span>
                        <input type="color" value={cardStyleDraft[key]} disabled={membershipSettings?.card_style_locked} onChange={(event) => updateCardStyle(key, event.target.value)} />
                      </label>
                    ))}
                  </div>
                  <label className="card-builder-upload">
                    <span>Logo associazione</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml"
                      disabled={membershipSettings?.card_style_locked}
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        setCardLogoFile(file);
                        if (file) setCardLogoPreviewUrl(URL.createObjectURL(file));
                      }}
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">Uso logo</span>
                      <select className="premium-select mt-2" value={cardStyleDraft.logo_mode} disabled={membershipSettings?.card_style_locked} onChange={(event) => updateCardStyle("logo_mode", event.target.value as OrgAdminCardStyle["logo_mode"])}>
                        <option value="watermark">Soffuso sullo sfondo</option>
                        <option value="visible">Ben visibile</option>
                        <option value="both">Visibile + soffuso</option>
                        <option value="none">Non mostrare</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">Posizione</span>
                      <select className="premium-select mt-2" value={cardStyleDraft.logo_position} disabled={membershipSettings?.card_style_locked} onChange={(event) => updateCardStyle("logo_position", event.target.value as OrgAdminCardStyle["logo_position"])}>
                        <option value="top-right">Alto destra</option>
                        <option value="top-left">Alto sinistra</option>
                        <option value="center">Centro</option>
                        <option value="bottom-left">Basso sinistra</option>
                        <option value="bottom-right">Basso destra</option>
                      </select>
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">Intensita logo soffuso</span>
                    <input className="mt-2 w-full" type="range" min="0" max="0.6" step="0.01" value={cardStyleDraft.logo_opacity} disabled={membershipSettings?.card_style_locked} onChange={(event) => updateCardStyle("logo_opacity", Number(event.target.value))} />
                  </label>
                  <div className="grid gap-2 text-sm text-slate-700">
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={cardStyleDraft.remove_logo_background} disabled={membershipSettings?.card_style_locked} onChange={(event) => updateCardStyle("remove_logo_background", event.target.checked)} />
                      Rimuovi sfondo chiaro dal logo al caricamento
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={cardStyleDraft.back_show_member} disabled={membershipSettings?.card_style_locked} onChange={(event) => updateCardStyle("back_show_member", event.target.checked)} />
                      Mostra dati socio sul retro
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">Titolo retro</span>
                    <input className="mt-2 h-11 w-full rounded-[0.75rem] border border-slate-200 bg-white px-4 text-sm" value={cardStyleDraft.back_title} disabled={membershipSettings?.card_style_locked} onChange={(event) => updateCardStyle("back_title", event.target.value)} />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">Testo retro</span>
                    <textarea className="mt-2 min-h-[88px] w-full rounded-[0.75rem] border border-slate-200 bg-white px-4 py-3 text-sm" value={cardStyleDraft.back_body} disabled={membershipSettings?.card_style_locked} onChange={(event) => updateCardStyle("back_body", event.target.value)} />
                  </label>
                  <button type="submit" className="btn-primary w-full justify-center" disabled={savingCardDesign || membershipSettings?.card_style_locked}>
                    {savingCardDesign ? "Salvataggio..." : "Salva design tessera"}
                  </button>
                </form>
              </SectionPanel>

              <SectionPanel title="Registro lotti" eyebrow="Disponibilità">
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-slate-900">Utilizzate</span>
                      <span className="tabular-nums text-slate-600">{stock?.used ?? 0} / {stock?.total ?? 0}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${usagePercent}%` }} />
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-slate-500">
                      <span>{usagePercent}%</span>
                      <span>{stock?.remaining ?? 0} disponibili</span>
                    </div>
                  </div>
                  <div className="rounded-[0.85rem] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">Prossimo lotto automatico</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Il sistema segnala il riordino quando la disponibilità scende sotto soglia operativa.
                    </p>
                    <StatusChip tone={(stock?.remaining ?? 0) < 25 ? "warning" : "success"}>
                      {(stock?.remaining ?? 0) < 25 ? "Da monitorare" : "Pronto"}
                    </StatusChip>
                  </div>
                </div>
              </SectionPanel>

              <SectionPanel title="Regole emissione" eyebrow="Quota e validità">
                <form className="space-y-4" onSubmit={handleMembershipSettingsSubmit}>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">Prezzo annuale</span>
                      <input className="mt-2 h-11 w-full rounded-[0.75rem] border border-slate-200 bg-white px-4 text-sm" type="number" step="0.01" min="0.01" name="membership_fee_amount" defaultValue={membershipSettings?.membership_fee_amount ?? ""} />
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">Valuta</span>
                      <input className="mt-2 h-11 w-full rounded-[0.75rem] border border-slate-200 bg-white px-4 text-sm uppercase" type="text" name="membership_fee_currency" maxLength={8} defaultValue={membershipSettings?.membership_fee_currency ?? "EUR"} />
                    </label>
                  </div>

                  {membershipSettings?.custom_membership_types_enabled ? (
                    <div className="space-y-3 border-t border-slate-100 pt-4">
                      <label className="block">
                        <span className="text-sm font-semibold text-slate-700">Prezzo temporanea</span>
                        <input className="mt-2 h-11 w-full rounded-[0.75rem] border border-slate-200 bg-white px-4 text-sm" type="number" step="0.01" min="0.01" name="temporary_membership_fee_amount" defaultValue={membershipSettings?.temporary_membership_fee_amount ?? ""} />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                        <label className="block">
                          <span className="text-sm font-semibold text-slate-700">Durata</span>
                          <input className="mt-2 h-11 w-full rounded-[0.75rem] border border-slate-200 bg-white px-4 text-sm" type="number" min="1" name="temporary_membership_duration_value" defaultValue={membershipSettings?.temporary_membership_duration_value ?? 1} />
                        </label>
                        <label className="block">
                          <span className="text-sm font-semibold text-slate-700">Unita</span>
                          <select className="mt-2 h-11 w-full rounded-[0.75rem] border border-slate-200 bg-white px-4 text-sm" name="temporary_membership_duration_unit" defaultValue={membershipSettings?.temporary_membership_duration_unit ?? "days"}>
                            <option value="days">Giorni</option>
                            <option value="hours">Ore</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  ) : null}

                  {membershipSettingsError ? <p className="text-sm text-rose-600">{membershipSettingsError}</p> : null}

                  <button type="submit" className="btn-primary w-full justify-center" disabled={savingMembershipSettings}>
                    {savingMembershipSettings ? "Salvataggio..." : "Salva regole"}
                  </button>
                </form>
              </SectionPanel>

              <SectionPanel title="Totale quote" eyebrow="Contabilità">
                <p className="text-3xl font-semibold tracking-tight text-slate-950">€ {summaryTotal.toFixed(2)}</p>
                <p className="mt-2 text-sm text-slate-500">Valore teorico calcolato sulle tessere emesse e sui prezzi quota correnti.</p>
              </SectionPanel>
            </aside>
          </div>
        </>
      )}
    </div>
  );
};

export default OrgAdminCards;
