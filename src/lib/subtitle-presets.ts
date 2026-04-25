/**
 * Single source of truth for subtitle styling — drives BOTH the live web
 * overlay (CSS) and the libass `force_style` used when burning into MP4.
 *
 * The two surfaces don't render identically (libass is an ASS engine, not a
 * browser), but each preset is hand-tuned so the burned output visually
 * matches the live preview as closely as possible.
 */

export type PresetId = 'classic' | 'box' | 'cinematic' | 'outline' | 'bold-center' | 'tiktok';

export interface WebStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  background?: string;
  textShadow?: string;
  textStroke?: string;
  italic?: boolean;
  position: 'top' | 'middle' | 'bottom';
  padding?: string;
}

export interface BurnStyle {
  font: 'Amiri' | 'IBM Plex Sans Arabic' | 'Cairo' | 'Tajawal' | 'Arial';
  fontSize: number;
  primaryColor: string;   // libass &HBBGGRR or &HAABBGGRR
  outlineColor: string;
  outline: number;        // 0..4
  position: 'top' | 'middle' | 'bottom';
  bold?: boolean;
  italic?: boolean;
}

export interface SubtitlePreset {
  id: PresetId;
  label: { en: string; ar: string };
  web: WebStyle;
  burn: BurnStyle;
  /** TikTok-style per-word highlighting can't be replicated by libass. */
  supportsArabicBurn: boolean;
}

export const SUBTITLE_PRESETS: Record<PresetId, SubtitlePreset> = {
  classic: {
    id: 'classic',
    label: { en: 'Classic', ar: 'كلاسيكي' },
    web: {
      fontFamily: '"Amiri", "IBM Plex Sans Arabic", serif',
      fontSize: 28,
      fontWeight: 600,
      color: '#FFFFFF',
      background: 'rgba(0,0,0,0.55)',
      padding: '0.25em 0.6em',
      position: 'bottom',
    },
    burn: {
      font: 'Amiri',
      fontSize: 28,
      primaryColor: '&H00FFFFFF',
      outlineColor: '&H00000000',
      outline: 2,
      position: 'bottom',
      bold: true,
    },
    supportsArabicBurn: true,
  },
  box: {
    id: 'box',
    label: { en: 'White Box', ar: 'صندوق أبيض' },
    web: {
      fontFamily: '"IBM Plex Sans Arabic", "Amiri", sans-serif',
      fontSize: 26,
      fontWeight: 700,
      color: '#000000',
      background: '#FFFFFF',
      padding: '0.35em 0.75em',
      position: 'bottom',
    },
    burn: {
      font: 'IBM Plex Sans Arabic',
      fontSize: 26,
      primaryColor: '&H00000000',
      outlineColor: '&H00FFFFFF',
      outline: 4,
      position: 'bottom',
      bold: true,
    },
    supportsArabicBurn: true,
  },
  cinematic: {
    id: 'cinematic',
    label: { en: 'Cinematic', ar: 'سينمائي' },
    web: {
      fontFamily: '"Amiri", serif',
      fontSize: 30,
      fontWeight: 400,
      color: '#F2EAD3',
      textShadow: '0 2px 8px rgba(0,0,0,0.85)',
      italic: true,
      position: 'bottom',
    },
    burn: {
      font: 'Amiri',
      fontSize: 30,
      primaryColor: '&H00D3EAF2',  // BGR of #F2EAD3
      outlineColor: '&H00000000',
      outline: 1,
      position: 'bottom',
      italic: true,
    },
    supportsArabicBurn: true,
  },
  outline: {
    id: 'outline',
    label: { en: 'Outline', ar: 'حدّ بارز' },
    web: {
      fontFamily: '"IBM Plex Sans Arabic", sans-serif',
      fontSize: 30,
      fontWeight: 700,
      color: '#FFFFFF',
      textStroke: '2px #000000',
      position: 'bottom',
    },
    burn: {
      font: 'IBM Plex Sans Arabic',
      fontSize: 30,
      primaryColor: '&H00FFFFFF',
      outlineColor: '&H00000000',
      outline: 3,
      position: 'bottom',
      bold: true,
    },
    supportsArabicBurn: true,
  },
  'bold-center': {
    id: 'bold-center',
    label: { en: 'Bold Center', ar: 'وسط عريض' },
    web: {
      fontFamily: '"IBM Plex Sans Arabic", sans-serif',
      fontSize: 40,
      fontWeight: 800,
      color: '#FFFFFF',
      textShadow: '0 0 12px rgba(0,0,0,0.9), 0 0 24px rgba(0,0,0,0.7)',
      position: 'middle',
    },
    burn: {
      font: 'IBM Plex Sans Arabic',
      fontSize: 40,
      primaryColor: '&H00FFFFFF',
      outlineColor: '&H00000000',
      outline: 3,
      position: 'middle',
      bold: true,
    },
    supportsArabicBurn: true,
  },
  tiktok: {
    id: 'tiktok',
    label: { en: 'TikTok Karaoke', ar: 'كاريوكي تيك توك' },
    web: {
      fontFamily: '"IBM Plex Sans Arabic", sans-serif',
      fontSize: 36,
      fontWeight: 800,
      color: '#FFFFFF',
      background: 'rgba(0,0,0,0.6)',
      padding: '0.3em 0.7em',
      position: 'middle',
    },
    burn: {
      // No per-word karaoke in libass; falls back to a static Bold Center look.
      font: 'IBM Plex Sans Arabic',
      fontSize: 36,
      primaryColor: '&H00FFFFFF',
      outlineColor: '&H00000000',
      outline: 3,
      position: 'middle',
      bold: true,
    },
    supportsArabicBurn: false,
  },
};

export function getPreset(id: string): SubtitlePreset | null {
  return (SUBTITLE_PRESETS as Record<string, SubtitlePreset>)[id] ?? null;
}

export const DEFAULT_PRESET_ID: PresetId = 'classic';
