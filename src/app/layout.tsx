import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'wsool-subtitles — universal video transcription',
  description: 'Transcribe videos with 14 STT providers including local whisper.cpp. Egyptian Arabic dialect supported.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
