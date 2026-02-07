import { ChangeEvent, memo, useEffect, useRef, useState } from "react";

type DebouncedSearchInputProps = {
  resetKey: number;
  onDebouncedChange: (value: string) => void;
};

const DebouncedSearchInput = memo(function DebouncedSearchInput({
  resetKey,
  onDebouncedChange,
}: DebouncedSearchInputProps) {
  const [value, setValue] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setValue("");
  }, [resetKey]);

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    []
  );

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setValue(nextValue);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => onDebouncedChange(nextValue), 320);
  };

  return (
    <div className="relative flex-1 min-w-[220px]">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
      </svg>
      <input
        className="w-full rounded-md border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 sm:max-w-xs"
        type="search"
        placeholder="Cerca per nome, cognome, email o CF..."
        value={value}
        onChange={handleChange}
      />
    </div>
  );
});

export default DebouncedSearchInput;
