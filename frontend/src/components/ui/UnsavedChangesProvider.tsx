import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { type Location, useBlocker } from "react-router-dom";
import ConfirmModal from "./ConfirmModal";

type GuardOptions = {
  id: string;
  when: boolean;
  title?: string;
  message?: string;
  blockOnSearchChange?: boolean;
};

type UnsavedChangesContextValue = {
  registerGuard: (guard: GuardOptions) => () => void;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

const DEFAULT_TITLE = "Modifiche non salvate";
const DEFAULT_MESSAGE = "Hai modifiche non salvate. Se esci ora, andranno perse.";

export const UnsavedChangesProvider = ({ children }: { children: ReactNode }) => {
  const [guards, setGuards] = useState<Record<string, GuardOptions>>({});

  const activeGuards = useMemo(
    () => Object.values(guards).filter((guard) => guard.when),
    [guards],
  );
  const activeGuard = activeGuards[activeGuards.length - 1] ?? null;

  const registerGuard = useCallback((guard: GuardOptions) => {
    setGuards((current) => ({ ...current, [guard.id]: guard }));
    return () => {
      setGuards((current) => {
        const next = { ...current };
        delete next[guard.id];
        return next;
      });
    };
  }, []);

  useEffect(() => {
    if (!activeGuards.length) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [activeGuards.length]);

  useEffect(() => {
    if (activeGuards.length) {
      document.documentElement.dataset.unsavedChanges = "true";
    } else {
      delete document.documentElement.dataset.unsavedChanges;
    }
    return () => {
      delete document.documentElement.dataset.unsavedChanges;
    };
  }, [activeGuards.length]);

  const blocker = useBlocker(
    useCallback(
      ({
        currentLocation,
        nextLocation,
      }: {
        currentLocation: Location;
        nextLocation: Location;
      }) => {
        if (!activeGuards.length) return false;
        const sameLocation =
          currentLocation.pathname === nextLocation.pathname
          && currentLocation.search === nextLocation.search
          && currentLocation.hash === nextLocation.hash;
        if (sameLocation) return false;

        const searchOnlyChange =
          currentLocation.pathname === nextLocation.pathname
          && currentLocation.hash === nextLocation.hash
          && currentLocation.search !== nextLocation.search;
        if (
          searchOnlyChange
          && activeGuards.every((guard) => guard.blockOnSearchChange === false)
        ) {
          return false;
        }
        return true;
      },
      [activeGuards],
    ),
  );

  const value = useMemo(() => ({ registerGuard }), [registerGuard]);

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      <ConfirmModal
        open={blocker.state === "blocked"}
        title={activeGuard?.title || DEFAULT_TITLE}
        description={activeGuard?.message || DEFAULT_MESSAGE}
        confirmLabel="Esci senza salvare"
        cancelLabel="Resta qui"
        tone="danger"
        impact="Le modifiche locali non sono ancora state salvate e non potranno essere recuperate."
        onClose={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
      />
    </UnsavedChangesContext.Provider>
  );
};

export function useUnsavedChangesGuard({
  when,
  title = DEFAULT_TITLE,
  message = DEFAULT_MESSAGE,
  blockOnSearchChange = true,
}: Omit<GuardOptions, "id">) {
  const context = useContext(UnsavedChangesContext);
  const id = useId();

  useEffect(() => {
    if (!context) return;
    return context.registerGuard({
      id,
      when,
      title,
      message,
      blockOnSearchChange,
    });
  }, [blockOnSearchChange, context, id, message, title, when]);
}
