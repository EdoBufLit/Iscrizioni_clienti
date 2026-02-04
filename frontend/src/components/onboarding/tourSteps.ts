import type { Step } from "react-joyride";

export const MEMBER_TOUR_STEPS: Step[] = [
  {
    target: '[data-tour="member-dashboard-home"]',
    title: "Benvenuto nella tua area socio",
    content:
      "Qui puoi gestire la tua iscrizione, controllare lo stato dei documenti e comunicare con l'associazione. Questa guida ti spiega come funziona tutto.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    target: '[data-tour="member-status"]',
    title: "Stato della tua iscrizione",
    content:
      "Qui vedi lo stato della tua iscrizione. Se vedi \"In revisione\" o \"Azione richiesta\", significa che c'è qualcosa da completare.",
    placement: "bottom",
  },
  {
    target: '[data-tour="member-documents"]',
    title: "Documenti richiesti",
    content:
      "In questa sezione carichi i documenti richiesti dall'associazione. Ogni documento viene verificato da un amministratore.",
    placement: "bottom",
  },
  {
    target: '[data-tour="member-document-rejected"]',
    title: "Documento rigettato",
    content:
      "Se un documento viene rigettato, qui troverai la motivazione. Leggi le note e carica un nuovo documento corretto.",
    placement: "bottom",
  },
  {
    target: '[data-tour="member-upload-document"]',
    title: "Caricare un nuovo documento",
    content:
      "Dopo un rigetto puoi caricare un nuovo documento direttamente da qui. Il nuovo file verrà rimesso in revisione.",
    placement: "top",
  },
  {
    target: '[data-tour="member-card-number"]',
    title: "Numero di tessera",
    content:
      "Quando la tua iscrizione è attiva, qui troverai il tuo numero di tessera assegnato dall'associazione.",
    placement: "bottom",
  },
  {
    target: '[data-tour="member-help"]',
    title: "Hai bisogno di aiuto?",
    content:
      "Se hai dubbi o problemi, puoi contattare l'associazione da questa sezione.",
    placement: "bottom",
  },
];

export const ORG_ADMIN_TOUR_STEPS: Step[] = [
  {
    target: '[data-tour="admin-dashboard-home"]',
    title: "Benvenuto nella dashboard amministratore",
    content:
      "Da qui gestisci i soci, i documenti, le tessere e le operazioni della tua associazione.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    target: '[data-tour="admin-members-list"]',
    title: "Elenco soci",
    content:
      "Qui trovi tutti i soci iscritti. Puoi cercarli, filtrarli e accedere al loro dettaglio.",
    placement: "bottom",
  },
  {
    target: '[data-tour="admin-add-member"]',
    title: "Aggiungere un socio manualmente",
    content:
      "Puoi aggiungere soci manualmente, ad esempio per iscrizioni fatte in sede o migrazioni da altri sistemi.",
    placement: "bottom",
  },
  {
    target: '[data-tour="admin-send-access"]',
    title: "Inviare l'accesso al socio",
    content:
      "Se un socio non ha accesso alla dashboard, puoi inviargli un magic link da qui.",
    placement: "left",
  },
  {
    target: '[data-tour="admin-documents"]',
    title: "Verifica documenti",
    content:
      "Qui controlli i documenti caricati dai soci. Puoi approvarli o rigettarli.",
    placement: "bottom",
  },
  {
    target: '[data-tour="admin-document-reject"]',
    title: "Rigetto con motivazione",
    content:
      "Quando rigetti un documento, inserisci sempre una motivazione chiara: il socio la vedrà e potrà correggere l'errore.",
    placement: "left",
  },
  {
    target: '[data-tour="admin-cards"]',
    title: "Gestione tessere",
    content:
      "Qui gestisci i lotti di tessere. Le tessere vengono assegnate automaticamente ai nuovi soci disponibili.",
    placement: "bottom",
  },
  {
    target: '[data-tour="admin-stats"]',
    title: "Stato e statistiche",
    content:
      "Questa sezione ti aiuta a capire quanti soci sono attivi, in attesa o con documenti da verificare.",
    placement: "bottom",
  },
];

export const TOUR_FINAL_MESSAGE = {
  member: {
    title: "Guida completata",
    content: "Hai completato la guida. Puoi rivederla in qualsiasi momento dal menu di aiuto.",
  },
  org_admin: {
    title: "Guida completata",
    content: "Hai completato la guida amministratore. Puoi riaprirla in qualsiasi momento dal menu di aiuto.",
  },
};
