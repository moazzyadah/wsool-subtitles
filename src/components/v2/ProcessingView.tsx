"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertCircle, ArrowLeft, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import ProviderPickerPopover, { type ProviderSelection } from "./ProviderPickerPopover";

interface ProcessingViewProps {
  uploadId: string;
  onDone: (jobId: string, title: string) => void;
  onReset: () => void;
}

type Stage = { id: string; label: string };
const STAGES: Stage[] = [
  { id: "enqueue", label: "Queueing transcription job" },
  { id: "transcribe", label: "Transcribing with AI" },
  { id: "format", label: "Formatting subtitles" },
];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.15 } },
};
const childFadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
};
const stageItem = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } },
};
const checkPop = {
  initial: { scale: 0, opacity: 0 },
  animate: { scale: 1, opacity: 1, transition: { type: "spring" as const, stiffness: 500, damping: 15 } },
};

const DEFAULT_SELECTION: ProviderSelection = {
  providerId: "local",
  model: "ggml-medium",
};

export default function ProcessingView({ uploadId, onDone, onReset }: ProcessingViewProps) {
  const [selection, setSelection] = useState<ProviderSelection>(DEFAULT_SELECTION);
  const [currentStage, setCurrentStage] = useState<number>(-1); // -1 = waiting for user to start
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const hasStarted = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aborted = useRef(false);

  // Auto-start once uploadId arrives (no API key needed for local provider)
  useEffect(() => {
    if (hasStarted.current || !uploadId) return;
    hasStarted.current = true;
    run(selection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadId]);

  // Cleanup poll on unmount: cancel pending tick AND mark aborted so any
  // in-flight fetch resolution skips setState/onDone on a dead component.
  useEffect(() => {
    return () => {
      aborted.current = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  const run = async (sel: ProviderSelection) => {
    if (aborted.current) return;
    setError(null);
    setCurrentStage(0);

    try {
      // Stage 0: Enqueue
      const enqueueRes = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId,
          providerId: sel.providerId,
          model: sel.model,
          language: "auto",
          task: "transcribe",
        }),
      });
      if (aborted.current) return;

      if (!enqueueRes.ok) {
        const data = await enqueueRes.json().catch(() => ({}));
        throw new Error(data.error || `Failed to start transcription (${enqueueRes.status})`);
      }

      const data = await enqueueRes.json() as { jobId?: unknown };
      if (typeof data.jobId !== "string") throw new Error("Server returned no jobId");
      const jid = data.jobId;
      if (aborted.current) return;
      setJobId(jid);
      setCurrentStage(1);

      // Stage 1-2: Poll
      await poll(jid);
    } catch (e) {
      if (aborted.current) return;
      setError(e instanceof Error ? e.message : "An unknown error occurred");
    }
  };

  const poll = (jid: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const tick = async () => {
        if (aborted.current) { resolve(); return; }
        try {
          const res = await fetch(`/api/jobs/${jid}`);
          if (aborted.current) { resolve(); return; }
          if (!res.ok) {
            reject(new Error(`Job fetch failed (${res.status})`));
            return;
          }
          const job = await res.json() as { status: string; error?: string; result?: { durationSec: number } };
          if (aborted.current) { resolve(); return; }

          if (job.status === "done") {
            setCurrentStage(3);
            pollTimer.current = setTimeout(() => {
              if (aborted.current) { resolve(); return; }
              onDone(jid, `Job ${jid.slice(0, 8)}`);
              resolve();
            }, 800);
          } else if (job.status === "error" || job.status === "failed") {
            reject(new Error(job.error || "Transcription failed"));
          } else {
            // pending / running — keep polling
            if (job.status === "running") setCurrentStage(2);
            pollTimer.current = setTimeout(tick, 1500);
          }
        } catch (e) {
          if (aborted.current) { resolve(); return; }
          reject(e);
        }
      };
      tick();
    });
  };

  const isComplete = currentStage >= STAGES.length;
  const isRunning = currentStage >= 0 && currentStage < STAGES.length && !error;

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 pb-20 bg-background">
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="max-w-md w-full space-y-10">

        {/* Hero animation */}
        <motion.div variants={childFadeUp} className="text-center space-y-5">
          <div className="relative mx-auto w-28 h-28 flex items-center justify-center">
            <AnimatePresence mode="wait">
              {error ? (
                <motion.div key="error" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertCircle className="w-10 h-10 text-destructive" />
                </motion.div>
              ) : isComplete ? (
                <motion.div key="done" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-green-500" />
                </motion.div>
              ) : (
                <motion.div key="wave" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-end justify-center gap-[5px] h-16"
                  style={{ animation: "glow-pulse 3s ease-in-out infinite" }}>
                  {[0, 1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="w-[5px] rounded-full bg-primary/80"
                      style={{ animation: `waveform 1.2s ease-in-out ${i * 0.1}s infinite alternate`, height: "16px" }} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="space-y-2">
            <AnimatePresence mode="wait">
              <motion.h2
                key={error ? "err" : isComplete ? "done" : "proc"}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="text-2xl font-bold tracking-tight"
              >
                {error ? "Processing Failed" : isComplete ? "Ready!" : "Processing Video"}
              </motion.h2>
            </AnimatePresence>
            <AnimatePresence mode="wait">
              <motion.p
                key={error ? "em" : isComplete ? "dm" : "pm"}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3, delay: 0.05 }}
                className="text-muted-foreground text-base max-w-sm mx-auto"
              >
                {error ?? (isComplete ? "Opening editor…" : "Hang tight — AI is transcribing your video…")}
              </motion.p>
            </AnimatePresence>

            {error && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}
                className="flex items-center justify-center gap-3 pt-2">
                <button onClick={onReset}
                  className="inline-flex items-center gap-1.5 text-sm font-medium bg-foreground text-background px-4 py-2 rounded-lg hover:opacity-90 transition-opacity">
                  <ArrowLeft className="w-3.5 h-3.5" /> Try Again
                </button>
              </motion.div>
            )}
          </div>

          {/* Provider picker — shown while running, disabled when already running */}
          {!error && !isComplete && (
            <motion.div variants={childFadeUp} className="flex items-center justify-center gap-2 pt-1">
              <Globe className="w-3.5 h-3.5 text-muted-foreground/50" />
              <span className="text-xs text-muted-foreground/50">Provider:</span>
              <ProviderPickerPopover
                selection={selection}
                onChange={sel => {
                  if (!isRunning) {
                    setSelection(sel);
                  }
                }}
                disabled={isRunning}
              />
            </motion.div>
          )}

          {jobId && isRunning && (
            <p className="text-[11px] text-muted-foreground/40">Job {jobId.slice(0, 8)}</p>
          )}
        </motion.div>

        {/* Stage list */}
        <motion.div variants={childFadeUp} className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
          {STAGES.map((stage, index) => {
            const isCompleted = currentStage > index;
            const isCurrent = currentStage === index && !error;
            const isPending = currentStage < index && !error;

            return (
              <motion.div
                key={stage.id}
                variants={stageItem}
                className={cn("flex items-center gap-4 transition-all duration-300", isPending && "opacity-40")}
              >
                <div className="shrink-0 flex items-center justify-center w-6 h-6">
                  <AnimatePresence mode="wait">
                    {isCompleted ? (
                      <motion.div key="check" {...checkPop}>
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      </motion.div>
                    ) : isCurrent ? (
                      <motion.div key="pulse" initial={{ scale: 0 }} animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 15 }}
                        className="w-5 h-5 flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_2px] shadow-primary/30" />
                      </motion.div>
                    ) : error && currentStage === index ? (
                      <motion.div key="error-icon" initial={{ scale: 0 }} animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 15 }}>
                        <AlertCircle className="w-5 h-5 text-destructive" />
                      </motion.div>
                    ) : (
                      <motion.div key="pending">
                        <div className="w-5 h-5 rounded-full border border-border/50" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <span className={cn(
                  "font-medium text-sm sm:text-base transition-colors duration-300",
                  isCompleted ? "text-foreground"
                    : isCurrent ? "text-primary"
                    : error && currentStage === index ? "text-destructive"
                    : "text-muted-foreground"
                )}>
                  {stage.label}
                </span>
              </motion.div>
            );
          })}
        </motion.div>
      </motion.div>
    </div>
  );
}
