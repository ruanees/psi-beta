'use client';

import { useEffect, useState } from 'react';

// Campo que grava no blur, sozinho, sem botão e sem redesenhar a tela.
// Só chama `gravar` se o valor mudou. Erro aparece embaixo do próprio campo.

interface Props {
  rotulo: string;
  valor: string;
  gravar: (novo: string) => Promise<void>;
  tipo?: 'text' | 'number';
  dica?: string;
  placeholder?: string;
  inputMode?: 'text' | 'numeric' | 'decimal';
}

export function CampoGravavel({ rotulo, valor, gravar, tipo = 'text', dica, placeholder, inputMode }: Props) {
  const [texto, setTexto] = useState(valor);
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  useEffect(() => setTexto(valor), [valor]);

  async function aoSair() {
    if (texto.trim() === valor.trim()) return;
    setGravando(true);
    setErro(null);
    try {
      await gravar(texto.trim());
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gravar.');
    } finally {
      setGravando(false);
    }
  }

  return (
    <label className="campo">
      <span>
        {rotulo}
        {gravando && <span className="mudo"> · gravando</span>}
      </span>
      <input
        className="ent"
        type={tipo}
        inputMode={inputMode}
        value={texto}
        placeholder={placeholder}
        aria-invalid={erro ? 'true' : undefined}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => void aoSair()}
      />
      {erro ? <small data-t="erro">{erro}</small> : dica && <small>{dica}</small>}
    </label>
  );
}
