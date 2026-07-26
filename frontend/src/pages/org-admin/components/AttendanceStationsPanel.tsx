import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  createOrgAdminAttendanceStation,
  fetchOrgAdminAttendanceStations,
  renewOrgAdminAttendanceStationPairing,
  revokeOrgAdminAttendanceStation,
  type AttendanceStation,
  type AttendanceStationPairing,
} from "../../../lib/api";
import { EmptyState, SectionPanel, StatusChip } from "./OrgAdminPrimitives";

function formatDateTime(value: string | null) {
  if (!value) return "Mai";
  return new Date(value).toLocaleString("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Rome",
  });
}

function stationStatus(station: AttendanceStation) {
  if (station.status === "active") {
    return { label: "Attiva", tone: "success" as const };
  }
  if (station.status === "revoked") {
    return { label: "Revocata", tone: "danger" as const };
  }
  return { label: "Da collegare", tone: "warning" as const };
}

export default function AttendanceStationsPanel() {
  const [stations, setStations] = useState<AttendanceStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyStationId, setBusyStationId] = useState<number | null>(null);
  const [pairing, setPairing] = useState<AttendanceStationPairing | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState<number | null>(null);
  const [confirmRelinkId, setConfirmRelinkId] = useState<number | null>(null);

  const loadStations = useCallback(async () => {
    setError("");
    try {
      const response = await fetchOrgAdminAttendanceStations();
      setStations(response.items);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Errore caricamento postazioni",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStations();
  }, [loadStations]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (normalizedName.length < 2 || creating) return;
    setCreating(true);
    setError("");
    setCopied(false);
    try {
      const response = await createOrgAdminAttendanceStation(normalizedName);
      setPairing(response);
      setName("");
      await loadStations();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Impossibile creare la postazione",
      );
    } finally {
      setCreating(false);
    }
  };

  const createPairing = async (stationId: number) => {
    setBusyStationId(stationId);
    setError("");
    setCopied(false);
    try {
      const response =
        await renewOrgAdminAttendanceStationPairing(stationId);
      setPairing(response);
      setConfirmRelinkId(null);
      await loadStations();
    } catch (pairingError) {
      setError(
        pairingError instanceof Error
          ? pairingError.message
          : "Impossibile collegare la postazione",
      );
    } finally {
      setBusyStationId(null);
    }
  };

  const revoke = async (stationId: number) => {
    setBusyStationId(stationId);
    setError("");
    try {
      await revokeOrgAdminAttendanceStation(stationId);
      if (pairing?.station.id === stationId) setPairing(null);
      setConfirmRevokeId(null);
      await loadStations();
    } catch (revokeError) {
      setError(
        revokeError instanceof Error
          ? revokeError.message
          : "Impossibile revocare la postazione",
      );
    } finally {
      setBusyStationId(null);
    }
  };

  const copyPairingLink = async () => {
    if (!pairing) return;
    try {
      await navigator.clipboard.writeText(pairing.pairing_url);
      setCopied(true);
    } catch {
      setCopied(false);
      setError("Copia non riuscita: seleziona e copia il link manualmente.");
    }
  };

  return (
    <SectionPanel
      title="Postazioni scanner"
      eyebrow="Ingressi senza login"
      action={
        <StatusChip tone={stations.some((station) => station.status === "active") ? "success" : "muted"}>
          {stations.filter((station) => station.status === "active").length} attive
        </StatusChip>
      }
    >
      <div className="grid gap-6 p-5 md:p-6">
        <div className="max-w-3xl">
          <p className="text-sm leading-6 text-slate-600">
            Collega un telefono o tablet del club. Il dispositivo potrà aprire
            soltanto lo scanner presenze e accettare tessere di questa
            associazione.
          </p>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
            onSubmit={handleCreate}
          >
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Nome postazione
              </span>
              <input
                className="theme-input mt-2 w-full"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Es. Tablet reception"
                maxLength={120}
                autoComplete="off"
              />
            </label>
            <button
              className="btn-primary min-h-11 self-end justify-center"
              type="submit"
              disabled={creating || name.trim().length < 2}
            >
              {creating ? "Creo..." : "Crea postazione"}
            </button>
          </form>
        </div>

        {error ? (
          <div
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {pairing ? (
          <div
            className="attendance-station-pairing grid gap-5 border border-emerald-200 bg-emerald-50 p-5 md:grid-cols-[180px_minmax(0,1fr)] md:p-6"
            aria-live="polite"
          >
            <div className="mx-auto w-full max-w-[180px] rounded-xl bg-white p-3">
              <img
                src={pairing.pairing_qr_data_url}
                alt={`QR per collegare ${pairing.station.name}`}
                className="aspect-square w-full"
              />
            </div>
            <div className="min-w-0 self-center">
              <StatusChip tone="success">Pronto da collegare</StatusChip>
              <h3 className="mt-3 text-xl font-semibold text-slate-950">
                {pairing.station.name}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                Inquadra questo QR dal dispositivo da usare all’ingresso. Il
                collegamento è monouso e scade alle{" "}
                {formatDateTime(pairing.pairing_expires_at)}.
              </p>
              <input
                className="theme-input mt-4 w-full text-sm"
                readOnly
                value={pairing.pairing_url}
                aria-label="Link di collegamento postazione"
                onFocus={(event) => event.currentTarget.select()}
              />
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  className="btn-secondary min-h-11 justify-center"
                  onClick={() => void copyPairingLink()}
                >
                  {copied ? "Link copiato" : "Copia link"}
                </button>
                <a
                  className="btn-primary min-h-11 justify-center"
                  href={pairing.pairing_url}
                >
                  Collega questo dispositivo
                </a>
                <button
                  type="button"
                  className="btn-ghost min-h-11 justify-center"
                  onClick={() => setPairing(null)}
                >
                  Chiudi
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-500">Caricamento postazioni...</p>
        ) : stations.length === 0 ? (
          <EmptyState
            title="Nessuna postazione collegata"
            description="Crea la prima postazione e inquadra il QR di associazione dal dispositivo del club."
          />
        ) : (
          <div className="divide-y divide-slate-100 border-y border-slate-100">
            {stations.map((station) => {
              const status = stationStatus(station);
              const isBusy = busyStationId === station.id;
              const confirmsRevoke = confirmRevokeId === station.id;
              const confirmsRelink = confirmRelinkId === station.id;
              return (
                <article
                  key={station.id}
                  className="grid gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(190px,auto)] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-950">
                        {station.name}
                      </h3>
                      <StatusChip tone={status.tone}>{status.label}</StatusChip>
                    </div>
                    <dl className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                      <div>
                        <dt className="inline font-medium text-slate-500">
                          Collegata:{" "}
                        </dt>
                        <dd className="inline">{formatDateTime(station.paired_at)}</dd>
                      </div>
                      <div>
                        <dt className="inline font-medium text-slate-500">
                          Ultimo utilizzo:{" "}
                        </dt>
                        <dd className="inline">
                          {formatDateTime(station.last_used_at)}
                        </dd>
                      </div>
                    </dl>
                    {confirmsRelink ? (
                      <p className="mt-3 text-sm font-medium text-amber-800">
                        Il dispositivo attuale verrà scollegato immediatamente.
                      </p>
                    ) : null}
                    {confirmsRevoke ? (
                      <p className="mt-3 text-sm font-medium text-rose-800">
                        La revoca è immediata e blocca le prossime scansioni.
                      </p>
                    ) : null}
                  </div>

                  {station.status !== "revoked" ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
                      {confirmsRelink ? (
                        <>
                          <button
                            className="btn-secondary min-h-11 justify-center"
                            type="button"
                            disabled={isBusy}
                            onClick={() => void createPairing(station.id)}
                          >
                            {isBusy ? "Attendo..." : "Conferma ricollega"}
                          </button>
                          <button
                            className="btn-ghost min-h-11 justify-center"
                            type="button"
                            onClick={() => setConfirmRelinkId(null)}
                          >
                            Annulla
                          </button>
                        </>
                      ) : confirmsRevoke ? (
                        <>
                          <button
                            className="btn-secondary min-h-11 justify-center text-rose-700"
                            type="button"
                            disabled={isBusy}
                            onClick={() => void revoke(station.id)}
                          >
                            {isBusy ? "Revoco..." : "Conferma revoca"}
                          </button>
                          <button
                            className="btn-ghost min-h-11 justify-center"
                            type="button"
                            onClick={() => setConfirmRevokeId(null)}
                          >
                            Annulla
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="btn-secondary min-h-11 justify-center"
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                              if (station.status === "active") {
                                setConfirmRelinkId(station.id);
                                setConfirmRevokeId(null);
                              } else {
                                void createPairing(station.id);
                              }
                            }}
                          >
                            {station.status === "active"
                              ? "Ricollega"
                              : "Genera collegamento"}
                          </button>
                          <button
                            className="btn-ghost min-h-11 justify-center text-rose-700"
                            type="button"
                            onClick={() => {
                              setConfirmRevokeId(station.id);
                              setConfirmRelinkId(null);
                            }}
                          >
                            Revoca
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </SectionPanel>
  );
}
