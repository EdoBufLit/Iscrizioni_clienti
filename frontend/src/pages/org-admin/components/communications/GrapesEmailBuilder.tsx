import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import grapesjs, { type Editor } from "grapesjs";
import grapesjsMjml from "grapesjs-mjml";
import mjml2html from "mjml-browser";
import "grapesjs/dist/css/grapes.min.css";
import "./grapes-email-builder.css";

import { useToast } from "../../../../components/ui/ToastProvider";
import type { OrgAdminEmailBuilderAsset, OrgAdminEmailTemplateVariable } from "../../../../lib/api";
import {
  BUILDER_BLOCKS,
  ensureMjmlDocument,
  findVariableLabel,
  formatBytes,
  htmlToText,
  sortAssetsByDate,
  type BuilderBlockDefinition,
} from "./emailBuilder";

type BuilderSnapshot = {
  compiledHtml: string;
  mjmlSource: string;
  bodyText: string;
  grapesjsProjectJson: Record<string, unknown> | null;
};

type GrapesEmailBuilderProps = {
  editorKey: string;
  initialMjmlSource: string;
  initialProjectData?: Record<string, unknown> | null;
  assets: OrgAdminEmailBuilderAsset[];
  variables: OrgAdminEmailTemplateVariable[];
  disabled?: boolean;
  onChange: (snapshot: BuilderSnapshot) => void;
  onUploadAsset: (file: File) => Promise<void>;
  onDeleteAsset: (assetId: number) => Promise<void>;
};

type RailTab = "blocks" | "media" | "variables";

const railTabs: Array<{ key: RailTab; label: string }> = [
  { key: "blocks", label: "Blocchi" },
  { key: "media", label: "Media" },
  { key: "variables", label: "Dati" },
];

function compileMjml(input: string): string {
  const compiled = mjml2html(input, { validationLevel: "soft" });
  return compiled.html || "";
}

function createAssetRecords(items: OrgAdminEmailBuilderAsset[]) {
  return items.map((item) => ({
    type: "image",
    src: item.public_url,
    name: item.name,
  }));
}

