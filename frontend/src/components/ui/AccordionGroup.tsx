import { type ReactNode, useState } from "react";

type AccordionItem = {
  id: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
};

type Props = {
  items: AccordionItem[];
  defaultOpen?: string[];
  allowMultiple?: boolean;
};

export default function AccordionGroup({
  items,
  defaultOpen = [],
  allowMultiple = false,
}: Props) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set(defaultOpen));

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (!allowMultiple) next.clear();
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const isOpen = openIds.has(item.id);
        return (
          <div
            key={item.id}
            className={`rounded-xl border transition-colors ${
              isOpen ? "border-neutral-200 bg-white shadow-sm" : "border-neutral-200/80 bg-neutral-50/60"
            }`}
          >
            <button
              type="button"
              onClick={() => toggle(item.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
            >
              <div className="min-w-0">
                <span className="block text-sm font-semibold text-neutral-900">{item.title}</span>
                {item.subtitle ? (
                  <span className="mt-0.5 block text-xs text-neutral-500">{item.subtitle}</span>
                ) : null}
              </div>
              <span
                className={`shrink-0 text-neutral-400 transition-transform duration-200 ${
                  isOpen ? "rotate-180" : ""
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </button>
            <div
              className={`overflow-hidden transition-all duration-200 ease-out ${
                isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <div className="border-t border-neutral-100 px-4 py-4">{item.children}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
