'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type Dto } from '@/lib/api.ts';
import { cpfFormatado } from '@/lib/campos.ts';
import { hoje } from '@/lib/datas.ts';
import { descricaoCobranca, descricaoRecibo } from '@/lib/financeiro.ts';
import { fd, moeda } from '@/lib/formato.ts';
import { FORMA_PAGAMENTO } from '@/lib/status.ts';
import { useApp } from './EstadoApp';
import { Janela } from './Janela';

// Recibos do Receita Saúde. A emissão é no app da Receita (não há API); aqui
// fica a fila do que falta emitir, com cada dado pronto para copiar na ordem
// dos campos, e o registro do número e da data depois de emitido.

type Item = Dto<'ItemFilaReciboDto'>;
type Recibo = Dto<'ReciboDto'>;

export function Recibos({ paciente }: { paciente?: string }) {
  const { conta } = useApp();
  const [fila, setFila] = useState<Item[] | null>(null);
  const [recibos, setRecibos] = useState<Recibo[] | null>(null);
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set());
  const [registrando, setRegistrando] = useState(false);
  const [cancelando, setCancelando] = useState<Recibo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const params = { conta: conta.id };
      const [f, r] = await Promise.all([
        api('get', '/contas/{conta}/recibos/fila', { params }),
        api('get', '/contas/{conta}/recibos', { params, consulta: paciente ? { paciente } : {} }),
      ]);
      setFila(paciente ? f.filter((i) => i.paciente.id === paciente) : f);
      setRecibos(r);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar os recibos.');
    }
  }, [conta.id, paciente]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Um recibo é de um paciente só: escolher de outro paciente recomeça a seleção.
  function alternar(i: Item) {
    const atual = (fila ?? []).filter((x) => escolhidas.has(x.id));
    const outroPaciente = atual.length > 0 && atual[0].paciente.id !== i.paciente.id;
    const nova = new Set(outroPaciente ? [] : escolhidas);
    if (nova.has(i.id)) nova.delete(i.id);
    else nova.add(i.id);
    setEscolhidas(nova);
  }

  const selecionados = (fila ?? []).filter((i) => escolhidas.has(i.id));
  // Agrupa por paciente: é como o recibo sai.
  const grupos = new Map<string, Item[]>();
  for (const i of fila ?? []) grupos.set(i.paciente.id, [...(grupos.get(i.paciente.id) ?? []), i]);

  return (
    <div className="pilha">
      {erro && (
        <div className="aviso" data-t="erro" role="alert">
          {erro}
        </div>
      )}

      <section className="cartao">
        <div className="cartao-topo">
          <h2>A emitir no Receita Saúde</h2>
          {selecionados.length > 0 && (
            <button className="btn" onClick={() => setRegistrando(true)}>
              Registrar recibo ({selecionados.length})
            </button>
          )}
        </div>
        <p className="mudo pequeno">
          Pagamentos recebidos ainda sem recibo. Emita no app Receita Saúde ou no e-CAC copiando cada dado, depois marque
          os pagamentos e registre o número do recibo aqui.
        </p>
        {fila === null && !erro ? (
          <p className="mudo">Carregando…</p>
        ) : grupos.size === 0 ? (
          <div className="vazio">Nada a emitir. Todo pagamento recebido tem recibo.</div>
        ) : (
          [...grupos.values()].map((itens) => {
            const p = itens[0].paciente;
            const pg = itens[0].pagador;
            const marcadosDoGrupo = itens.filter((i) => escolhidas.has(i.id));
            const base = marcadosDoGrupo.length > 0 ? marcadosDoGrupo : itens;
            const total = base.reduce((s, i) => s + i.valor, 0);
            const faltaCpf = !pg.cpf || (pg.responsavel && !p.cpf);
            return (
              <div key={p.id} className="bloco-recibo pilha" data-g="p">
                <div className="cartao-topo">
                  <Link className="lk" href={`/pacientes/${p.id}`}>
                    <strong>{p.nome}</strong>
                  </Link>
                  <small className="mudo">
                    {marcadosDoGrupo.length > 0 ? `${marcadosDoGrupo.length} marcado(s)` : `${itens.length} pagamento(s)`}
                  </small>
                </div>
                {faltaCpf && (
                  <div className="aviso" data-t="atencao">
                    Falta o CPF {!pg.cpf ? (pg.responsavel ? 'do responsável que paga' : 'do paciente') : 'do paciente'}: o Receita
                    Saúde exige.{' '}
                    <Link className="lk" href={`/pacientes/${p.id}`}>
                      Completar na ficha (Dados)
                    </Link>
                  </div>
                )}
                <dl className="dados-recibo">
                  <Copiavel rotulo={pg.responsavel ? 'CPF de quem pagou (responsável)' : 'CPF de quem pagou'} valor={pg.cpf ? cpfFormatado(pg.cpf) : null} />
                  {pg.responsavel && <Copiavel rotulo="CPF do beneficiário (paciente)" valor={p.cpf ? cpfFormatado(p.cpf) : null} />}
                  <Copiavel rotulo="Valor" valor={moeda(total).replace('R$', '').trim()} />
                  <Copiavel rotulo="Data do pagamento" valor={fd(base[base.length - 1].pagaEm)} />
                  <Copiavel rotulo="Descrição" valor={descricaoRecibo(base)} />
                </dl>
                <ul className="lista">
                  {itens.map((i) => (
                    <li key={i.id}>
                      <label className="marcar">
                        <input type="checkbox" checked={escolhidas.has(i.id)} onChange={() => alternar(i)} />
                        <span>
                          {descricaoCobranca(i)}
                          <small className="mudo">
                            {' '}
                            · pago em {fd(i.pagaEm)}, {FORMA_PAGAMENTO[i.forma]}
                          </small>
                        </span>
                      </label>
                      <span className="num">{moeda(i.valor)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </section>

      <section className="cartao">
        <h2>Recibos registrados</h2>
        {recibos === null && !erro ? (
          <p className="mudo">Carregando…</p>
        ) : recibos && recibos.length === 0 ? (
          <div className="vazio">Nenhum recibo registrado ainda.</div>
        ) : (
          <ul className="lista cobrancas">
            {(recibos ?? []).map((r) => (
              <li key={r.id}>
                <span className="cobranca-texto">
                  <strong>
                    Nº {r.numero}
                    {paciente ? '' : ` · ${r.beneficiarioNome}`}
                  </strong>
                  <small className="mudo">
                    Emitido em {fd(r.emitidoEm)} · pago por {r.pagadorNome}
                    {r.cobrancas > 1 ? ` · ${r.cobrancas} pagamentos` : ''}
                    {r.canceladoEm ? ` · cancelado: ${r.canceladoMotivo}` : ''}
                  </small>
                </span>
                <span className="cobranca-valor num">{moeda(r.valor)}</span>
                <span className="selo" data-c={r.canceladoEm ? 'tracejado' : 'ok'}>
                  {r.canceladoEm ? 'Cancelado' : 'Emitido'}
                </span>
                <span className="cobranca-acoes">
                  {!r.canceladoEm && (
                    <button className="btn" data-v="leve" onClick={() => setCancelando(r)}>
                      Cancelar registro
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {registrando && (
        <RegistrarRecibo
          itens={selecionados}
          aoFechar={() => setRegistrando(false)}
          aoGravar={() => {
            setEscolhidas(new Set());
            void carregar();
          }}
        />
      )}
      {cancelando && <CancelarRecibo recibo={cancelando} aoFechar={() => setCancelando(null)} aoGravar={() => void carregar()} />}
    </div>
  );
}

function Copiavel({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <>
      <dt>{rotulo}</dt>
      <dd>
        {valor ? (
          <>
            <span className="num">{valor}</span>
            <button
              type="button"
              className="lk pequeno"
              onClick={() =>
                void navigator.clipboard
                  .writeText(valor)
                  .then(() => {
                    setCopiado(true);
                    setTimeout(() => setCopiado(false), 1500);
                  })
                  .catch(() => undefined)
              }
            >
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </>
        ) : (
          <span className="mudo">não cadastrado</span>
        )}
      </dd>
    </>
  );
}

function RegistrarRecibo({ itens, aoFechar, aoGravar }: { itens: Item[]; aoFechar: () => void; aoGravar: () => void }) {
  const { conta } = useApp();
  const [numero, setNumero] = useState('');
  const [data, setData] = useState(hoje());
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const total = itens.reduce((s, i) => s + i.valor, 0);

  async function gravar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setErro(null);
    try {
      await api('post', '/contas/{conta}/recibos', {
        params: { conta: conta.id },
        corpo: { cobrancas: itens.map((i) => i.id), numero: numero.trim(), emitidoEm: data },
      });
      aoGravar();
      aoFechar();
    } catch (er) {
      setErro(er instanceof Error ? er.message : 'Não foi possível registrar.');
      setOcupado(false);
    }
  }

  return (
    <Janela
      titulo="Registrar recibo emitido"
      subtitulo={`${itens[0].paciente.nome} · ${itens.length === 1 ? '1 pagamento' : `${itens.length} pagamentos`} · ${moeda(total)}`}
      icone="financeiro"
      aoFechar={aoFechar}
      rodape={
        <>
          <button type="button" className="btn" data-v="sec" onClick={aoFechar}>
            Voltar
          </button>
          <button type="submit" form="recibo-form" className="btn" disabled={ocupado}>
            {ocupado ? 'Gravando…' : 'Registrar recibo'}
          </button>
        </>
      }
    >
      <form id="recibo-form" className="pilha" data-g="p" onSubmit={(e) => void gravar(e)}>
        {erro && (
          <div className="aviso" data-t="erro" role="alert">
            {erro}
          </div>
        )}
        <label className="campo">
          <span>Número do recibo no Receita Saúde</span>
          <input className="ent" value={numero} required maxLength={60} autoFocus onChange={(e) => setNumero(e.target.value)} />
        </label>
        <label className="campo">
          <span>Emitido em</span>
          <input className="ent" type="date" max={hoje()} value={data} required onChange={(e) => setData(e.target.value)} />
        </label>
      </form>
    </Janela>
  );
}

function CancelarRecibo({ recibo, aoFechar, aoGravar }: { recibo: Recibo; aoFechar: () => void; aoGravar: () => void }) {
  const { conta } = useApp();
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  async function cancelar(e: FormEvent) {
    e.preventDefault();
    try {
      await api('post', '/contas/{conta}/recibos/{recibo}/cancelar', {
        params: { conta: conta.id, recibo: recibo.id },
        corpo: { motivo },
      });
      aoGravar();
      aoFechar();
    } catch (er) {
      setErro(er instanceof Error ? er.message : 'Não foi possível cancelar.');
    }
  }

  return (
    <Janela
      titulo="Cancelar registro do recibo"
      subtitulo={`Nº ${recibo.numero} · ${recibo.beneficiarioNome} · ${moeda(recibo.valor)}`}
      icone="financeiro"
      aoFechar={aoFechar}
      rodape={
        <>
          <button type="button" className="btn" data-v="sec" onClick={aoFechar}>
            Voltar
          </button>
          <button type="submit" form="cancelar-recibo" className="btn" data-v="perigo">
            Cancelar registro
          </button>
        </>
      }
    >
      <form id="cancelar-recibo" className="pilha" data-g="p" onSubmit={(e) => void cancelar(e)}>
        {erro && (
          <div className="aviso" data-t="erro" role="alert">
            {erro}
          </div>
        )}
        <p className="mudo">
          Os pagamentos voltam para a fila do que falta emitir. Se o recibo foi emitido no Receita Saúde, cancele lá também.
        </p>
        <label className="campo">
          <span>Motivo</span>
          <input className="ent" value={motivo} required maxLength={300} onChange={(e) => setMotivo(e.target.value)} />
        </label>
      </form>
    </Janela>
  );
}
