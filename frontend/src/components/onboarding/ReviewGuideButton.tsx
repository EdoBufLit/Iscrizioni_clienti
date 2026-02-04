import { useState } from "react";
import { resetOnboardingTour } from "../../lib/api";

// Must match the key prefix in OnboardingTour.tsx
const TOUR_STORAGE_KEY_PREFIX = "onboarding_tour_";

const clearTourStorage = () => {
  try {
    // Clear both role keys to ensure clean reset
    localStorage.removeItem(`${TOUR_STORAGE_KEY_PREFIX}member`);
    localStorage.removeItem(`${TOUR_STORAGE_KEY_PREFIX}org_admin`);
  } catch {
    // Ignore localStorage errors
  }
};

type ReviewGuideButtonProps = {
  className?: string;
};

export const ReviewGuideButton = ({ className = "" }: ReviewGuideButtonProps) => {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      // Clear localStorage first for immediate effect
      clearTourStorage();
      // Then reset backend
      await resetOnboardingTour();
      window.location.reload();
    } catch {
      // Silently fail
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={`flex items-center gap-2 text-sm font-medium text-neutral-500 transition hover:text-neutral-700 disabled:opacity-50 ${className}`}
      data-tour="member-help"
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
      </svg>
      {loading ? "Caricamento..." : "Rivedi guida"}
    </button>
  );
};

export default ReviewGuideButton;
