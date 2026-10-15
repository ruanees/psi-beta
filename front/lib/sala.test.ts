import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { linkDoPaciente, nomeDaChamada } from './sala.ts';

describe('sala online', () => {
  it('link do paciente no endereço de quem copia', () => {
    assert.equal(linkDoPaciente('ab12', 'https://senda.app'), 'https://senda.app/sala/ab12');
  });

  it('botão com o nome do serviço', () => {
    assert.equal(nomeDaChamada('https://meet.google.com/abc-defg-hij'), 'Entrar no Meet');
    assert.equal(nomeDaChamada('https://meet.google.com.golpe.com/x'), 'Entrar na chamada');
    assert.equal(nomeDaChamada('https://us02web.zoom.us/j/1'), 'Entrar na chamada');
    assert.equal(nomeDaChamada('não é link'), 'Entrar na chamada');
  });
});
