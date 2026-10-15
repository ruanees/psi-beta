'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/components/EstadoApp';
import { api } from '@/lib/api.ts';

// Volta do Google depois de "Conectar Google". O código e o `state` vão ao
// back com o login de quem está aqui; o back confere que foi esta pessoa quem
// pediu e só então guarda a conexão.

export default function RetornoGoogle() {
  const { conta } = useApp();
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const enviado = useRef(false);

  useEffect(() => {
    if (enviado.current) return;
    enviado.current = true;
    const q = new URLSearchParams(window.location.search);
    const codigo = q.get('code');
    const estado = q.get('state');
    // Tira o código da barra de endereço e do histórico antes de qualquer coisa.
    window.history.replaceState(null, '', window.location.pathname);
    if (q.get('error') || !codigo || !estado) {
      setErro(q.get('error') === 'access_denied' ? 'Você não autorizou o Senda no Google.' : 'O Google não completou a conexão.');
      return;
    }
    api('post', '/contas/{conta}/google/retorno', { params: { conta: conta.id }, corpo: { codigo, estado } })
      .then(() => router.replace('/configuracoes?google=ok'))
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível concluir a conexão.'));
  }, [conta.id, router]);

  return (
    <section className="cartao pilha" data-g="p">
      <h2>Conta Google</h2>
      {erro ? (
        <>
          <div className="aviso" data-t="erro" role="alert">
            {erro}
          </div>
          <Link className="btn" data-v="sec" href="/configuracoes">
            Voltar para Configurações
          </Link>
        </>
      ) : (
        <p className="mudo">Concluindo a conexão com o Google…</p>
      )}
    </section>
  );
}
