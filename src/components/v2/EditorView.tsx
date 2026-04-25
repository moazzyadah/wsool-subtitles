"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, ListTodo, Download, ChevronDown, Loader2, Search, Copy, Check,
  ArrowLeftRight, Clock, ArrowLeft, Type, Cloud, CloudOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Tooltip from "@/components/ui/Tooltip";
import {
  SUBTITLE_PRESETS, DEFAULT_PRESET_ID, presetToOverlayStyle, presetToPositionClass,
  type PresetId, type SubtitlePreset,
} from "@/lib/subtitle-presets";
import { secondsToSrtClock, secondsToShortClock, shiftSeconds } from "@/lib/srt-clock";
import ToastStack, { type ToastEntry, type ToastType } from "./editor/Toast";

interface Props {
  jobId: string;
  uploadId: string;
  onNewProject: () => void;
}

interface EditorSegment {
  id: number;          // local stable id (index of original load)
  start: number;       // seconds
  end: number;         // seconds
  text: string;
  confidence: number;  // computed min over words / segment confidence / 1
}

interface WordTiming {
  text: string;
  start: number;
  end: number;
  confidence?: number;
}

interface JobResponse {
  status: string;
  result?: {
    segments: Array<{ start: number; end: number; text: string; confidence?: number }>;
    words: Array<{ start: number; end: number; text: string; confidence?: number }>;
    language: string;
    durationSec: number;
  };
  editedSegments?: Array<{ start: number; end: number; text: string }>;
  error?: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; segments: EditorSegment[]; words: WordTiming[]; language: string; durationSec: number };

type SaveState = "clean" | "dirty" | "saving" | "saved" | { error: string };

const DEBOUNCE_MS = 500;
const SAVED_DISPLAY_MS = 2000;

/** Compute a 0..1 confidence for a segment from its words (min) or seg.confidence or 1.0. */
function computeConfidence(seg: { start: number; end: number; confidence?: number }, words: WordTiming[]): number {
  const inSeg = words.filter(w => w.start >= seg.start - 0.05 && w.end <= seg.end + 0.05 && typeof w.confidence === "number");
  if (inSeg.length > 0) {
    return Math.min(...inSeg.map(w => w.confidence as number));
  }
  if (typeof seg.confidence === "number") return seg.confidence;
  return 1;
}

function confidenceRingClass(c: number): string {
  if (c < 0.4) return "ring-1 ring-destructive/40";
  if (c < 0.7) return "ring-1 ring-amber-500/40";
  return "";
}

const panelSlideLeft = {
  hidden: { opacity: 0, x: -24 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const } },
};
const panelSlideRight = {
  hidden: { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const, delay: 0.1 } },
};

