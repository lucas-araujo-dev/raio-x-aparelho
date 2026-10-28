// Raio-X do Aparelho: coleta o que o navegador revela e compara com o que o anúncio prometeu.
// Escrito em ES2017 sem "?." nem "??": precisa rodar em WebViews antigas (ex.: Chrome 66 de 2018, comum em centrais).
(function () {
  'use strict';

  // GPU → famílias de chip prováveis. Só entra aqui o que tem fonte confiável (fabricante ou datasheet).
  var GPU_FAMILIES = [
    { re: /Mali-G31/i, gpu: 'ARM Mali-G31', tier: 'entrada', chips: [
      'Allwinner H713 / TV303 (projetores HY300, HY320 e similares)',
      'Allwinner H616 / H618 / H313 / H700 (TV boxes e portáteis)',
      'Rockchip RK3326',
      'Amlogic S905X2 / S905X3 / S905X4 / S905W2 / S905Y4 (TV boxes e TV sticks)'] },
    { re: /Mali-G52/i, gpu: 'ARM Mali-G52', tier: 'intermediário de entrada', chips: [
      'Rockchip RK3566 / RK3568 / RK3576',
      'Unisoc UIS7862 / T618 (centrais multimídia "8 núcleos")',
      'Amlogic S922X (TV boxes melhores)',
      'MediaTek Helio G70–G96 (celulares)'] },
    { re: /Mali-G57|Mali-G68|Mali-G610|Mali-G710|Mali-G615/i, gpu: 'ARM Mali-G57/G68/G610', tier: 'intermediário a bom', chips: [
      'Rockchip RK3588 (G610)', 'MediaTek Dimensity / Helio G99 (celulares)', 'Unisoc T606/T616/T7xx (G57)'] },
    { re: /Mali-450/i, gpu: 'ARM Mali-450', tier: 'muito antigo (projeto de 2014–2016)', chips: [
      'Amlogic S905W / S905X / S905L', 'Rockchip RK3228 / RK3229 / RK3318 / RK3328 / RK3528', 'Allwinner H5'] },
    { re: /Mali-400/i, gpu: 'ARM Mali-400', tier: 'muito antigo', chips: ['Allwinner H3 / A33', 'Rockchip RK3188'] },
    { re: /Mali-T7[26]0|Mali-T8[2368]0/i, gpu: 'ARM Mali-T7xx/T8xx', tier: 'antigo', chips: [
      'Allwinner H6 (T720)', 'MediaTek MT8163 / MT6737 (T720)', 'Rockchip RK3288 (T760)', 'Rockchip RK3399 (T860)', 'Amlogic S912 (T820)'] },
    { re: /PowerVR|GE8\d{3}|IMG/i, gpu: 'Imagination PowerVR', tier: 'entrada', chips: [
      'MediaTek Helio A22 / P22 / P35 e MT876x (GE8320)', 'Unisoc SC9863A (GE8322)', 'Rockchip RK3368 (G6110)'] },
    { re: /Adreno/i, gpu: 'Qualcomm Adreno', tier: 'varia pelo modelo', chips: ['Qualcomm Snapdragon'] },
    { re: /Apple/i, gpu: 'Apple GPU', tier: '—', chips: ['Apple (iPhone, iPad ou Mac)'] },
    { re: /NVIDIA|GeForce|Radeon|AMD|Intel/i, gpu: 'GPU de computador', tier: '—', chips: ['Computador (PC ou notebook)'] }
  ];

  // Versão mínima da WebView/Chrome que vem de fábrica em cada Android (aproximação conservadora, com folga).
  // Um aparelho que diz ser Android 12 mas ainda tem WebView de 2018 quase certamente tem a versão maquiada.
  var MIN_WEBVIEW = { 10: 70, 11: 80, 12: 88, 13: 98, 14: 110, 15: 120, 16: 126 };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function gpuInfo() {
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return null;
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      var renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      var vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
      var maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      return { renderer: String(renderer || ''), vendor: String(vendor || ''), maxTexture: maxTex };
    } catch (e) { return null; }
  }

  function decodeSupport(contentType, width, height, bitrate) {
    if (!navigator.mediaCapabilities || !navigator.mediaCapabilities.decodingInfo) return Promise.resolve(null);
    return navigator.mediaCapabilities.decodingInfo({
      type: 'file',
      video: { contentType: contentType, width: width, height: height, bitrate: bitrate, framerate: 30 }
    }).then(function (r) { return r; }, function () { return null; });
  }

  // Teste curto de CPU (≈ 0,5 s). Serve para comparar aparelhos entre si, não é benchmark oficial.
  function cpuScore() {
    var t0 = performance.now(), n = 0, x = 0;
    while (performance.now() - t0 < 500) {
      for (var i = 0; i < 20000; i++) { x = (x * 1103515245 + 12345) % 2147483648; }
      n++;
    }
    return Math.round(n * 20000 / ((performance.now() - t0) * 1000));
  }

  function collect() {
    var ua = navigator.userAgent;
    var r = { ua: ua };
    var m = ua.match(/Android\s([\d.]+)(?:;\s*([^;)]+))?/);
    r.androidUA = m ? m[1] : null;
    r.modelUA = m && m[2] ? m[2].replace(/\s*Build\/.*$/, '').trim() : null;
    var c = ua.match(/Chrome\/(\d+)/);
    r.chrome = c ? parseInt(c[1], 10) : null;
    r.webview = /; wv\)/.test(ua) || /Version\/[\d.]+ Chrome/.test(ua);
    r.platform = navigator.platform || '';
    r.cores = navigator.hardwareConcurrency || null;
    r.memory = navigator.deviceMemory || null;
    var dpr = window.devicePixelRatio || 1;
    var w = Math.round(screen.width * dpr), h = Math.round(screen.height * dpr);
    r.screenPx = [Math.max(w, h), Math.min(w, h)];
    r.gpu = gpuInfo();
    r.family = null;
    if (r.gpu) {
      for (var i = 0; i < GPU_FAMILIES.length; i++) {
        if (GPU_FAMILIES[i].re.test(r.gpu.renderer)) { r.family = GPU_FAMILIES[i]; break; }
      }
    }

    var ch = navigator.userAgentData && navigator.userAgentData.getHighEntropyValues
      ? navigator.userAgentData.getHighEntropyValues(['model', 'platformVersion', 'architecture', 'bitness']).then(function (v) { return v; }, function () { return null; })
      : Promise.resolve(null);

    return Promise.all([
      ch,
      decodeSupport('video/mp4; codecs="hvc1.1.6.L150.B0"', 3840, 2160, 20000000),
      decodeSupport('video/webm; codecs="vp09.00.50.08"', 3840, 2160, 20000000),
      decodeSupport('video/mp4; codecs="avc1.640028"', 1920, 1080, 8000000)
    ]).then(function (res) {
      var h = res[0];
      if (h) {
        if (h.model) r.modelUA = h.model;
        if (h.platformVersion && /Android/i.test(ua)) r.androidUA = h.platformVersion.split('.')[0];
        r.bitness = h.bitness || null;
        r.arch = h.architecture || null;
      }
      // Chrome reduzido mostra "Android 10; K": não é o modelo real.
      if (r.modelUA === 'K') r.modelUA = null;
      r.hevc4k = res[1];
      r.vp94k = res[2];
      r.h2641080 = res[3];
      r.cpu = cpuScore();
      return r;
    });
  }

  function is32bit(r) {
    if (r.bitness === '32') return true;
    if (r.bitness === '64') return false;
    if (/armv7l|armv8l|i686/i.test(r.platform)) return true;
    if (/aarch64|x86_64|Win64|MacIntel/i.test(r.platform)) return false;
    return null;
  }

  function claims() {
    return {
      android: parseInt($('c-android').value, 10) || null,
      ram: parseFloat($('c-ram').value) || null,
      res: $('c-res').value || null,
      chip: ($('c-chip').value || '').trim()
    };
  }

  function analyse(r, c) {
    var out = [];
    var bits = is32bit(r);
    var android = r.androidUA ? parseInt(r.androidUA, 10) : null;

    // 1) Versão do Android
    if (c.android && android && android < c.android) {
      out.push(['bad', 'Android: prometido ' + c.android + ', o sistema declara ' + android,
        'O próprio aparelho informa uma versão menor que a do anúncio.']);
    }
    var claimed = Math.max(c.android || 0, android || 0);
    var floor = MIN_WEBVIEW[claimed];
    if (r.chrome && floor && r.chrome < floor) {
      out.push(['bad', 'Versão do Android provavelmente maquiada',
        'O navegador deste aparelho usa o motor Chrome ' + r.chrome + ', antigo demais para um Android ' + claimed +
        ' de verdade (que já sai de fábrica com motor ' + floor + ' ou mais novo). É o padrão de firmwares que trocam só o número da versão. ' +
        'Exemplo real: uma central "Android 13" com motor Chrome 66 era Android 9.']);
    } else if (claimed && r.chrome) {
      out.push(['info', 'Motor do navegador: Chrome ' + r.chrome,
        'Compatível com o Android declarado (' + claimed + '). Atenção: se você instalou o Chrome pela Play Store, ele é sempre recente e este teste não consegue provar a versão do sistema. Use o navegador que veio no aparelho para um resultado mais revelador.']);
    }

    // 2) RAM
    if (r.memory) {
      var memTxt = r.memory >= 8 ? '8 GB ou mais' : '≈ ' + (r.memory < 1 ? Math.round(r.memory * 1024) + ' MB' : r.memory + ' GB');
      if (c.ram && r.memory < c.ram && !(r.memory >= 8)) {
        out.push(['bad', 'RAM: prometido ' + c.ram + ' GB, medido ' + memTxt,
          'O navegador arredonda a memória para 0,5 / 1 / 2 / 4 / 8 GB. Um aparelho com ' + c.ram + ' GB reais apareceria como ' + c.ram + ' GB aqui.']);
      } else {
        out.push([c.ram ? 'ok' : 'info', 'RAM: ' + memTxt, c.ram ? 'Bate com o anúncio (medida aproximada).' : 'Medida arredondada pelo navegador.']);
      }
    } else {
      out.push(['info', 'RAM: este navegador não informa', 'Abra a página no Chrome ou no navegador padrão do aparelho para medir.']);
    }

    // 3) Resolução
    var px = r.screenPx;
    var native = px[0] + '×' + px[1];
    if (c.res === '4k' && px[0] < 3800) {
      out.push(['bad', 'Resolução: prometido 4K, o sistema roda em ' + native,
        'Nenhum aparelho desta faixa de preço tem tela ou painel 4K. "Suporta 4K" no anúncio normalmente quer dizer que ele aceita abrir um vídeo 4K, reduzindo para a resolução real.']);
    } else if (c.res === '1080' && px[0] < 1900) {
      out.push(['bad', 'Resolução: prometido Full HD, o sistema roda em ' + native,
        'A imagem que o aparelho gera tem menos pontos que 1920×1080.']);
    } else {
      out.push(['info', 'Resolução de trabalho do sistema: ' + native,
        'Em projetores, o painel físico pode ser ainda menor que isso. Em TVs, a interface às vezes roda em 1080p mesmo com painel 4K.']);
    }

    // 4) Chip / GPU
    if (r.family) {
      var claimTxt = (c.chip + ' ' + (r.modelUA || '')).toLowerCase();
      var familyTxt = r.family.chips.join(' ').toLowerCase();
      // Só acusa divergência para chips cuja GPU está no mapa; chip desconhecido nunca vira acusação.
      var mapped = GPU_FAMILIES.map(function (f) { return f.chips.join(' '); }).join(' ').toLowerCase();
      var named = claimTxt.match(/rk\d{4}|s9\d{2}[a-z0-9]*|h\d{3}|uis\d{4}/g) || [];
      var mismatch = named.filter(function (n) { return mapped.indexOf(n) >= 0 && familyTxt.indexOf(n) < 0; });
      if (mismatch.length) {
        out.push(['bad', 'Chip anunciado não bate com a placa de vídeo',
          '"' + mismatch.join(', ') + '" não usa a GPU ' + r.family.gpu + '. Esta GPU aparece em: ' + r.family.chips.join('; ') + '. ' +
          'Exemplo real: um projetor HY300 Pro se identificava como "ADT-3 / RK3566", mas era um Allwinner H713 (GPU Mali-G31).']);
      } else {
        out.push(['info', 'Placa de vídeo: ' + r.family.gpu + ' (nível ' + r.family.tier + ')',
          'Chips prováveis: ' + r.family.chips.join('; ') + '.']);
      }
    } else if (r.gpu) {
      out.push(['info', 'Placa de vídeo: ' + r.gpu.renderer, 'Ainda não está no nosso mapa de chips.']);
    }

    // 5) 32 bits
    if (bits === true && /Android/i.test(r.ua)) {
      out.push(['warn', 'Sistema de 32 bits',
        'O processador pode até ser de 64 bits, mas o Android instalado é de 32. Na prática: cada app pode usar pouca memória e alguns apps novos (64 bits apenas) não instalam. É comum em projetores e TV boxes baratos.']);
    }

    // 6) Decodificação de vídeo
    if (r.hevc4k || r.vp94k) {
      var hevc = r.hevc4k && r.hevc4k.supported, vp9 = r.vp94k && r.vp94k.supported;
      if (!hevc && !vp9) {
        out.push(['warn', 'Vídeo 4K: o navegador não decodifica',
          'Nem HEVC nem VP9 em 4K. Apps nativos (YouTube, Netflix) podem se sair um pouco melhor, mas é sinal de chip fraco para 4K.']);
      } else {
        out.push(['info', 'Vídeo 4K no navegador: ' + [hevc ? 'HEVC' : null, vp9 ? 'VP9' : null].filter(Boolean).join(' e ') +
          ((r.vp94k && r.vp94k.smooth) || (r.hevc4k && r.hevc4k.smooth) ? ' (fluido)' : ' (pode engasgar)'),
          'Decodificar 4K não significa exibir 4K: a imagem é reduzida para a resolução real da tela.']);
      }
    }
    return out;
  }

  function specRows(r) {
    var rows = [];
    function add(k, v) { if (v !== null && v !== undefined && v !== '') rows.push('<tr><td>' + esc(k) + '</td><td>' + esc(v) + '</td></tr>'); }
    add('Modelo que o aparelho declara', r.modelUA);
    add('Android declarado', r.androidUA);
    add('Motor do navegador', r.chrome ? 'Chrome ' + r.chrome + (r.webview ? ' (WebView do sistema)' : '') : null);
    add('GPU (WebGL)', r.gpu ? r.gpu.renderer : null);
    add('Núcleos de CPU', r.cores);
    add('RAM (aproximada)', r.memory ? (r.memory >= 8 ? '8 GB ou mais' : r.memory + ' GB') : null);
    add('Resolução do sistema', r.screenPx.join('×'));
    var b = is32bit(r);
    add('Arquitetura', (r.arch ? r.arch + ' ' : '') + (b === null ? '' : b ? '32 bits' : '64 bits') + (r.platform ? ' (' + r.platform + ')' : ''));
    add('Nota de CPU (comparativa)', r.cpu);
    return rows.join('');
  }

  function reportText(r, verdicts) {
    var lines = ['Raio-X do meu aparelho:'];
    verdicts.forEach(function (v) { lines.push((v[0] === 'bad' ? '❌ ' : v[0] === 'warn' ? '⚠️ ' : v[0] === 'ok' ? '✅ ' : '• ') + v[1]); });
    if (r.gpu) lines.push('GPU: ' + r.gpu.renderer);
    lines.push('Teste o seu: ' + location.href.split('#')[0]);
    return lines.join('\n');
  }

  var last = null;

  function render() {
    if (!last) return;
    var v = analyse(last, claims());
    $('verdicts').innerHTML = v.map(function (x) {
      return '<li class="' + x[0] + '"><strong>' + esc(x[1]) + '</strong>' + esc(x[2]) + '</li>';
    }).join('');
    $('specs').innerHTML = specRows(last);
    $('share-text').value = reportText(last, v);
    $('result').classList.remove('hidden');
  }

  function run() {
    var btn = $('run');
    btn.disabled = true;
    btn.textContent = 'Analisando…';
    // Dá tempo de a tela atualizar antes do teste de CPU.
    setTimeout(function () {
      collect().then(function (r) {
        last = r;
        render();
        btn.disabled = false;
        btn.textContent = 'Testar de novo';
        $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, function (e) {
        btn.disabled = false;
        btn.textContent = 'Tentar de novo';
        $('verdicts').innerHTML = '<li class="warn"><strong>Não foi possível concluir o teste</strong>' + esc(e && e.message || e) + '</li>';
        $('result').classList.remove('hidden');
      });
    }, 50);
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('run').addEventListener('click', run);
    ['c-android', 'c-ram', 'c-res', 'c-chip'].forEach(function (id) {
      $(id).addEventListener('change', render);
    });
    $('share-copy').addEventListener('click', function () {
      var t = $('share-text');
      t.select();
      try { document.execCommand('copy'); $('share-copy').textContent = 'Copiado!'; } catch (e) { /* o texto já está selecionado */ }
    });
    var wa = $('share-wa');
    wa.addEventListener('click', function () {
      wa.href = 'https://wa.me/?text=' + encodeURIComponent($('share-text').value);
    });
  });

  // Exposto para testes automatizados.
  window.RaioX = { analyse: analyse, GPU_FAMILIES: GPU_FAMILIES, MIN_WEBVIEW: MIN_WEBVIEW };
})();
