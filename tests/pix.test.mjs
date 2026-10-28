import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// CRC16-CCITT-FALSE independente do site.js, conferido com o valor de referência do padrão.
function crc16(s) {
  let crc = 0xffff;
  for (const b of Buffer.from(s, 'utf8')) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function parseEmv(s) {
  const out = {};
  for (let i = 0; i < s.length;) {
    const id = s.slice(i, i + 2), len = Number(s.slice(i + 2, i + 4));
    out[id] = s.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}

function generate(key, name, city) {
  let copied = null, onClick = null;
  const attrs = { 'data-pix-key': key, 'data-pix-name': name, 'data-pix-city': city };
  const box = {
    getAttribute: (k) => attrs[k],
    querySelector: (sel) => (sel === '[data-pix-copy]' ? { addEventListener: (_, fn) => { onClick = fn; } } : { textContent: '' }),
  };
  const ctx = {
    document: { getElementById: () => box, querySelector: () => null },
    navigator: { clipboard: { writeText: (t) => { copied = t; return { then: (ok) => ok() }; } } },
  };
  vm.runInNewContext(fs.readFileSync(new URL('../src/assets/site.js', import.meta.url), 'utf8'), ctx);
  onClick();
  return copied;
}

test('CRC de referência', () => assert.equal(crc16('123456789'), '29B1'));

test('Pix copia e cola válido com chave aleatória', () => {
  const code = generate('fe911d3a-d002-42bf-8929-ed58ff37f732', 'Raio-X do Aparelho', 'Brasil');
  assert.equal(code.slice(-4), crc16(code.slice(0, -4)), 'CRC confere');
  const f = parseEmv(code);
  assert.equal(f['00'], '01');
  assert.equal(f['53'], '986');
  assert.equal(f['58'], 'BR');
  assert.equal(f['59'], 'RAIO-X DO APARELHO');
  assert.equal(f['60'], 'BRASIL');
  const acct = parseEmv(f['26']);
  assert.equal(acct['00'], 'br.gov.bcb.pix');
  assert.equal(acct['01'], 'fe911d3a-d002-42bf-8929-ed58ff37f732');
});

test('Nome com acento e cidade longa são normalizados e truncados', () => {
  const f = parseEmv(generate('chave', 'João da Conceição Araújo Filho Neto', 'São José dos Campos'));
  assert.equal(f['59'], 'JOAO DA CONCEICAO ARAUJO ');
  assert.equal(f['60'], 'SAO JOSE DOS CA');
});
