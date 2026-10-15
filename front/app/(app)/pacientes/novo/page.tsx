'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { CamposDoPlano } from '@/components/CamposDoPlano';
import { useApp } from '@/components/EstadoApp';
import { Icone } from '@/components/Icone';
import { api, type Dto } from '@/lib/api.ts';
import { hoje, idade } from '@/lib/datas.ts';
import { soDigitos, valorEmReais } from '@/lib/campos.ts';

type Responsavel = Dto<'NovoResponsavelDto'> & { chave: number };

export default function NovoPaciente() {
  const { conta } = useApp();
  const router = useRouter();
  const [nascimento, setNascimento] = useState('');
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [tipo, setTipo] = useState<Dto<'Plano'>>('avulsa');
  const [sessoes, setSessoes] = useState('');
  const [valor, setValor] = useState('');
  const menor = (idade(nascimento) ?? 99) < 18;

  const mudarResp = (chave: number, p: Partial<Responsavel>) =>
    setResponsaveis(responsaveis.map((r) => (r.chave === chave ? { ...r, ...p } : r)));

  const salvar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const texto = (k: string) => String(f.get(k) ?? '').trim() || undefined;
    if (menor && responsaveis.filter((r) => r.nome.trim()).length === 0) {
      return setErro('Paciente menor de idade precisa de ao menos um responsável.');
    }
    setErro(null);
    setOcupado(true);
    try {
      const { id } = await api('post', '/contas/{conta}/pacientes', {
        params: { conta: conta.id },
        corpo: {
          nome: String(f.get('nome')).trim(),
          telefone: texto('telefone'),
          nascimento: nascimento || undefined,
          cpf: soDigitos(texto('cpf')),
          // Avulsa é o padrão do banco: basta o valor da sessão. Pacote e mensal vão como plano.
          ...(tipo === 'avulsa'
            ? { valorSessao: valorEmReais(valor) }
            : { plano: { tipo, sessoes: sessoes ? Number(sessoes) : null, valor: valorEmReais(valor) ?? null } }),
          queixaPrincipal: texto('queixa'),
          consentimento: f.get('consentimento') === 'on',
          responsaveis: responsaveis
            .filter((r) => r.nome.trim())
            .map((r) => ({
              nome: r.nome.trim(),
              parentesco: r.parentesco?.trim() || undefined,
              telefone: r.telefone?.trim() || undefined,
              cpf: soDigitos(r.cpf),
              financeiro: r.financeiro ?? false,
            })),
        },
      });
      router.replace(`/pacientes/${id}`);
    } catch (er) {
      setErro(er instanceof Error ? er.message : 'Não foi possível cadastrar.');
      setOcupado(false);
      // O botão fica no fim do formulário e o aviso no começo: sem rolar, o erro passa batido.
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <form className="pilha formulario" onSubmit={salvar}>
      <div className="cabecalho">
        <div>
          <Link className="lk pequeno" href="/pacientes">
            ← Pacientes
          </Link>
          <h1>Novo paciente</h1>
        </div>
      </div>

      {erro && (
        <div className="aviso" data-t="erro" role="alert">
          {erro}
        </div>
      )}

      <section className="cartao">
        <h2>Dados do paciente</h2>
        <label className="campo">
          <span>Nome completo</span>
          <input className="ent" name="nome" required maxLength={160} autoFocus />
        </label>
        <div className="grade" data-n="3">
          <label className="campo">
            <span>Telefone</span>
            <input className="ent" name="telefone" type="tel" maxLength={30} placeholder="(11) 99999-0000" />
          </label>
          <label className="campo">
            <span>Data de nascimento</span>
            <input className="ent" type="date" max={hoje()} value={nascimento} onChange={(e) => setNascimento(e.target.value)} />
            {menor && nascimento && <small>Menor de idade: cadastre ao menos um responsável.</small>}
          </label>
          <label className="campo">
            <span>CPF</span>
            <input className="ent" name="cpf" inputMode="numeric" placeholder="Opcional" maxLength={14} />
            <small>Necessário para o recibo do Receita Saúde.</small>
          </label>
        </div>
      </section>

      <section className="cartao">
        <h2>Plano</h2>
        <CamposDoPlano
          tipo={tipo}
          sessoes={sessoes}
          valor={valor}
          valorPadrao={conta.perfil?.valorSessaoPadrao}
          aoEscolher={(t) => {
            setTipo(t);
            setSessoes('');
            setValor('');
          }}
          aoMudarSessoes={setSessoes}
          aoMudarValor={setValor}
        />
      </section>

      <section className="cartao">
        <div className="cartao-topo">
          <h2>Pais ou responsáveis</h2>
          <button
            type="button"
            className="btn"
            data-v="suave"
            onClick={() => setResponsaveis([...responsaveis, { chave: Date.now(), nome: '', financeiro: responsaveis.length === 0 }])}
          >
            <Icone nome="mais" tamanho={18} /> Adicionar responsável
          </button>
        </div>
        {responsaveis.length === 0 ? (
          <p className="mudo">{menor ? 'Obrigatório para menor de idade.' : 'Opcional para adultos.'}</p>
        ) : (
          responsaveis.map((r) => (
            <div key={r.chave} className="bloco-responsavel">
              <div className="grade" data-n="2">
                <label className="campo">
                  <span>Nome</span>
                  <input className="ent" value={r.nome} required onChange={(e) => mudarResp(r.chave, { nome: e.target.value })} />
                </label>
                <label className="campo">
                  <span>Parentesco</span>
                  <input className="ent" value={r.parentesco ?? ''} placeholder="Mãe, pai, avó…" onChange={(e) => mudarResp(r.chave, { parentesco: e.target.value })} />
                </label>
                <label className="campo">
                  <span>Telefone</span>
                  <input className="ent" type="tel" value={r.telefone ?? ''} onChange={(e) => mudarResp(r.chave, { telefone: e.target.value })} />
                </label>
                <label className="campo">
                  <span>CPF</span>
                  <input className="ent" inputMode="numeric" value={r.cpf ?? ''} onChange={(e) => mudarResp(r.chave, { cpf: e.target.value })} />
                </label>
              </div>
              <div className="linha" data-entre>
                <label className="alternar">
                  <input type="checkbox" checked={r.financeiro ?? false} onChange={(e) => mudarResp(r.chave, { financeiro: e.target.checked })} />
                  Paga as sessões (sai no recibo)
                </label>
                <button type="button" className="btn" data-v="leve" onClick={() => setResponsaveis(responsaveis.filter((x) => x.chave !== r.chave))}>
                  <Icone nome="lixo" tamanho={18} /> Remover
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="cartao">
        <h2>Queixa principal</h2>
        <label className="campo">
          <span className="oculto">Queixa principal</span>
          <textarea className="ent" name="queixa" rows={4} maxLength={4000} placeholder="O motivo que trouxe o paciente ao atendimento." />
          <small>Dado clínico: só você, psicólogo do paciente, vê este campo.</small>
        </label>
      </section>

      <section className="cartao">
        <label className="alternar consentimento">
          <input type="checkbox" name="consentimento" required />
          <span>
            O paciente, ou o responsável, autorizou o registro destes dados para o atendimento psicológico, conforme a
            LGPD.
          </span>
        </label>
      </section>

      <div className="linha">
        <button className="btn" disabled={ocupado}>
          {ocupado ? 'Cadastrando…' : 'Cadastrar paciente'}
        </button>
        <Link className="btn" data-v="sec" href="/pacientes">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
