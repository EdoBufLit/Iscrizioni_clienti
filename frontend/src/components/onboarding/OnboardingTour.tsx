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
const MEMBER_TOUR_RUN_KEY = "tour_member_run";
const MEMBER_TOUR_STEP_INDEX_KEY = "tour_member_step_index";
const MEMBER_TARGET_NOT_FOUND_MAX_RETRIES = 4;

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

const getMemberTourProgressFromStorage = (): { run: boolean; stepIndex: number } => {
  try {
    const runRaw = localStorage.getItem(MEMBER_TOUR_RUN_KEY);
    const stepRaw = localStorage.getItem(MEMBER_TOUR_STEP_INDEX_KEY);
    const parsedStep = Number.parseInt(stepRaw ?? "0", 10);

    return {
      run: runRaw === "1",
      stepIndex: Number.isFinite(parsedStep) && parsedStep >= 0 ? parsedStep : 0,
    };
  } catch {
    return { run: false, stepIndex: 0 };
  }
};

const setMemberTourProgressInStorage = (run: boolean, stepIndex: number) => {
  try {
    localStorage.setItem(MEMBER_TOUR_RUN_KEY, run ? "1" : "0");
    localStorage.setItem(MEMBER_TOUR_STEP_INDEX_KEY, `${Math.max(0, stepIndex)}`);
  } catch {
    // Ignore localStorage errors
  }
};

const clearMemberTourProgressInStorage = () => {
  try {
    localStorage.removeItem(MEMBER_TOUR_RUN_KEY);
    localStorage.removeItem(MEMBER_TOUR_STEP_INDEX_KEY);
  } catch {
    // Ignore localStorage errors
  }
};

