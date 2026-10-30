import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiLogout } from "../../lib/api";

export default function MemberLogoutButton({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await apiLogout(); navigate("/login", { replace: true }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Uscita non riuscita. Riprova."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className="member-logout">
    <button type="button" className="btn-ghost" onClick={() => void logout()} disabled={busy} aria-busy={busy}>
      {busy ? "Uscita in corso…" : compact ? "Esci" : "Esci dall'account"}
    </button>
    {error ? <p className="member-logout__error" role="alert">{error}</p> : null}
  </div>;
}