export function GrapesEmailBuilder({
  editorKey,
  initialMjmlSource,
  initialProjectData,
  assets,
  variables,
  disabled = false,
  onChange,
  onUploadAsset,
  onDeleteAsset,
}: GrapesEmailBuilderProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const onChangeRef = useRef(onChange);
  const syncTimerRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [railTab, setRailTab] = useState<RailTab>("blocks");
  const [assetBusyId, setAssetBusyId] = useState<number | null>(null);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const { showToast } = useToast();
  const sortedAssets = useMemo(() => sortAssetsByDate(assets), [assets]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!hostRef.current) return;

    const editor = grapesjs.init({
      container: hostRef.current,
      height: "100%",
      width: "auto",
      storageManager: false,
      fromElement: false,
      panels: { defaults: [] },
      blockManager: { appendTo: undefined },
      layerManager: { appendTo: undefined },
      selectorManager: { appendTo: undefined, componentFirst: true },
      styleManager: {
        sectors: [
          {
            name: "Typography",
            open: true,
            buildProps: ["font-size", "font-weight", "line-height", "letter-spacing", "text-align", "color"],
          },
          {
            name: "Spacing",
            open: false,
            buildProps: ["padding", "margin"],
          },
          {
            name: "Decoration",
            open: false,
            buildProps: ["background-color", "border-radius", "border-color"],
          },
        ],
      },
      assetManager: {
        assets: createAssetRecords(sortedAssets),
        upload: false,
        autoAdd: false,
      },
      deviceManager: {
        devices: [
          { id: "desktop", name: "Desktop", width: "" },
          { id: "mobile", name: "Mobile", width: "390px", widthMedia: "480px" },
        ],
      },
      canvas: {
        styles: [
          "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap",
        ],
      },
      plugins: [grapesjsMjml],
      pluginsOpts: {
        "grapesjs-mjml": {
          resetBlocks: true,
          resetDevices: true,
          resetStyleManager: false,
          hideSelector: true,
          useCustomTheme: false,
          blocks: [],
        },
      },
    });

    editorRef.current = editor;
    editor.BlockManager.getAll().reset();
    BUILDER_BLOCKS.forEach((block) => {
      editor.BlockManager.add(block.id, {
        label: block.label,
        content: block.mjml.trim(),
      });
    });

    const initialDocument = ensureMjmlDocument(initialMjmlSource);
    if (initialProjectData && Object.keys(initialProjectData).length > 0) {
      editor.loadProjectData(initialProjectData as never);
    } else {
      editor.setComponents(initialDocument);
    }

    const emitSnapshot = () => {
      const currentEditor = editorRef.current;
      if (!currentEditor) return;
      const mjmlSource = ensureMjmlDocument(currentEditor.getHtml());
      const compiledHtml = compileMjml(mjmlSource);
      onChangeRef.current({
        mjmlSource,
        compiledHtml,
        bodyText: htmlToText(compiledHtml),
        grapesjsProjectJson: currentEditor.getProjectData() as Record<string, unknown>,
      });
    };

    const scheduleSync = () => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
      }
      syncTimerRef.current = window.setTimeout(emitSnapshot, 220);
    };

    editor.on("load", () => {
      setReady(true);
      currentSetDevice("desktop");
      emitSnapshot();
    });
    editor.on("update", scheduleSync);

    const currentSetDevice = (next: "desktop" | "mobile") => {
      editor.setDevice(next === "mobile" ? "Mobile" : "Desktop");
      setDevice(next);
    };

    currentSetDevice("desktop");

    return () => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
      }
      setReady(false);
      editor.destroy();
      editorRef.current = null;
    };
  }, [editorKey]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.AssetManager.getAll().reset(createAssetRecords(sortedAssets));
  }, [sortedAssets]);

  function switchDevice(next: "desktop" | "mobile") {
    const editor = editorRef.current;
    if (!editor) return;
    editor.setDevice(next === "mobile" ? "Mobile" : "Desktop");
    setDevice(next);
  }

  function appendBlock(block: BuilderBlockDefinition) {
    const editor = editorRef.current;
    if (!editor) return;
    const wrapper = editor.getWrapper();
    if (!wrapper) return;
    const body = wrapper.find("mj-body")[0] || wrapper;
    const collection = body.components();
    const previousLength = collection.length;
    body.append(block.mjml.trim() as never);
    const last = collection.at(collection.length - 1);
    if (collection.length === previousLength || !last) {
      showToast({ tone: "error", message: `Impossibile inserire ${block.label.toLowerCase()} nel builder.` });
      return;
    }
    const children = body.components();
    const inserted = children.at(children.length - 1);
    editor.select(inserted || last);
    window.requestAnimationFrame(() => {
      const element = (inserted || last)?.getEl?.();
      if (element instanceof HTMLElement) {
        element.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    });
    showToast({ tone: "success", message: `${block.label} aggiunto al messaggio.` });
  }

  function insertVariable(placeholder: string) {
    const editor = editorRef.current;
    if (!editor) return;
    const selected = editor.getSelected();
    if (selected) {
      const currentContent = String(selected.get("content") || "");
      if (currentContent || String(selected.getName() || "").includes("text") || String(selected.getName() || "").includes("button")) {
        selected.set("content", `${currentContent}${placeholder}`);
        showToast({ tone: "success", message: `${findVariableLabel(variables, placeholder)} inserito.` });
        return;
      }
    }
    appendBlock({
      id: "assoc-variable",
      label: "Merge tag",
      description: "Inserimento rapido placeholder",
      mjml: `<mj-section padding="12px 0"><mj-column><mj-text color="#334155" font-size="15px" line-height="24px">${placeholder}</mj-text></mj-column></mj-section>`,
    });
  }

  function applyAsset(asset: OrgAdminEmailBuilderAsset) {
    const editor = editorRef.current;
    if (!editor) return;
    const selected = editor.getSelected();
    const selectedName = String(selected?.getName?.() || "").toLowerCase();
    if (selected && selectedName.includes("image")) {
      selected.addAttributes({ src: asset.public_url, alt: asset.name });
      showToast({ tone: "success", message: `${asset.name} applicata all'immagine selezionata.` });
      return;
    }
    appendBlock({
      id: "assoc-image-asset",
      label: "Immagine",
      description: "Asset libreria",
      mjml: `
        <mj-section padding="12px 0">
          <mj-column>
            <mj-image src="${asset.public_url}" alt="${asset.name}" border-radius="6px" />
          </mj-column>
        </mj-section>
      `,
    });
  }

  async function handleAssetUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingAsset(true);
    try {
      await onUploadAsset(file);
      showToast({ tone: "success", message: "Asset caricato nella libreria dell'associazione." });
    } catch (error) {
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Errore caricamento asset",
      });
    } finally {
      setUploadingAsset(false);
      event.target.value = "";
    }
  }

  async function handleDeleteAsset(assetId: number) {
    setAssetBusyId(assetId);
    try {
      await onDeleteAsset(assetId);
      showToast({ tone: "success", message: "Asset eliminato dalla libreria." });
    } catch (error) {
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Errore eliminazione asset",
      });
    } finally {
      setAssetBusyId(null);
    }
  }

  return (
    <div className="builder-shell">
      <div className="builder-toolbar">
        <div>
          <p className="builder-toolbar__eyebrow">Composer guidato</p>
          <h3 className="builder-toolbar__title">Componi il messaggio nel canvas centrale</h3>
          <p className="builder-toolbar__copy">
            Blocchi essenziali, libreria media dell&apos;organizzazione e merge tag semplici. Nessun pannello tecnico superfluo.
          </p>
        </div>
        <div className="builder-toolbar__devices">
          <button
            type="button"
            className={device === "desktop" ? "builder-device builder-device--active" : "builder-device"}
            onClick={() => switchDevice("desktop")}
          >
            Desktop
          </button>
          <button
            type="button"
            className={device === "mobile" ? "builder-device builder-device--active" : "builder-device"}
            onClick={() => switchDevice("mobile")}
          >
            Mobile
          </button>
        </div>
      </div>

      <div className="builder-workbench">
        <div className={`builder-canvas ${disabled ? "builder-canvas--disabled" : ""}`}>
          {!ready ? <div className="builder-canvas__loading">Caricamento editor...</div> : null}
          <div ref={hostRef} className="builder-canvas__host" />
          {disabled ? (
            <div className="builder-canvas__overlay">
              Modello di sistema in sola lettura. Duplicalo per modificarlo.
            </div>
          ) : null}
        </div>

        <aside className="builder-rail">
          <div className="builder-rail__tabs">
            {railTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={railTab === tab.key ? "builder-rail__tab builder-rail__tab--active" : "builder-rail__tab"}
                onClick={() => setRailTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {railTab === "blocks" ? (
            <div className="builder-rail__panel">
              <p className="builder-rail__title">Blocchi guidati</p>
              <p className="builder-rail__copy">Aggiungi solo i moduli utili per le comunicazioni associative.</p>
              <div className="builder-block-grid">
                {BUILDER_BLOCKS.map((block) => (
                  <button key={block.id} type="button" className="builder-block-card" onClick={() => appendBlock(block)}>
                    <span className="builder-block-card__label">{block.label}</span>
                    <span className="builder-block-card__description">{block.description}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {railTab === "media" ? (
            <div className="builder-rail__panel">
              <div className="builder-rail__panel-header">
                <div>
                  <p className="builder-rail__title">Libreria media</p>
                  <p className="builder-rail__copy">Asset separati per organizzazione, pronti da riusare nel builder.</p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={uploadingAsset}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingAsset ? "Caricamento..." : "Carica"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  className="hidden"
                  onChange={(event) => void handleAssetUpload(event)}
                />
              </div>
              <div className="builder-media-list">
                {sortedAssets.length ? (
                  sortedAssets.map((asset) => (
                    <div key={asset.id} className="builder-media-card">
                      <button type="button" className="builder-media-card__preview" onClick={() => applyAsset(asset)}>
                        <img src={asset.public_url} alt={asset.name} loading="lazy" />
                      </button>
                      <div className="builder-media-card__meta">
                        <p className="builder-media-card__name">{asset.name}</p>
                        <p className="builder-media-card__info">{formatBytes(asset.size_bytes)}</p>
                      </div>
                      <div className="builder-media-card__actions">
                        <button type="button" className="btn-ghost" onClick={() => applyAsset(asset)}>
                          Usa
                        </button>
                        <button
                          type="button"
                          className="btn-ghost text-red-600"
                          disabled={assetBusyId === asset.id}
                          onClick={() => void handleDeleteAsset(asset.id)}
                        >
                          {assetBusyId === asset.id ? "..." : "Elimina"}
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="builder-empty-state">
                    Carica il logo o le immagini dell&apos;associazione. Da qui le applichi direttamente all&apos;editor.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {railTab === "variables" ? (
            <div className="builder-rail__panel">
              <p className="builder-rail__title">Merge tag semplici</p>
              <p className="builder-rail__copy">Inserisci i placeholder senza dover ricordare la sintassi a memoria.</p>
              <div className="builder-variable-list">
                {variables.map((item) => (
                  <button
                    key={item.placeholder}
                    type="button"
                    className="builder-variable-chip"
                    onClick={() => insertVariable(item.placeholder)}
                  >
                    <span className="builder-variable-chip__label">{item.label}</span>
                    <span className="builder-variable-chip__value">{item.placeholder}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
