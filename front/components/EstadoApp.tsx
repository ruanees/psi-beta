'use client';

import { createContext, useContext } from 'react';
import type { Dto } from '@/lib/api.ts';
import type { MotivoSaida } from '@/lib/sessao.ts';

export interface EstadoApp {
  conta: Dto<'ContaDto'>;
  /** Relê a conta do servidor depois de uma gravação, em vez de cada tela remontar o estado. */
  recarregar: () => Promise<void>;
  sair: (motivo?: MotivoSaida) => Promise<void>;
}

export const ContextoApp = createContext<EstadoApp | null>(null);

export function useApp(): EstadoApp {
  const v = useContext(ContextoApp);
  if (!v) throw new Error('useApp() fora da moldura do app');
  return v;
}
