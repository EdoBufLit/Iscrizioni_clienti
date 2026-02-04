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

export const OnboardingTour = ({ role, onTourEnd }: OnboardingTourProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  // Track if we're currently navigating/waiting for DOM
  const isNavigatingRef = useRef(false);
  // Track skipped optional steps to avoid infinite loops
  const skippedStepsRef = useRef(new Set<number>());

  const steps = role === "member" ? MEMBER_TOUR_STEPS : ORG_ADMIN_TOUR_STEPS;
  const finalMessage = TOUR_FINAL_MESSAGE[role];

  // Add final step dynamically
  const stepsWithFinal: TourStep[] = [
    ...steps,
    {
      target: "body",
      title: finalMessage.title,
      content: finalMessage.content,
      placement: "center" as const,
      disableBeacon: true,
    },
  ];

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
      const step = stepsWithFinal[index];
      if (!step) return false;

      // Final step always works
      if (step.target === "body") return true;

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
    [stepsWithFinal, navigateToStep]
  );

  // Find next valid step index (skipping optional steps whose targets don't exist)
  const findNextValidStep = useCallback(
    async (fromIndex: number, direction: 1 | -1 = 1): Promise<number> => {
      let nextIndex = fromIndex;
      const maxIndex = stepsWithFinal.length - 1;

      while (nextIndex >= 0 && nextIndex <= maxIndex) {
        // Skip already-skipped steps
        if (skippedStepsRef.current.has(nextIndex)) {
          nextIndex += direction;
          continue;
        }

        const step = stepsWithFinal[nextIndex];

        // Final step is always valid
        if (step.target === "body") return nextIndex;

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

      // If we've gone past the end, return the final step
      return direction === 1 ? maxIndex : 0;
    },
    [stepsWithFinal, location.pathname, navigate]
  );

  // Initialize tour
  useEffect(() => {
    fetchOnboardingStatus()
      .then((status) => {
        if (status.should_show) {
          // Delay to ensure initial DOM is ready
          setTimeout(() => {
            setRun(true);
          }, 600);
        }
      })
      .catch(() => {
        // Silently fail
      })
      .finally(() => setLoading(false));
  }, []);

  // Handle step changes - ensure we're on the right route
  useEffect(() => {
    if (!run || loading || isNavigatingRef.current) return;

    const step = stepsWithFinal[stepIndex];
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
  }, [run, loading, stepIndex, stepsWithFinal, isOnCorrectRoute, navigate]);

  const handleJoyrideCallback = useCallback(
    async (data: CallBackProps) => {
      const { status, action, type, index } = data;

      // Ignore events while navigating
      if (isNavigatingRef.current) return;

      if (type === EVENTS.STEP_AFTER) {
        const nextDirection = action === ACTIONS.PREV ? -1 : 1;
        const nextRawIndex = index + nextDirection;

        // Find next valid step
        const nextIndex = await findNextValidStep(nextRawIndex, nextDirection);
        setStepIndex(nextIndex);
      }

      if (type === EVENTS.TARGET_NOT_FOUND) {
        const step = stepsWithFinal[index];

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

      if (status === STATUS.FINISHED) {
        completeOnboardingTour().catch(() => {});
        setRun(false);
        onTourEnd?.();
      }

      if (status === STATUS.SKIPPED) {
        skipOnboardingTour().catch(() => {});
        setRun(false);
        onTourEnd?.();
      }
    },
    [stepsWithFinal, findNextValidStep, prepareStep, onTourEnd]
  );

  if (loading) return null;

  return (
    <Joyride
      steps={stepsWithFinal}
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
  );
};

export default OnboardingTour;
