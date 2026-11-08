import React, { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Check } from "lucide-react";

export type SharedSelectOption = {
  value: string;
  display?: string;
  displayTrigger?: string;
  displayOption?: string;
  sub?: string;
};

export function SharedSelect({
  value,
  onChange,
  options,
  label,
  className,
  triggerClassName,
  contentClassName,
  align = "stretch",
  multiple = false,
}: {
  value: string | string[];
  onChange: (v: any) => void;
  options: SharedSelectOption[];
  label?: string;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  align?: "stretch" | "left" | "right" | "center";
  multiple?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const selectedItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen && selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [isOpen]);

  let triggerText = "Any";
  if (multiple) {
    const vals = Array.isArray(value) ? value : value ? [value as string] : [];
    if (vals.length === 0) {
      triggerText = "Any";
    } else if (vals.length === 1) {
      const selectedOpt = options.find((o) => o.value === vals[0]);
      triggerText =
        selectedOpt?.displayTrigger ||
        selectedOpt?.displayOption ||
        selectedOpt?.display ||
        vals[0];
    } else {
      triggerText = `${vals.length} selected`;
    }
  } else {
    const val = value as string;
    const selectedOpt = options.find((o) => o.value === val);
    triggerText =
      selectedOpt?.displayTrigger ||
      selectedOpt?.displayOption ||
      selectedOpt?.display ||
      (val === "" ? "Any" : val);
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 w-full relative",
        isOpen ? "z-50" : "z-10",
        className,
      )}
      ref={ref}
    >
      {label && (
        <span className="font-bold text-[8px] sm:text-[9px] text-white/75 uppercase tracking-wide text-center">
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between gap-2 rounded-full bg-black/80 ring-1 ring-white/10 backdrop-blur-md px-4 py-2.5 text-[13px] font-semibold text-white outline-none transition hover:bg-white/10 whitespace-nowrap cursor-pointer",
          triggerClassName,
        )}
      >
        <span className="truncate">{triggerText}</span>
        <ChevronDown
          className={cn(
            "size-4 opacity-50 transition-transform duration-200 shrink-0",
            isOpen ? "rotate-180" : "",
          )}
        />
      </button>

      {isOpen && (
        <div
          className={cn(
            "absolute top-[calc(100%+10px)] z-50 bg-black/90 backdrop-blur-md ring-1 ring-white/10 rounded-2xl shadow-2xl p-1 max-h-[220px] overflow-y-auto no-scrollbar animate-in fade-in zoom-in-95",
            align === "stretch" && "left-0 right-0",
            align === "left" && "left-0 min-w-full w-max max-w-[90vw]",
            align === "right" && "right-0 min-w-full w-max max-w-[90vw]",
            align === "center" && "left-1/2 -translate-x-1/2 min-w-full w-max max-w-[90vw]",
            contentClassName,
          )}
        >
          {options.map((opt) => {
            let isSelected = false;
            if (multiple) {
              const vals = Array.isArray(value) ? value : value ? [value as string] : [];
              isSelected = vals.includes(opt.value);
            } else {
              isSelected = value === opt.value;
            }

            const itemLabel = opt.displayOption || opt.display || opt.displayTrigger || opt.value;
            return (
              <button
                key={opt.value}
                ref={isSelected && !multiple ? selectedItemRef : undefined}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (multiple) {
                    const vals = Array.isArray(value) ? value : value ? [value as string] : [];
                    if (opt.value === "") {
                      onChange([]);
                    } else {
                      if (vals.includes(opt.value)) {
                        onChange(vals.filter((v) => v !== opt.value));
                      } else {
                        onChange([...vals.filter((v) => v !== ""), opt.value]);
                      }
                    }
                  } else {
                    onChange(opt.value);
                    setIsOpen(false);
                  }
                }}
                className={cn(
                  "w-full text-left px-3 py-2 text-[13px] rounded-xl mb-0.5 last:mb-0 transition-colors flex flex-col justify-center cursor-pointer",
                  isSelected
                    ? "bg-white/10 text-[var(--brand,#df7426)] font-bold"
                    : "text-white hover:bg-white/10",
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="truncate">{itemLabel}</span>
                  {isSelected && <Check className="size-4 shrink-0 ml-2" />}
                </div>
                {opt.sub && (
                  <span className="text-[10px] text-white/50 leading-tight block mt-0.5">
                    {opt.sub}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
