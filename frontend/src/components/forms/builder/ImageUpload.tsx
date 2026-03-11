import React, { useRef, useState } from "react";

interface ImageUploadProps {
  label: string;
  value: string | null;
  onChange: (base64: string) => void;
  onRemove: () => void;
  disabled?: boolean;
}

export function ImageUpload({ label, value, onChange, onRemove, disabled }: ImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Resize logic to keep base64 small
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        // Compress to JPEG 80% quality
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        onChange(dataUrl);
        setLoading(false);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = ""; // Reset input
  };

  return (
    <div className="space-y-3">
      <span className="block text-[11px] font-bold uppercase tracking-[0.05em] text-neutral-500">{label}</span>
      {value ? (
        <div className="relative group overflow-hidden rounded-xl border border-neutral-200">
          <div className="aspect-video w-full bg-neutral-100 flex items-center justify-center relative">
             <img src={value} alt="Preview" className="object-cover w-full h-full" />
             <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-white/90 text-neutral-900 rounded-lg px-3 py-1.5 text-xs font-bold shadow-sm hover:bg-white transition-colors"
                  disabled={disabled}
                >
                  Cambia
                </button>
                <button
                  type="button"
                  onClick={onRemove}
                  className="bg-red-500/90 text-white rounded-lg px-3 py-1.5 text-xs font-bold shadow-sm hover:bg-red-500 transition-colors"
                  disabled={disabled}
                >
                  Rimuovi
                </button>
             </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || loading}
          className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50 hover:bg-neutral-100 hover:border-brand/30 transition-all p-6 text-neutral-500 disabled:opacity-50"
        >
          <svg className="w-8 h-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <span className="text-sm font-medium">{loading ? "Elaborazione..." : "Carica immagine"}</span>
        </button>
      )}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/jpeg, image/png, image/webp"
        onChange={handleFileChange}
      />
    </div>
  );
}
