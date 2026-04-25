"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Provider {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  models: { id: string; label: string }[];
}

export interface ProviderSelection {
  providerId: string;
  model: string;
}

interface ProviderPickerPopoverProps {
  selection: ProviderSelection;
  onChange: (s: ProviderSelection) => void;
  disabled?: boolean;
}

export default function ProviderPickerPopover({ selection, onChange, disabled }: ProviderPickerPopoverProps) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/providers")
      .then(r => r.json())
      .then(d => setProviders((d.providers as Provider[]).filter(p => p.enabled)))
      .catch(() => { /* non-blocking */ });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = providers.find(p => p.id === selection.providerId);
  const currentModel = current?.models.find(m => m.id === selection.model);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm font-medium transition-all duration-200",
          "bg-muted/30 hover:bg-muted/60 hover:border-border/80 text-muted-foreground hover:text-foreground",
          disabled && "opacity-50 cursor-not-allowed pointer-events-none"
        )}
      >
        <span>{current?.name ?? "Select provider"}</span>
        {currentModel && <span className="text-muted-foreground/60">·</span>}
        {currentModel && <span className="text-muted-foreground/80 text-xs">{currentModel.label.split("(")[0]!.trim()}</span>}
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 top-full mt-2 w-72 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-border">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">Provider</p>
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {providers.length === 0 && (
                <p className="px-4 py-6 text-sm text-center text-muted-foreground">Loading…</p>
              )}
              {providers.map(p => (
                <div key={p.id}>
                  <div className="px-3 pt-2 pb-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">{p.name}</span>
                  </div>
                  {p.models.map(m => {
                    const isActive = selection.providerId === p.id && selection.model === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => { onChange({ providerId: p.id, model: m.id }); setOpen(false); }}
                        className={cn(
                          "w-full text-left px-4 py-2 flex items-center justify-between gap-2 transition-colors hover:bg-muted/50 text-sm",
                          isActive && "text-foreground bg-muted/30"
                        )}
                      >
                        <span className={cn("text-sm", isActive ? "font-medium" : "text-muted-foreground")}>
                          {m.label.split("(")[0]!.trim()}
                        </span>
                        {isActive && <Check className="w-3.5 h-3.5 shrink-0 text-foreground" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
