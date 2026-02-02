import { onINP } from "web-vitals/attribution";
import { getPerfConfig } from "./perfConfig";

type InteractionSnapshot = {
  ts: number;
  type: string;
  route: string;
  target: EventTarget | null;
};

type PerfStop = () => void;

const getRoute = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

const asElement = (target: EventTarget | null): Element | null => {
  if (!target) return null;
  if (target instanceof Element) return target;
  if (target instanceof Node) {
    if (target.nodeType === Node.ELEMENT_NODE) return target as Element;
    if (target.nodeType === Node.TEXT_NODE) {
      return (target as Node).parentElement;
    }
  }
  return null;
};

const truncate = (value: string, max = 120) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

const describeElement = (target: EventTarget | null) => {
  const el = asElement(target);
  if (!el || typeof el.tagName !== "string") return "unknown-target";
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const role = el.getAttribute?.("role");
  const aria = el.getAttribute?.("aria-label");
  const testId = el.getAttribute?.("data-testid");
  const className =
    typeof (el as HTMLElement).className === "string"
      ? (el as HTMLElement).className
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((c) => `.${c}`)
          .join("")
      : "";
  const extras = [
    role ? `[role=${role}]` : "",
    aria ? `[aria-label=${aria}]` : "",
    testId ? `[data-testid=${testId}]` : "",
  ]
    .filter(Boolean)
    .join("");
  return truncate(`${tag}${id}${className}${extras}`) || "unknown-target";
};

const findComponent = (target: EventTarget | null, maxDepth = 6) => {
  let current: Element | null = asElement(target);
  let depth = 0;
  while (current && depth < maxDepth) {
    const component = (current as HTMLElement).dataset?.component;
    if (component) return component;
    current = current.parentElement;
    depth += 1;
  }
  return undefined;
};

const schedule = (fn: () => void) => {
  const ric = (window as Window & { requestIdleCallback?: typeof requestIdleCallback })
    .requestIdleCallback;
  if (typeof ric === "function") {
    ric(fn, { timeout: 2000 });
    return;
  }
  setTimeout(fn, 0);
};

const createThrottle = (minIntervalMs: number) => {
  let last = 0;
  return () => {
    const now = performance.now();
    if (now - last < minIntervalMs) return false;
    last = now;
    return true;
  };
};

const createRouteCap = (maxPerRoute: number) => {
  const counts = new Map<string, number>();
  return (kind: string, route: string) => {
    const key = `${kind}|${route}`;
    const current = counts.get(key) ?? 0;
    if (current >= maxPerRoute) return false;
    counts.set(key, current + 1);
    return true;
  };
};

let lastInteraction: InteractionSnapshot | null = null;
let observers: PerformanceObserver[] = [];
let listenersAttached = false;
let stopPerf: PerfStop | null = null;

const initInteractionTracking = () => {
  if (listenersAttached) return;
  listenersAttached = true;
  const events: Array<keyof WindowEventMap> = [
    "pointerdown",
    "keydown",
    "click",
  ];
  const handler = (event: Event) => {
    lastInteraction = {
      ts: performance.now(),
      type: event.type,
      route: getRoute(),
      target: event.target,
    };
  };
  events.forEach((event) => {
    window.addEventListener(event, handler, {
      capture: true,
      passive: true,
    });
  });
  stopPerf = () => {
    events.forEach((event) => {
      window.removeEventListener(event, handler, { capture: true } as AddEventListenerOptions);
    });
    observers.forEach((observer) => observer.disconnect());
    observers = [];
    listenersAttached = false;
  };
};

const logINPFactory = (
  throttleOk: () => boolean,
  canLogRoute: (kind: string, route: string) => boolean,
  activeRef: { active: boolean }
) => {
  return (metric: unknown) => {
    if (!activeRef.active) return;
    if (!throttleOk()) return;
    const inpMetric = metric as {
      value: number;
      rating: string;
      attribution?: {
        inputDelay?: number;
        processingTime?: number;
        presentationDelay?: number;
        interactionType?: string;
        interactionTarget?: EventTarget | null;
      };
    };
    const route = lastInteraction?.route ?? getRoute();
    if (!canLogRoute("inp", route)) return;

    schedule(() => {
      if (!activeRef.active) return;
      const attr = inpMetric.attribution ?? {};
      const target =
        describeElement(attr.interactionTarget ?? lastInteraction?.target ?? null);
      const component =
        findComponent(attr.interactionTarget ?? lastInteraction?.target ?? null) ??
        "n/a";
      console.groupCollapsed(
        `[INP] ${inpMetric.value.toFixed(0)}ms (${inpMetric.rating})`
      );
      console.log("route", route);
      console.log("component", component);
      console.log("target", target);
      console.log("interactionType", attr.interactionType ?? "n/a");
      console.log("inputDelay", attr.inputDelay ?? "n/a");
      console.log("processingTime", attr.processingTime ?? "n/a");
      console.log("presentationDelay", attr.presentationDelay ?? "n/a");
      console.groupEnd();
    });
  };
};

const initLongTaskObserver = (
  throttleOk: () => boolean,
  canLogRoute: (kind: string, route: string) => boolean,
  activeRef: { active: boolean }
) => {
  if (!("PerformanceObserver" in window)) return;
  try {
    const observer = new PerformanceObserver((list) => {
      if (!activeRef.active) return;
      list.getEntries().forEach((entry) => {
        if (!throttleOk()) return;
        const route = lastInteraction?.route ?? getRoute();
        if (!canLogRoute("longtask", route)) return;
        schedule(() => {
          if (!activeRef.active) return;
          const target = describeElement(lastInteraction?.target ?? null);
          const component = findComponent(lastInteraction?.target ?? null) ?? "n/a";
          const attribution = (entry as PerformanceEntry & { attribution?: unknown })
            .attribution;
          console.groupCollapsed(
            `[LongTask] ${entry.duration.toFixed(0)}ms at ${entry.startTime.toFixed(
              0
            )}ms`
          );
          console.log("route", route);
          console.log("component", component);
          console.log("target", target);
          if (Array.isArray(attribution) && attribution.length > 0) {
            console.log("attribution", attribution);
          }
          console.groupEnd();
        });
      });
    });
    observer.observe({ entryTypes: ["longtask"] });
    observers.push(observer);
  } catch {
    // unsupported
  }
};

export const setupPerfInstrumentation = (): PerfStop => {
  if (stopPerf) return stopPerf;

  const config = getPerfConfig();
  if (!config.enabled) {
    stopPerf = () => {};
    return stopPerf;
  }

  if (Math.random() > config.sampleRate) {
    stopPerf = () => {};
    return stopPerf;
  }

  const activeRef = { active: true };
  const inpThrottle = createThrottle(config.inpThrottleMs);
  const longTaskThrottle = createThrottle(config.longTaskThrottleMs);
  const canLogRoute = createRouteCap(config.maxLogsPerRoute);

  initInteractionTracking();
  onINP(logINPFactory(inpThrottle, canLogRoute, activeRef), {
    reportAllChanges: true,
  });
  initLongTaskObserver(longTaskThrottle, canLogRoute, activeRef);

  const stop = () => {
    activeRef.active = false;
    stopPerf?.();
  };
  stopPerf = stop;
  return stop;
};
