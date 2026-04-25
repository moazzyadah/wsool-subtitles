"use client";

import { useSearchParams } from 'next/navigation';
import App from '@/components/App';
import NewApp from '@/components/v2/NewApp';

export default function UiRouter() {
  const params = useSearchParams();
  if (params.get('ui') === 'v2') return <NewApp />;
  return <App />;
}
