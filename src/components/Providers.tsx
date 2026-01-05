'use client';

import { AuthProvider } from '@/contexts/AuthContext';
import { useBuildVersionCheck } from '@/hooks/useDataVersionCheck';
import type { ReactNode } from 'react';

type ProvidersProps = {
  children: ReactNode;
};

function BuildVersionChecker({ children }: { children: ReactNode }): React.JSX.Element {
  useBuildVersionCheck();
  return <>{children}</>;
}

export function Providers({ children }: ProvidersProps): React.JSX.Element {
  return (
    <AuthProvider>
      <BuildVersionChecker>{children}</BuildVersionChecker>
    </AuthProvider>
  );
}
