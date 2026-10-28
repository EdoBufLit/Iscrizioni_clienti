import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import {
  checkInOrgAdminAttendance,
  fetchOrgAdminAttendances,
  type OrgAdminAttendance,
} from "../../lib/api";
import {
  cameraAccessErrorMessage,
  isCameraAllowedByDocumentPolicy,
} from "../../lib/cameraAccess";
import {
  extractMemberCardVerificationToken,
} from "../../lib/memberCardQr";
import {
  EmptyState,
  SectionPanel,
  StatusChip,
} from "./components/OrgAdminPrimitives";
import ModalShell from "../../components/ui/ModalShell";
import AttendanceStationsPanel from "./components/AttendanceStationsPanel";
import AttendanceMemberSearch from "./components/AttendanceMemberSearch";

function localDateValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  });
}

function membershipLabel(value: string) {
  return value === "temporary" ? "Temporanea" : "Annuale";
}

function attendanceSourceLabel(item: OrgAdminAttendance) {
  if (item.source === "manual") return "Inserimento manuale";
  return item.scanner_station_name || "Area Riservata";
}

function stopMediaStream(stream: MediaStream | null | undefined) {
  if (typeof stream?.getTracks !== "function") return;
  stream.getTracks().forEach((track) => track.stop());
}

const OrgAdminAttendancePage = () => {
  const [selectedDay, setSelectedDay] = useState(localDateValue);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<OrgAdminAttendance[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [scannerState, setScannerState] = useState<"idle" | "starting" | "scanning">("idle");
  const [scanError, setScanError] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [showManualUrl, setShowManualUrl] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"live" | "history">("live");
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showStationsModal, setShowStationsModal] = useState(false);
  const [lastResult, setLastResult] = useState<{
    created: boolean;
    item: OrgAdminAttendance;
  } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const scanLockedRef = useRef(false);
  const scannerSessionRef = useRef(0);
  const listRequestRef = useRef(0);

  const loadAttendances = useCallback(async (day: string, q: string) => {
    const requestId = ++listRequestRef.current;
    setLoading(true);
    setListError("");
    try {
      const response = await fetchOrgAdminAttendances({
        day,
        q: q.trim() || undefined,
        limit: 250,
      });
      if (requestId !== listRequestRef.current) return;
      setItems(response.items);
      setTotal(response.total);
    } catch (error) {
      if (requestId !== listRequestRef.current) return;
      setListError(error instanceof Error ? error.message : "Errore caricamento presenze");
    } finally {
      if (requestId === listRequestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadAttendances(selectedDay, search);
    }, search ? 250 : 0);
    return () => window.clearTimeout(timeout);
  }, [loadAttendances, search, selectedDay]);

  const stopScanner = useCallback(() => {
    scannerSessionRef.current += 1;
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    const stream = videoRef.current?.srcObject as MediaStream | null | undefined;
    stopMediaStream(stream);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScannerState("idle");
  }, []);

  useEffect(() => stopScanner, [stopScanner]);

  const registerPresence = useCallback(
    async (rawValue: string) => {
      if (scanLockedRef.current) return;
      const token = extractMemberCardVerificationToken(rawValue);
      if (!token) {
        stopScanner();
        navigator.vibrate?.([180, 80, 180]);
        setScanError("Il QR non contiene una tessera ASSONAM riconoscibile.");
        return;
      }
      scanLockedRef.current = true;
      setSubmitting(true);
      setScanError("");
      stopScanner();
      try {
        const response = await checkInOrgAdminAttendance(token);
        setLastResult(response);
        if (!response.created) {
          navigator.vibrate?.([120, 60, 120]);
        } else {
          navigator.vibrate?.(60);
        }
        setManualValue("");
        setShowManualUrl(false);
        setSelectedDay(response.item.attendance_date);
        await loadAttendances(response.item.attendance_date, search);
      } catch (error) {
        setLastResult(null);
        navigator.vibrate?.([180, 80, 180]);
        setScanError(
          error instanceof Error ? error.message : "Impossibile registrare la presenza",
        );
      } finally {
        setSubmitting(false);
        scanLockedRef.current = false;
      }
    },
    [loadAttendances, search, stopScanner],
  );

  const startScanner = useCallback(async () => {
    stopScanner();
    const scannerSession = scannerSessionRef.current;
    setLastResult(null);
    setScanError("");
    setScannerState("starting");
    scanLockedRef.current = false;
    let pendingStream: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Fotocamera non supportata da questo browser.");
      }
      if (!window.isSecureContext) {
        throw new Error(
          "La fotocamera richiede una connessione sicura HTTPS. Apri nuovamente questa pagina dal sito ASSONAM.",
        );
      }
      if (!isCameraAllowedByDocumentPolicy()) {
        throw new Error(
          "La configurazione di sicurezza del sito sta bloccando la fotocamera. Ricarica la pagina e riprova.",
        );
      }
      const video = videoRef.current;
      if (!video) throw new Error("Anteprima fotocamera non disponibile.");

      // Ask the browser directly from the button action, before loading the QR
      // decoder. This preserves the native first-use permission prompt.
      pendingStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
        },
        audio: false,
      });
      if (scannerSession !== scannerSessionRef.current) {
        stopMediaStream(pendingStream);
        return;
      }

      const { BrowserQRCodeReader } = await import("@zxing/browser");
      if (scannerSession !== scannerSessionRef.current) {
        stopMediaStream(pendingStream);
        return;
      }
      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 250,
      });
      const controls = await reader.decodeFromStream(
        pendingStream,
        video,
        (result) => {
          if (scannerSession === scannerSessionRef.current && result && !scanLockedRef.current) {
            void registerPresence(result.getText());
          }
        },
      );
      pendingStream = null;
      if (scannerSession !== scannerSessionRef.current || scanLockedRef.current) {
        controls.stop();
        return;
      }
      scannerControlsRef.current = controls;
      setScannerState("scanning");
    } catch (error) {
      stopMediaStream(pendingStream);
      if (scannerSession !== scannerSessionRef.current) return;
      stopScanner();
      setScanError(cameraAccessErrorMessage(error));
    }
  }, [registerPresence, stopScanner]);

  const handleManualSubmit = (event: FormEvent) => {
    event.preventDefault();
    void registerPresence(manualValue);
  };

  const handleMemberRegistered = (response: { created: boolean; item: OrgAdminAttendance }) => {
    setLastResult(response);
    setScanError("");
    setSearch("");
    setShowSearchModal(false);
    setSelectedDay(response.item.attendance_date);
    void loadAttendances(response.item.attendance_date, "");
  };

  const recentItems = items.slice(0, 3);

  return (
    <div className="container-shell org-admin-mobile-page org-admin-attendance-page py-10 space-y-4">
      <header className="org-page-header org-admin-attendance-header">
        <div className="min-w-0">
          <p className="org-eyebrow hidden md:block">Soci e tessere</p>
          <h1 className="org-page-header__title">Presenze</h1>
          <p className="org-page-header__subtitle hidden md:block">
            Registra il primo ingresso giornaliero scansionando il QR o cercando il socio.
          </p>
        </div>
        <div className="org-page-header__actions flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              stopScanner();
              setShowStationsModal(true);
            }}
            className="btn-secondary org-admin-attendance-header__gear"
            aria-label="Postazioni scanner"
            title="Configura postazioni scanner"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
            <span className="hidden sm:inline">Postazioni scanner</span>
          </button>
        </div>
      </header>

      <div className="org-admin-attendance-tabs" role="tablist" aria-label="Vista presenze">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "live"}
          className={`org-admin-attendance-tab ${activeTab === "live" ? "is-active" : ""}`}
          onClick={() => setActiveTab("live")}
        >
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 8h3v3H8V8Zm5 0h3v3h-3V8Zm-5 5h3v3H8v-3Zm6 0h2v2h-2v-2Z" />
          </svg>
          <span>Scanner Live</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "history"}
          className={`org-admin-attendance-tab ${activeTab === "history" ? "is-active" : ""}`}
          onClick={() => {
            stopScanner();
            setActiveTab("history");
          }}
        >
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z" />
          </svg>
          <span>Storico Presenze</span>
          <span className="org-admin-attendance-tab__count">{total}</span>
        </button>
      </div>

      {activeTab === "live" ? (
        <div className="org-admin-attendance-live mx-auto max-w-xl space-y-3">
          <div className="org-admin-attendance-live__counter" aria-live="polite">
            <span className="org-admin-attendance-live__pulse" aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--oa-muted)]">Ingressi stasera:</span>
            <strong className="text-sm font-bold text-[var(--oa-text)]">
              {total} {total === 1 ? "socio" : "soci"}
            </strong>
          </div>

          <div className="org-admin-attendance-camera-box relative overflow-hidden rounded-2xl border border-[var(--oa-line-strong)] bg-slate-950">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              muted
              playsInline
              aria-label="Anteprima fotocamera per la scansione QR"
            />
            {scannerState !== "scanning" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/85 px-5 text-center text-white">
                <svg className="h-10 w-10 text-emerald-400/90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
                  <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 8h3v3H8V8Zm5 0h3v3h-3V8Zm-5 5h3v3H8v-3Zm6 0h2v2h-2v-2Z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="text-xs font-medium text-white/80">
                  {scannerState === "starting"
                    ? "Avvio fotocamera..."
                    : "Inquadra il QR della tessera"}
                </p>
                <button
                  type="button"
                  className="btn-primary !min-h-10 !rounded-xl !px-5 !py-2 text-sm font-semibold shadow-lg"
                  onClick={() => void startScanner()}
                  disabled={scannerState === "starting" || submitting}
                >
                  {scannerState === "starting" ? "Avvio..." : "Avvia fotocamera"}
                </button>
              </div>
            ) : (
              <>
                <div
                  className="attendance-scanner-frame pointer-events-none absolute inset-[14%] border-2"
                  data-testid="attendance-scanner-frame"
                  style={{ backgroundColor: "transparent" }}
                  aria-hidden="true"
                />
                <div className="absolute bottom-3 inset-x-0 flex justify-center px-4">
                  <button
                    type="button"
                    className="btn-secondary !min-h-9 !rounded-full !bg-slate-900/85 !px-4 !py-1.5 !text-xs !text-white !border-white/25 backdrop-blur-sm"
                    onClick={stopScanner}
                  >
                    Ferma fotocamera
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            aria-label="Cerca socio"
            className="org-admin-attendance-search-trigger"
            disabled={submitting}
            onClick={() => {
              stopScanner();
              setScanError("");
              setShowSearchModal(true);
            }}
          >
            <svg className="h-4 w-4 shrink-0 text-[var(--oa-brand-strong)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <span>Non ha il QR? Cerca per Nome / CF</span>
          </button>

          {scanError ? (
            <div className="org-admin-attendance-feedback org-admin-attendance-feedback--error" role="alert">
              <div className="flex items-start gap-3">
                <span className="org-admin-attendance-feedback__icon" aria-hidden="true">✕</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold uppercase tracking-wider">Ingresso non registrato</p>
                  <p className="mt-1 text-sm font-semibold leading-snug">{scanError}</p>
                </div>
              </div>
            </div>
          ) : lastResult ? (
            <div
              className={`org-admin-attendance-feedback ${
                lastResult.created
                  ? "org-admin-attendance-feedback--success"
                  : "org-admin-attendance-feedback--warning"
              }`}
              role="status"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="org-admin-attendance-feedback__icon" aria-hidden="true">
                    {lastResult.created ? "✓" : "!"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-extrabold uppercase tracking-wider">
                      {lastResult.created
                        ? "Ingresso registrato"
                        : `Già entrato alle ${formatTime(lastResult.item.checked_in_at)}`}
                    </p>
                    <p className="mt-0.5 truncate text-lg font-extrabold tracking-tight">
                      {lastResult.item.member_name}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold opacity-90">
                      Tessera #{lastResult.item.card_no} ({lastResult.item.card_year}) · {membershipLabel(lastResult.item.membership_type)} · Ore {formatTime(lastResult.item.checked_in_at)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary !min-h-8 shrink-0 !rounded-lg !px-2.5 !py-1 !text-xs font-bold"
                  onClick={() => void startScanner()}
                >
                  Scansiona
                </button>
              </div>
            </div>
          ) : null}

          <div className="org-admin-attendance-recent">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--oa-muted)]">
                Ultimi ingressi
              </span>
              {total > 0 && (
                <button
                  type="button"
                  className="text-xs font-semibold text-[var(--oa-brand-strong)] hover:underline"
                  onClick={() => {
                    stopScanner();
                    setActiveTab("history");
                  }}
                >
                  Vedi registro ({total}) ›
                </button>
              )}
            </div>
            {recentItems.length === 0 ? (
              <p className="mt-1.5 text-xs text-[var(--oa-muted)]">
                Nessun ingresso registrato oggi.
              </p>
            ) : (
              <ul className="mt-1.5 divide-y divide-[var(--oa-line)] rounded-xl border border-[var(--oa-line)] bg-[var(--oa-panel)]">
                {recentItems.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <span className="truncate font-semibold text-[var(--oa-text)]">
                      {item.member_name}
                    </span>
                    <span className="shrink-0 tabular-nums text-[var(--oa-muted)]">
                      #{item.card_no} · <strong className="text-[var(--oa-text)]">{formatTime(item.checked_in_at)}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="pt-1 text-center">
            {!showManualUrl ? (
              <button
                type="button"
                className="text-[11px] font-medium text-[var(--oa-muted)] underline underline-offset-2 hover:text-[var(--oa-text)]"
                onClick={() => setShowManualUrl(true)}
              >
                Inserimento manuale URL
              </button>
            ) : (
              <form className="rounded-xl border border-[var(--oa-line)] bg-[var(--oa-panel)] p-3 text-left" onSubmit={handleManualSubmit}>
                <label htmlFor="attendance-qr-value" className="text-xs font-semibold text-[var(--oa-muted)]">
                  Incolla il link della tessera
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    id="attendance-qr-value"
                    className="theme-input min-w-0 flex-1 !py-1.5 text-xs"
                    value={manualValue}
                    onChange={(event) => setManualValue(event.target.value)}
                    placeholder="https://.../api/cards/verify/..."
                    autoComplete="off"
                  />
                  <button
                    className="btn-secondary !min-h-8 !px-3 !py-1.5 text-xs"
                    type="submit"
                    disabled={submitting || manualValue.trim().length < 20}
                  >
                    {submitting ? "..." : "Registra"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : (
        <SectionPanel
          title="Registro presenze"
          eyebrow="Storico giornaliero"
          action={<StatusChip tone="info">{total} totali</StatusChip>}
        >
          <div className="grid gap-3 border-b border-[var(--oa-line)] p-3.5 md:grid-cols-[190px_minmax(0,1fr)] md:p-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Data</span>
              <input
                className="theme-input mt-1.5 w-full"
                type="date"
                value={selectedDay}
                onChange={(event) => setSelectedDay(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Cerca socio o tessera</span>
              <input
                className="theme-input mt-1.5 w-full"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nome, cognome, email o numero tessera"
              />
            </label>
          </div>

          {loading ? (
            <p className="p-6 text-sm text-slate-500">Caricamento presenze...</p>
          ) : listError ? (
            <div className="p-6 text-sm text-rose-700" role="alert">{listError}</div>
          ) : items.length === 0 ? (
            <EmptyState
              title="Nessuna presenza per questa giornata"
              description="Le presenze registrate tramite QR o ricerca socio compariranno qui in ordine di ingresso."
            />
          ) : (
            <>
              <div className="divide-y divide-slate-100 xl:hidden">
                {items.map((item) => (
                  <article key={item.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-950">
                        {item.member_name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        #{item.card_no}/{item.card_year} · {membershipLabel(item.membership_type)} · {attendanceSourceLabel(item)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold tabular-nums text-emerald-700">
                      {formatTime(item.checked_in_at)}
                    </span>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto xl:block">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Ora ingresso</th>
                      <th className="px-5 py-3 font-semibold">Socio</th>
                      <th className="px-5 py-3 font-semibold">Tessera</th>
                      <th className="px-5 py-3 font-semibold">Tipo</th>
                      <th className="px-5 py-3 font-semibold">Origine</th>
                      <th className="px-5 py-3 font-semibold">Stato</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item) => (
                      <tr key={item.id} className="transition-colors hover:bg-slate-50/70">
                        <td className="px-5 py-4 font-semibold tabular-nums text-slate-950">
                          {formatTime(item.checked_in_at)}
                        </td>
                        <td className="max-w-[280px] px-5 py-4 font-medium text-slate-900 [overflow-wrap:anywhere]">{item.member_name}</td>
                        <td className="px-5 py-4 tabular-nums text-slate-600">
                          {item.card_no} / {item.card_year}
                        </td>
                        <td className="px-5 py-4 text-slate-600">{membershipLabel(item.membership_type)}</td>
                        <td className="px-5 py-4 text-slate-600">{attendanceSourceLabel(item)}</td>
                        <td className="px-5 py-4"><StatusChip tone="success">Presente</StatusChip></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </SectionPanel>
      )}

      <ModalShell
        open={showSearchModal}
        title="Cerca socio per Nome o CF"
        description="Registra l'ingresso anche se il socio non ha il QR a portata di mano."
        onClose={() => {
          if (!submitting) setShowSearchModal(false);
        }}
        closeDisabled={submitting}
        placement="bottom"
        sizeClassName="max-w-lg"
      >
        <AttendanceMemberSearch onRegistered={handleMemberRegistered} onBusyChange={setSubmitting} />
      </ModalShell>

      <ModalShell
        open={showStationsModal}
        title="Postazioni scanner"
        description="Collega un tablet o smartphone dedicato esclusivamente alla scansione all'ingresso."
        onClose={() => setShowStationsModal(false)}
        placement="bottom"
        sizeClassName="max-w-2xl"
      >
        <AttendanceStationsPanel />
      </ModalShell>
    </div>
  );
};

export default OrgAdminAttendancePage;
