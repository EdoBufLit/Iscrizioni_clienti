import { useCallback, useEffect, useState } from "react";
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

export const OnboardingTour = ({ role, onTourEnd }: OnboardingTourProps) => {
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  const steps = role === "member" ? MEMBER_TOUR_STEPS : ORG_ADMIN_TOUR_STEPS;
  const finalMessage = TOUR_FINAL_MESSAGE[role];

  // Add final step dynamically
  const stepsWithFinal = [
    ...steps,
    {
      target: "body",
      title: finalMessage.title,
      content: finalMessage.content,
      placement: "center" as const,
      disableBeacon: true,
    },
  ];

  useEffect(() => {
    fetchOnboardingStatus()
      .then((status) => {
        if (status.should_show) {
          // Small delay to ensure DOM elements are rendered
          setTimeout(() => setRun(true), 500);
        }
      })
      .catch(() => {
        // Silently fail - don't block user experience
      })
      .finally(() => setLoading(false));
  }, []);

  const handleJoyrideCallback = useCallback(
    (data: CallBackProps) => {
      const { status, action, type, index } = data;

      if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
        setStepIndex(index + (action === ACTIONS.PREV ? -1 : 1));
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
    [onTourEnd]
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
