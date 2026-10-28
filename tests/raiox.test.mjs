import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../src/assets/raiox.js', import.meta.url), 'utf8');
const sandbox = { window: {}, document: { addEventListener() {} } };
vm.runInNewContext(code, sandbox);
const { analyse, GPU_FAMILIES } = sandbox.window.RaioX;

const family = (renderer) => GPU_FAMILIES.find((f) => f.re.test(renderer)) || null;
const device = (o) => ({
  ua: `Mozilla/5.0 (Linux; Android ${o.android}; ${o.model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${o.chrome}.0.0.0 Safari/537.36`,
  androidUA: String(o.android), modelUA: o.model, chrome: o.chrome, platform: o.platform || 'Linux aarch64',
  memory: o.memory, screenPx: o.screen, gpu: { renderer: o.gpu }, family: family(o.gpu),
  hevc4k: null, vp94k: null, cpu: 100,
});
const kinds = (v) => v.map((x) => `${x[0]}:${x[1]}`);
const has = (v, kind, text) => v.some((x) => x[0] === kind && x[1].includes(text));

test('HY300 Pro real: chip falso, 4K falso, 32 bits', () => {
  const r = device({ android: 11, model: 'ADT-3', chrome: 120, platform: 'Linux armv8l', memory: 1, screen: [1280, 720], gpu: 'Mali-G31' });
  const v = analyse(r, { android: 11, ram: 2, res: '4k', chip: 'RK3566' });
  assert.ok(has(v, 'bad', 'Chip anunciado não bate'), kinds(v).join('\n'));
  assert.ok(has(v, 'bad', 'prometido 4K'), kinds(v).join('\n'));
  assert.ok(has(v, 'bad', 'RAM: prometido 2 GB'), kinds(v).join('\n'));
  assert.ok(has(v, 'warn', '32 bits'), kinds(v).join('\n'));
  assert.ok(!has(v, 'bad', 'maquiada'), 'Android 11 com Chrome 120 é coerente');
});

test('Central "Android 13" real: Android 9 com WebView 66', () => {
  const r = device({ android: 12, model: 'UJC201_64', chrome: 66, memory: 4, screen: [1280, 720], gpu: 'PowerVR Rogue GE8300' });
  const v = analyse(r, { android: 13, ram: 4, res: null, chip: 'AC8257' });
  assert.ok(has(v, 'bad', 'maquiada'), kinds(v).join('\n'));
  assert.ok(has(v, 'bad', 'prometido 13'), kinds(v).join('\n'));
  assert.ok(has(v, 'ok', 'RAM: ≈ 4 GB'), kinds(v).join('\n'));
  // GPU do AC8257 não está documentada: o teste não pode acusar divergência de chip.
  assert.ok(!has(v, 'bad', 'Chip anunciado'), kinds(v).join('\n'));
});

test('Aparelho honesto sem promessas não recebe nenhum alerta vermelho', () => {
  const r = device({ android: 14, model: 'SM-A155M', chrome: 130, memory: 4, screen: [2340, 1080], gpu: 'Mali-G57 MC2' });
  const v = analyse(r, { android: null, ram: null, res: null, chip: '' });
  assert.equal(v.filter((x) => x[0] === 'bad' || x[0] === 'warn').length, 0, kinds(v).join('\n'));
});

test('TV box RK3566 verdadeira passa no teste de chip', () => {
  const r = device({ android: 11, model: 'X88 Pro', chrome: 110, memory: 4, screen: [1920, 1080], gpu: 'Mali-G52 2EE' });
  const v = analyse(r, { android: 11, ram: 4, res: '1080', chip: 'rk3566' });
  assert.equal(v.filter((x) => x[0] === 'bad').length, 0, kinds(v).join('\n'));
});

test('TV box "RK3318 4K Android 13" com Mali-450 e motor antigo', () => {
  const r = device({ android: 13, model: 'H96 Max', chrome: 74, platform: 'Linux armv7l', memory: 2, screen: [1920, 1080], gpu: 'Mali-450 MP' });
  const v = analyse(r, { android: 13, ram: 4, res: '4k', chip: 'RK3318' });
  assert.ok(has(v, 'bad', 'maquiada'));
  assert.ok(has(v, 'bad', 'RAM: prometido 4 GB'));
  assert.ok(has(v, 'bad', 'prometido 4K'));
  assert.ok(!has(v, 'bad', 'Chip anunciado'), 'RK3318 usa mesmo Mali-450');
});
