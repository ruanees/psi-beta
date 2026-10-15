'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, type Dto } from '@/lib/api.ts';
import { useApp } from './EstadoApp';
import { Icone } from './Icone';

// Busca de paciente no topo, de qualquer tela. "/" leva o foco para ela;
// Enter abre o primeiro resultado. A busca vai no corpo da requisição.

export function BuscaPaciente() {
  const { conta } = useApp();
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [termo, setTermo] = useState('');
  const [aberta, setAberta] = useState(false);
  const [res, setRes] = useState<Dto<'PacienteResumoDto'>[]>([]);
  const [ativo, setAtivo] = useState(0);

  useEffect(() => {
    const atalho = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName) && !alvo.isContentEditable) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', atalho);
    return () => window.removeEventListener('keydown', atalho);
  }, []);

  useEffect(() => {
    const t = termo.trim();
    if (t.length < 2) return setRes([]);
    let vivo = true;
    const espera = window.setTimeout(() => {
      api('post', '/contas/{conta}/pacientes/buscar', { params: { conta: conta.id }, corpo: { busca: t } })
        .then((r) => vivo && (setRes(r.slice(0, 8)), setAtivo(0)))
        .catch(() => vivo && setRes([]));
    }, 200);
    return () => {
      vivo = false;
      window.clearTimeout(espera);
    };
  }, [termo, conta.id]);

  const abrir = (id: string) => {
    setTermo('');
    setAberta(false);
    ref.current?.blur();
    router.push(`/pacientes/${id}`);
  };

  return (
    <div className="busca-topo">
      <label className="busca">
        <Icone nome="busca" tamanho={18} />
        <span className="oculto">Buscar paciente</span>
        <input
          ref={ref}
          className="ent"
          type="search"
          placeholder="Buscar paciente   /"
          value={termo}
          role="combobox"
          aria-expanded={aberta && res.length > 0}
          aria-controls="busca-resultados"
          onFocus={() => setAberta(true)}
          onBlur={() => window.setTimeout(() => setAberta(false), 150)}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') (e.preventDefault(), setAtivo(Math.min(ativo + 1, res.length - 1)));
            if (e.key === 'ArrowUp') (e.preventDefault(), setAtivo(Math.max(ativo - 1, 0)));
            if (e.key === 'Enter' && res[ativo]) abrir(res[ativo].id);
            if (e.key === 'Escape') (setTermo(''), ref.current?.blur());
          }}
        />
      </label>
      {aberta && termo.trim().length >= 2 && (
        <ul className="folha busca-resultados" id="busca-resultados" role="listbox">
          {res.length === 0 ? (
            <li className="mudo pequeno" style={{ padding: 12 }}>
              Nenhum paciente encontrado.
            </li>
          ) : (
            res.map((p, i) => (
              <li key={p.id} role="option" aria-selected={i === ativo}>
                <button type="button" className="folha-item" onMouseDown={() => abrir(p.id)}>
                  <strong>{p.nome}</strong>
                  {p.responsavel && <small className="mudo">resp. {p.responsavel}</small>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
