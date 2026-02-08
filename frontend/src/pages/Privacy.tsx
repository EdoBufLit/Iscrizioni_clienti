import { useEffect } from "react";
import { Link } from "react-router-dom";
import { applySeo } from "../lib/seo";

const Privacy = () => {
  useEffect(() => {
    applySeo({
      title: "Informativa sulla privacy",
      description:
        "Informativa sul trattamento dei dati personali ai sensi del GDPR (Regolamento UE 2016/679) — ASSO.N.A.M.",
      canonicalPath: "/privacy",
    });
  }, []);

  return (
    <div>
      <section className="bg-white py-16">
        <div className="container-shell">
          <div className="max-w-3xl">
            <p className="section-title">PRIVACY</p>
            <h1 className="section-heading">Informativa sulla privacy</h1>
            <p className="mt-5 text-base leading-7 text-neutral-600">
              Informativa sul trattamento dei dati personali ai sensi del
              Regolamento (UE) 2016/679 (GDPR) e della normativa italiana
              vigente in materia di protezione dei dati personali.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container-shell">
          <div className="prose prose-neutral max-w-3xl">
            <div className="surface p-7">
              <h2 className="text-base font-semibold text-neutral-900">
                1. Titolare del trattamento
              </h2>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                Il titolare del trattamento dei dati personali è ASSO.N.A.M. —
                Associazione Nazionale Arti e Mestieri, con sede operativa in Via
                Sambucuccio d'Alando, 10 — 00162 Roma (RM).
              </p>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                Email: asso.nam@email.it — Telefono: +39 06 3972 4643
              </p>
            </div>

            <div className="surface mt-6 p-7">
              <h2 className="text-base font-semibold text-neutral-900">
                2. Finalità e base giuridica del trattamento
              </h2>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                I dati personali raccolti attraverso il portale sono trattati per
                le seguenti finalità:
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-neutral-600">
                <li>
                  <span className="mr-2 text-neutral-300">—</span>
                  Gestione delle richieste di iscrizione alle associazioni
                  affiliate
                </li>
                <li>
                  <span className="mr-2 text-neutral-300">—</span>
                  Verifica dei dati e della documentazione presentata
                </li>
                <li>
                  <span className="mr-2 text-neutral-300">—</span>
                  Emissione della tessera socio e gestione dell'area riservata
                </li>
                <li>
                  <span className="mr-2 text-neutral-300">—</span>
                  Adempimento degli obblighi amministrativi e contabili previsti
                  dalla normativa vigente e dallo statuto associativo
                </li>
                <li>
                  <span className="mr-2 text-neutral-300">—</span>
                  Comunicazioni relative allo stato della pratica e ai servizi
                  associativi
                </li>
              </ul>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                La base giuridica del trattamento è il consenso dell'interessato
                (art. 6, par. 1, lett. a del GDPR), l'esecuzione di un contratto
                (art. 6, par. 1, lett. b) e l'adempimento di obblighi legali
                (art. 6, par. 1, lett. c).
              </p>
            </div>

            <div className="surface mt-6 p-7">
              <h2 className="text-base font-semibold text-neutral-900">
                3. Dati raccolti
              </h2>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                I dati personali raccolti comprendono: nome, cognome, data di
                nascita, codice fiscale, indirizzo email, numero di telefono,
                documento di identità (facoltativo) e credenziali di accesso.
              </p>
            </div>

            <div className="surface mt-6 p-7">
              <h2 className="text-base font-semibold text-neutral-900">
                4. Modalità di trattamento e conservazione
              </h2>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                I dati sono trattati con strumenti informatici e archiviati su
                sistemi protetti. Le misure di sicurezza adottate sono conformi a
                quanto previsto dal GDPR. I dati sono conservati per il tempo
                necessario al conseguimento delle finalità indicate e comunque
                nel rispetto degli obblighi di legge.
              </p>
            </div>

            <div className="surface mt-6 p-7">
              <h2 className="text-base font-semibold text-neutral-900">
                5. Comunicazione e diffusione dei dati
              </h2>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                I dati personali non sono diffusi a terzi. Possono essere
                comunicati all'associazione affiliata per la quale è stata
                presentata richiesta di iscrizione, nonché a soggetti autorizzati
                al trattamento in qualità di responsabili o incaricati, nei
                limiti strettamente necessari alle finalità indicate.
              </p>
            </div>

            <div className="surface mt-6 p-7">
              <h2 className="text-base font-semibold text-neutral-900">
                6. Diritti dell'interessato
              </h2>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                Ai sensi degli articoli 15-22 del GDPR, l'interessato ha
                diritto di:
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-neutral-600">
                <li>
                  <span className="mr-2 text-neutral-300">—</span>
                  Accedere ai propri dati personali
                </li>
                <li>
                  <span className="mr-2 text-neutral-300">—</span>
                  Richiedere la rettifica o la cancellazione dei dati
                </li>
                <li>
                  <span className="mr-2 text-neutral-300">—</span>
                  Limitare od opporsi al trattamento
                </li>
                <li>
                  <span className="mr-2 text-neutral-300">—</span>
                  Richiedere la portabilità dei dati
                </li>
                <li>
                  <span className="mr-2 text-neutral-300">—</span>
                  Revocare il consenso in qualsiasi momento
                </li>
                <li>
                  <span className="mr-2 text-neutral-300">—</span>
                  Proporre reclamo all'Autorità Garante per la protezione dei
                  dati personali
                </li>
              </ul>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                Le richieste possono essere inviate all'indirizzo email
                asso.nam@email.it.
              </p>
            </div>

            <div className="surface mt-6 p-7">
              <h2 className="text-base font-semibold text-neutral-900">
                7. Cookie
              </h2>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                Il sito utilizza esclusivamente cookie tecnici necessari al
                funzionamento del portale e alla gestione della sessione utente.
                Non vengono utilizzati cookie di profilazione o di terze parti a
                fini pubblicitari.
              </p>
            </div>
          </div>

          <div className="mt-10 max-w-3xl">
            <p className="text-xs text-neutral-400">
              Ultimo aggiornamento: febbraio 2026
            </p>
            <div className="mt-4">
              <Link className="btn-ghost" to="/">
                Torna alla home
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Privacy;
