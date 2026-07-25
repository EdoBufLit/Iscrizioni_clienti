import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import {
  checkInOrgAdminAttendance,
  fetchOrgAdminAttendances,
  type OrgAdminAttendance,
} from "../../lib/api";
import {
  extractMemberCardVerificationToken,
} from "../../lib/memberCardQr";
import {
  EmptyState,
  PageHeader,
  SectionPanel,
  StatusChip,
} from "./components/OrgAdminPrimitives";

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
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    created: boolean;
    item: OrgAdminAttendance;
  } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const scanLockedRef = useRef(false);

  const loadAttendances = useCallback(async (day: string, q: string) => {
    setLoading(true);
    setListError("");
    try {
      const response = await fetchOrgAdminAttendances({
        day,
        q: q.trim() || undefined,
        limit: 250,
      });
      setItems(response.items);
      setTotal(response.total);
    } catch (error) {
      setListError(error instanceof Error ? error.message : "Errore caricamento presenze");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadAttendances(selectedDay, search);
    }, search ? 250 : 0);
    return () => window.clearTimeout(timeout);
  }, [loadAttendances, search, selectedDay]);

  const stopScanner = useCallback(() => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
    }
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
        setManualValue("");
        setSelectedDay(response.item.attendance_date);
        await loadAttendances(response.item.attendance_date, search);
      } catch (error) {
        setLastResult(null);
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
    setLastResult(null);
    setScanError("");
    setScannerState("starting");
    scanLockedRef.current = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Fotocamera non supportata da questo browser.");
      }
      const video = videoRef.current;
      if (!video) throw new Error("Anteprima fotocamera non disponibile.");
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 250,
      });
      const controls = await reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: "environment" },
          },
          audio: false,
        },
        video,
        (result) => {
          if (result && !scanLockedRef.current) {
            void registerPresence(result.getText());
          }
        },
      );
      scannerControlsRef.current = controls;
      setScannerState("scanning");
    } catch (error) {
      stopScanner();
      const message = error instanceof Error ? error.message : "";
      setScanError(
        /permission|denied|notallowed/i.test(message)
          ? "Permesso fotocamera negato. Abilitalo nel browser oppure incolla il link della tessera."
          : message || "Impossibile avviare la fotocamera.",
      );
    }
  }, [registerPresence, stopScanner]);

  const handleManualSubmit = (event: FormEvent) => {
    event.preventDefault();
    void registerPresence(manualValue);
  };

  return (
    <div className="container-shell org-admin-mobile-page py-10 space-y-6">
      <PageHeader
        eyebrow="Soci e tessere"
        title="Presenze"
        subtitle="Scansiona il QR della tessera e registra il primo ingresso giornaliero del socio."
        actions={
          <StatusChip tone={total > 0 ? "success" : "muted"}>
            {total} {total === 1 ? "presenza" : "presenze"}
          </StatusChip>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <SectionPanel title="Scansiona tessera" eyebrow="Check-in QR">
          <div className="grid gap-5 p-5 md:p-6">
            <div className="relative aspect-[4/3] overflow-hidden rounded-[1.2rem] border border-slate-200 bg-slate-950">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                muted
                playsInline
                aria-label="Anteprima fotocamera per la scansione QR"
              />
              {scannerState !== "scanning" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-white">
                  <svg className="h-12 w-12 text-white/75" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 8h3v3H8V8Zm5 0h3v3h-3V8Zm-5 5h3v3H8v-3Zm6 0h2v2h-2v-2Z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="mt-3 text-sm font-semibold">
                    {scannerState === "starting"
                      ? "Avvio fotocamera..."
                      : "Inquadra il QR presente sulla tessera"}
                  </p>
                </div>
              ) : (
                <div className="pointer-events-none absolute inset-[14%] rounded-[1.4rem] border-2 border-emerald-300 shadow-[0_0_0_999px_rgba(2,6,23,0.35)]" />
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              {scannerState === "scanning" ? (
                <button type="button" className="btn-secondary" onClick={stopScanner}>
                  Ferma fotocamera
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void startScanner()}
                  disabled={scannerState === "starting" || submitting}
                >
                  {scannerState === "starting" ? "Avvio..." : "Avvia fotocamera"}
                </button>
              )}
            </div>

            <form className="border-t border-slate-100 pt-5" onSubmit={handleManualSubmit}>
              <label htmlFor="attendance-qr-value" className="text-sm font-semibold text-slate-800">
                In alternativa, incolla il link della tessera
              </label>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                <input
                  id="attendance-qr-value"
                  className="theme-input min-w-0 flex-1"
                  value={manualValue}
                  onChange={(event) => setManualValue(event.target.value)}
                  placeholder="https://.../api/cards/verify/..."
                  autoComplete="off"
                />
                <button
                  className="btn-secondary justify-center"
                  type="submit"
                  disabled={submitting || manualValue.trim().length < 20}
                >
                  {submitting ? "Registro..." : "Registra presenza"}
                </button>
              </div>
            </form>
          </div>
        </SectionPanel>

        <SectionPanel title="Esito ultimo controllo" eyebrow="Ingresso">
          <div className="p-5 md:p-6">
            {scanError ? (
              <div className="rounded-[1rem] border border-rose-200 bg-rose-50 px-5 py-5 text-rose-800" role="alert">
                <p className="font-semibold">Presenza non registrata</p>
                <p className="mt-2 text-sm leading-6">{scanError}</p>
              </div>
            ) : lastResult ? (
              <div
                className={`rounded-[1.2rem] border px-5 py-6 ${
                  lastResult.created
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-amber-200 bg-amber-50"
                }`}
                role="status"
              >
                <StatusChip tone={lastResult.created ? "success" : "warning"}>
                  {lastResult.created ? "Ingresso registrato" : "Già presente oggi"}
                </StatusChip>
                <p className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">
                  {lastResult.item.member_name}
                </p>
                <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-slate-500">Tessera</dt>
                    <dd className="mt-1 font-semibold text-slate-900">
                      {lastResult.item.card_no} / {lastResult.item.card_year}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Tipo</dt>
                    <dd className="mt-1 font-semibold text-slate-900">
                      {membershipLabel(lastResult.item.membership_type)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Giorno</dt>
                    <dd className="mt-1 font-semibold text-slate-900">
                      {new Date(`${lastResult.item.attendance_date}T12:00:00`).toLocaleDateString("it-IT")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Primo ingresso</dt>
                    <dd className="mt-1 font-semibold text-slate-900">
                      {formatTime(lastResult.item.checked_in_at)}
                    </dd>
                  </div>
                </dl>
                <button
                  className="btn-primary mt-6 w-full justify-center"
                  type="button"
                  onClick={() => void startScanner()}
                >
                  Scansiona un&apos;altra tessera
                </button>
              </div>
            ) : (
              <EmptyState
                title="Nessuna scansione effettuata"
                description="L'esito mostra nome del socio, tessera e ora del primo ingresso."
              />
            )}
          </div>
        </SectionPanel>
      </div>

      <SectionPanel
        title="Registro presenze"
        eyebrow="Giornata selezionata"
        action={<StatusChip tone="info">{total} totali</StatusChip>}
      >
        <div className="grid gap-4 border-b border-slate-100 p-4 md:grid-cols-[190px_minmax(0,1fr)]">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Data</span>
            <input
              className="theme-input mt-2 w-full"
              type="date"
              value={selectedDay}
              onChange={(event) => setSelectedDay(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Cerca socio o tessera</span>
            <input
              className="theme-input mt-2 w-full"
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
            description="Le presenze registrate tramite QR compariranno qui in ordine di ingresso."
          />
        ) : (
          <>
            <div className="divide-y divide-slate-100 md:hidden">
              {items.map((item) => (
                <article key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-slate-950 [overflow-wrap:anywhere]">
                        {item.member_name}
                      </p>
                      <p className="mt-1 text-sm tabular-nums text-slate-500">
                        Tessera {item.card_no} / {item.card_year}
                      </p>
                    </div>
                    <StatusChip tone="success">Presente</StatusChip>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 rounded-[1rem] bg-slate-50 px-4 py-3 text-sm">
                    <div>
                      <dt className="text-slate-500">Ora ingresso</dt>
                      <dd className="mt-1 font-semibold tabular-nums text-slate-950">
                        {formatTime(item.checked_in_at)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Tipo tessera</dt>
                      <dd className="mt-1 font-semibold text-slate-950">
                        {membershipLabel(item.membership_type)}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Ora ingresso</th>
                    <th className="px-5 py-3 font-semibold">Socio</th>
                    <th className="px-5 py-3 font-semibold">Tessera</th>
                    <th className="px-5 py-3 font-semibold">Tipo</th>
                    <th className="px-5 py-3 font-semibold">Stato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <tr key={item.id} className="transition-colors hover:bg-slate-50/70">
                      <td className="px-5 py-4 font-semibold tabular-nums text-slate-950">
                        {formatTime(item.checked_in_at)}
                      </td>
                      <td className="px-5 py-4 font-medium text-slate-900">{item.member_name}</td>
                      <td className="px-5 py-4 tabular-nums text-slate-600">
                        {item.card_no} / {item.card_year}
                      </td>
                      <td className="px-5 py-4 text-slate-600">{membershipLabel(item.membership_type)}</td>
                      <td className="px-5 py-4"><StatusChip tone="success">Presente</StatusChip></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionPanel>
    </div>
  );
};

export default OrgAdminAttendancePage;
