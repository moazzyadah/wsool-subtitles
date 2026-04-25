"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { motion } from "framer-motion";
import { UploadCloud, Link as LinkIcon, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB
const MAX_FILE_LABEL = "500 MB";

interface ImportViewProps {
  /** Called with the uploadId returned from POST /api/upload */
  onNext: (uploadId: string) => void;
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};
const childFadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const } },
};
const headlineStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.25 } },
};
const headlineChild = {
  hidden: { opacity: 0, y: 24, filter: "blur(6px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const } },
};
const cardZoomIn = {
  hidden: { opacity: 0, scale: 0.95, y: 16 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
};

export default function ImportView({ onNext }: ImportViewProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const uploadFile = async (file: File): Promise<string> => {
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Upload failed (${res.status})`);
    }
    const data = await res.json() as { uploadId?: unknown };
    if (typeof data.uploadId !== "string") throw new Error("Server returned no uploadId");
    return data.uploadId;
  };

  const onDrop = useCallback(async (accepted: File[], rejected: unknown[]) => {
    if ((rejected as unknown[]).length > 0) {
      setError(`File too large. Maximum size is ${MAX_FILE_LABEL}.`);
      return;
    }
    if (accepted.length === 0) return;
    setError("");
    const file = accepted[0] as File;
    setUploading(true);
    try {
      const uploadId = await uploadFile(file);
      onNext(uploadId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [onNext]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "video/mp4": [".mp4"],
      "video/quicktime": [".mov"],
      "video/webm": [".webm"],
      "audio/mpeg": [".mp3"],
      "audio/wav": [".wav"],
    },
    maxFiles: 1,
    maxSize: MAX_FILE_BYTES,
    multiple: false,
    disabled: uploading,
  });

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    const mediaRegex = /^https?:\/\/.+\.(mp4|webm|mov|mp3|wav)(\?.*)?$/i;
    if (!mediaRegex.test(trimmed)) {
      setError("Please enter a direct MP4, MOV, WEBM, MP3, or WAV URL");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to ingest URL (${res.status})`);
      }
      const data = await res.json() as { uploadId?: unknown };
      if (typeof data.uploadId !== "string") throw new Error("Server returned no uploadId");
      onNext(data.uploadId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to ingest URL");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex-1 w-full">
      {/* Background blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-[-10%] left-[-10%] w-[30%] h-[30%] rounded-full bg-muted/40 blur-[100px]"
          style={{ animation: "float 8s ease-in-out infinite" }}
        />
        <div
          className="absolute bottom-[-5%] right-[-5%] w-[25%] h-[25%] rounded-full bg-muted/30 blur-[80px]"
          style={{ animation: "float 10s ease-in-out 2s infinite reverse" }}
        />
      </div>

      {/* Hero */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="min-h-[90vh] flex flex-col items-center justify-center px-6 pt-12 pb-20 relative z-10"
      >
        {/* Badge */}
        <motion.div
          variants={childFadeUp}
          className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-muted/50 border border-border text-sm font-medium text-muted-foreground mb-8"
        >
          <div className="flex items-end gap-[2px] h-[12px]">
            {[{ h: "40%", d: "0s" }, { h: "80%", d: "0.18s" }, { h: "55%", d: "0.36s" }, { h: "100%", d: "0.09s" }].map(({ h, d }, i) => (
              <div
                key={i}
                className="w-[2px] rounded-full bg-muted-foreground/70 origin-bottom"
                style={{ height: h, animation: `waveBar 1.3s ease-in-out ${d} infinite` }}
              />
            ))}
          </div>
          <span>AI-powered subtitle generator</span>
        </motion.div>

        {/* Headline */}
        <motion.div variants={headlineStagger} initial="hidden" animate="visible" className="text-center max-w-2xl mb-10">
          <motion.h1 variants={headlineChild} className="text-4xl md:text-5xl lg:text-[3.4rem] font-bold tracking-tight leading-[1.15]">
            Perfect{" "}
            <span className="hero-gradient-text">subtitles</span>,
          </motion.h1>
          <motion.h1 variants={headlineChild} className="text-4xl md:text-5xl lg:text-[3.4rem] font-bold tracking-tight leading-[1.15] mt-1">
            zero effort.
          </motion.h1>
          <motion.p variants={headlineChild} className="text-muted-foreground text-lg mt-5 font-light max-w-lg mx-auto">
            Upload your video or paste a direct media link. Our AI handles the transcription and styling instantly.
          </motion.p>
        </motion.div>

        {/* Upload card */}
        <motion.div variants={cardZoomIn} className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl p-2">
          <div className="bg-background/50 rounded-xl p-8 border border-border/50">
            <div className="grid gap-6">

              {/* Dropzone */}
              <div
                {...getRootProps()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-300 relative z-20",
                  uploading && "cursor-not-allowed opacity-60",
                  isDragActive ? "border-primary bg-primary/10 scale-[1.02]" : "border-border hover:border-primary/50 hover:bg-muted/50"
                )}
              >
                <input {...getInputProps()} />
                <div className="flex flex-col items-center gap-4">
                  <div className={cn(
                    "w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300",
                    isDragActive ? "bg-primary text-primary-foreground scale-110" : "bg-primary/10 text-primary"
                  )}>
                    {uploading ? (
                      <div className="flex items-end gap-[3px] h-8">
                        {[0, 1, 2, 3, 4].map(i => (
                          <div key={i} className="w-[4px] rounded-full bg-primary" style={{ animation: `waveform 1.2s ease-in-out ${i * 0.1}s infinite alternate`, height: "12px" }} />
                        ))}
                      </div>
                    ) : (
                      <UploadCloud className="w-8 h-8" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-lg font-medium">
                      {uploading ? "Uploading…" : isDragActive ? "Drop video here" : "Click or drag video to upload"}
                    </p>
                    <p className="text-sm text-muted-foreground font-medium">
                      {`MP4, MOV, WEBM, MP3, WAV up to ${MAX_FILE_LABEL}`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                <div className="relative flex justify-center text-[10px] font-bold uppercase tracking-wider">
                  <span className="bg-background px-3 text-muted-foreground">Or paste a URL</span>
                </div>
              </div>

              {/* URL form */}
              <form onSubmit={handleUrlSubmit} className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1 group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-foreground transition-colors">
                      <LinkIcon className="w-5 h-5" />
                    </div>
                    <input
                      type="text"
                      placeholder="Paste MP4, MOV, WEBM, MP3, or WAV link…"
                      aria-label="Video URL"
                      className="w-full pl-12 pr-4 py-3.5 bg-muted/30 border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary focus:bg-background transition-all duration-300 text-foreground font-medium disabled:opacity-60"
                      value={url}
                      disabled={uploading}
                      onChange={e => { setUrl(e.target.value); if (error) setError(""); }}
                    />
                  </div>
                  <motion.button
                    type="submit"
                    disabled={!url.trim() || uploading}
                    whileTap={{ scale: 0.98 }}
                    className="bg-foreground text-background px-8 py-3.5 rounded-xl font-medium hover:shadow-lg transition-shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center sm:w-auto w-full gap-2"
                  >
                    Import <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </div>

                {error ? (
                  <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-destructive text-sm font-medium px-1">
                    {error}
                  </motion.p>
                ) : (
                  <p className="text-[11px] text-muted-foreground/50 px-1">Direct media links must end with .mp4, .mov, .webm, .mp3, or .wav</p>
                )}
              </form>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
