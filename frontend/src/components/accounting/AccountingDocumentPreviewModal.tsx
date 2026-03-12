import ModalShell from "../ui/ModalShell";

export type AccountingPreviewDocument = {
  title: string;
  original_filename: string;
  mime_type: string | null;
  file_size: number | null;
  preview_url: string | null;
  open_url: string;
  preview_available: boolean;
};

type Props<TDocument extends AccountingPreviewDocument> = {
  document: TDocument | null;
  open: boolean;
  onClose: () => void;
  onDownload: (document: TDocument) => void | Promise<void>;
  onOpenInNewTab?: (document: TDocument) => void;
};

const formatBytes = (value: number | null | undefined) => {
  if (!value) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const fileKindLabel = (mimeType: string | null) => {
  if (!mimeType) return "File";
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/")) return "Immagine";
  if (mimeType.includes("sheet") || mimeType.includes("excel") || mimeType.includes("csv")) {
    return "Foglio";
  }
  if (mimeType.includes("word") || mimeType.includes("document")) return "Documento";
  return mimeType;
};

const buildPdfPreviewUrl = (url: string) => `${url}#toolbar=1&navpanes=0&view=FitH`;

const AccountingDocumentPreviewModal = <TDocument extends AccountingPreviewDocument>({
  document,
  open,
  onClose,
  onDownload,
  onOpenInNewTab,
}: Props<TDocument>) => {
  const footer = document ? (
    <>
      <button
        type="button"
        className="btn-ghost"
        onClick={() => {
          if (onOpenInNewTab) {
            onOpenInNewTab(document);
            return;
          }
          window.open(document.open_url, "_blank", "noopener,noreferrer");
        }}
      >
        Apri in una scheda
      </button>
      <button
        type="button"
        className="btn-primary"
        onClick={() => {
          void onDownload(document);
        }}
      >
        Scarica file
      </button>
    </>
  ) : null;

  return (
    <ModalShell
      open={open}
      title={document?.title ?? "Preview documento"}
      description={
        document
          ? `${document.original_filename} · ${fileKindLabel(document.mime_type)}`
          : undefined
      }
      sizeClassName="max-w-6xl"
      footer={footer}
      onClose={onClose}
    >
      {document ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
                Tipo file
              </p>
              <p className="mt-2 text-sm font-bold text-neutral-900">
                {fileKindLabel(document.mime_type)}
              </p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
                Dimensione
              </p>
              <p className="mt-2 text-sm font-bold text-neutral-900">
                {formatBytes(document.file_size)}
              </p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
                Rendering
              </p>
              <p className="mt-2 text-sm font-bold text-neutral-900">
                {document.preview_available ? "Inline" : "Non disponibile"}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-[28px] border border-neutral-200 bg-neutral-950/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
            {document.preview_url && document.preview_available ? (
              document.mime_type?.startsWith("image/") ? (
                <div className="flex min-h-[420px] items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.92),_rgba(244,247,250,0.96))] p-4">
                  <img
                    src={document.preview_url}
                    alt={document.title}
                    className="max-h-[72vh] w-full rounded-2xl object-contain shadow-[0_24px_70px_rgba(15,23,42,0.12)]"
                  />
                </div>
              ) : (
                <iframe
                  src={buildPdfPreviewUrl(document.preview_url)}
                  title={document.title}
                  className="h-[72vh] min-h-[560px] w-full bg-white"
                />
              )
            ) : (
              <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 px-6 py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-900 text-white shadow-lg">
                  <svg
                    className="h-7 w-7"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 13h6m-6 4h6m2 4H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div className="space-y-1">
                  <p className="text-base font-bold text-neutral-900">
                    Preview inline non disponibile
                  </p>
                  <p className="max-w-lg text-sm font-medium leading-6 text-neutral-500">
                    Questo formato non puo essere mostrato dentro il workspace. Aprilo in una
                    nuova scheda o scaricalo.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </ModalShell>
  );
};

export default AccountingDocumentPreviewModal;