export default function EditorView({ jobId, uploadId, onNewProject }: Props) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [save, setSave] = useState<SaveState>("clean");
  const [presetId, setPresetId] = useState<PresetId>(DEFAULT_PRESET_ID);

  // playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeId, setActiveId] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // ui state
  const [searchQuery, setSearchQuery] = useState("");
  const [showReview, setShowReview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");

  // export
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [burning, setBurning] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // toast
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const toastIdRef = useRef(0);
  const showToast = useCallback((message: string, type: ToastType = "success") => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  // save machinery
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const segmentsRef = useRef<EditorSegment[]>([]);
  const isMounted = useRef(true);

  // ── Load on mount ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (cancelled) return;
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to load job (${res.status})`);
        }
        const job = (await res.json()) as JobResponse;
        if (job.status !== "done" || !job.result) {
          setLoad({ status: "error", message: "Transcription is not complete." });
          return;
        }
        const words: WordTiming[] = job.result.words.map(w => ({
          text: w.text, start: w.start, end: w.end, confidence: w.confidence,
        }));
        const sourceSegs = job.editedSegments?.length
          ? job.editedSegments
          : job.result.segments;
        if (!sourceSegs?.length) {
          setLoad({
            status: "error",
            message: "This transcription has no segments. Re-run with a different provider.",
          });
          return;
        }
        const segments: EditorSegment[] = sourceSegs.map((s, i) => ({
          id: i + 1,
          start: s.start,
          end: s.end,
          text: s.text,
          confidence: computeConfidence(s, words),
        }));
        segmentsRef.current = segments;
        setLoad({
          status: "ready",
          segments,
          words,
          language: job.result.language,
          durationSec: job.result.durationSec,
        });
        if (segments.length) setActiveId(segments[0]!.id);
      } catch (e) {
        if (cancelled) return;
        setLoad({ status: "error", message: e instanceof Error ? e.message : "Failed to load" });
      }
    })();
    return () => { cancelled = true; };
  }, [jobId]);

  // ── Mount/unmount tracking ──
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (savedClearTimer.current) clearTimeout(savedClearTimer.current);
    };
  }, []);

  // ── Auto-save: flush pending edit ──
  const flushSave = useCallback(async (): Promise<void> => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const segs = segmentsRef.current;
    if (!segs.length) return;
    setSave("saving");
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segments: segs.map(s => ({ start: s.start, end: s.end, text: s.text })),
        }),
      });
      if (!isMounted.current) return;
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSave({ error: data.error || `HTTP ${res.status}` });
        return;
      }
      setSave("saved");
      if (savedClearTimer.current) clearTimeout(savedClearTimer.current);
      savedClearTimer.current = setTimeout(() => {
        if (isMounted.current) setSave("clean");
      }, SAVED_DISPLAY_MS);
    } catch (e) {
      if (!isMounted.current) return;
      setSave({ error: e instanceof Error ? e.message : "Network error" });
    }
  }, [jobId]);

  const markDirty = useCallback(() => {
    setSave("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flushSave(); }, DEBOUNCE_MS);
  }, [flushSave]);

  // sendBeacon best-effort on unmount/navigation
  useEffect(() => {
    const onBeforeUnload = () => {
      if (save === "dirty" || save === "saving") {
        const segs = segmentsRef.current;
        if (segs.length && navigator.sendBeacon) {
          const body = new Blob(
            [JSON.stringify({ segments: segs.map(s => ({ start: s.start, end: s.end, text: s.text })) })],
            { type: "application/json" }
          );
          navigator.sendBeacon(`/api/jobs/${jobId}`, body);
        }
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [jobId, save]);

  // ── Mutators ──
  const updateSegments = useCallback((next: EditorSegment[]) => {
    segmentsRef.current = next;
    setLoad(prev => prev.status === "ready" ? { ...prev, segments: next } : prev);
    markDirty();
  }, [markDirty]);

  const editText = useCallback((id: number, text: string) => {
    if (load.status !== "ready") return;
    updateSegments(load.segments.map(s => s.id === id ? { ...s, text } : s));
  }, [load, updateSegments]);

  const shiftAll = useCallback((deltaMs: number) => {
    if (load.status !== "ready") return;
    updateSegments(load.segments.map(s => ({
      ...s,
      start: shiftSeconds(s.start, deltaMs),
      end: shiftSeconds(s.end, deltaMs),
    })));
    showToast(`Shifted by ${deltaMs > 0 ? "+" : ""}${deltaMs}ms`);
  }, [load, updateSegments, showToast]);

  const replaceAll = useCallback(() => {
    if (load.status !== "ready" || !findText) return;
    const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "gi");
    let count = 0;
    const next = load.segments.map(s => {
      const matches = s.text.match(re);
      if (matches) count += matches.length;
      return { ...s, text: s.text.replace(re, replaceText) };
    });
    if (count === 0) return;
    updateSegments(next);
    showToast(`Replaced ${count} occurrence${count !== 1 ? "s" : ""}`);
    setFindText("");
    setReplaceText("");
  }, [load, findText, replaceText, updateSegments, showToast]);

  // ── Filter / derived state ──
  const segments = load.status === "ready" ? load.segments : [];
  const words = load.status === "ready" ? load.words : [];
  const language = load.status === "ready" ? load.language : "";
  const isArabic = language?.startsWith("ar") ?? false;

  const filtered = useMemo(() => segments.filter(s => {
    if (showReview && s.confidence >= 0.8) return false;
    if (searchQuery && !s.text.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }), [segments, showReview, searchQuery]);

  const findMatchCount = useMemo(() => {
    if (!findText) return 0;
    const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "gi");
    return segments.reduce((acc, s) => acc + (s.text.match(re)?.length ?? 0), 0);
  }, [segments, findText]);

  const reviewCount = segments.filter(s => s.confidence < 0.8).length;
  const totalWords = segments.reduce((a, s) => a + s.text.trim().split(/\s+/).filter(Boolean).length, 0);
  const totalSec = segments.length
    ? segments[segments.length - 1]!.end - segments[0]!.start
    : 0;

  // ── Playback ──
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play(); else v.pause();
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const t = v.currentTime;
    setCurrentTime(t);
    const active = filtered.find(s => t >= s.start && t <= s.end);
    if (active && active.id !== activeId) {
      setActiveId(active.id);
      document.getElementById(`seg-${active.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [filtered, activeId]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const v = videoRef.current;
      if (!v) return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "j":
        case "J":
          v.currentTime = Math.max(0, v.currentTime - 5);
          break;
        case "l":
        case "L":
          v.currentTime = Math.min(duration, v.currentTime + 5);
          break;
        case "ArrowUp": {
          e.preventDefault();
          const idx = filtered.findIndex(s => s.id === activeId);
          if (idx > 0) {
            const prev = filtered[idx - 1]!;
            setActiveId(prev.id);
            v.currentTime = prev.start;
            document.getElementById(`seg-${prev.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          const idx = filtered.findIndex(s => s.id === activeId);
          if (idx >= 0 && idx < filtered.length - 1) {
            const next = filtered[idx + 1]!;
            setActiveId(next.id);
            v.currentTime = next.start;
            document.getElementById(`seg-${next.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          break;
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [filtered, activeId, duration, togglePlay]);

  // ── Outside click for export dropdown ──
  useEffect(() => {
    if (!isExportOpen) return;
    const onDown = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setIsExportOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsExportOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isExportOpen]);

  // ── Copy ──
  const copyTranscript = useCallback(async () => {
    await navigator.clipboard.writeText(filtered.map(s => s.text).join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [filtered]);

  // ── Export ──
  const downloadHref = useCallback((format: "srt" | "vtt") => `/api/jobs/${jobId}?format=${format}`, [jobId]);

  const exportMp4 = useCallback(async () => {
    setIsExportOpen(false);
    setBurning(true);
    try {
      await flushSave();
      const res = await fetch("/api/burn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, uploadId, presetId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Burn failed (${res.status})`);
      }
      // Trigger download via anchor click — leaves the page intact and lets the
      // browser surface its native download UI.
      const a = document.createElement("a");
      a.href = `/api/jobs/${jobId}/burn-output`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast("Video exported");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Export failed", "error");
    } finally {
      if (isMounted.current) setBurning(false);
    }
  }, [jobId, uploadId, presetId, flushSave, showToast]);

  // ── Overlay rendering ──
  const preset = SUBTITLE_PRESETS[presetId];
  const activeSeg = segments.find(s => currentTime >= s.start && currentTime <= s.end);
  const overlay = useMemo(() => {
    if (!activeSeg) return null;
    if (presetId === "tiktok") {
      // Use real word timings, not proportional zones.
      const segWords = words.filter(w => w.start >= activeSeg.start - 0.05 && w.end <= activeSeg.end + 0.05);
      const tokens = segWords.length ? segWords : activeSeg.text.split(/\s+/).map(t => ({ text: t, start: 0, end: 0 } as WordTiming));
      const baseStyle = presetToOverlayStyle(preset);
      return (
        <div className={cn("absolute z-10 px-6 pointer-events-none", presetToPositionClass(preset))}>
          <div className="text-center max-w-[85%] flex flex-wrap justify-center gap-x-2 gap-y-1 subtitle-line" dir={isArabic ? "rtl" : "auto"}>
            {tokens.map((w, i) => {
              const isHot = segWords.length > 0 && currentTime >= w.start && currentTime <= w.end;
              return (
                <span
                  key={i}
                  className={cn("transition-colors duration-150 leading-tight font-extrabold uppercase",
                    isHot ? "text-black bg-[#FACC15] px-1.5 py-0.5 rounded-md" : "text-white"
                  )}
                  style={{
                    ...baseStyle,
                    background: isHot ? "#FACC15" : "transparent",
                    color: isHot ? "#000" : "#fff",
                    padding: isHot ? "0.2em 0.4em" : 0,
                    textShadow: isHot ? "none" : "0 2px 8px rgba(0,0,0,0.8)",
                  }}
                >
                  {w.text}
                </span>
              );
            })}
          </div>
        </div>
      );
    }
    return (
      <div className={cn("absolute z-10 px-6 pointer-events-none", presetToPositionClass(preset))}>
        <span
          className="subtitle-line text-center max-w-[90%] inline-block"
          style={presetToOverlayStyle(preset)}
          dir={isArabic ? "rtl" : "auto"}
        >
          {activeSeg.text}
        </span>
      </div>
    );
  }, [activeSeg, preset, presetId, words, currentTime, isArabic]);

  // ── Loading / error states ──
  if (load.status === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (load.status === "error") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-destructive font-medium">{load.message}</p>
        <button onClick={onNewProject} className="text-sm bg-foreground text-background px-4 py-2 rounded-lg hover:opacity-90 inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Start over
        </button>
      </div>
    );
  }

  const presetEntries = Object.values(SUBTITLE_PRESETS);

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
      {/* ── Left Panel: video + style picker ── */}
      <motion.div
        variants={panelSlideLeft}
        initial="hidden"
        animate="visible"
        className="md:flex-[3] flex flex-col border-b md:border-b-0 md:border-r border-border bg-card/30 min-h-0"
      >
        <div className="flex-1 p-3 sm:p-6 flex flex-col items-center justify-center min-h-0">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
            className="w-full max-w-4xl bg-black rounded-lg shadow-xl overflow-hidden relative flex items-center justify-center group ring-1 ring-border"
            style={{ aspectRatio: "16 / 9" }}
          >
            <video
              ref={videoRef}
              src={`/api/video/${uploadId}`}
              className="w-full h-full object-contain"
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onClick={togglePlay}
            />
            {overlay}

            {/* Hover controls */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-auto">
              <div className="flex items-center gap-4 text-white">
                <button onClick={togglePlay} className="hover:text-primary transition-colors" aria-label={isPlaying ? "Pause" : "Play"}>
                  {isPlaying ? <Pause className="w-6 h-6" fill="currentColor" /> : <Play className="w-6 h-6" fill="currentColor" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    if (videoRef.current) { videoRef.current.currentTime = t; setCurrentTime(t); }
                  }}
                  className="flex-1 h-1.5 bg-white/30 rounded-full cursor-pointer accent-primary"
                  aria-label="Seek"
                />
                <span className="text-xs font-medium tabular-nums text-white/80">
                  {secondsToShortClock(currentTime)} / {secondsToShortClock(duration)}
                </span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Style picker */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.35 }}
          className="p-4 border-t border-border bg-card/50"
        >
          <h3 className="font-medium text-foreground text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
            <Type className="w-3.5 h-3.5" /> Subtitle Style
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {presetEntries.map((p) => {
              const isSelected = presetId === p.id;
              const arabicWarning = isArabic && !p.supportsArabicBurn;
              const chip = (
                <motion.button
                  key={p.id}
                  onClick={() => setPresetId(p.id)}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  className={cn(
                    "p-2.5 text-left rounded-lg border transition-all duration-200 w-full",
                    isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border hover:border-primary/40 hover:bg-muted/30"
                  )}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={cn("font-medium text-xs", arabicWarning && "text-amber-500/80")}>{p.label.en}</span>
                    {isSelected && <span className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <span className="text-[10px] text-muted-foreground line-clamp-1">{p.label.ar}</span>
                </motion.button>
              );
              return arabicWarning ? (
                <Tooltip key={p.id} label="Per-word highlighting can't be burned — preview only.">
                  {chip}
                </Tooltip>
              ) : chip;
            })}
          </div>
        </motion.div>

        {/* Keyboard hints */}
        <div className="px-4 py-2 text-[10px] text-muted-foreground/40 text-center border-t border-border/20 flex items-center justify-center gap-3 flex-wrap">
          <span><kbd className="bg-muted/50 px-1.5 py-0.5 rounded text-[9px] font-mono">Space</kbd> Play/Pause</span>
          <span><kbd className="bg-muted/50 px-1.5 py-0.5 rounded text-[9px] font-mono">J</kbd> -5s</span>
          <span><kbd className="bg-muted/50 px-1.5 py-0.5 rounded text-[9px] font-mono">L</kbd> +5s</span>
          <span><kbd className="bg-muted/50 px-1 py-0.5 rounded text-[9px] font-mono">↑↓</kbd> Navigate</span>
        </div>
      </motion.div>

      {/* ── Right Panel: editor ── */}
      <motion.div
        variants={panelSlideRight}
        initial="hidden"
        animate="visible"
        className="md:flex-[2] flex flex-col bg-background md:min-w-[320px] min-h-0 overflow-hidden"
      >
        {/* Top toolbar */}
        <div className="border-b border-border bg-card shrink-0">
          <div className="h-14 flex items-center justify-between px-4 gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowReview(v => !v)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-colors",
                  showReview ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/80"
                )}
              >
                <ListTodo className="w-4 h-4" />
                Review
                {reviewCount > 0 && (
                  <span className="bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded-full min-w-4 text-center">
                    {reviewCount}
                  </span>
                )}
              </button>
              <SaveIndicator state={save} />
            </div>

            <div className="flex items-center gap-2">
              <Tooltip label={copied ? "Copied!" : "Copy transcript"}>
                <motion.button
                  onClick={copyTranscript}
                  whileTap={{ scale: 0.95 }}
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
                  aria-label="Copy transcript"
                >
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </motion.button>
              </Tooltip>

              <div className="relative" ref={exportRef}>
                <motion.button
                  onClick={() => setIsExportOpen(o => !o)}
                  whileTap={{ scale: 0.98 }}
                  disabled={burning}
                  className="text-sm px-4 py-2 rounded-lg font-medium flex items-center gap-2 bg-foreground text-background hover:bg-foreground/90 transition-all disabled:opacity-70"
                >
                  {burning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Encoding…</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Export
                      <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isExportOpen && "rotate-180")} />
                    </>
                  )}
                </motion.button>

                <AnimatePresence>
                  {isExportOpen && !burning && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.97 }}
                      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
                    >
                      <div className="py-1">
                        <a
                          href={downloadHref("srt")}
                          download
                          onClick={() => setIsExportOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                        >
                          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-bold text-blue-400">SRT</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">Download SRT</p>
                            <p className="text-[11px] text-muted-foreground">Universal — YouTube, Premiere, etc.</p>
                          </div>
                        </a>
                        <a
                          href={downloadHref("vtt")}
                          download
                          onClick={() => setIsExportOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                        >
                          <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-bold text-purple-400">VTT</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">Download VTT</p>
                            <p className="text-[11px] text-muted-foreground">Web-ready — HTML5 players</p>
                          </div>
                        </a>
                        <div className="mx-4 my-1 border-t border-border/50" />
                        <button
                          onClick={exportMp4}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                        >
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Download className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">Export Burned-in MP4</p>
                            <p className="text-[11px] text-muted-foreground">Video with baked subtitles — for social media</p>
                          </div>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Search + find/replace */}
          <div className="px-4 py-2 border-t border-border/40 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
              <input
                type="text"
                placeholder="Search subtitles…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted/30 border border-border/50 rounded-lg outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-all text-foreground placeholder:text-muted-foreground/40"
              />
            </div>
            <Tooltip label="Find & Replace">
              <button
                onClick={() => setShowFindReplace(v => !v)}
                className={cn(
                  "p-1.5 rounded-md transition-colors shrink-0",
                  showFindReplace ? "bg-primary/10 text-primary" : "text-muted-foreground/50 hover:text-foreground hover:bg-muted/50"
                )}
                aria-label="Find and replace"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          </div>

          <AnimatePresence>
            {showFindReplace && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden border-t border-border/40"
              >
                <div className="px-4 py-2 space-y-2">
                  <input
                    type="text"
                    placeholder="Find…"
                    value={findText}
                    onChange={(e) => setFindText(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-muted/30 border border-border/50 rounded-lg outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 text-foreground placeholder:text-muted-foreground/40"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Replace with…"
                      value={replaceText}
                      onChange={(e) => setReplaceText(e.target.value)}
                      className="flex-1 px-3 py-1.5 text-sm bg-muted/30 border border-border/50 rounded-lg outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 text-foreground placeholder:text-muted-foreground/40"
                    />
                    <button
                      onClick={replaceAll}
                      disabled={findMatchCount === 0}
                      className="text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    >
                      Replace All
                    </button>
                  </div>
                  {findText && (
                    <span className="text-[10px] text-muted-foreground/60">
                      {findMatchCount} match{findMatchCount !== 1 ? "es" : ""} found
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Time shift */}
          <div className="px-4 py-2 border-t border-border/30 flex items-center gap-2">
            <Clock className="w-3 h-3 text-muted-foreground/40 shrink-0" />
            <span className="text-[10px] text-muted-foreground/50 shrink-0">Offset</span>
            <div className="flex gap-1 flex-1 justify-end flex-wrap">
              {([
                { label: "-1s", value: -1000 },
                { label: "-0.5s", value: -500 },
                { label: "-0.1s", value: -100 },
                { label: "+0.1s", value: 100 },
                { label: "+0.5s", value: 500 },
                { label: "+1s", value: 1000 },
              ] as const).map(opt => (
                <motion.button
                  key={opt.label}
                  onClick={() => shiftAll(opt.value)}
                  whileTap={{ scale: 0.95 }}
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted/30 transition-all"
                >
                  {opt.label}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="px-4 pb-2 text-[10px] text-muted-foreground/50 font-mono tabular-nums">
            {segments.length} subs · {totalWords} words · {Math.floor(totalSec / 60)}m {String(Math.floor(totalSec % 60)).padStart(2, "0")}s
          </div>
        </div>

        {/* Subtitle list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3" dir={isArabic ? "rtl" : "ltr"}>
          {filtered.map((sub) => {
            const isActive = activeId === sub.id;
            return (
              <div
                id={`seg-${sub.id}`}
                key={sub.id}
                onClick={() => {
                  setActiveId(sub.id);
                  if (videoRef.current) videoRef.current.currentTime = sub.start;
                }}
                className={cn(
                  "p-3 rounded-xl border transition-all duration-200 cursor-text bg-card",
                  isActive ? "border-primary ring-1 ring-primary/20 shadow-sm" : "border-border hover:border-border/80",
                  confidenceRingClass(sub.confidence)
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground/70" dir="ltr">
                    {secondsToSrtClock(sub.start).slice(0, -4)} → {secondsToSrtClock(sub.end).slice(0, -4)}
                  </span>
                  {sub.confidence < 0.8 && (
                    <span className="text-[9px] uppercase font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                      Review
                    </span>
                  )}
                </div>
                <textarea
                  className={cn(
                    "subtitle-line w-full bg-transparent resize-none outline-none leading-relaxed text-sm",
                    isActive ? "text-foreground" : "text-muted-foreground"
                  )}
                  rows={2}
                  value={sub.text}
                  dir={isArabic ? "rtl" : "auto"}
                  onChange={(e) => editText(sub.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground/50">
              <Search className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">
                {searchQuery ? `No subtitles match "${searchQuery}"` : "No subtitles to show"}
              </p>
            </div>
          )}
        </div>
      </motion.div>

      <ToastStack toasts={toasts} />
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "clean") return null;
  if (state === "dirty") {
    return (
      <span className="text-[11px] text-muted-foreground/60 font-medium flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" /> Unsaved
      </span>
    );
  }
  if (state === "saving") {
    return (
      <span className="text-[11px] text-muted-foreground/80 font-medium flex items-center gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin" /> Saving…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="text-[11px] text-green-500 font-medium flex items-center gap-1.5">
        <Cloud className="w-3 h-3" /> Saved
      </span>
    );
  }
  return (
    <span className="text-[11px] text-destructive font-medium flex items-center gap-1.5">
      <CloudOff className="w-3 h-3" /> Save failed: {state.error}
    </span>
  );
}
