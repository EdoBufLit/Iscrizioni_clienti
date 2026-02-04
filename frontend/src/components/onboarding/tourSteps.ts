import type { Step } from "react-joyride";

export type TourStepMeta = {
  route?: string; // Route to navigate to before showing this step
  optional?: boolean; // If true, skip if target not found (conditional elements)
};

export type TourStep = Step & TourStepMeta;

export const MEMBER_TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="member-dashboard-home"]',
    title: "Benvenuto nella tua area socio",
    content:
      "Qui puoi gestire la tua iscrizione, controllare lo stato dei documenti e comunicare con l'associazione. Questa guida ti spiega come funziona tutto.",
    placement: "bottom",
    disableBeacon: true,
    route: "/dashboard",
  },
  {
    target: '[data-tour="member-status"]',
    title: "Stato della tua iscrizione",
    content:
      "Qui vedi lo stato della tua iscrizione. Se vedi \"In revisione\" o \"Azione richiesta\", significa che c'è qualcosa da completare.",
    placement: "bottom",
    route: "/dashboard",
  },
  {
    target: '[data-tour="member-card-number"]',
    title: "Numero di tessera",
    content:
      "Quando la tua iscrizione è attiva, qui troverai il tuo numero di tessera assegnato dall'associazione.",
    placement: "bottom",
    route: "/dashboard",
  },
  {
    target: '[data-tour="member-documents"]',
    title: "Documenti richiesti",
    content:
      "In questa sezione carichi i documenti richiesti dall'associazione. Ogni documento viene verificato da un amministratore.",
    placement: "bottom",
    route: "/dashboard/documenti",
  },
  {
    target: '[data-tour="member-document-rejected"]',
    title: "Documento rigettato",
    content:
      "Se un documento viene rigettato, qui troverai la motivazione. Leggi le note e carica un nuovo documento corretto.",
    placement: "bottom",
    route: "/dashboard/documenti",
    optional: true, // Only shows if there's a rejected document
  },
  {
    target: '[data-tour="member-upload-document"]',
    title: "Caricare un nuovo documento",
    content:
      "Dopo un rigetto puoi caricare un nuovo documento direttamente da qui. Il nuovo file verrà rimesso in revisione.",
    placement: "top",
    route: "/dashboard/documenti",
    optional: true, // Only shows if there's a rejected document
  },
];

export const ORG_ADMIN_TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="admin-dashboard-home"]',
    title: "Benvenuto nella dashboard amministratore",
    content:
      "Da qui gestisci i soci, i documenti, le tessere e le operazioni della tua associazione.",
    placement: "bottom",
    disableBeacon: true,
    route: "/org-admin",
  },
  {
    target: '[data-tour="admin-stats"]',
    title: "Stato e statistiche",
    content:
      "Questa sezione ti aiuta a capire quanti soci sono attivi, in attesa o con documenti da verificare.",
    placement: "bottom",
    route: "/org-admin",
  },
  {
    target: '[data-tour="admin-members-list"]',
    title: "Elenco soci",
    content:
      "Qui trovi tutti i soci iscritti. Puoi cercarli, filtrarli e accedere al loro dettaglio.",
    placement: "bottom",
    route: "/org-admin/soci",
  },
  {
    target: '[data-tour="admin-add-member"]',
    title: "Aggiungere un socio manualmente",
    content:
      "Puoi aggiungere soci manualmente, ad esempio per iscrizioni fatte in sede o migrazioni da altri sistemi.",
    placement: "bottom",
    route: "/org-admin/soci",
  },
  {
    target: '[data-tour="admin-cards"]',
    title: "Gestione tessere",
    content:
      "Qui gestisci i lotti di tessere. Le tessere vengono assegnate automaticamente ai nuovi soci disponibili.",
    placement: "bottom",
    route: "/org-admin/tessere",
  },
];

export const TOUR_FINAL_MESSAGE = {
  member: {
    title: "Guida completata",
    content: "Hai completato la guida. Puoi rivederla in qualsiasi momento dal menu.",
  },
  org_admin: {
    title: "Guida completata",
    content: "Hai completato la guida amministratore. Puoi riaprirla in qualsiasi momento dal menu.",
  },
};
