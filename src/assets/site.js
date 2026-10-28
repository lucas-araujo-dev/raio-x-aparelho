// Pix "copia e cola" (BR Code estático, padrão EMV do Banco Central). Sem bibliotecas externas.
(function () {
  var box = document.getElementById('apoie');
  if (!box) return;

  function field(id, value) {
    var len = String(value.length);
    return id + (len.length < 2 ? '0' + len : len) + value;
  }
  function plain(s, max) {
    return (s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s).toUpperCase().slice(0, max);
  }
  function crc16(s) {
    var crc = 0xffff;
    for (var i = 0; i < s.length; i++) {
      crc ^= s.charCodeAt(i) << 8;
      for (var j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return ('0000' + crc.toString(16).toUpperCase()).slice(-4);
  }
  function brcode(key, name, city) {
    var p = field('00', '01') +
      field('26', field('00', 'br.gov.bcb.pix') + field('01', key)) +
      field('52', '0000') + field('53', '986') + field('58', 'BR') +
      field('59', plain(name || 'APOIO', 25)) + field('60', plain(city || 'BRASIL', 15)) +
      field('62', field('05', '***')) + '6304';
    return p + crc16(p);
  }

  var code = brcode(box.getAttribute('data-pix-key'), box.getAttribute('data-pix-name'), box.getAttribute('data-pix-city'));
  var status = box.querySelector('[data-pix-status]');
  box.querySelector('[data-pix-copy]').addEventListener('click', function () {
    function done() { status.textContent = 'Copiado! Cole no app do seu banco em Pix → Copia e cola.'; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done, fallback);
    } else fallback();
    function fallback() {
      var t = document.createElement('textarea');
      t.value = code; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); done(); } catch (e) { status.textContent = code; }
      document.body.removeChild(t);
    }
  });
})();
