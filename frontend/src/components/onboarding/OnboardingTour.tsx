import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Joyride, {
  type CallBackProps,
  STATUS,
  ACTIONS,
  EVENTS,
} from "react-joyride";
import {
  fetchOnboardingStatus,
  startOnboardingTour,
  completeOnboardingTour,
  skipOnboardingTour,
} from "../../lib/api";
import {
  MEMBER_TOUR_STEPS,
  ORG_ADMIN_TOUR_STEPS,
  TOUR_FINAL_MESSAGE,
  type TourStep,
} from "./tourSteps";

type OnboardingTourProps = {
  role: "member" | "org_admin";
  onTourEnd?: () => void;
};

const JOYRIDE_STYLES = {
  options: {
    primaryColor: "#4F46E5",
    zIndex: 10000,
  },
  tooltip: {
    borderRadius: 8,
    padding: 16,
  },
  tooltipTitle: {
    fontSize: 16,
    fontWeight: 600,
  },
  tooltipContent: {
    fontSize: 14,
    lineHeight: 1.5,
  },
  buttonNext: {
    borderRadius: 6,
    padding: "8px 16px",
    fontSize: 14,
  },
  buttonBack: {
    marginRight: 8,
    fontSize: 14,
  },
  buttonSkip: {
    color: "#6B7280",
    fontSize: 14,
  },
};

const LOCALE = {
  back: "Indietro",
  close: "Chiudi",
  last: "Fine",
  next: "Avanti",
  open: "Apri",
  skip: "Salta guida",
};

type FinalStepDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  content: string;
  onClose: () => void;
};

const FinalStepDialog = ({
  open,
  onOpenChange,
  title,
  content,
  onClose,
}: FinalStepDialogProps) => {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-final-step-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Chiudi modale guida completata"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-700"
          aria-label="Chiudi"
        >
          X
        </button>

        <h2 id="onboarding-final-step-title" className="text-lg font-semibold text-neutral-900">
          {title}
        </h2>
        <p className="mt-2 text-sm text-neutral-600">{content}</p>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
          >
            Indietro
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            Fine
          </button>
        </div>
      </div>
    </div>
  );
};

// Wait for DOM to settle after navigation
const waitForDom = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 100);
      });
    });
  });

