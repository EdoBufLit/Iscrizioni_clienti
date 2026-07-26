import { useCallback, useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import {
  AttendanceStationAuthError,
  checkInAttendanceStation,
  fetchAttendanceStationSession,
  type AttendanceStationSession,
  type OrgAdminAttendance,
} from "../lib/api";
import {
  cameraAccessErrorMessage,
  isCameraAllowedByDocumentPolicy,
} from "../lib/cameraAccess";
import { extractMemberCardVerificationToken } from "../lib/memberCardQr";

type ScanOutcome = {
  tone: "success" | "duplicate" | "error";
  title: string;
  message: string;
  item?: OrgAdminAttendance;
};

function stopMediaStream(stream: MediaStream | null | undefined) {
  if (typeof stream?.getTracks !== "function") return;
  stream.getTracks().forEach((track) => track.stop());
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  });
}

export default function AttendanceStationScanner() {
  const [session, setSession] = useState<AttendanceStationSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authorizationError, setAuthorizationError] = useState("");
  const [scannerState, setScannerState] = useState<
    "idle" | "starting" | "scanning"
  >("idle");
  const [scanOutcome, setScanOutcome] = useState<ScanOutcome | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const scanLockedRef = useRef(false);
  const lastSeenValueRef = useRef("");
  const lastSeenAtRef = useRef(0);

  const stopScanner = useCallback(() => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    const stream = videoRef.current?.srcObject as MediaStream | null | undefined;
    stopMediaStream(stream);
    if (videoRef.current) videoRef.current.srcObject = null;
    scanLockedRef.current = false;
    setScannerState("idle");
  }, []);

  const loadSession = useCallback(async () => {
    setSessionLoading(true);
    setAuthorizationError("");
    try {
      setSession(await fetchAttendanceStationSession());
    } catch (error) {
      setSession(null);
      setAuthorizationError(
        error instanceof AttendanceStationAuthError
          ? "Questo dispositivo non è collegato a una postazione attiva."
          : error instanceof Error
            ? error.message
            : "Impossibile verificare la postazione.",
      );
    } finally {
      setSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => stopScanner, [stopScanner]);

  const registerPresence = useCallback(
    async (rawValue: string) => {
      const token = extractMemberCardVerificationToken(rawValue);
      const scanIdentity = token || rawValue.trim();
      const now = Date.now();
      if (
        scanIdentity &&
        scanIdentity === lastSeenValueRef.current &&
        now - lastSeenAtRef.current < 2500
      ) {
        lastSeenAtRef.current = now;
        return;
      }
      if (scanLockedRef.current) return;

      lastSeenValueRef.current = scanIdentity;
      lastSeenAtRef.current = now;
      if (!token) {
        setScanOutcome({
          tone: "error",
          title: "QR non riconosciuto",
          message: "Inquadra il QR presente su una tessera ASSO.N.A.M.",
        });
        return;
      }

      scanLockedRef.current = true;
      try {
        const response = await checkInAttendanceStation(token);
        setScanOutcome({
          tone: response.created ? "success" : "duplicate",
          title: response.created
            ? "Ingresso registrato"
            : "Già presente oggi",
          message: response.created
            ? `${response.item.member_name}, ingresso delle ${formatTime(response.item.checked_in_at)}.`
            : `Il primo ingresso di ${response.item.member_name} era già stato registrato alle ${formatTime(response.item.checked_in_at)}.`,
          item: response.item,
        });
        if (typeof navigator.vibrate === "function") {
          navigator.vibrate(response.created ? 80 : [50, 50, 50]);
        }
      } catch (error) {
        if (error instanceof AttendanceStationAuthError) {
          stopScanner();
          setSession(null);
          setAuthorizationError(
            "La postazione è stata scollegata o revocata dall’associazione.",
          );
          return;
        }
        setScanOutcome({
          tone: "error",
          title: "Presenza non registrata",
          message:
            error instanceof Error
              ? error.message
              : "Impossibile registrare la presenza.",
        });
      } finally {
        scanLockedRef.current = false;
      }
    },
    [stopScanner],
  );

  const startScanner = useCallback(async () => {
    stopScanner();
    setScanOutcome(null);
    setScannerState("starting");
    lastSeenValueRef.current = "";
    lastSeenAtRef.current = 0;
    let pendingStream: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Fotocamera non supportata da questo browser.");
      }
      if (!window.isSecureContext) {
        throw new Error(
          "La fotocamera richiede una connessione sicura HTTPS.",
        );
      }
      if (!isCameraAllowedByDocumentPolicy()) {
        throw new Error(
          "La configurazione di sicurezza del sito sta bloccando la fotocamera. Ricarica la pagina e riprova.",
        );
      }
      const video = videoRef.current;
      if (!video) throw new Error("Anteprima fotocamera non disponibile.");

      pendingStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 200,
      });
      const controls = await reader.decodeFromStream(
        pendingStream,
        video,
        (result) => {
          if (result) void registerPresence(result.getText());
        },
      );
      pendingStream = null;
      scannerControlsRef.current = controls;
      setScannerState("scanning");
    } catch (error) {
      stopMediaStream(pendingStream);
      stopScanner();
      setScanOutcome({
        tone: "error",
        title: "Fotocamera non disponibile",
        message: cameraAccessErrorMessage(error),
      });
    }
  }, [registerPresence, stopScanner]);

  const outcomeClasses =
    scanOutcome?.tone === "success"
      ? "border-emerald-300 bg-emerald-50 text-emerald-950"
      : scanOutcome?.tone === "duplicate"
        ? "border-amber-300 bg-amber-50 text-amber-950"
        : "border-rose-300 bg-rose-50 text-rose-950";

  return (
    <main className="attendance-station-page min-h-[100svh] bg-[#eef5f2] text-slate-950">
      <header className="border-b border-emerald-950/10 bg-[#073f36] text-emerald-50">
        <div className="mx-auto flex min-h-20 w-full max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
              ASSO.N.A.M. · Presenze
            </p>
            <h1 className="mt-1 truncate text-xl font-semibold">
              {session?.organization.name || "Scanner ingressi"}
            </h1>
          </div>
          {session ? (
            <span className="max-w-[42%] truncate rounded-full border border-emerald-100/25 bg-emerald-50/10 px-3 py-2 text-xs font-semibold">
              {session.station.name}
            </span>
          ) : null}
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-3xl gap-5 px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
        {sessionLoading ? (
          <div className="py-20 text-center text-sm text-slate-600">
            Verifica postazione...
          </div>
        ) : authorizationError || !session ? (
          <section className="rounded-[1.4rem] border border-amber-200 bg-amber-50 p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
              Autorizzazione richiesta
            </p>
            <h2 className="mt-3 text-2xl font-semibold">
              Dispositivo non collegato
            </h2>
            <p className="mt-3 text-base leading-7 text-amber-950/80">
              {authorizationError ||
                "Apri il collegamento generato dall’Area Riservata dell’associazione."}
            </p>
            <button
              type="button"
              className="mt-6 min-h-12 rounded-xl bg-amber-950 px-5 py-3 font-semibold text-amber-50"
              onClick={() => void loadSession()}
            >
              Verifica di nuovo
            </button>
          </section>
        ) : (
          <>
            <section className="attendance-station-card overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-[0_18px_55px_rgba(10,48,41,0.10)]">
              <div className="px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                  Postazione autorizzata
                </p>
                <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                  <h2 className="text-2xl font-semibold">Inquadra la tessera</h2>
                  <span className="text-sm text-slate-500">
                    Primo ingresso giornaliero
                  </span>
                </div>
              </div>

              <div className="relative aspect-[4/3] overflow-hidden bg-slate-950 sm:mx-6 sm:mb-6 sm:rounded-[1.15rem]">
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  muted
                  playsInline
                  aria-label="Anteprima fotocamera per il controllo tessere"
                />
                {scannerState === "scanning" ? (
                  <div
                    className="attendance-station-scanner-frame pointer-events-none absolute inset-[14%] border-2"
                    data-testid="attendance-station-scanner-frame"
                    aria-hidden="true"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 px-6 text-center text-white">
                    <svg
                      className="h-14 w-14 text-emerald-300"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    >
                      <path
                        d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 8h3v3H8V8Zm5 0h3v3h-3V8Zm-5 5h3v3H8v-3Zm6 0h2v2h-2v-2Z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <p className="mt-4 max-w-xs text-sm font-semibold leading-6 text-slate-100">
                      {scannerState === "starting"
                        ? "Avvio fotocamera..."
                        : "La fotocamera si attiva solo dopo il tuo consenso."}
                    </p>
                  </div>
                )}
              </div>

              <div className="grid gap-3 px-5 py-5 sm:grid-cols-2 sm:px-6 sm:pt-0">
                {scannerState === "scanning" ? (
                  <button
                    type="button"
                    className="min-h-12 rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-800 sm:col-span-2"
                    onClick={stopScanner}
                  >
                    Ferma fotocamera
                  </button>
                ) : (
                  <button
                    type="button"
                    className="min-h-12 rounded-xl bg-[#086b59] px-5 py-3 font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2"
                    onClick={() => void startScanner()}
                    disabled={scannerState === "starting"}
                  >
                    {scannerState === "starting"
                      ? "Avvio..."
                      : "Avvia scanner"}
                  </button>
                )}
              </div>
            </section>

            {scanOutcome ? (
              <section
                className={`rounded-[1.25rem] border p-5 sm:p-6 ${outcomeClasses}`}
                role={scanOutcome.tone === "error" ? "alert" : "status"}
                aria-live="assertive"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">
                  Esito scansione
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  {scanOutcome.title}
                </h2>
                <p className="mt-2 text-base leading-7 opacity-85">
                  {scanOutcome.message}
                </p>
                {scanOutcome.item ? (
                  <p className="mt-4 text-sm font-semibold opacity-75">
                    Tessera {scanOutcome.item.card_no} /{" "}
                    {scanOutcome.item.card_year}
                  </p>
                ) : null}
              </section>
            ) : (
              <p className="attendance-station-helper px-1 text-center text-sm leading-6 text-slate-600">
                Dopo ogni esito puoi inquadrare subito la tessera successiva.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
