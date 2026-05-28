import { type ReactNode } from "react";

type Tab = {
  key: string;
  label: string;
  icon?: ReactNode;
};

type Props = {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
};

export default function MobileScrollTabs({ tabs, active, onChange }: Props) {
  return (
    <div className="relative">
      <div
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 scrollbar-none"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={`snap-start flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                isActive
                  ? "border-brand bg-brand text-white shadow-sm"
                  : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50"
              }`}
            >
              {tab.icon ? <span className="h-4 w-4">{tab.icon}</span> : null}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
