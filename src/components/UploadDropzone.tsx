'use client';

import { useDropzone } from 'react-dropzone';
import { Upload } from 'lucide-react';

interface Props {
  onFile: (file: File) => void | Promise<void>;
}

export default function UploadDropzone({ onFile }: Props) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'video/*': ['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v'],
      'audio/*': ['.mp3', '.wav', '.flac', '.m4a', '.ogg'],
    },
    multiple: false,
    onDrop: (files: File[]) => {
      const f = files[0];
      if (f) void onFile(f);
    },
  });

  return (
    <div
      {...getRootProps()}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-16 transition-colors ${
        isDragActive ? 'border-emerald-500 bg-emerald-950/30' : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'
      }`}
    >
      <input {...getInputProps()} />
      <Upload className="mb-4 h-12 w-12 text-zinc-500" />
      <p className="text-lg font-medium text-zinc-200">
        {isDragActive ? 'Drop the file here' : 'Drag a video or audio file here'}
      </p>
      <p className="mt-2 text-sm text-zinc-500">or click to browse</p>
      <p className="mt-4 text-xs text-zinc-600">
        MP4, MOV, MKV, WebM, AVI, MP3, WAV, FLAC, M4A
      </p>
    </div>
  );
}