// Try to find element with retries
const waitForElement = async (
  selector: string,
  maxRetries = 5,
  delayMs = 200
): Promise<Element | null> => {
  for (let i = 0; i < maxRetries; i++) {
    const el = document.querySelector(selector);
    if (el) return el;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
};

// localStorage keys for tour state persistence
const TOUR_STORAGE_KEY_PREFIX = "onboarding_tour_";

const getTourStorageKey = (role: string) => `${TOUR_STORAGE_KEY_PREFIX}${role}`;

const getTourStateFromStorage = (role: string): "completed" | "skipped" | null => {
  try {
    const value = localStorage.getItem(getTourStorageKey(role));
    if (value === "completed" || value === "skipped") return value;
    return null;
  } catch {
    return null;
  }
};

const setTourStateInStorage = (role: string, state: "completed" | "skipped") => {
  try {
    localStorage.setItem(getTourStorageKey(role), state);
  } catch {
    // Ignore localStorage errors
  }
};

export const OnboardingTour = ({ role, onTourEnd }: OnboardingTourProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showFinalStep, setShowFinalStep] = useState(false);

  // Track if we're currently navigating/waiting for DOM
  const isNavigatingRef = useRef(false);
  // Track skipped optional steps to avoid infinite loops
  const skippedStepsRef = useRef(new Set<number>());
  // Track if tour has been ended to prevent double handling
  const tourEndedRef = useRef(false);
  // Track manual close of final dialog to avoid reopening due late callbacks
  const finalStepDismissedRef = useRef(false);

  const steps = role === "member" ? MEMBER_TOUR_STEPS : ORG_ADMIN_TOUR_STEPS;
  const finalMessage = TOUR_FINAL_MESSAGE[role];

  // Check if current route matches the required route for a step
  const isOnCorrectRoute = useCallback(
    (step: TourStep): boolean => {
      if (!step.route) return true;
      // Exact match or starts with (for nested routes)
      return (
        location.pathname === step.route ||
        location.pathname.startsWith(step.route + "/")
      );
    },
    [location.pathname]
  );

  // Navigate to the required route and wait for DOM
  const navigateToStep = useCallback(
    async (step: TourStep): Promise<boolean> => {
      if (!step.route || isOnCorrectRoute(step)) {
        return true;
      }

      isNavigatingRef.current = true;
      navigate(step.route);

      // Wait for navigation and DOM to settle
      await waitForDom();

      // Wait for target element
      const targetSelector =
        typeof step.target === "string" ? step.target : null;
      if (targetSelector) {
        const el = await waitForElement(targetSelector);
        if (!el && step.optional) {
          isNavigatingRef.current = false;
          return false; // Target not found, step is optional
        }
      }

      isNavigatingRef.current = false;
      return true;
    },
    [navigate, isOnCorrectRoute]
  );

  // Prepare step - navigate if needed, verify target exists
  const prepareStep = useCallback(
    async (index: number): Promise<boolean> => {
      const step = steps[index];
      if (!step) return false;

      // Navigate if needed
      const navOk = await navigateToStep(step);
      if (!navOk) return false;

      // Final check - target must exist
      const targetSelector =
        typeof step.target === "string" ? step.target : null;
      if (targetSelector) {
        const el = await waitForElement(targetSelector, 3, 150);
        if (!el) {
          return step.optional === true; // OK to skip if optional
        }
      }

      return true;
    },
    [steps, navigateToStep]
  );

  // Find next valid step index (skipping optional steps whose targets don't exist)
  const findNextValidStep = useCallback(
    async (fromIndex: number, direction: 1 | -1 = 1): Promise<number> => {
      let nextIndex = fromIndex;
      const maxIndex = steps.length - 1;

      while (nextIndex >= 0 && nextIndex <= maxIndex) {
        // Skip already-skipped steps
        if (skippedStepsRef.current.has(nextIndex)) {
          nextIndex += direction;
          continue;
        }

        const step = steps[nextIndex];
        if (!step) {
          nextIndex += direction;
          continue;
        }

        // Check if step target exists
        const targetSelector =
          typeof step.target === "string" ? step.target : null;

        if (targetSelector) {
          // Navigate first if needed
          if (step.route && location.pathname !== step.route) {
            navigate(step.route);
            await waitForDom();
          }

          const el = await waitForElement(targetSelector, 3, 150);

          if (!el) {
            if (step.optional) {
              // Mark as skipped and continue
              skippedStepsRef.current.add(nextIndex);
              nextIndex += direction;
              continue;
            }
            // Non-optional step without target - still try to show it
            // (Joyride will handle TARGET_NOT_FOUND)
          }
        }

        return nextIndex;
      }

      // Clamp to the nearest valid step index
      return direction === 1 ? maxIndex : 0;
    },
    [steps, location.pathname, navigate]
  );

  // Initialize tour - check localStorage first, then backend
  useEffect(() => {
    let cancelled = false;
    let startTimer: number | null = null;

    // Check localStorage first for immediate response
    const localState = getTourStateFromStorage(role);
    if (localState) {
      // Tour already completed or skipped locally - don't show
      setLoading(false);
      return;
    }

    // Check backend status
    fetchOnboardingStatus()
      .then((status) => {
        if (cancelled) return;
        if (status.should_show) {
          // Double-check localStorage hasn't changed
          const recheck = getTourStateFromStorage(role);
          if (recheck) {
            setLoading(false);
            return;
          }
          tourEndedRef.current = false;
          finalStepDismissedRef.current = false;
          skippedStepsRef.current.clear();
          setShowFinalStep(false);
          setStepIndex(0);
          // Delay to ensure initial DOM is ready
          startTimer = window.setTimeout(() => {
            if (cancelled || tourEndedRef.current) return;
            const localRecheck = getTourStateFromStorage(role);
            if (localRecheck) return;
            setRun(true);
          }, 600);
        }
      })
      .catch(() => {
        // Silently fail
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (startTimer !== null) {
        window.clearTimeout(startTimer);
      }
    };
  }, [role]);

  // Handle step changes - ensure we're on the right route
  useEffect(() => {
    if (tourEndedRef.current) return;
    if (!run || loading || isNavigatingRef.current) return;

    const step = steps[stepIndex];
    if (!step) return;

    // Check if we need to navigate
    if (step.route && !isOnCorrectRoute(step)) {
      const doNav = async () => {
        isNavigatingRef.current = true;
        navigate(step.route!);
        await waitForDom();
        isNavigatingRef.current = false;
      };
      doNav();
    }
  }, [run, loading, stepIndex, steps, isOnCorrectRoute, navigate]);

  // Helper to end tour and persist state
  const endTour = useCallback(
    (reason: "completed" | "skipped") => {
      // Prevent double handling
      if (tourEndedRef.current) return;
      tourEndedRef.current = true;

      console.log(`[OnboardingTour] Ending tour: ${reason}`);

      // IMMEDIATELY stop the tour - this removes the overlay
      setRun(false);

      // Save to localStorage for instant persistence across refreshes
      setTourStateInStorage(role, reason);

      // Save to backend (async, non-blocking)
      if (reason === "completed") {
        completeOnboardingTour().catch(() => {});
      } else {
        skipOnboardingTour().catch(() => {});
      }

      // Notify parent
      onTourEnd?.();
    },
    [role, onTourEnd]
  );

  const handleFinalStepOpenChange = useCallback((open: boolean) => {
    if (!open) {
      finalStepDismissedRef.current = true;
    }
    setShowFinalStep(open);
  }, []);

  const closeFinalStep = useCallback(() => {
    finalStepDismissedRef.current = true;
    setShowFinalStep(false);
  }, []);

  const handleJoyrideCallback = useCallback(
    async (data: CallBackProps) => {
      const { status, action, type, index } = data;

      // DEBUG: Log all callback events
      console.log("[OnboardingTour] Callback:", { status, action, type, index });

      // Ignore events while navigating
      if (isNavigatingRef.current) return;

      // Handle tour end cases - MUST check these FIRST before other logic
      // 1. User clicked "Fine" (last button) - status becomes FINISHED
      if (status === STATUS.FINISHED) {
        endTour("completed");
        if (!finalStepDismissedRef.current) {
          setShowFinalStep(true);
        }
        return;
      }

      // 2. User clicked "Salta guida" - status becomes SKIPPED
      if (status === STATUS.SKIPPED) {
        finalStepDismissedRef.current = true;
        setShowFinalStep(false);
        endTour("skipped");
        return;
      }

      // 3. User clicked X button - action is CLOSE
      if (action === ACTIONS.CLOSE) {
        finalStepDismissedRef.current = true;
        setShowFinalStep(false);
        endTour("skipped");
        return;
      }

      // Handle step navigation
      if (type === EVENTS.STEP_AFTER) {
        // Some Joyride versions emit STEP_AFTER on last step before FINISHED.
        // Complete immediately to avoid being stuck on the last tooltip.
        if (action !== ACTIONS.PREV && index >= steps.length - 1) {
          endTour("completed");
          if (!finalStepDismissedRef.current) {
            setShowFinalStep(true);
          }
          return;
        }

        const nextDirection = action === ACTIONS.PREV ? -1 : 1;
        const nextRawIndex = index + nextDirection;

        // Find next valid step
        const nextIndex = await findNextValidStep(nextRawIndex, nextDirection);
        setStepIndex(nextIndex);
      }

      if (type === EVENTS.TARGET_NOT_FOUND) {
        const step = steps[index];

        // If optional, skip to next
        if (step?.optional) {
          skippedStepsRef.current.add(index);
          const nextIndex = await findNextValidStep(index + 1, 1);
          setStepIndex(nextIndex);
          return;
        }

        // Non-optional: try to prepare the step (navigate + wait)
        const prepared = await prepareStep(index);
        if (!prepared) {
          // Still can't find it - skip anyway
          const nextIndex = await findNextValidStep(index + 1, 1);
          setStepIndex(nextIndex);
        }
        // If prepared, Joyride will retry automatically on next render
      }

      if (type === EVENTS.TOUR_START) {
        startOnboardingTour().catch(() => {});
      }
    },
    [steps, findNextValidStep, prepareStep, endTour]
  );

  if (loading) return null;

  return (
    <>
      <Joyride
        steps={steps}
        run={run}
        stepIndex={stepIndex}
        continuous
        showSkipButton
        showProgress
        scrollToFirstStep
        disableScrollParentFix
        callback={handleJoyrideCallback}
        styles={JOYRIDE_STYLES}
        locale={LOCALE}
        floaterProps={{
          disableAnimation: true,
        }}
      />
      <FinalStepDialog
        open={showFinalStep}
        onOpenChange={handleFinalStepOpenChange}
        title={finalMessage.title}
        content={finalMessage.content}
        onClose={closeFinalStep}
      />
    </>
  );
};

export default OnboardingTour;
