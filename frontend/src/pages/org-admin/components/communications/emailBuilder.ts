import type {
  OrgAdminCampaignAudienceType,
  OrgAdminCampaignRecipientMode,
  OrgAdminEmailBuilderAsset,
  OrgAdminEmailEditorStatus,
  OrgAdminEmailTemplateType,
  OrgAdminEmailTemplateVariable,
} from "../../../../lib/api";

export type BuilderBlockDefinition = {
  id: string;
  label: string;
  description: string;
  mjml: string;
};

export const TEMPLATE_TYPE_OPTIONS: Array<{
  value: OrgAdminEmailTemplateType;
  label: string;
  description: string;
}> = [
  {
    value: "newsletter",
    label: "Newsletter",
    description: "Aggiornamenti associativi, novita e comunicazioni editoriali.",
  },
  {
    value: "event",
    label: "Evento",
    description: "Inviti, convocazioni e programmi collegati ad appuntamenti.",
  },
  {
    value: "renewal_reminder",
    label: "Reminder rinnovo",
    description: "Promemoria di rinnovo quota con CTA semplice e diretta.",
  },
  {
    value: "booking_confirmation",
    label: "Conferma prenotazione",
    description: "Conferma automatica di richieste, prenotazioni o adesioni.",
  },
  {
    value: "booking_rejection",
    label: "Rigetto prenotazione",
    description: "Comunicazione chiara di rigetto con messaggio organizzazione.",
  },
  {
    value: "generic_notice",
    label: "Avviso generico",
    description: "Messaggi trasversali e note operative dell'associazione.",
  },
];

export const TEMPLATE_STATUS_OPTIONS: Array<{
  value: OrgAdminEmailEditorStatus;
  label: string;
}> = [
  { value: "draft", label: "Bozza" },
  { value: "ready", label: "Pronto" },
];

export const CAMPAIGN_AUDIENCE_OPTIONS: Array<{
  value: OrgAdminCampaignAudienceType;
  label: string;
  description: string;
}> = [
  {
    value: "active_members",
    label: "Tutti i soci attivi",
    description: "Invia alla base attiva senza segmenti ulteriori.",
  },
  {
    value: "expired_members",
    label: "Soci scaduti",
    description: "Comunica solo con i soci che devono riattivarsi.",
  },
  {
    value: "renewal_due_members",
    label: "Rinnovo in scadenza",
    description: "Target mirato su chi ha una scadenza ravvicinata.",
  },
];

export const CAMPAIGN_RECIPIENT_MODE_OPTIONS: Array<{
  value: OrgAdminCampaignRecipientMode;
  label: string;
}> = [
  { value: "all_members", label: "Tutto il segmento" },
  { value: "selected_members", label: "Solo soci selezionati" },
];

export const DEFAULT_TEMPLATE_TYPE: OrgAdminEmailTemplateType = "newsletter";
export const DEFAULT_CAMPAIGN_AUDIENCE: OrgAdminCampaignAudienceType = "active_members";
export const DEFAULT_RECIPIENT_MODE: OrgAdminCampaignRecipientMode = "all_members";
export const DEFAULT_EDITOR_STATUS: OrgAdminEmailEditorStatus = "draft";

