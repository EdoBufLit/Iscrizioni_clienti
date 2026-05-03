import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
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

type SelectedElementKind = "testo" | "bottone" | "immagine" | "blocco" | "elemento";

type SelectedElementState = {
  kind: SelectedElementKind;
  title: string;
  content: string;
  href: string;
  src: string;
  alt: string;
  fontSize: string;
  fontWeight: string;
  textColor: string;
  backgroundColor: string;
  align: string;
  paddingTop: string;
  paddingBottom: string;
  borderRadius: string;
};

type BuilderSectionSummary = {
  id: string;
  label: string;
  selected: boolean;
};

const railTabs: Array<{ key: RailTab; label: string }> = [
  { key: "blocks", label: "Blocchi" },
  { key: "media", label: "Media" },
  { key: "variables", label: "Dati" },
];

const alignOptions = [
  { value: "left", label: "Sinistra" },
  { value: "center", label: "Centro" },
  { value: "right", label: "Destra" },
];

const fontWeightOptions = [
  { value: "400", label: "Normale" },
  { value: "600", label: "Semi-bold" },
  { value: "700", label: "Bold" },
  { value: "800", label: "Extra bold" },
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

function mapSelectedElementAttr(current: SelectedElementState, key: string, value: string): SelectedElementState {
  if (key === "href") return { ...current, href: value };
  if (key === "src") return { ...current, src: value };
  if (key === "alt") return { ...current, alt: value };
  if (key === "font-size") return { ...current, fontSize: value };
  if (key === "font-weight") return { ...current, fontWeight: value };
  if (key === "color") return { ...current, textColor: value };
  if (key === "background-color") return { ...current, backgroundColor: value };
  if (key === "align") return { ...current, align: value };
  if (key === "border-radius") return { ...current, borderRadius: value };
  return current;
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
  const blocksPanelRef = useRef<HTMLDivElement | null>(null);
  const stylePanelRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const selectedComponentRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  const syncTimerRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [railTab, setRailTab] = useState<RailTab>("blocks");
  const [assetBusyId, setAssetBusyId] = useState<number | null>(null);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [selectedElement, setSelectedElement] = useState<SelectedElementState | null>(null);
  const [selectedSectionLabel, setSelectedSectionLabel] = useState<string | null>(null);
  const [sections, setSections] = useState<BuilderSectionSummary[]>([]);
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(null);
  const { showToast } = useToast();
  const sortedAssets = useMemo(() => sortAssetsByDate(assets), [assets]);
  const linkVariables = useMemo(
    () =>
      variables.filter((item) => {
        const placeholder = String(item.placeholder || item.key || "");
        return placeholder.includes("link_") || placeholder.includes("url");
      }),
    [variables],
  );

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const refreshSections = useCallback((currentEditor: Editor | null = editorRef.current) => {
    if (!currentEditor) return;
    const selectedSection = getSelectedTopLevelSection(currentEditor);
    const nextSections = getTopLevelEmailSections(currentEditor).map((section: any, index: number) => ({
      id: sectionIdentity(section, index),
      label: sectionLabel(section, index),
      selected: Boolean(selectedSection && section === selectedSection),
    }));
    setSections(nextSections);
    setSelectedSectionLabel(
      selectedSection ? sectionLabel(selectedSection, nextSections.findIndex((item: BuilderSectionSummary) => item.selected)) : null,
    );
  }, []);

  useEffect(() => {
    if (!hostRef.current) return;

    const editor = grapesjs.init({
      container: hostRef.current,
      height: "100%",
      width: "auto",
      cssIcons: "",
      telemetry: false,
      storageManager: false,
      fromElement: false,
      panels: { defaults: [] },
      blockManager: { appendTo: undefined },
      layerManager: { appendTo: undefined },
      selectorManager: { appendTo: undefined, componentFirst: true },
      styleManager: {
        appendTo: stylePanelRef.current || undefined,
        sectors: [
          {
            name: "Tipografia",
            open: true,
            buildProps: ["font-size", "font-weight", "line-height", "letter-spacing", "text-align", "color"],
          },
          {
            name: "Spaziatura",
            open: false,
            buildProps: ["padding", "margin"],
          },
          {
            name: "Decorazione",
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
        label: `
          <span class="builder-block-card__label">${block.label}</span>
          <span class="builder-block-card__description">${block.description}</span>
        `,
        content: block.mjml.trim(),
        attributes: {
          class: "builder-block-card",
          title: block.description,
        },
      });
    });
    renderNativeBlocks(editor, blocksPanelRef.current, appendBlock);

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

    const attrValue = (component: any, key: string, fallback = "") => {
      if (!component) return null;
      const attrs = component.getAttributes?.() || {};
      const style = component.getStyle?.() || {};
      return String(attrs[key] ?? style[key] ?? component.get?.(key) ?? fallback);
    };

    const readSelectedElement = (component: any): SelectedElementState | null => {
      if (!component) return null;
      const name = String(component.getName?.() || component.get?.("type") || component.get?.("tagName") || "").toLowerCase();
      const isButton = name.includes("button");
      const isImage = name.includes("image");
      const isText = name.includes("text");
      const isSection = name.includes("section") || name.includes("column") || name.includes("body");
      const kind: SelectedElementKind = isButton ? "bottone" : isImage ? "immagine" : isText ? "testo" : isSection ? "blocco" : "elemento";
      const title = isButton ? "Bottone CTA" : isImage ? "Immagine" : isText ? "Testo" : isSection ? "Blocco selezionato" : "Elemento selezionato";
      return {
        kind,
        title,
        content: String(component.get?.("content") || ""),
        href: attrValue(component, "href", "") || "",
        src: attrValue(component, "src", "") || "",
        alt: attrValue(component, "alt", "") || "",
        fontSize: attrValue(component, "font-size", isButton ? "14px" : "15px") || "",
        fontWeight: attrValue(component, "font-weight", isButton ? "700" : "400") || "",
        textColor: attrValue(component, "color", isButton ? "#ffffff" : "#334155") || "",
        backgroundColor: attrValue(component, "background-color", isButton ? "#17494a" : "") || "",
        align: attrValue(component, "align", "left") || "left",
        paddingTop: attrValue(component, "padding-top", "") || "",
        paddingBottom: attrValue(component, "padding-bottom", "") || "",
        borderRadius: attrValue(component, "border-radius", "") || "",
      };
    };

    const syncSelectedElement = (component: any) => {
      const next = readSelectedElement(component);
      selectedComponentRef.current = next ? component : null;
      setSelectedElement(next);
      window.requestAnimationFrame(() => refreshSections());
    };

    editor.on("load", () => {
      setReady(true);
      currentSetDevice("desktop");
      emitSnapshot();
      refreshSections();
    });
    editor.on("update", () => {
      scheduleSync();
      refreshSections();
    });
    editor.on("component:selected", syncSelectedElement);
    editor.on("component:deselected", () => {
      selectedComponentRef.current = null;
      setSelectedElement(null);
      setSelectedSectionLabel(null);
      refreshSections();
    });
    editor.on("component:update", () => {
      if (selectedComponentRef.current) {
        syncSelectedElement(selectedComponentRef.current);
      }
    });

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
    if (railTab !== "blocks" || !ready) return;
    renderNativeBlocks(editorRef.current, blocksPanelRef.current, appendBlock);
  }, [railTab, ready]);

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
    const sectionContainer = getSectionContainer(editor);
    if (!sectionContainer) return;
    const { collection } = sectionContainer;
    const previousLength = collection.length;
    const selectedSection = getSelectedTopLevelSection(editor);
    const insertAt = selectedSection ? collection.indexOf(selectedSection) + 1 : collection.length;
    const insertedCollection = collection.add(block.mjml.trim() as never, { at: insertAt });
    const inserted = Array.isArray(insertedCollection) ? insertedCollection[0] : insertedCollection;
    if (collection.length === previousLength || !inserted) {
      showToast({ tone: "error", message: `Impossibile inserire ${block.label.toLowerCase()} nel builder.` });
      return;
    }
    editor.select(inserted);
    window.requestAnimationFrame(() => {
      const element = inserted?.getEl?.();
      if (element instanceof HTMLElement) {
        element.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    });
    showToast({ tone: "success", message: `${block.label} aggiunto ${selectedSection ? "dopo il blocco selezionato" : "al messaggio"}.` });
  }

  function selectSection(sectionId: string) {
    const editor = editorRef.current;
    if (!editor) return;
    const target = getTopLevelEmailSections(editor).find((section: any, index: number) => sectionIdentity(section, index) === sectionId);
    if (target) editor.select(target);
  }

  function moveSelectedSection(direction: "up" | "down") {
    const editor = editorRef.current;
    if (!editor) return;
    const sectionContainer = getSectionContainer(editor);
    const section = getSelectedTopLevelSection(editor);
    if (!sectionContainer || !section) return;
    const { collection } = sectionContainer;
    const currentIndex = collection.indexOf(section);
    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= collection.length) return;
    collection.remove(section);
    collection.add(section, { at: nextIndex });
    editor.select(section);
    window.requestAnimationFrame(() => refreshSections(editor));
  }

  function moveSectionToIndex(sectionId: string, targetIndex: number) {
    const editor = editorRef.current;
    if (!editor) return;
    const sectionContainer = getSectionContainer(editor);
    const sectionsList = getTopLevelEmailSections(editor);
    const section = sectionsList.find((item: any, index: number) => sectionIdentity(item, index) === sectionId);
    if (!sectionContainer || !section) return;
    const currentIndex = sectionsList.indexOf(section);
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= sectionsList.length || currentIndex === targetIndex) return;
    const { collection } = sectionContainer;
    collection.remove(section);
    collection.add(section, { at: targetIndex });
    editor.select(section);
    window.requestAnimationFrame(() => refreshSections(editor));
  }

  function deleteSelectedSection() {
    const editor = editorRef.current;
    if (!editor) return;
    const section = getSelectedTopLevelSection(editor);
    if (!section) return;
    section.remove();
    setSelectedElement(null);
    setSelectedSectionLabel(null);
  }

  function updateSelectedContent(value: string) {
    const component = selectedComponentRef.current;
    if (!component) return;
    component.set("content", value);
    setSelectedElement((current) => (current ? { ...current, content: value } : current));
  }

  function updateSelectedAttr(key: string, value: string) {
    const component = selectedComponentRef.current;
    if (!component) return;
    component.addAttributes({ [key]: value });
    setSelectedElement((current) => (current ? mapSelectedElementAttr(current, key, value) : current));
  }

  function updateSelectedSectionPadding(key: "paddingTop" | "paddingBottom", value: string) {
    const component = selectedComponentRef.current;
    if (!component) return;
    const attrKey = key === "paddingTop" ? "padding-top" : "padding-bottom";
    component.addAttributes({ [attrKey]: value });
    setSelectedElement((current) => (current ? { ...current, [key]: value } : current));
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

      <div className="builder-workbench builder-workbench--three">
        <aside className="builder-rail builder-rail--left">
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
              <p className="builder-rail__copy">Trascina un blocco nel canvas oppure cliccalo per aggiungerlo al messaggio.</p>
              <div ref={blocksPanelRef} className="builder-block-grid builder-block-grid--native" />
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

        <div className={`builder-canvas ${disabled ? "builder-canvas--disabled" : ""}`}>
          {!ready ? <div className="builder-canvas__loading">Caricamento editor...</div> : null}
          <div ref={hostRef} className="builder-canvas__host" />
          {disabled ? (
            <div className="builder-canvas__overlay">
              Modello di sistema in sola lettura. Duplicalo per modificarlo.
            </div>
          ) : null}
        </div>

        <aside className="builder-rail builder-rail--right">
          <div className="builder-properties-heading">
            <p className="builder-selection-card__eyebrow">Proprietà blocco</p>
            <p className="builder-selection-card__title">
              {selectedElement?.title || selectedSectionLabel || "Seleziona un elemento"}
            </p>
            <p className="builder-rail__copy">
              Clicca testo, bottone, immagine o blocco nel canvas per modificarlo senza pannelli tecnici.
            </p>
          </div>

          {selectedElement ? (
            <div className="builder-inspector">
              {(selectedElement.kind === "testo" || selectedElement.kind === "bottone") ? (
                <label className="builder-selection-card__label">
                  {selectedElement.kind === "bottone" ? "Testo del bottone" : "Testo"}
                  <textarea
                    className="builder-selection-card__input builder-selection-card__textarea"
                    value={selectedElement.content}
                    onChange={(event) => updateSelectedContent(event.target.value)}
                    placeholder="Scrivi il contenuto"
                  />
                </label>
              ) : null}

              {selectedElement.kind === "bottone" ? (
                <label className="builder-selection-card__label">
                  Link del bottone
                  <input
                    className="builder-selection-card__input"
                    value={selectedElement.href}
                    onChange={(event) => updateSelectedAttr("href", event.target.value)}
                    placeholder="https://... oppure {{link_form_collegato}}"
                  />
                </label>
              ) : null}

              {selectedElement.kind === "immagine" ? (
                <>
                  <label className="builder-selection-card__label">
                    URL immagine
                    <input
                      className="builder-selection-card__input"
                      value={selectedElement.src}
                      onChange={(event) => updateSelectedAttr("src", event.target.value)}
                      placeholder="https://..."
                    />
                  </label>
                  <label className="builder-selection-card__label">
                    Testo alternativo
                    <input
                      className="builder-selection-card__input"
                      value={selectedElement.alt}
                      onChange={(event) => updateSelectedAttr("alt", event.target.value)}
                      placeholder="Descrizione immagine"
                    />
                  </label>
                </>
              ) : null}

              {selectedElement.kind === "bottone" && linkVariables.length ? (
                <div className="builder-selection-card__chips">
                  {linkVariables.map((item) => (
                    <button
                      key={item.placeholder}
                      type="button"
                      className="builder-selection-card__chip"
                      onClick={() => updateSelectedAttr("href", item.placeholder)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}

              {(selectedElement.kind === "testo" || selectedElement.kind === "bottone") ? (
                <div className="builder-inspector-grid">
                  <label className="builder-selection-card__label">
                    Dimensione testo
                    <input
                      className="builder-selection-card__input"
                      value={selectedElement.fontSize}
                      onChange={(event) => updateSelectedAttr("font-size", event.target.value)}
                      placeholder="15px"
                    />
                  </label>
                  <label className="builder-selection-card__label">
                    Peso
                    <select
                      className="builder-selection-card__input"
                      value={selectedElement.fontWeight}
                      onChange={(event) => updateSelectedAttr("font-weight", event.target.value)}
                    >
                      {fontWeightOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              <div className="builder-inspector-grid">
                {(selectedElement.kind === "testo" || selectedElement.kind === "bottone") ? (
                  <label className="builder-selection-card__label">
                    Colore testo
                    <span className="builder-color-row">
                      <input
                        type="color"
                        value={selectedElement.textColor.startsWith("#") ? selectedElement.textColor : "#334155"}
                        onChange={(event) => updateSelectedAttr("color", event.target.value)}
                      />
                      <input
                        className="builder-selection-card__input"
                        value={selectedElement.textColor}
                        onChange={(event) => updateSelectedAttr("color", event.target.value)}
                      />
                    </span>
                  </label>
                ) : null}
                {(selectedElement.kind === "bottone" || selectedElement.kind === "blocco" || selectedElement.kind === "elemento") ? (
                  <label className="builder-selection-card__label">
                    Sfondo
                    <span className="builder-color-row">
                      <input
                        type="color"
                        value={selectedElement.backgroundColor.startsWith("#") ? selectedElement.backgroundColor : "#ffffff"}
                        onChange={(event) => updateSelectedAttr("background-color", event.target.value)}
                      />
                      <input
                        className="builder-selection-card__input"
                        value={selectedElement.backgroundColor}
                        onChange={(event) => updateSelectedAttr("background-color", event.target.value)}
                        placeholder="#ffffff"
                      />
                    </span>
                  </label>
                ) : null}
              </div>

              {(selectedElement.kind === "testo" || selectedElement.kind === "bottone") ? (
                <div className="builder-segmented" role="group" aria-label="Allineamento">
                  {alignOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={selectedElement.align === option.value ? "is-active" : ""}
                      onClick={() => updateSelectedAttr("align", option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="builder-inspector-grid">
                {(selectedElement.kind === "blocco" || selectedElement.kind === "elemento") ? (
                  <>
                    <label className="builder-selection-card__label">
                      Spazio sopra
                      <input
                        className="builder-selection-card__input"
                        value={selectedElement.paddingTop}
                        onChange={(event) => updateSelectedSectionPadding("paddingTop", event.target.value)}
                        placeholder="18px"
                      />
                    </label>
                    <label className="builder-selection-card__label">
                      Spazio sotto
                      <input
                        className="builder-selection-card__input"
                        value={selectedElement.paddingBottom}
                        onChange={(event) => updateSelectedSectionPadding("paddingBottom", event.target.value)}
                        placeholder="18px"
                      />
                    </label>
                  </>
                ) : null}
                {(selectedElement.kind === "immagine" || selectedElement.kind === "bottone") ? (
                  <label className="builder-selection-card__label">
                    Raggio bordo
                    <input
                      className="builder-selection-card__input"
                      value={selectedElement.borderRadius}
                      onChange={(event) => updateSelectedAttr("border-radius", event.target.value)}
                      placeholder="6px"
                    />
                  </label>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="builder-empty-state">
              Seleziona un elemento nel canvas. Qui comparirànno solo i controlli utili per modificarlo.
            </div>
          )}

          <div className="builder-selection-card">
            <p className="builder-selection-card__label">Struttura messaggio</p>
            <div className="builder-section-list">
              {sections.map((section, index) => (
                <button
                  key={section.id}
                  type="button"
                  draggable
                  className={[
                    section.selected ? "builder-section-row builder-section-row--active" : "builder-section-row",
                    draggingSectionId === section.id ? "builder-section-row--dragging" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => selectSection(section.id)}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", section.id);
                    setDraggingSectionId(section.id);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const draggedId = event.dataTransfer.getData("text/plain") || draggingSectionId;
                    if (draggedId) moveSectionToIndex(draggedId, index);
                    setDraggingSectionId(null);
                  }}
                  onDragEnd={() => setDraggingSectionId(null)}
                >
                  <span className="builder-section-row__handle" aria-hidden="true">::</span>
                  {section.label}
                </button>
              ))}
            </div>
            <div className="builder-section-actions">
              <button type="button" className="builder-section-action" onClick={() => moveSelectedSection("up")} disabled={!selectedSectionLabel}>
                Su
              </button>
              <button type="button" className="builder-section-action" onClick={() => moveSelectedSection("down")} disabled={!selectedSectionLabel}>
                Giu
              </button>
              <button type="button" className="builder-section-action builder-section-action--danger" onClick={deleteSelectedSection} disabled={!selectedSectionLabel}>
                Elimina
              </button>
            </div>
          </div>

          <details className="builder-advanced-panel">
            <summary>Avanzate</summary>
            <p>Proprietà tecniche dell'editor. Usale solo per rifiniture non coperte dai controlli rapidi.</p>
            <div className="builder-style-panel" ref={stylePanelRef} />
          </details>
        </aside>
      </div>
    </div>
  );
}

function componentName(component: any): string {
  return String(
    component?.getName?.()
      || component?.get?.("tagName")
      || component?.get?.("type")
      || component?.attributes?.tagName
      || "",
  ).toLowerCase();
}

function findComponentByName(root: any, matcher: (name: string) => boolean): any | null {
  if (!root) return null;
  if (matcher(componentName(root))) return root;
  const children = root.components?.();
  if (!children) return null;
  for (const child of children.models || children) {
    const found = findComponentByName(child, matcher);
    if (found) return found;
  }
  return null;
}

function getBodyComponent(editor: Editor): any | null {
  const wrapper = editor.getWrapper();
  if (!wrapper) return null;
  return (
    findComponentByName(wrapper, (name) => name === "mj-body" || name === "body" || name.includes("mj-body"))
    || wrapper
  );
}

function getSectionContainer(editor: Editor): { body: any; collection: any } | null {
  const body = getBodyComponent(editor);
  const collection = body?.components?.();
  if (!body || !collection) return null;
  const children = Array.from(collection.models || collection) as any[];
  const mjmlRoot = children.length === 1 && componentName(children[0]).includes("mjml") ? children[0] : null;
  if (mjmlRoot) {
    const nestedBody = findComponentByName(mjmlRoot, (name) => name === "mj-body" || name === "body" || name.includes("mj-body"));
    const nestedCollection = nestedBody?.components?.();
    if (nestedBody && nestedCollection) {
      return { body: nestedBody, collection: nestedCollection };
    }
  }
  return { body, collection };
}

function renderNativeBlocks(
  editor: Editor | null,
  container: HTMLDivElement | null,
  onBlockClick?: (block: BuilderBlockDefinition) => void,
) {
  if (!editor || !container) return;
  container.innerHTML = "";
  const rendered = editor.BlockManager.render(undefined, { external: true });
  if (rendered) {
    container.appendChild(rendered);
    if (onBlockClick) {
      Array.from(container.querySelectorAll<HTMLElement>(".gjs-block")).forEach((element, index) => {
        element.addEventListener(
          "click",
          (event) => {
            const block = BUILDER_BLOCKS[index];
            if (!block) return;
            event.preventDefault();
            event.stopPropagation();
            onBlockClick(block);
          },
          true,
        );
      });
    }
  }
}

function getTopLevelEmailSections(editor: Editor): any[] {
  const sectionContainer = getSectionContainer(editor);
  if (!sectionContainer) return [];
  const children = Array.from(sectionContainer.collection.models || sectionContainer.collection) as any[];
  return children.filter((child: any) => {
    const name = componentName(child);
    return !name.includes("mjml") && !name.includes("body");
  });
}

function getSelectedTopLevelSection(editor: Editor): any | null {
  const sectionContainer = getSectionContainer(editor);
  const selected = editor.getSelected();
  if (!sectionContainer || !selected) return null;
  const { body } = sectionContainer;
  const sections = getTopLevelEmailSections(editor);
  let current: any = selected;
  while (current && current.parent && current.parent() && current.parent() !== body) {
    current = current.parent();
  }
  if (current && current.parent && current.parent() === body && sections.includes(current)) {
    return current;
  }
  return sections.find((section) => section === selected) || null;
}

function sectionIdentity(section: any, index: number): string {
  return String(section.cid || section.getId?.() || section.get?.("id") || index);
}

function sectionLabel(section: any, index: number): string {
  const text = String(section.getName?.() || section.get?.("tagName") || "Blocco").replace(/^mj-/i, "");
  const normalized = text && text.toLowerCase() !== "section" ? text.charAt(0).toUpperCase() + text.slice(1) : "Blocco";
  return `${index + 1}. ${normalized}`;
}
