import { useEffect } from "react";
import { Link } from "react-router-dom";
import { applySeo } from "../lib/seo";

export const PRIVACY_NOTICE_VERSION = "2026-07-15.2";

type PrivacySection = {
  title: string;
  intro?: string;
  paragraphs?: string[];
  bullets?: string[];
  note?: string;
};

const CONTACT_DETAILS = {
  organization: "ASSO.N.A.M. - Associazione Nazionale Arti e Mestieri",
  address: "Via Sambucuccio d'Alando, 10 - 00162 Roma (RM)",
  vatNumber: "IT11257860962",
  fiscalCode: "97542050154",
  email: "asso.nam@email.it",
  phone: "+39 06 3972 4643",
} as const;

const HIGHLIGHTS = [
  {
    label: "Ambito",
    value: "iscrizione socio online e gestione del rapporto associativo",
  },
  {
    label: "Servizi coperti",
    value: "tessera digitale, area riservata, libro soci digitale",
  },
  {
    label: "Scelta dell'interessato",
    value: "comunicazioni promozionali via email solo con consenso facoltativo",
  },
] as const;

const SECTIONS: PrivacySection[] = [
  {
    title: "1. Titolari e ruoli nel trattamento",
    paragraphs: [
      `${CONTACT_DETAILS.organization}, P.IVA ${CONTACT_DETAILS.vatNumber} e C.F. ${CONTACT_DETAILS.fiscalCode}, con sede in ${CONTACT_DETAILS.address}, opera quale Titolare per le finalità proprie di affiliazione e amministrazione centrale, gestione degli account e della piattaforma, sicurezza, prevenzione degli abusi, adempimenti di legge e tutela dei propri diritti. Per questi ambiti è contattabile all'indirizzo ${CONTACT_DETAILS.email} o al numero ${CONTACT_DETAILS.phone}.`,
      "Per l'ammissione alla singola associazione, il relativo libro soci, la quota, le attività locali e le campagne decise autonomamente, il Titolare è di regola l'associazione, il circolo o il club al quale l'interessato chiede di iscriversi. I suoi riferimenti sono indicati nella pagina dell'associazione e nelle comunicazioni ricevute.",
      "Quando mette a disposizione la piattaforma per tali finalità locali, ASSO.N.A.M. tratta i dati per conto dell'associazione. Questo rapporto deve essere disciplinato ai sensi dell'articolo 28 GDPR, con istruzioni documentate e gli altri contenuti obbligatori previsti dalla norma.",
      "Un'associazione può invece operare quale Responsabile di ASSO.N.A.M. soltanto per attività circoscritte svolte esclusivamente per conto di ASSO.N.A.M. e sulla base di istruzioni documentate, senza perseguire finalità proprie.",
      "Qualora una finalità e i relativi mezzi essenziali siano determinati congiuntamente, i soggetti interessati disciplinano le rispettive responsabilità ai sensi dell'articolo 26 GDPR e ne rendono disponibile il contenuto essenziale.",
    ],
  },
  {
    title: "2. Categorie di dati trattati",
    intro:
      "Nel contesto dell'iscrizione e della gestione del rapporto associativo possono essere trattate, a seconda del caso concreto, le seguenti categorie di dati:",
    bullets: [
      "dati identificativi e anagrafici, quali nome, cognome, data e luogo di nascita, sesso e codice fiscale;",
      "dati di contatto, quali indirizzo email e numero di telefono;",
      "dati associativi, quali data di iscrizione, stato della pratica, numero tessera, anno di validità e associazione o club di riferimento;",
      "dati relativi all'account e informazioni tecniche necessarie alla sicurezza dell'area riservata;",
      "eventuale documento di identità e dati in esso contenuti, esclusivamente quando richiesto per la verifica della pratica;",
      "dati relativi al pagamento della quota associativa, senza memorizzare nel portale i dati completi della carta;",
      "dati tecnici di navigazione, log applicativi e cookie tecnici necessari al funzionamento del servizio;",
      "preferenze relative alle comunicazioni promozionali e prova dell'eventuale consenso o della sua revoca.",
    ],
  },
  {
    title: "3. Finalità del trattamento",
    intro: "I dati personali sono trattati per finalità determinate, esplicite e legittime, tra cui:",
    bullets: [
      "gestione della richiesta di iscrizione e delle verifiche preliminari;",
      "costituzione, gestione e aggiornamento del rapporto associativo;",
      "emissione, attivazione, invio e gestione della tessera associativa digitale;",
      "tenuta del libro soci digitale e gestione organizzativa e amministrativa del rapporto;",
      "gestione dell'account, autenticazione, prevenzione degli accessi non autorizzati e sicurezza del portale;",
      "gestione della quota associativa e del relativo pagamento, quando previsto;",
      "invio di comunicazioni operative e di servizio relative a iscrizione, tessera, documenti, pagamenti o rapporto associativo;",
      "adempimento di obblighi normativi e tutela dei diritti del titolare competente;",
      "previo consenso facoltativo, invio via email di comunicazioni informative e promozionali su attività, eventi e iniziative dell'associazione di iscrizione.",
    ],
  },
  {
    title: "4. Base giuridica",
    bullets: [
      "la gestione della richiesta di iscrizione e dei contatti avviati dall'interessato si fonda sull'esecuzione di misure richieste dall'interessato;",
      "la gestione del rapporto associativo, dell'area riservata, della tessera e dei servizi richiesti si fonda sull'esecuzione del rapporto associativo;",
      "gli adempimenti amministrativi, contabili e organizzativi previsti dalla normativa si fondano sull'adempimento di obblighi legali, ove applicabili;",
      "i controlli tecnici, la prevenzione degli abusi e la protezione del portale si fondano sul legittimo interesse alla sicurezza dei sistemi, alla continuità operativa e alla difesa dei diritti;",
      "le comunicazioni informative e promozionali via email si fondano esclusivamente sul consenso facoltativo dell'interessato, che può essere revocato in qualsiasi momento.",
    ],
  },
  {
    title: "5. Natura del conferimento dei dati",
    paragraphs: [
      "Il conferimento dei dati indicati come necessari nel flusso di iscrizione è indispensabile per gestire la richiesta, creare l'account, amministrare il rapporto associativo ed emettere la tessera digitale.",
      "Il mancato conferimento dei dati necessari può impedire di completare l'iscrizione o di erogare i servizi associativi richiesti.",
      "Il consenso alle comunicazioni informative e promozionali è invece facoltativo: il rifiuto o la revoca non producono conseguenze sull'iscrizione, sul pagamento, sull'approvazione della pratica, sulla tessera o sull'accesso ai servizi associativi.",
    ],
  },
  {
    title: "6. Comunicazioni operative e promozionali",
    paragraphs: [
      "Le comunicazioni necessarie alla gestione dell'iscrizione e del rapporto associativo, come conferme, ricevute, avvisi sulla pratica, documenti e tessera, sono comunicazioni di servizio e non dipendono dal consenso promozionale.",
      "Le comunicazioni promozionali sono inviate soltanto via email e soltanto a chi ha prestato uno specifico consenso. Ogni messaggio promozionale contiene uno strumento semplice per revocarlo.",
      "Il consenso raccolto nel flusso di iscrizione non autorizza la comunicazione dei dati a partner per loro autonome finalità di marketing. Un'eventuale finalità di questo tipo richiederebbe una informativa e un consenso separati.",
    ],
  },
  {
    title: "7. Destinatari o categorie di destinatari",
    intro: "I dati possono essere comunicati, nei limiti pertinenti alle finalità indicate, a:",
    bullets: [
      "personale, collaboratori e soggetti autorizzati che operano secondo istruzioni ricevute;",
      "ASSO.N.A.M., quando opera come responsabile della piattaforma per conto dell'associazione titolare;",
      "l'associazione di iscrizione e i suoi soggetti autorizzati, nei limiti del rapporto e delle finalità di competenza;",
      "fornitori di hosting, manutenzione, posta elettronica, archiviazione, pagamento e servizi di tessera o wallet digitale;",
      "soggetti nominati responsabili del trattamento ai sensi dell'articolo 28 GDPR, ove richiesto;",
      "autorità, enti pubblici o altri soggetti legittimati a ricevere i dati in forza della normativa applicabile.",
    ],
  },
  {
    title: "8. Trasferimenti verso Paesi extra SEE",
    paragraphs: [
      "Il database e i file applicativi primari del portale sono ospitati su infrastruttura Hetzner nella località NBG1, Norimberga, Germania, quindi nello Spazio Economico Europeo. Non sono ospitati in Italia.",
      "Servizi tecnici quali protezione della rete, posta elettronica, messaggistica, pagamenti, wallet digitale e assistenza possono tuttavia comportare trattamenti o accessi ai dati anche al di fuori dello SEE, secondo la configurazione e le condizioni del fornitore utilizzato.",
      "La verifica e la formalizzazione delle garanzie applicabili ai singoli fornitori sono in corso. Quando un servizio comporta un trasferimento extra SEE, il titolare deve individuare e documentare una base valida, come una decisione di adeguatezza o le clausole contrattuali standard, svolgere le valutazioni richieste e adottare le eventuali misure supplementari. L'interessato può chiedere informazioni sulle garanzie applicabili al proprio caso.",
    ],
  },
  {
    title: "9. Periodo di conservazione",
    intro:
      "I termini massimi organizzativi definiti nel piano interno sono riportati di seguito. La loro applicazione è oggi in parte automatizzata e in parte affidata a controlli organizzativi da completare e documentare; quando un job automatico non è ancora disponibile, il titolare competente deve comunque effettuare la revisione e la cancellazione secondo questi termini. Un obbligo di legge, un contenzioso o un legal hold documentato può sospendere la cancellazione per il solo tempo necessario.",
    bullets: [
      "per una pratica soltanto iniziata e non presentata il termine massimo previsto è di 30 giorni dall'ultima attività; per una pratica presentata e poi rifiutata o chiusa è di 180 giorni, salvo contestazioni o obblighi documentati;",
      "per la copia del documento di identità, quando richiesta, è previsto un termine massimo di 30 giorni dalla verifica o decisione finale, mantenendo soltanto l'esito minimo necessario, salvo uno specifico obbligo di legge;",
      "i dati operativi del socio sono conservati per la durata del rapporto e per i 12 mesi successivi; lo storico minimo necessario del libro soci e della tessera può essere conservato per 10 anni dalla cessazione;",
      "i documenti e i riferimenti contabili sono conservati per 10 anni dall'ultima registrazione, o più a lungo quando necessario per un accertamento o un contenzioso in corso;",
      "il consenso promozionale non è più utilizzato dopo la revoca e viene riesaminato in caso di inattività protratta; la prova minimizzata di consenso, revoca e ultimi invii è conservata per 5 anni dall'ultimo utilizzo o dalla revoca;",
      "i termini previsti sono 30 giorni per i log applicativi ordinari, 90 giorni per quelli di sicurezza e 24 mesi per l'audit amministrativo, salvo incidente o legal hold documentato;",
      "per i backup rolling è definito un ciclo massimo ordinario di 60 giorni; gli ulteriori periodi per moduli, prenotazioni, messaggi, webhook e provider sono descritti nel piano di conservazione interno.",
    ],
  },
  {
    title: "10. Modalità del trattamento e sicurezza",
    paragraphs: [
      "Il trattamento avviene mediante strumenti informatici, telematici e organizzativi adeguati alla natura dei dati e secondo i principi di liceità, correttezza, trasparenza, minimizzazione e limitazione della conservazione.",
      "Sono adottate misure volte a limitare l'accesso ai soli soggetti autorizzati e a ridurre i rischi di perdita, divulgazione non autorizzata, accesso abusivo o uso illecito dei dati personali.",
    ],
  },
  {
    title: "11. Diritti dell'interessato",
    intro: "Nei casi previsti dagli articoli 15 e seguenti del GDPR, l'interessato può:",
    bullets: [
      "accedere ai propri dati e ottenerne copia;",
      "chiedere rettifica, integrazione, cancellazione o limitazione del trattamento;",
      "opporsi al trattamento nei casi previsti dalla legge;",
      "esercitare il diritto alla portabilità, ove applicabile;",
      "revocare in qualsiasi momento il consenso promozionale, senza pregiudicare la liceità del trattamento effettuato prima della revoca;",
      "proporre reclamo al Garante per la protezione dei dati personali.",
    ],
    note:
      `Per i dati del rapporto associativo e le campagne promozionali è possibile rivolgersi anzitutto all'associazione di iscrizione. Per i trattamenti svolti da ASSONAM quale autonomo titolare è possibile scrivere a ${CONTACT_DETAILS.email}. La revoca delle comunicazioni promozionali può essere effettuata anche tramite il link presente in ogni email promozionale.`,
  },
  {
    title: "12. Cookie e strumenti analoghi",
    paragraphs: [
      "Il portale utilizza cookie tecnici e strumenti analoghi necessari al funzionamento delle pagine pubbliche, dell'area riservata, dell'autenticazione e delle funzioni essenziali del servizio.",
      "Qualora vengano introdotti strumenti non tecnici, saranno fornite le informazioni e le scelte richieste dalla normativa prima della loro attivazione.",
    ],
  },
];

