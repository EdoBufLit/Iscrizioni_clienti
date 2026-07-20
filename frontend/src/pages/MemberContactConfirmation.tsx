import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { authorizeMemberEmailChange, confirmMemberContactChange } from "../lib/api";
import { applySeo } from "../lib/seo";

const MemberContactConfirmation = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const isAuthorization = searchParams.get("action") === "authorize";
  const [status, setStatus] = useState<"ready" | "busy" | "success" | "error">("ready");
  const [message, setMessage] = useState("");

  useEffect(() => {
    applySeo({ title: "Conferma contatto", description: "Conferma modifica contatto ASSONAM", noindex: true });
  }, []);

  const confirm = async () => {
    if (!token || status === "busy") return;
    setStatus("busy");
    setMessage("");
    try {
      if (isAuthorization) {
        await authorizeMemberEmailChange(token);
        window.history.replaceState({}, document.title, "/conferma-contatto");
        setStatus("success");
        setMessage("Modifica autorizzata dalla vecchia email. Ora conferma il link ricevuto al nuovo indirizzo.");
        return;
      }
      const field = await confirmMemberContactChange(token);
      window.history.replaceState({}, document.title, "/conferma-contatto");
      setStatus("success");
      setMessage(field === "email" ? "Il nuovo indirizzo email è attivo." : "Il nuovo numero di telefono è stato salvato.");
    } catch (caught) {
      setStatus("error");
      setMessage(caught instanceof Error ? caught.message : "Il link non è valido.");
    }
  };

  return (
    <main className="container-shell flex min-h-[65vh] items-center justify-center py-12">
      <section className="surface w-full max-w-xl p-7 text-center" aria-labelledby="contact-confirm-title">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Sicurezza account</p>
        <h1 id="contact-confirm-title" className="mt-2 text-2xl font-bold text-neutral-950">{isAuthorization ? "Autorizza modifica email" : "Conferma modifica contatto"}</h1>
        {status === "success" ? (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900" role="status">{message}</div>
        ) : (
          <>
            <p className="mt-3 text-sm leading-6 text-neutral-600">{isAuthorization ? "Questa autorizzazione prova l’accesso al vecchio indirizzo. Per completare servirà anche il link inviato alla nuova email." : "La modifica verrà applicata solo dopo le verifiche richieste. Il link è monouso e non mostra dati personali."}</p>
            {status === "error" || !token ? <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{message || "Token mancante o non valido."}</div> : null}
            <button className="btn-primary mt-6 px-6 py-3" type="button" disabled={!token || status === "busy"} onClick={() => void confirm()}>{status === "busy" ? "Verifica in corso…" : isAuthorization ? "Autorizza modifica" : "Conferma modifica"}</button>
          </>
        )}
        <div className="mt-6"><Link className="text-sm font-semibold text-brand hover:underline" to="/dashboard/profilo">Vai al profilo</Link></div>
      </section>
    </main>
  );
};

export default MemberContactConfirmation;
