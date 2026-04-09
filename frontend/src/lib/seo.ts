export type JsonLdObject = Record<string, unknown>;

export type SeoPayload = {
  title: string;
  description: string;
  canonicalPath?: string;
  noindex?: boolean;
  ogType?: "website" | "article";
  imagePath?: string;
  appendSiteName?: boolean;
  structuredData?: JsonLdObject | JsonLdObject[];
};

const SITE_NAME = "ASSO.N.A.M.";
const DEFAULT_IMAGE_PATH = "/logo.jpg";
const DEFAULT_OG_LOCALE = "it_IT";

const ensureMeta = (attr: "name" | "property", key: string): HTMLMetaElement => {
  const selector = `meta[${attr}="${key}"]`;
  const existing = document.head.querySelector(selector);
  if (existing instanceof HTMLMetaElement) {
    return existing;
  }
  const meta = document.createElement("meta");
  meta.setAttribute(attr, key);
  document.head.appendChild(meta);
  return meta;
};

const setMeta = (attr: "name" | "property", key: string, content: string): void => {
  const meta = ensureMeta(attr, key);
  meta.setAttribute("content", content);
};

const ensureCanonical = (): HTMLLinkElement => {
  const existing = document.head.querySelector('link[rel="canonical"]');
  if (existing instanceof HTMLLinkElement) {
    return existing;
  }
  const link = document.createElement("link");
  link.setAttribute("rel", "canonical");
  document.head.appendChild(link);
  return link;
};

const toAbsoluteUrl = (pathOrUrl: string): string => {
  try {
    return new URL(pathOrUrl, window.location.origin).toString();
  } catch {
    return window.location.origin;
  }
};

const normalizeCanonicalPath = (path: string): string => {
  if (!path) return "/";
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return withSlash !== "/" && withSlash.endsWith("/")
    ? withSlash.slice(0, -1)
    : withSlash;
};

const clearJsonLdScripts = (): void => {
  document
    .querySelectorAll('script[type="application/ld+json"][data-seo="true"]')
    .forEach((node) => node.remove());
};

const addJsonLdScript = (payload: JsonLdObject): void => {
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.setAttribute("data-seo", "true");
  script.text = JSON.stringify(payload);
  document.head.appendChild(script);
};

const withBrandSuffix = (title: string): string =>
  title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;

export const applySeo = ({
  title,
  description,
  canonicalPath,
  noindex = false,
  ogType = "website",
  imagePath = DEFAULT_IMAGE_PATH,
  appendSiteName = true,
  structuredData,
}: SeoPayload): void => {
  const canonical = toAbsoluteUrl(normalizeCanonicalPath(canonicalPath ?? window.location.pathname));
  const imageUrl = toAbsoluteUrl(imagePath);
  const fullTitle = appendSiteName ? withBrandSuffix(title) : title;
  const robots = noindex ? "noindex,nofollow" : "index,follow";

  document.documentElement.lang = "it";
  document.title = fullTitle;

  ensureCanonical().setAttribute("href", canonical);

  setMeta("name", "description", description);
  setMeta("name", "robots", robots);

  setMeta("property", "og:type", ogType);
  setMeta("property", "og:title", fullTitle);
  setMeta("property", "og:description", description);
  setMeta("property", "og:url", canonical);
  setMeta("property", "og:site_name", SITE_NAME);
  setMeta("property", "og:locale", DEFAULT_OG_LOCALE);
  setMeta("property", "og:image", imageUrl);

  setMeta("name", "twitter:card", "summary_large_image");
  setMeta("name", "twitter:title", fullTitle);
  setMeta("name", "twitter:description", description);
  setMeta("name", "twitter:image", imageUrl);

  clearJsonLdScripts();
  if (structuredData) {
    if (Array.isArray(structuredData)) {
      structuredData.forEach((entry) => addJsonLdScript(entry));
    } else {
      addJsonLdScript(structuredData);
    }
  }
};