const Privacy = () => {
  useEffect(() => {
    applySeo({
      title: "Informativa privacy iscrizione soci",
      description:
        "Informativa ASSONAM sul trattamento dei dati personali per iscrizione soci, tessera digitale, area riservata e comunicazioni promozionali facoltative.",
      canonicalPath: "/privacy",
    });
  }, []);

  return (
    <section className="py-16" data-reveal="fade-up">
      <div className="container-shell">
        <div className="surface-strong overflow-hidden p-8 md:p-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.9fr)] lg:items-start">
            <div className="max-w-4xl">
              <p className="section-title">Privacy</p>
              <h1 className="section-heading">Informativa sul trattamento dei dati personali</h1>
              <p className="mt-5 max-w-3xl text-base leading-8 text-neutral-600">
                Informativa resa ai sensi del Regolamento (UE) 2016/679 e della normativa italiana
                vigente per il trattamento dei dati personali effettuato tramite il portale ASSONAM
                dedicato all&apos;iscrizione, alla tessera associativa digitale, al libro soci, ai
                servizi riservati e, previo consenso, alle comunicazioni promozionali via email.
              </p>
            </div>

            <aside className="surface h-full p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                Riferimenti
              </p>
              <dl className="mt-4 space-y-4">
                <div>
                  <dt className="text-xs uppercase tracking-[0.16em] text-neutral-400">
                    Gestore piattaforma
                  </dt>
                  <dd className="mt-1 text-sm font-medium leading-6 text-neutral-900">
                    {CONTACT_DETAILS.organization}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.16em] text-neutral-400">Sede</dt>
                  <dd className="mt-1 text-sm leading-6 text-neutral-700">{CONTACT_DETAILS.address}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.16em] text-neutral-400">
                    Identificativi
                  </dt>
                  <dd className="mt-1 space-y-1 text-sm leading-6 text-neutral-700">
                    <p>P.IVA {CONTACT_DETAILS.vatNumber}</p>
                    <p>C.F. {CONTACT_DETAILS.fiscalCode}</p>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.16em] text-neutral-400">Contatti</dt>
                  <dd className="mt-1 space-y-1 text-sm leading-6 text-neutral-700">
                    <p>{CONTACT_DETAILS.email}</p>
                    <p>{CONTACT_DETAILS.phone}</p>
                  </dd>
                </div>
              </dl>
            </aside>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3" data-reveal="stagger">
            {HIGHLIGHTS.map((item) => (
              <article key={item.label} className="surface p-5" data-reveal-item>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                  {item.label}
                </p>
                <p className="mt-3 text-sm leading-7 text-neutral-700">{item.value}</p>
              </article>
            ))}
          </div>

          <div className="mt-10 space-y-4" data-reveal="stagger">
            {SECTIONS.map((section) => (
              <article key={section.title} className="surface p-6 md:p-7" data-reveal-item>
                <h2 className="text-lg font-semibold text-neutral-900">{section.title}</h2>
                {section.intro ? (
                  <p className="mt-3 text-sm leading-7 text-neutral-600">{section.intro}</p>
                ) : null}
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph} className="mt-3 text-sm leading-7 text-neutral-600">
                    {paragraph}
                  </p>
                ))}
                {section.bullets?.length ? (
                  <ul className="mt-4 space-y-2.5 text-sm leading-7 text-neutral-600">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-3">
                        <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/70" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {section.note ? (
                  <div className="mt-4 rounded-xl border border-brand/15 bg-brand/[0.04] px-4 py-3">
                    <p className="text-sm leading-7 text-neutral-700">{section.note}</p>
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200/70 pt-6">
            <p className="text-xs text-neutral-500">
              Versione {PRIVACY_NOTICE_VERSION} — efficace dal 15 luglio 2026
            </p>
            <div className="flex flex-wrap gap-3">
              <Link className="btn-ghost px-5 py-2.5" to="/contatti">
                Contatti
              </Link>
              <Link className="btn-ghost px-5 py-2.5" to="/">
                Torna alla home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Privacy;