export const BUILDER_BLOCKS: BuilderBlockDefinition[] = [
  {
    id: "assoc-hero",
    label: "Hero",
    description: "Apertura con kicker, titolo e testo introduttivo.",
    mjml: `
      <mj-section background-color="#f5f1e8" padding="36px 0 16px 0">
        <mj-column>
          <mj-text color="#8d6b3f" font-size="12px" font-weight="700" letter-spacing="1px" text-transform="uppercase">Aggiornamento associazione</mj-text>
          <mj-text color="#0f172a" font-size="28px" font-weight="700" line-height="34px" padding-top="8px">Titolo principale</mj-text>
          <mj-text color="#475569" font-size="15px" line-height="24px" padding-top="8px">Scrivi qui l'apertura del messaggio e orienta subito il socio sull'azione da compiere.</mj-text>
        </mj-column>
      </mj-section>
    `,
  },
  {
    id: "assoc-title-text",
    label: "Titolo + testo",
    description: "Sezione editoriale pulita per spiegare il messaggio.",
    mjml: `
      <mj-section background-color="#ffffff" padding="12px 0">
        <mj-column>
          <mj-text color="#0f172a" font-size="22px" font-weight="700" line-height="28px">Titolo sezione</mj-text>
          <mj-text color="#475569" font-size="15px" line-height="24px" padding-top="8px">Inserisci qui il testo del messaggio. Puoi usare anche merge tag come {{nome_socio}} o {{messaggio_org}}.</mj-text>
        </mj-column>
      </mj-section>
    `,
  },
  {
    id: "assoc-image",
    label: "Immagine",
    description: "Immagine singola ampia con bordo pulito.",
    mjml: `
      <mj-section padding="12px 0">
        <mj-column>
          <mj-image src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80" alt="Immagine comunicazione" border-radius="6px" />
        </mj-column>
      </mj-section>
    `,
  },
  {
    id: "assoc-cta",
    label: "Bottone CTA",
    description: "Call to action semplice con testo di supporto.",
    mjml: `
      <mj-section padding="12px 0 20px 0">
        <mj-column>
          <mj-button background-color="#17494a" color="#ffffff" border-radius="6px" font-weight="700" href="{{link_form_collegato}}">Apri il modulo</mj-button>
          <mj-text color="#64748b" font-size="13px" line-height="20px" align="center" padding-top="8px">Se il pulsante non funziona, copia questo link nel browser: {{link_form_collegato}}</mj-text>
        </mj-column>
      </mj-section>
    `,
  },
  {
    id: "assoc-event",
    label: "Sezione evento",
    description: "Box agenda per inviti e appuntamenti.",
    mjml: `
      <mj-section background-color="#fffaf1" border-radius="8px" padding="18px 18px 6px 18px">
        <mj-column>
          <mj-text color="#8d6b3f" font-size="12px" font-weight="700" letter-spacing="1px" text-transform="uppercase">Evento</mj-text>
          <mj-text color="#0f172a" font-size="20px" font-weight="700" line-height="26px">{{nome_evento}}</mj-text>
          <mj-text color="#334155" font-size="15px" line-height="24px">Data: {{data_evento}}<br />Link diretto: {{link_evento}}</mj-text>
        </mj-column>
      </mj-section>
    `,
  },
  {
    id: "assoc-date-details",
    label: "Data e dettagli",
    description: "Riepilogo rapido con data, luogo e informazioni operative.",
    mjml: `
      <mj-section background-color="#f8fafc" padding="18px" border-radius="8px">
        <mj-column>
          <mj-text color="#8d6b3f" font-size="12px" font-weight="700" letter-spacing="1px" text-transform="uppercase">Dettagli utili</mj-text>
          <mj-text color="#0f172a" font-size="18px" font-weight="700" line-height="24px">{{nome_evento}}</mj-text>
          <mj-text color="#334155" font-size="15px" line-height="24px">Quando: {{data_evento}}<br />Aggiornato il: {{data_oggi}}</mj-text>
        </mj-column>
      </mj-section>
    `,
  },
  {
    id: "assoc-contact-details",
    label: "Contatti",
    description: "Telefono, email e riferimenti dell'associazione.",
    mjml: `
      <mj-section background-color="#ffffff" padding="16px 0">
        <mj-column>
          <mj-text color="#8d6b3f" font-size="12px" font-weight="700" letter-spacing="1px" text-transform="uppercase">Contatti</mj-text>
          <mj-text color="#334155" font-size="15px" line-height="24px">Telefono socio: {{telefono_socio}}<br />Telefono associazione: {{telefono_associazione}}<br />Email socio: {{email_socio}}</mj-text>
        </mj-column>
      </mj-section>
    `,
  },
  {
    id: "assoc-renewal",
    label: "Reminder rinnovo",
    description: "Blocco pronto per sollecitare il rinnovo.",
    mjml: `
      <mj-section background-color="#fff8e1" padding="18px" border-radius="8px">
        <mj-column>
          <mj-text color="#7c5d12" font-size="12px" font-weight="700" letter-spacing="1px" text-transform="uppercase">Rinnovo</mj-text>
          <mj-text color="#0f172a" font-size="20px" font-weight="700">La tua quota e in scadenza</mj-text>
          <mj-text color="#475569" font-size="15px" line-height="24px">Ciao {{nome_socio}}, per restare attivo in {{nome_associazione}} completa il rinnovo dal link qui sotto.</mj-text>
          <mj-button background-color="#b5830f" color="#ffffff" border-radius="6px" href="{{link_iscrizione}}">Rinnova ora</mj-button>
        </mj-column>
      </mj-section>
    `,
  },
  {
    id: "assoc-booking-confirmation",
    label: "Conferma prenotazione",
    description: "Blocco gia pronto per conferme automatiche.",
    mjml: `
      <mj-section background-color="#edf8f2" padding="18px" border-radius="8px">
        <mj-column>
          <mj-text color="#146c43" font-size="12px" font-weight="700" letter-spacing="1px" text-transform="uppercase">Prenotazione confermata</mj-text>
          <mj-text color="#0f172a" font-size="20px" font-weight="700">La richiesta e stata confermata</mj-text>
          <mj-text color="#475569" font-size="15px" line-height="24px">Ciao {{nome_socio}}, la tua richiesta e ora in stato {{stato_prenotazione}}. Ti aspettiamo.</mj-text>
        </mj-column>
      </mj-section>
    `,
  },
  {
    id: "assoc-booking-rejection",
    label: "Rigetto prenotazione",
    description: "Blocco chiaro per richieste non approvate.",
    mjml: `
      <mj-section background-color="#fff1f2" padding="18px" border-radius="8px">
        <mj-column>
          <mj-text color="#be123c" font-size="12px" font-weight="700" letter-spacing="1px" text-transform="uppercase">Richiesta non approvata</mj-text>
          <mj-text color="#0f172a" font-size="20px" font-weight="700">Non possiamo confermare la prenotazione</mj-text>
          <mj-text color="#475569" font-size="15px" line-height="24px">Ciao {{nome_socio}}, la tua richiesta risulta {{stato_prenotazione}}. Messaggio organizzazione: {{messaggio_org}}</mj-text>
        </mj-column>
      </mj-section>
    `,
  },
  {
    id: "assoc-footer",
    label: "Footer associazione",
    description: "Chiusura istituzionale coerente.",
    mjml: `
      <mj-section background-color="#f8fafc" padding="24px 0 4px 0">
        <mj-column>
          <mj-divider border-color="#d7dee7" border-width="1px" />
          <mj-text color="#0f172a" font-size="15px" font-weight="700" padding-top="16px">{{nome_associazione}}</mj-text>
          <mj-text color="#64748b" font-size="13px" line-height="20px">Questa email e stata inviata dalla tua associazione. Per informazioni rispondi a questo messaggio.</mj-text>
        </mj-column>
      </mj-section>
    `,
  },
];

