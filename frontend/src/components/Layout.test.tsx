import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Layout from "./Layout";

const animations = vi.hoisted(() => ({
  set: vi.fn(), to: vi.fn(), fromTo: vi.fn(), timeline: vi.fn(), kill: vi.fn(), killTweensOf: vi.fn(),
}));
function assertMountedTargets(target: unknown) {
  const nodes = Array.isArray(target) ? target : [target];
  if (nodes.some(node => !(node instanceof Element))) throw new TypeError("GSAP target is null or missing");
}
vi.mock("gsap", () => ({ gsap: {
  set: (...args: unknown[]) => animations.set(...args),
  to: (...args: unknown[]) => animations.to(...args),
  killTweensOf: (...args: unknown[]) => animations.killTweensOf(...args),
  timeline: () => { animations.timeline(); return { fromTo: animations.fromTo, kill: animations.kill }; },
} }));
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: { div: ({ children }: { children: ReactNode }) => <div>{children}</div> },
}));
vi.mock("./motion/MotionProvider", () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("./public/usePublicMotion", () => ({ usePublicMotion: () => undefined }));
vi.mock("./public/InstallAppPrompt", () => ({ default: () => null }));
vi.mock("./theme/ThemeProvider", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
vi.mock("./theme/ThemeToggle", () => ({ default: () => <button type="button">Cambia tema</button> }));
vi.mock("../lib/api", () => ({ fetchWhoAmI: async () => ({ authenticated: false }) }));

function Content() {
  const location = useLocation();
  return <div><output aria-label="Pagina corrente">{location.pathname}</output>
    <Link to="/forms/demo">Apri modulo</Link><Link to="/contatti">Apri pagina pubblica</Link>
  </div>;
}
function showPage(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route element={<Layout />}>
    <Route path="*" element={<Content />} />
  </Route></Routes></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  animations.set.mockImplementation(assertMountedTargets);
  animations.to.mockImplementation(assertMountedTargets);
  animations.fromTo.mockImplementation(assertMountedTargets);
  animations.killTweensOf.mockImplementation(assertMountedTargets);
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn((query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)", media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
  })) });
});

describe("Layout: animazioni soltanto sugli elementi presenti", () => {
  it.each(["/forms/demo", "/org-admin/login"])("mostra %s con movimento ridotto senza animare header assenti", async path => {
    showPage(path);
    expect(await screen.findByLabelText("Pagina corrente")).toHaveTextContent(path);
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(animations.set).not.toHaveBeenCalled();
    expect(animations.to).not.toHaveBeenCalled();
    expect(animations.timeline).not.toHaveBeenCalled();
    expect(animations.fromTo).not.toHaveBeenCalled();
  });

  it("su una pagina pubblica con movimento ridotto ripristina solo elementi reali", async () => {
    showPage("/contatti");
    expect(await screen.findByRole("banner")).toBeInTheDocument();
    await waitFor(() => expect(animations.set).toHaveBeenCalled());
    expect(animations.timeline).not.toHaveBeenCalled();
    for (const [target] of animations.set.mock.calls) {
      const nodes = Array.isArray(target) ? target : [target];
      expect(nodes.length).toBeGreaterThan(0);
      nodes.forEach(node => expect(node).toBeInTheDocument());
    }
  });

  it("passa dal modulo alla pagina pubblica e torna al modulo senza usare ref nulli", async () => {
    showPage("/forms/demo");
    expect(animations.set).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: "Apri pagina pubblica" }));
    expect(await screen.findByRole("banner")).toBeInTheDocument();
    await waitFor(() => expect(animations.set).toHaveBeenCalled());
    const previousCalls = animations.set.mock.calls.length;
    fireEvent.click(screen.getByRole("link", { name: "Apri modulo" }));
    expect(screen.getByLabelText("Pagina corrente")).toHaveTextContent("/forms/demo");
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(animations.set).toHaveBeenCalledTimes(previousCalls);
    expect(animations.timeline).not.toHaveBeenCalled();
  });
});
