import { type ReactNode, useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  snapPoints?: number[]; // es. [0.6, 1] per 60% e 100%
  initialSnap?: number;
};

export default function BottomSheet({
  open,
  onClose,
  children,
  title,
  snapPoints = [0.6, 1],
  initialSnap = 0,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [snapIndex, setSnapIndex] = useState(initialSnap);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  useEffect(() => {
    if (!open) {
      setSnapIndex(initialSnap);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, initialSnap]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const currentSnap = snapPoints[Math.min(snapIndex, snapPoints.length - 1)] ?? 0.6;

  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragStartY.current = clientY;
    dragStartHeight.current = panelRef.current?.getBoundingClientRect().height ?? 0;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging) return;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const delta = dragStartY.current - clientY;
    const newHeight = Math.max(100, dragStartHeight.current + delta);
    if (panelRef.current) {
      panelRef.current.style.height = `${newHeight}px`;
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging || !panelRef.current) {
      setIsDragging(false);
      return;
    }
    const height = panelRef.current.getBoundingClientRect().height;
    const vh = window.innerHeight;
    let closest = 0;
    let minDiff = Infinity;
    snapPoints.forEach((sp, i) => {
      const target = sp * vh;
      const diff = Math.abs(target - height);
      if (diff < minDiff) {
        minDiff = diff;
        closest = i;
      }
    });
    setSnapIndex(closest);
    panelRef.current.style.height = `${snapPoints[closest] * vh}px`;
    setIsDragging(false);
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div
        ref={panelRef}
        className="relative z-10 flex flex-col rounded-t-2xl bg-white shadow-[0_-8px_32px_rgba(0,0,0,0.18)] transition-[height] duration-300 ease-out"
        style={{ height: `${currentSnap * 100}vh`, maxHeight: "100vh" }}
      >
        <div
          className="flex shrink-0 cursor-grab touch-none items-center justify-center pt-3 pb-1 active:cursor-grabbing"
          onMouseDown={handleTouchStart}
          onMouseMove={handleTouchMove}
          onMouseUp={handleTouchEnd}
          onMouseLeave={handleTouchEnd}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="h-1.5 w-10 rounded-full bg-neutral-300" />
        </div>
        {title ? (
          <div className="flex items-center justify-between px-5 pb-3">
            <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
              aria-label="Chiudi"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : null}
        <div className="flex-1 overflow-y-auto px-5 pb-8 custom-scrollbar">{children}</div>
      </div>
    </div>
  );
}
