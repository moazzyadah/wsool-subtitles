import { NextResponse } from 'next/server';
import { PROVIDERS } from '@/lib/providers/registry';
import { config } from '@/lib/config';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  // Return catalog with `enabled` flags. Never expose key contents.
  const out = PROVIDERS.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    docsUrl: p.docsUrl,
    envKey: p.envKey,
    enabled:
      p.id === 'local' ? true : Boolean(config.keys[p.id as keyof typeof config.keys]),
    capabilities: p.capabilities,
    models: p.models,
  }));
  return NextResponse.json({ providers: out });
}