export function getTemplateTypeMeta(value: OrgAdminEmailTemplateType) {
  return (
    TEMPLATE_TYPE_OPTIONS.find((item) => item.value === value) ||
    TEMPLATE_TYPE_OPTIONS.find((item) => item.value === DEFAULT_TEMPLATE_TYPE)!
  );
}

export function getTemplateStatusLabel(status: OrgAdminEmailEditorStatus | string | null | undefined): string {
  if (status === "ready") return "Pronto";
  return "Bozza";
}

export function getTemplateTypeLabel(type: OrgAdminEmailTemplateType | string | null | undefined): string {
  return TEMPLATE_TYPE_OPTIONS.find((item) => item.value === type)?.label || "Template";
}

export function getCampaignAudienceLabel(value: OrgAdminCampaignAudienceType): string {
  return CAMPAIGN_AUDIENCE_OPTIONS.find((item) => item.value === value)?.label || "Audience";
}

export function getBuilderInitialMjml(templateType: OrgAdminEmailTemplateType): string {
  const intro = {
    newsletter: {
      title: "Le novita di {{nome_associazione}}",
      body: "Ciao {{nome_socio}}, ecco un riepilogo chiaro delle novita, degli aggiornamenti e delle prossime azioni utili.",
      cta: "Leggi l'aggiornamento",
      link: "{{link_form_collegato}}",
    },
    event: {
      title: "Sei invitato al prossimo appuntamento",
      body: "Abbiamo preparato un invito semplice e diretto per accompagnare il socio verso l'evento giusto.",
      cta: "Apri dettagli evento",
      link: "{{link_evento}}",
    },
    renewal_reminder: {
      title: "Ricorda il rinnovo della quota",
      body: "Questo promemoria aiuta il socio a completare il rinnovo senza passaggi inutili.",
      cta: "Vai al rinnovo",
      link: "{{link_iscrizione}}",
    },
    booking_confirmation: {
      title: "Prenotazione confermata",
      body: "Comunica in modo chiaro lo stato della richiesta e i prossimi passaggi.",
      cta: "Apri dettagli",
      link: "{{link_evento}}",
    },
    booking_rejection: {
      title: "Aggiornamento sulla tua richiesta",
      body: "Spiega il rigetto con tono cortese e indica il messaggio organizzativo essenziale.",
      cta: "Contatta la segreteria",
      link: "{{link_evento}}",
    },
    generic_notice: {
      title: "Comunicazione importante",
      body: "Usa questo layout essenziale per avvisi, richiami e comunicazioni di servizio.",
      cta: "Approfondisci",
      link: "{{link_iscrizione}}",
    },
  }[templateType];

  return `
    <mjml>
      <mj-body width="640px" background-color="#f3efe7">
        <mj-section background-color="#ffffff" padding="28px 28px 10px 28px">
          <mj-column>
            <mj-text color="#8d6b3f" font-size="12px" font-weight="700" letter-spacing="1px" text-transform="uppercase">Comunicazione associazione</mj-text>
            <mj-text color="#0f172a" font-size="30px" font-weight="700" line-height="36px" padding-top="8px">${intro.title}</mj-text>
            <mj-text color="#475569" font-size="15px" line-height="24px" padding-top="8px">${intro.body}</mj-text>
          </mj-column>
        </mj-section>
        <mj-section background-color="#ffffff" padding="4px 28px 12px 28px">
          <mj-column>
            <mj-button background-color="#17494a" color="#ffffff" border-radius="6px" font-weight="700" href="${intro.link}">${intro.cta}</mj-button>
          </mj-column>
        </mj-section>
        <mj-section background-color="#ffffff" padding="10px 28px 28px 28px">
          <mj-column>
            <mj-text color="#64748b" font-size="13px" line-height="20px">Messaggio organizzazione: {{messaggio_org}}</mj-text>
            <mj-divider border-width="1px" border-color="#dbe2ea" padding-top="18px" />
            <mj-text color="#0f172a" font-size="15px" font-weight="700" padding-top="12px">{{nome_associazione}}</mj-text>
            <mj-text color="#64748b" font-size="13px" line-height="20px">Email demo pronta per il builder guidato ASSONAM.</mj-text>
          </mj-column>
        </mj-section>
      </mj-body>
    </mjml>
  `.trim();
}

export function ensureMjmlDocument(source: string | null | undefined, templateType = DEFAULT_TEMPLATE_TYPE) {
  const normalized = (source || "").trim();
  if (normalized.includes("<mjml")) return normalized;
  if (!normalized) return getBuilderInitialMjml(templateType);
  return `
    <mjml>
      <mj-body width="640px" background-color="#f3efe7">
        ${normalized}
      </mj-body>
    </mjml>
  `.trim();
}

export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  if (typeof window === "undefined") {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const parser = new window.DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function sortAssetsByDate(items: OrgAdminEmailBuilderAsset[]) {
  return [...items].sort((left, right) => {
    const leftDate = new Date(left.created_at || 0).getTime();
    const rightDate = new Date(right.created_at || 0).getTime();
    return rightDate - leftDate;
  });
}

export function findVariableLabel(
  variables: OrgAdminEmailTemplateVariable[],
  placeholder: string,
): string {
  return variables.find((item) => item.placeholder === placeholder)?.label || placeholder;
}
