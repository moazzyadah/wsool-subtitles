import { Suspense } from 'react';
import UiRouter from './UiRouter';

export default function Page() {
  return (
    <Suspense>
      <UiRouter />
    </Suspense>
  );
}
