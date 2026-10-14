'use client';

import { useEffect, useState } from 'react';
import { aoMudarGravacao, type EstadoGravacao } from '@/lib/api.ts';

/**
 * Só fala quando a gravação falha. Cada campo grava na hora; um selo que diz
 * "Sincronizado" o tempo todo vira paisagem (lição do DIME). Só o sucesso de
 * outra escrita o apaga.
 */
export function SeloGravacao() {
  const [estado, setEstado] = useState<EstadoGravacao>({ falhou: false });
  useEffect(() => aoMudarGravacao(setEstado), []);
  if (!estado.falhou) return null;
  return (
    <div className="aviso selo-gravacao" data-t="erro" role="alert">
      Não foi possível gravar a última alteração. {estado.mensagem}
    </div>
  );
}
