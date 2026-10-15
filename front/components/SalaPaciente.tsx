'use client';

import { useEffect, useRef, useState } from 'react';
import { api, ErroApi, type Dto } from '@/lib/api.ts';
import { nomeDaChamada } from '@/lib/sala.ts';
import { Icone } from './Icone';
import { Simbolo } from './Simbolo';

// O que o paciente vê: quando é a próxima sessão online e, a partir de 15
// minutos antes, o botão da chamada. Nada além disso sai do servidor.

const DIA: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
const HORA: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
const dia = (iso: string) => {
  const t = new Date(iso).toLocaleDateString('pt-BR', DIA);
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', HORA);

export function SalaPaciente({ token }: { token: string }) {
  const [sala, setSala] = useState<Dto<'SalaPublicaDto'> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const temSala = useRef(false);

  useEffect(() => {
    const carregar = () =>
      api('get', '/sala/{token}', { params: { token }, publica: true })
        .then((s) => {
          temSala.current = true;
          setSala(s);
          setErro(null);
        })
        .catch((e) => {
          // Sem conexão mantém o que já estava na tela; link inválido troca a tela.
          if (e instanceof ErroApi && e.status === 0 && temSala.current) return;
          setErro(e instanceof Error ? e.message : 'Não foi possível abrir a sala.');
        });
    void carregar();
    // Confere de novo a cada 30 segundos: o botão aparece sozinho na hora.
    const t = setInterval(carregar, 30_000);
    return () => clearInterval(t);
  }, [token]);

  return (
    <main className="sala-paciente">
      <div className="sala-caixa">
        <span className="marca">
          <Simbolo tamanho={32} />
          senda
        </span>
        <div className="cartao pilha">
          {erro ? (
            <>
              <h1>Sala não encontrada</h1>
              <p className="mudo">{erro}</p>
            </>
          ) : !sala ? (
            <p className="mudo">Abrindo a sala…</p>
          ) : (
            <Conteudo sala={sala} />
          )}
        </div>
        <p className="pequeno mudo">Sessão de psicologia. A chamada abre em outra aba, com câmera e microfone.</p>
      </div>
    </main>
  );
}

function Conteudo({ sala }: { sala: Dto<'SalaPublicaDto'> }) {
  const com = sala.profissional ? `com ${sala.profissional}` : '';
  if (sala.situacao === 'sem_sessao' || !sala.inicio || !sala.fim) {
    return (
      <>
        <h1>Nenhuma sessão online marcada</h1>
        <p className="mudo">Quando houver uma sessão online {com}, ela aparece aqui. Guarde este link.</p>
      </>
    );
  }
  const quando = (
    <p className="sala-quando">
      <Icone nome="calendario" tamanho={18} />
      <span>
        <strong>{dia(sala.inicio)}</strong>
        <br />
        {hora(sala.inicio)} – {hora(sala.fim)}
      </span>
    </p>
  );
  if (sala.situacao === 'cedo') {
    return (
      <>
        <h1>Sua próxima sessão {com}</h1>
        {quando}
        <div className="aviso">
          A sala abre às <strong>{hora(sala.abreEm ?? sala.inicio)}</strong>, 15 minutos antes. Deixe esta página aberta: o botão
          aparece sozinho.
        </div>
      </>
    );
  }
  if (sala.situacao === 'sem_link' || !sala.link) {
    return (
      <>
        <h1>Sessão {com}</h1>
        {quando}
        <div className="aviso" data-t="atencao">
          O link da chamada ainda não foi colocado. Deixe esta página aberta: o botão aparece assim que ele estiver pronto.
        </div>
      </>
    );
  }
  return (
    <>
      <h1>Sessão {com}</h1>
      {quando}
      <a className="btn" data-largo href={sala.link} target="_blank" rel="noopener noreferrer">
        <Icone nome="video" tamanho={18} /> {nomeDaChamada(sala.link)}
      </a>
      <p className="pequeno mudo">Procure um lugar reservado, com fone de ouvido se puder.</p>
    </>
  );
}
