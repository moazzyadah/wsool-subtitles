"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "error";
export interface ToastEntry {
  id: number;
  message: string;
  type: ToastType;
}

interface Props {
  toasts: ToastEntry[];
}

export default function ToastStack({ toasts }: Props) {
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-xl border shadow-lg backdrop-blur-sm text-sm font-medium",
              t.type === "success"
                ? "bg-card/90 border-green-500/20 text-green-500"
                : "bg-card/90 border-destructive/20 text-destructive"
            )}
          >
            {t.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span className="truncate max-w-xs">{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
