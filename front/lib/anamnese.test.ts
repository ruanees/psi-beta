import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { ANAMNESE_VAZIA, anamneseParaEnviar, linhaMedicacao, resumoLaudo, resumoMedicacao, temConteudo } from './anamnese.ts';

describe('anamnese', () => {
  it('linha do medicamento sem pedaços vazios', () => {
    assert.equal(linhaMedicacao({ nome: 'Metilfenidato', dose: '10 mg', frequencia: 'de manhã', prescritor: null }), 'Metilfenidato 10 mg · de manhã');
    assert.equal(linhaMedicacao({ nome: 'Sertralina', dose: null, frequencia: '  ', prescritor: 'Dr. Reis' }), 'Sertralina · Dr. Reis');
  });

  it('resumo do laudo e da medicação', () => {
    assert.equal(resumoLaudo({ laudo: null, laudoDescricao: null }), null);
    assert.equal(resumoLaudo({ laudo: 'sim', laudoDescricao: 'TDAH, 2024' }), 'TDAH, 2024');
    assert.equal(resumoLaudo({ laudo: 'nao', laudoDescricao: null }), 'Não possui laudo.');
    assert.deepEqual(resumoMedicacao({ medicacao: 'sim', medicacoes: [] }), ['Toma medicação (sem detalhes).']);
    assert.deepEqual(resumoMedicacao({ medicacao: 'nao_sabe', medicacoes: [] }), ['Não sabe se toma medicação.']);
  });

  it('envio: apara textos, tira linhas vazias e limpa o que a resposta "não" anula', () => {
    const e = anamneseParaEnviar({
      ...ANAMNESE_VAZIA,
      laudo: 'nao',
      laudoDescricao: 'sobrou de antes',
      medicacao: 'sim',
      medicacoes: [
        { nome: ' Sertralina ', dose: '50 mg', frequencia: '', prescritor: null },
        { nome: '  ', dose: null, frequencia: null, prescritor: null },
      ],
      rotina: '  ',
      sonoAlimentacao: ' Dorme mal ',
    });
    assert.equal(e.laudoDescricao, null);
    assert.deepEqual(e.medicacoes, [{ nome: 'Sertralina', dose: '50 mg', frequencia: null, prescritor: null }]);
    assert.equal(e.rotina, null);
    assert.equal(e.sonoAlimentacao, 'Dorme mal');
    assert.deepEqual(anamneseParaEnviar({ ...ANAMNESE_VAZIA, medicacao: 'nao', medicacoes: [{ nome: 'X', dose: null, frequencia: null, prescritor: null }] }).medicacoes, []);
  });

  it('cadastro só manda anamnese com conteúdo', () => {
    assert.equal(temConteudo(ANAMNESE_VAZIA), false);
    assert.equal(temConteudo({ ...ANAMNESE_VAZIA, rotina: '   ' }), false);
    assert.equal(temConteudo({ ...ANAMNESE_VAZIA, laudo: 'nao' }), true);
  });
});
