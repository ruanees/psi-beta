import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { corpoDaTransferencia, frasePacientes, quemEntrega, quemRecebe, rotuloDoPsicologo, type Psicologo } from './transferencia.ts';

const ana: Psicologo = { membroId: 'a', nome: 'Ana', ativo: true, pacientes: 3 };
const bia: Psicologo = { membroId: 'b', nome: 'Bia', ativo: false, pacientes: 2 };
const caio: Psicologo = { membroId: 'c', nome: 'Caio', ativo: true, pacientes: 0 };

describe('transferir pacientes', () => {
  it('entrega quem tem paciente, quem saiu primeiro; recebe quem entra e não é o mesmo', () => {
    assert.deepEqual(quemEntrega([ana, bia, caio]).map((p) => p.nome), ['Bia', 'Ana']);
    assert.deepEqual(quemRecebe([ana, bia, caio], 'a').map((p) => p.nome), ['Caio']);
    assert.deepEqual(quemRecebe([ana, bia, caio], 'b').map((p) => p.nome), ['Ana', 'Caio']);
  });

  it('o rótulo diz quem saiu e quantos pacientes', () => {
    assert.equal(rotuloDoPsicologo(bia), 'Bia (saiu do consultório) · 2 pacientes');
    assert.equal(frasePacientes(1), '1 paciente');
  });

  it('o pedido leva sempre a lista, e o motivo vazio fica de fora', () => {
    assert.deepEqual(corpoDaTransferencia('b', 'a', ['p1'], '  '), { de: 'b', para: 'a', pacientes: ['p1'] });
    assert.equal(corpoDaTransferencia('b', 'a', [], ' Saiu ').motivo, 'Saiu');
  });
});
