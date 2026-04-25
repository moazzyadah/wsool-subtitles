"use client";

import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { History, Plus, Trash2, Clock, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import Logo from "@/components/ui/Logo";
import Tooltip from "@/components/ui/Tooltip";
import ImportView from "./ImportView";
import ProcessingView from "./ProcessingView";
import EditorView from "./EditorView";

export type AppStep = "import" | "processing" | "editor";

export interface AppState {
  step: "import";
}
export interface ProcessingState {
  step: "processing";
  uploadId: string;
  jobId: string;
}
export interface EditorState {
  step: "editor";
  uploadId: string;
  jobId: string;
}
export type MachineState = AppState | ProcessingState | EditorState;

export interface HistoryEntry {
  id: string;
  uploadId: string;
  title: string;
  date: string;
}

const HISTORY_KEY = "wsool_subtitles_history";

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 50)));
  } catch { /* quota exceeded */ }
}

const pageVariants = {
  initial: { opacity: 0, scale: 0.97, filter: "blur(6px)" },
  animate: {
    opacity: 1, scale: 1, filter: "blur(0px)",
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  },
  exit: {
    opacity: 0, scale: 0.97, filter: "blur(6px)",
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
  },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const m = Math.floor(diffMs / 60000);
  const h = Math.floor(diffMs / 3600000);
  const dd = Math.floor(diffMs / 86400000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (dd < 7) return `${dd}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function NewApp() {
  const [state, setState] = useState<MachineState>({ step: "import" });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Close history dropdown on outside click / Escape
  useEffect(() => {
    if (!isHistoryOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setIsHistoryOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsHistoryOpen(false); };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isHistoryOpen]);

  const reset = () => setState({ step: "import" });

  const addToHistory = (entry: HistoryEntry) => {
    const updated = [entry, ...history.filter(h => h.id !== entry.id)];
    setHistory(updated);
    saveHistory(updated);
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  };

  const currentStep = state.step;

  return (
    <div className="flex flex-col h-dvh w-full bg-background text-foreground overflow-hidden">
      {/* Nav */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="h-14 border-b border-border/60 flex items-center px-5 shrink-0 justify-between bg-card/80 backdrop-blur-xl z-30 relative"
      >
        <button onClick={reset} className="hover:opacity-80 transition-opacity">
          <Logo />
        </button>

        {/* Step indicator — visible when not on import */}
        <AnimatePresence>
          {currentStep !== "import" && (
            <div className="hidden md:flex absolute inset-0 items-center justify-center pointer-events-none">
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] as const }}
                className="flex items-center pointer-events-auto"
              >
                <NavStep current={currentStep} target="processing" label="Transcribe" num={1} />
                <div className={cn("w-8 h-px mx-1", currentStep === "editor" ? "bg-foreground/20" : "bg-border/50")} />
                <NavStep current={currentStep} target="editor" label="Edit & Export" num={2} />
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-1.5">
          {/* New project — editor step only */}
          <AnimatePresence>
            {currentStep === "editor" && (
              <Tooltip label="New Project">
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                  onClick={reset}
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-200"
                >
                  <Plus className="w-[18px] h-[18px]" />
                </motion.button>
              </Tooltip>
            )}
          </AnimatePresence>

          {/* History dropdown */}
          <div className="relative flex items-center" ref={historyRef}>
            <Tooltip label="History">
              <button
                onClick={() => setIsHistoryOpen(v => !v)}
                className={cn(
                  "p-2 rounded-lg transition-all duration-200",
                  isHistoryOpen
                    ? "text-foreground bg-muted shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                <History className="w-[18px] h-[18px]" />
              </button>
            </Tooltip>

            <AnimatePresence>
              {isHistoryOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <h3 className="font-semibold text-sm">History</h3>
                    {history.length > 0 && (
                      <button
                        onClick={clearHistory}
                        className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" /> Clear
                      </button>
                    )}
                  </div>
                  <div className="max-h-[360px] overflow-y-auto">
                    {history.length === 0 ? (
                      <div className="px-4 py-10 text-center text-muted-foreground">
                        <Clock className="w-8 h-8 mx-auto mb-3 opacity-40" />
                        <p className="text-sm font-medium">No history yet</p>
                        <p className="text-xs mt-1 opacity-70">Your projects will appear here</p>
                      </div>
                    ) : (
                      <div className="py-1">
                        {history.map((entry, i) => (
                          <button
                            key={`${entry.id}-${i}`}
                            onClick={() => {
                              setState({ step: "editor", uploadId: entry.uploadId, jobId: entry.id });
                              setIsHistoryOpen(false);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/30 last:border-b-0 group/entry"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{entry.title}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{formatDate(entry.date)}</p>
                              </div>
                              <svg className="w-4 h-4 text-muted-foreground/0 group-hover/entry:text-muted-foreground/60 transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 18l6-6-6-6" />
                              </svg>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.header>

      <main className="flex-1 overflow-auto flex relative">
        <AnimatePresence mode="wait">
          {state.step === "import" && (
            <motion.div key="import" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="flex-1 flex">
              <ImportView
                onNext={(uploadId) => {
                  // uploadId received; ProcessingView will create the job
                  setState({ step: "processing", uploadId, jobId: "" });
                }}
              />
            </motion.div>
          )}
          {state.step === "processing" && (
            <motion.div key="processing" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="flex-1 flex">
              <ProcessingView
                uploadId={state.uploadId}
                onDone={(jobId, title) => {
                  const entry: HistoryEntry = {
                    id: jobId,
                    uploadId: (state as ProcessingState).uploadId,
                    title,
                    date: new Date().toISOString(),
                  };
                  addToHistory(entry);
                  setState({ step: "editor", uploadId: (state as ProcessingState).uploadId, jobId });
                }}
                onReset={reset}
              />
            </motion.div>
          )}
          {state.step === "editor" && (
            <motion.div key="editor" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="flex-1 flex flex-col min-h-0">
              <EditorView jobId={state.jobId} uploadId={state.uploadId} onNewProject={reset} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function NavStep({ current, target, label, num }: { current: AppStep; target: AppStep; label: string; num: number }) {
  const order: AppStep[] = ["processing", "editor"];
  const ci = order.indexOf(current);
  const ti = order.indexOf(target);
  const isPast = ti < ci;
  const isCurrent = current === target;

  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 border",
        isPast ? "border-green-500/40 bg-green-500/10 text-green-500"
          : isCurrent ? "border-foreground/30 bg-foreground text-background"
          : "border-border/60 text-muted-foreground/50"
      )}>
        {isPast ? <Check className="w-2.5 h-2.5" /> : num}
      </div>
      <span className={cn(
        "text-xs font-medium transition-colors duration-300",
        isPast ? "text-muted-foreground" : isCurrent ? "text-foreground" : "text-muted-foreground/50"
      )}>
        {label}
      </span>
    </div>
  );
}
