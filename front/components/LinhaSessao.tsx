'use client';

import type { Dto } from '@/lib/api.ts';
import { diaPorExtenso, partes } from '@/lib/datas.ts';
import { MODALIDADE, STATUS_SESSAO } from '@/lib/status.ts';
import { Icone } from './Icone';

type Sessao = Pick<Dto<'SessaoAgendaDto'>, 'inicio' | 'fim' | 'modalidade' | 'status' | 'recorrenciaId'> & {
  pacienteNome?: string;
};

/** Uma sessão em linha: à esquerda o que ela é, à direita a situação. */
export function LinhaSessao({ sessao, aoAbrir, comNome = true }: { sessao: Sessao; aoAbrir: () => void; comNome?: boolean }) {
  const ini = partes(sessao.inicio);
  const fim = partes(sessao.fim);
  const st = STATUS_SESSAO[sessao.status];
  return (
    <button type="button" className="linha-sessao" data-c={st.cor} onClick={aoAbrir}>
      <span className="linha-sessao-hora num">
        {ini.hora}
        <small>{fim.hora}</small>
      </span>
      <span className="linha-sessao-texto">
        <strong>{comNome ? sessao.pacienteNome : diaPorExtenso(ini.dia)}</strong>
        <small className="mudo">
          {MODALIDADE[sessao.modalidade]}
          {sessao.recorrenciaId ? ' · toda semana' : ''}
        </small>
      </span>
      {sessao.modalidade === 'online' && (
        <span className="etiqueta" data-v="ac">
          <Icone nome="video" tamanho={14} /> Online
        </span>
      )}
      <span className="selo" data-c={st.cor}>
        {st.rotulo}
      </span>
    </button>
  );
}