export const OnboardingTour = ({ role, onTourEnd }: OnboardingTourProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isMemberTour = role === "member";

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
  // Member-only retry tracking for unstable targets on route/tab changes
  const memberTargetRetriesRef = useRef<Record<number, number>>({});

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
        const el = await waitForElement(targetSelector, isMemberTour ? 8 : 5, 200);
        if (!el && step.optional) {
          isNavigatingRef.current = false;
          return false; // Target not found, step is optional
        }
      }

      isNavigatingRef.current = false;
      return true;
    },
    [navigate, isOnCorrectRoute, isMemberTour]
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
        const el = await waitForElement(targetSelector, isMemberTour ? 8 : 3, 150);
        if (!el) {
          return step.optional === true; // OK to skip if optional
        }
      }

      return true;
    },
    [steps, navigateToStep, isMemberTour]
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
            isNavigatingRef.current = true;
            navigate(step.route);
            await waitForDom();
            isNavigatingRef.current = false;
          }

          const el = await waitForElement(targetSelector, isMemberTour ? 8 : 3, 150);

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

      // For member flow, allow "past end" sentinel to close cleanly when
      // optional trailing steps are not present in the current UI.
      if (direction === 1) {
        return isMemberTour ? steps.length : maxIndex;
      }
      return 0;
    },
    [steps, location.pathname, navigate, isMemberTour]
  );

  // Initialize tour - check localStorage first, then backend
  useEffect(() => {
    let cancelled = false;
    let startTimer: number | null = null;

    // Check localStorage first for immediate response
    const localState = getTourStateFromStorage(role);
    if (localState) {
      // Tour already completed or skipped locally - don't show
      if (isMemberTour) {
        clearMemberTourProgressInStorage();
      }
      setLoading(false);
      return;
    }

    // Check backend status
    fetchOnboardingStatus()
      .then((status) => {
        if (cancelled) return;
        if (!status.should_show) {
          if (isMemberTour) {
            clearMemberTourProgressInStorage();
          }
          return;
        }

        // Double-check localStorage hasn't changed
        const recheck = getTourStateFromStorage(role);
        if (recheck) {
          setLoading(false);
          return;
        }

        tourEndedRef.current = false;
        finalStepDismissedRef.current = false;
        skippedStepsRef.current.clear();
        memberTargetRetriesRef.current = {};
        setShowFinalStep(false);

        let initialStepIndex = 0;
        let resumeInProgress = false;
        if (isMemberTour) {
          const progress = getMemberTourProgressFromStorage();
          if (progress.run) {
            resumeInProgress = true;
            initialStepIndex = Math.min(
              Math.max(progress.stepIndex, 0),
              Math.max(steps.length - 1, 0)
            );
          }
        }

        setStepIndex(initialStepIndex);
        // Delay to ensure initial DOM is ready
        startTimer = window.setTimeout(() => {
          if (cancelled || tourEndedRef.current) return;
          const localRecheck = getTourStateFromStorage(role);
          if (localRecheck) return;
          setRun(true);
        }, resumeInProgress ? 200 : 600);
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
  }, [role, isMemberTour, steps.length]);

  // Persist member in-progress state to survive remounts during route/tab changes.
  useEffect(() => {
    if (!isMemberTour || loading) return;
    if (tourEndedRef.current) {
      clearMemberTourProgressInStorage();
      return;
    }
    setMemberTourProgressInStorage(run, stepIndex);
  }, [isMemberTour, loading, run, stepIndex]);

  // Temporary debug logs for member flow only.
  useEffect(() => {
    if (!isMemberTour) return;
    console.log("[OnboardingTour][member] state", {
      role,
      run,
      stepIndex,
      currentRoute: location.pathname,
    });
  }, [isMemberTour, role, run, stepIndex, location.pathname]);

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

      if (isMemberTour) {
        console.log(`[OnboardingTour][member] Ending tour: ${reason}`);
      }

      // IMMEDIATELY stop the tour - this removes the overlay
      setRun(false);
      memberTargetRetriesRef.current = {};
      if (isMemberTour) {
        clearMemberTourProgressInStorage();
      }

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
    [role, onTourEnd, isMemberTour]
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

  const completeTourWithFinalDialog = useCallback(() => {
    endTour("completed");
    if (!finalStepDismissedRef.current) {
      setShowFinalStep(true);
    }
  }, [endTour]);

  const handleJoyrideCallback = useCallback(
    async (data: CallBackProps) => {
      const { status, action, type, index } = data;
      const callbackIndex = typeof index === "number" ? index : stepIndex;

      if (isMemberTour) {
        console.log("[OnboardingTour][member] callback", {
          role,
          run,
          stepIndex,
          currentRoute: location.pathname,
          status,
          action,
          type,
          index: callbackIndex,
        });
      }

      // Ignore events while navigating
      if (isNavigatingRef.current) return;

      // Handle tour end cases - MUST check these FIRST before other logic
      // 1. User clicked "Fine" (last button) - status becomes FINISHED
      if (status === STATUS.FINISHED) {
        completeTourWithFinalDialog();
        return;
      }

      // 2. User clicked "Salta guida" - status becomes SKIPPED
      if (status === STATUS.SKIPPED) {
        finalStepDismissedRef.current = true;
        setShowFinalStep(false);
        endTour("skipped");
        return;
      }

      if (isMemberTour && (status === STATUS.ERROR || type === EVENTS.ERROR)) {
        // Keep member tour alive on transient route/DOM mismatches.
        const prepared = await prepareStep(callbackIndex);
        if (!prepared) {
          const nextIndex = await findNextValidStep(callbackIndex + 1, 1);
          if (nextIndex >= steps.length) {
            completeTourWithFinalDialog();
            return;
          }
          setStepIndex(nextIndex);
        }
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
        if (action !== ACTIONS.PREV && callbackIndex >= steps.length - 1) {
          completeTourWithFinalDialog();
          return;
        }

        const nextDirection = action === ACTIONS.PREV ? -1 : 1;
        const nextRawIndex = callbackIndex + nextDirection;

        // Find next valid step
        const nextIndex = await findNextValidStep(nextRawIndex, nextDirection);
        if (nextDirection === 1 && nextIndex >= steps.length) {
          completeTourWithFinalDialog();
          return;
        }
        memberTargetRetriesRef.current = {};
        setStepIndex(nextIndex);
        return;
      }

      if (type === EVENTS.TARGET_NOT_FOUND) {
        const step = steps[callbackIndex];

        // If optional, skip to next
        if (step?.optional) {
          skippedStepsRef.current.add(callbackIndex);
          const nextIndex = await findNextValidStep(callbackIndex + 1, 1);
          if (nextIndex >= steps.length) {
            completeTourWithFinalDialog();
            return;
          }
          setStepIndex(nextIndex);
          return;
        }

        // Non-optional: member flow retries before advancing to avoid route/tab race.
        if (isMemberTour) {
          for (let attempt = 1; attempt <= MEMBER_TARGET_NOT_FOUND_MAX_RETRIES; attempt += 1) {
            memberTargetRetriesRef.current[callbackIndex] = attempt;
            console.warn("[OnboardingTour][member] target retry", {
              stepIndex: callbackIndex,
              attempt,
              max: MEMBER_TARGET_NOT_FOUND_MAX_RETRIES,
              currentRoute: location.pathname,
            });
            await waitForDom();
            const prepared = await prepareStep(callbackIndex);
            if (prepared) {
              memberTargetRetriesRef.current[callbackIndex] = 0;
              return;
            }
          }
          memberTargetRetriesRef.current[callbackIndex] = 0;
        }

        // After retries, skip ahead without stopping the tour.
        const prepared = await prepareStep(callbackIndex);
        if (!prepared) {
          const nextIndex = await findNextValidStep(callbackIndex + 1, 1);
          if (nextIndex >= steps.length) {
            completeTourWithFinalDialog();
            return;
          }
          setStepIndex(nextIndex);
        }
        return;
      }

      if (type === EVENTS.TOUR_START) {
        startOnboardingTour().catch(() => {});
      }
    },
    [
      role,
      run,
      stepIndex,
      location.pathname,
      isMemberTour,
      steps,
      findNextValidStep,
      prepareStep,
      endTour,
      completeTourWithFinalDialog,
    ]
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
