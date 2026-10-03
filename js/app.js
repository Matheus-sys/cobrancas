(function () {
  'use strict';

  const STORE_KEY = 'cobrancas.v1';
  const MAX_HISTORY = 30;
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
    'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ================= armazenamento local ================= */
  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORE_KEY));
      if (data && typeof data === 'object') {
        return Object.assign({ config: null, inquilinos: [], historico: [], seq: 0, diaVenc: 10 }, data);
      }
    } catch (e) { /* armazenamento indisponível */ }
    return { config: null, inquilinos: [], historico: [], seq: 0, diaVenc: 10 };
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignora */ }
  }
  const state = load();
  let current = null;   // cobrança exibida no momento
  let editingId = null; // id da cobrança sendo corrigida

  /* ================= utilidades ================= */
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtMoney = (cents) => brl.format(cents / 100);
  const fmtPlain = (cents) => (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtDate = (iso) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
  const mesLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return `${MESES[m - 1]} de ${y}`; };
  const mesCurto = (ym) => { const [y, m] = ym.split('-').map(Number); return `${MESES[m - 1]}/${y}`; };
  const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
  const onlyDigits = (s) => String(s || '').replace(/\D/g, '');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function addMonths(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }
  function dueFor(ym, day) {
    const [y, m] = ym.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return `${y}-${pad(m)}-${pad(Math.min(day, last))}`;
  }
  function thisMonth() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }

  function formatPhone(d) {
    d = onlyDigits(d);
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return d;
  }
  function formatKey(tipo, key) {
    if (tipo === 'cpf') return key.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    if (tipo === 'cnpj') return key.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    if (tipo === 'celular') return formatPhone(key.replace(/^\+55/, ''));
    return key;
  }
  const TIPO_NOME = { cpf: 'CPF', cnpj: 'CNPJ', celular: 'Celular', email: 'E-mail', aleatoria: 'Chave aleatória' };

  let toastTimer;
  function toast(msg, ms = 2800) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  function setError(form, name, msg, input) {
    const el = $(`[data-error="${name}"]`, form);
    if (el) el.textContent = msg || '';
    if (input) input.classList.toggle('invalid', !!msg);
  }
  function focusFirstError(form) {
    const el = $$('.error', form).find((e) => e.textContent);
    if (el) {
      el.closest('.field, .card').scrollIntoView({ behavior: 'smooth', block: 'center' });
      const input = $('.invalid', el.closest('.field, .card'));
      if (input) setTimeout(() => input.focus({ preventScroll: true }), 300);
    }
  }

  /* ================= navegação ================= */
  function show(view) {
    $$('.view').forEach((v) => { v.hidden = v.id !== `view-${view}`; });
    $('#topnav').hidden = !state.config;
    $$('.navbtn').forEach((b) => b.classList.toggle('active', b.dataset.go === view));
    if (view === 'setup') fillSetup();
    if (view === 'history') renderHistory();
    window.scrollTo(0, 0);
  }
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (!go) return;
    if (!state.config) return show('setup');
    if (go.dataset.go === 'form' && !$('#view-result').hidden) resetForm();
    show(go.dataset.go);
  });

  /* ================= meus dados ================= */
  const KEY_UI = {
    celular: { label: 'Seu celular (chave Pix)', mode: 'tel', ph: '(11) 98765-4321', hint: 'Com DDD. Ex.: (11) 98765-4321' },
    cpf: { label: 'Seu CPF (chave Pix)', mode: 'numeric', ph: '000.000.000-00', hint: 'Só os números já servem.' },
    email: { label: 'Seu e-mail (chave Pix)', mode: 'email', ph: 'nome@email.com', hint: '' },
    cnpj: { label: 'Seu CNPJ (chave Pix)', mode: 'numeric', ph: '00.000.000/0000-00', hint: 'Só os números já servem.' },
    aleatoria: { label: 'Sua chave aleatória', mode: 'text', ph: 'Cole aqui', hint: 'Copie do app do banco e cole aqui.' },
  };
  function applyKeyUI(tipo) {
    const ui = KEY_UI[tipo];
    const input = $('#cfg-chave');
    $('#cfg-chave-label').textContent = ui.label;
    input.inputMode = ui.mode;
    input.type = tipo === 'email' ? 'email' : 'text';
    input.placeholder = ui.ph;
    input.autocapitalize = 'off';
    $('#cfg-chave-hint').textContent = ui.hint;
  }
  function fillSetup() {
    const c = state.config;
    if (c) {
      $('#cfg-nome').value = c.nome;
      $('#cfg-chave').value = formatKey(c.tipo, c.chave);
      $('#cfg-cidade').value = c.cidade;
      $(`#cfg-tipo input[value="${c.tipo}"]`).checked = true;
    }
    applyKeyUI($('#cfg-tipo input:checked').value);
  }
  $('#cfg-tipo').addEventListener('change', (e) => {
    applyKeyUI(e.target.value);
    $('#cfg-chave').value = '';
    setError($('#setup-form'), 'chave', '', $('#cfg-chave'));
    $('#cfg-chave').focus();
  });
  $('#setup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const nome = $('#cfg-nome').value.trim();
    const tipo = $('#cfg-tipo input:checked').value;
    const cidade = $('#cfg-cidade').value.trim();
    const key = Pix.normalizeKey(tipo, $('#cfg-chave').value);

    setError(form, 'nome', nome.length >= 3 ? '' : 'Escreva seu nome completo.', $('#cfg-nome'));
    setError(form, 'chave', key.ok ? '' : key.error, $('#cfg-chave'));
    setError(form, 'cidade', cidade.length >= 2 ? '' : 'Escreva sua cidade.', $('#cfg-cidade'));
    if (nome.length < 3 || !key.ok || cidade.length < 2) return focusFirstError(form);

    const first = !state.config;
    state.config = { nome, tipo, chave: key.key, cidade };
    save();
    toast(first ? 'Pronto! Agora é só fazer a cobrança.' : 'Dados salvos.');
    show('form');
  });

  /* ================= formulário da cobrança ================= */
  function buildMonthOptions(selected) {
    const base = thisMonth();
    const opts = [];
    for (let i = -3; i <= 3; i++) opts.push(addMonths(base, i));
    if (selected && !opts.includes(selected)) opts.unshift(selected);
    $('#ref-mes').innerHTML = opts.map((ym) =>
      `<option value="${ym}"${ym === (selected || base) ? ' selected' : ''}>${mesCurto(ym)}</option>`).join('');
  }
  $('#ref-mes').addEventListener('change', (e) => {
    $('#venc').value = dueFor(e.target.value, state.diaVenc || 10);
  });

  function renderTenantList() {
    $('#inq-lista').innerHTML = state.inquilinos
      .map((t) => `<option value="${esc(t.nome)}">${esc(t.unidade || '')}</option>`).join('');
  }
  $('#inq-nome').addEventListener('change', (e) => {
    const t = state.inquilinos.find((x) => x.nome.toLowerCase() === e.target.value.trim().toLowerCase());
    if (t) {
      $('#inq-unidade').value = t.unidade || '';
      $('#inq-whats').value = t.whatsapp ? formatPhone(t.whatsapp) : '';
      // sugere os mesmos itens da última cobrança desse inquilino, se a lista estiver vazia
      const last = state.historico.find((h) => h.inquilino.nome.toLowerCase() === t.nome.toLowerCase());
      if (last && !$$('.item').length) last.itens.forEach((it) => addItem(it.desc, it.cents));
    }
    setError($('#bill-form'), 'inqNome', '', e.target);
  });
  $('#inq-whats').addEventListener('blur', (e) => {
    if (onlyDigits(e.target.value).length >= 10) e.target.value = formatPhone(e.target.value);
  });

  // valor no estilo dos apps de banco: os dígitos entram pela direita (centavos)
  function moneyInput(input) {
    input.addEventListener('input', () => {
      const cents = parseInt(onlyDigits(input.value).slice(0, 9) || '0', 10);
      input.dataset.cents = cents;
      input.value = cents ? fmtPlain(cents) : '';
      input.classList.remove('invalid');
      updateTotal();
    });
  }

  function addItem(desc = '', cents = 0, focusValue = true) {
    const li = document.createElement('li');
    li.className = 'item';
    li.innerHTML = `
      <input class="item-desc" aria-label="Descrição do item" maxlength="40" placeholder="Escreva o que é">
      <button type="button" class="item-remove" aria-label="Remover item">×</button>
      <div class="item-value-wrap">
        <input class="item-value" inputmode="numeric" aria-label="Valor em reais" placeholder="0,00">
      </div>`;
    const d = $('.item-desc', li);
    const v = $('.item-value', li);
    d.value = desc;
    v.dataset.cents = cents;
    v.value = cents ? fmtPlain(cents) : '';
    moneyInput(v);
    $('.item-remove', li).addEventListener('click', () => { li.remove(); updateTotal(); });
    $('#items').appendChild(li);
    updateTotal();
    if (focusValue) (desc ? v : d).focus();
    setError($('#bill-form'), 'itens', '');
  }
  $('#chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) addItem(chip.dataset.item);
  });

  function readItems() {
    return $$('.item').map((li) => ({
      desc: $('.item-desc', li).value.trim(),
      cents: Number($('.item-value', li).dataset.cents) || 0,
      el: li,
    }));
  }
  function updateTotal() {
    const total = readItems().reduce((s, i) => s + i.cents, 0);
    $('#total').textContent = fmtMoney(total);
    $('#items-empty').hidden = $$('.item').length > 0;
  }

  function resetForm(prefill) {
    editingId = null;
    $('#form-title').textContent = 'Nova cobrança';
    $('#bill-form').reset();
    $('#items').innerHTML = '';
    $$('#bill-form .invalid').forEach((el) => el.classList.remove('invalid'));
    $$('#bill-form .error').forEach((el) => { el.textContent = ''; });
    const ym = (prefill && prefill.mesRef) || thisMonth();
    buildMonthOptions(ym);
    $('#venc').value = (prefill && prefill.vencimento) || dueFor(ym, state.diaVenc || 10);
    if (prefill) {
      $('#inq-nome').value = prefill.inquilino.nome;
      $('#inq-unidade').value = prefill.inquilino.unidade || '';
      $('#inq-whats').value = prefill.inquilino.whatsapp ? formatPhone(prefill.inquilino.whatsapp) : '';
      $('#obs').value = prefill.obs || '';
      prefill.itens.forEach((it) => addItem(it.desc, it.cents, false));
    }
    renderTenantList();
    updateTotal();
  }

  $('#bill-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    $$('.error', form).forEach((el) => { el.textContent = ''; });
    $$('.invalid', form).forEach((el) => el.classList.remove('invalid'));

    const nome = $('#inq-nome').value.trim();
    const unidade = $('#inq-unidade').value.trim();
    const whatsapp = onlyDigits($('#inq-whats').value);
    const mesRef = $('#ref-mes').value;
    const vencimento = $('#venc').value;
    const itens = readItems();
    let ok = true;

    if (!nome) { setError(form, 'inqNome', 'Escreva o nome do inquilino.', $('#inq-nome')); ok = false; }
    if (!vencimento) { setError(form, 'venc', 'Escolha a data de vencimento.', $('#venc')); ok = false; }
    if (!itens.length) { setError(form, 'itens', 'Adicione pelo menos um item (ex.: Aluguel).'); ok = false; }
    itens.forEach((it) => {
      if (!it.desc) { $('.item-desc', it.el).classList.add('invalid'); ok = false; }
      if (!it.cents) { $('.item-value', it.el).classList.add('invalid'); ok = false; }
    });
    if (itens.length && itens.some((it) => !it.desc || !it.cents)) {
      setError(form, 'itens', 'Preencha o nome e o valor de cada item.');
    }
    if (!ok) return focusFirstError(form);

    // lembra o inquilino e o dia de vencimento preferido
    const idx = state.inquilinos.findIndex((t) => t.nome.toLowerCase() === nome.toLowerCase());
    const tenant = { nome, unidade, whatsapp: whatsapp.length >= 10 ? whatsapp : '' };
    if (idx >= 0) state.inquilinos.splice(idx, 1);
    state.inquilinos.unshift(tenant);
    state.diaVenc = Number(vencimento.slice(8, 10));

    const prev = editingId ? state.historico.find((h) => h.id === editingId) : null;
    const numero = prev ? prev.numero : ++state.seq;
    const bill = {
      id: prev ? prev.id : `c${Date.now()}`,
      numero,
      inquilino: tenant,
      mesRef,
      vencimento,
      itens: itens.map(({ desc, cents }) => ({ desc, cents })),
      totalCents: itens.reduce((s, i) => s + i.cents, 0),
      obs: $('#obs').value.trim(),
      criadoEm: prev ? prev.criadoEm : new Date().toISOString(),
      recebedor: Object.assign({}, state.config),
    };
    bill.payload = Pix.buildPayload({
      key: bill.recebedor.chave,
      name: bill.recebedor.nome,
      city: bill.recebedor.cidade,
      amount: bill.totalCents / 100,
      txid: `COB${pad(numero, 4)}${mesRef.replace('-', '')}`,
    });

    state.historico = state.historico.filter((h) => h.id !== bill.id);
    state.historico.unshift(bill);
    state.historico = state.historico.slice(0, MAX_HISTORY);
    save();
    openBill(bill);
  });

  /* ================= documento ================= */
  function qrSvg(text) {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }

  function renderDoc(b) {
    const r = b.recebedor;
    const linhas = b.itens.map((it) =>
      `<tr><td>${esc(it.desc)}</td><td>${fmtMoney(it.cents)}</td></tr>`).join('');
    $('#doc').innerHTML = `
      <header class="doc-head">
        <div>
          <span class="doc-kicker">Cobrança</span>
          <h2>${mesLabel(b.mesRef)}</h2>
        </div>
        <div class="doc-num">Nº<strong>${pad(b.numero, 4)}</strong></div>
      </header>
      <div class="doc-body">
        <div class="doc-parties">
          <div>
            <span class="doc-lbl">Pagador</span>
            <strong>${esc(b.inquilino.nome)}</strong>
            ${b.inquilino.unidade ? `<small>${esc(b.inquilino.unidade)}</small>` : ''}
          </div>
          <div>
            <span class="doc-lbl">Recebedor</span>
            <strong>${esc(r.nome)}</strong>
            <small>${esc(r.cidade)}</small>
          </div>
        </div>
        <table class="doc-items">
          <thead><tr><th>Descrição</th><th>Valor</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
        <div class="doc-sum">
          <div class="doc-due"><span class="doc-lbl">Vencimento</span><strong>${fmtDate(b.vencimento)}</strong></div>
          <div class="doc-total"><span class="doc-lbl">Total a pagar</span><strong>${fmtMoney(b.totalCents)}</strong></div>
        </div>
        ${b.obs ? `<p class="doc-obs">${esc(b.obs)}</p>` : ''}
        <div class="doc-cut"><span>Pagamento via Pix</span></div>
      </div>
      <div class="doc-pix">
        <div class="doc-qr">${qrSvg(b.payload)}</div>
        <div>
          <h3>Pague com Pix</h3>
          <ol>
            <li>Abra o app do seu banco</li>
            <li>Vá em <b>Pix</b> › <b>Ler QR Code</b> ou <b>Pix Copia e Cola</b></li>
            <li>Confira o valor e confirme</li>
          </ol>
          <p class="doc-key">Chave Pix (${TIPO_NOME[r.tipo]}): <strong>${esc(formatKey(r.tipo, r.chave))}</strong></p>
        </div>
      </div>
      <div class="doc-code">
        <span class="doc-lbl">Pix Copia e Cola</span>
        <code>${esc(b.payload)}</code>
      </div>
      <footer class="doc-foot">
        <span>Emitido em ${fmtDate(isoDate(new Date(b.criadoEm)))}</span>
        <span>Ref. ${mesCurto(b.mesRef)}</span>
      </footer>`;
  }

  function openBill(b) {
    current = b;
    renderDoc(b);
    show('result');
  }

  /* ================= envio ================= */
  function summaryText(b) {
    const linhas = b.itens.map((it) => `• ${it.desc}: ${fmtMoney(it.cents)}`).join('\n');
    const unidade = b.inquilino.unidade ? ` (${b.inquilino.unidade})` : '';
    return `Olá, ${firstName(b.inquilino.nome)}! Segue a cobrança de ${mesCurto(b.mesRef)}${unidade}:\n\n` +
      `${linhas}\n\n*Total: ${fmtMoney(b.totalCents)}*\nVencimento: ${fmtDate(b.vencimento)}\n\n` +
      `Pagamento por Pix. Em seguida envio o código "Pix Copia e Cola".`;
  }
  function fileName(b) {
    const slug = Pix.sanitize(firstName(b.inquilino.nome), 20).toLowerCase().replace(/\s+/g, '-');
    return `cobranca-${pad(b.numero, 4)}-${slug || 'inquilino'}.png`;
  }

  async function renderImage() {
    const node = $('#doc');
    const opts = { pixelRatio: 3, backgroundColor: '#ffffff', cacheBust: false };
    await document.fonts.ready;
    // Safari às vezes perde fontes/SVG na primeira renderização; a segunda sai completa.
    await htmlToImage.toBlob(node, opts);
    return htmlToImage.toBlob(node, opts);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { /* sem suporte */ }
      ta.remove();
      return ok;
    }
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function withBusy(btn, label, fn) {
    const span = $('span', btn) || btn;
    const old = span.textContent;
    btn.disabled = true;
    span.textContent = label;
    try { await fn(); } finally { btn.disabled = false; span.textContent = old; }
  }

  $('#btn-share-img').addEventListener('click', (e) => withBusy(e.currentTarget, 'Preparando…', async () => {
    const b = current;
    let blob;
    try { blob = await renderImage(); } catch (err) { blob = null; }
    const text = summaryText(b);

    if (blob) {
      const file = new File([blob], fileName(b), { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      }
      // computador ou navegador sem compartilhamento de arquivos
      downloadBlob(blob, fileName(b));
      await copyText(text);
      toast('Imagem salva e mensagem copiada. Abra o WhatsApp e anexe a imagem.', 5000);
      return;
    }
    // sem imagem: envia ao menos o texto
    const phone = b.inquilino.whatsapp;
    window.open(`https://wa.me/${phone ? '55' + phone : ''}?text=${encodeURIComponent(text)}`, '_blank');
  }));

  $('#btn-share-code').addEventListener('click', async () => {
    const b = current;
    const phone = b.inquilino.whatsapp;
    if (phone) {
      window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(b.payload)}`, '_blank');
      return;
    }
    if (navigator.share) {
      try { await navigator.share({ text: b.payload }); return; } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(b.payload)}`, '_blank');
  });

  $('#btn-copy').addEventListener('click', async () => {
    toast((await copyText(current.payload)) ? 'Código Pix copiado!' : 'Não foi possível copiar.');
  });
  $('#btn-download').addEventListener('click', (e) => withBusy(e.currentTarget, 'Salvando…', async () => {
    try {
      downloadBlob(await renderImage(), fileName(current));
      toast('Imagem salva.');
    } catch (err) {
      toast('Não foi possível salvar a imagem.');
    }
  }));
  $('#btn-print').addEventListener('click', () => window.print());

  $('#btn-edit').addEventListener('click', () => {
    resetForm(current);
    editingId = current.id;
    $('#form-title').textContent = `Corrigir cobrança Nº ${pad(current.numero, 4)}`;
    show('form');
  });
  $('#btn-new').addEventListener('click', () => { resetForm(); show('form'); });

  /* ================= histórico ================= */
  function renderHistory() {
    const list = $('#history');
    $('#history-empty').hidden = state.historico.length > 0;
    list.innerHTML = state.historico.map((h) => `
      <li class="hist">
        <div class="hist-top">
          <span class="hist-name">${esc(h.inquilino.nome)}</span>
          <span class="hist-total">${fmtMoney(h.totalCents)}</span>
        </div>
        <p class="hist-meta">Nº ${pad(h.numero, 4)} · ${mesCurto(h.mesRef)}${h.inquilino.unidade ? ' · ' + esc(h.inquilino.unidade) : ''}</p>
        <div class="hist-actions">
          <button type="button" class="btn btn-outline" data-open="${h.id}">Abrir</button>
          <button type="button" class="btn btn-primary" data-repeat="${h.id}">Repetir mês seguinte</button>
        </div>
      </li>`).join('');
  }
  $('#history').addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    const rep = e.target.closest('[data-repeat]');
    const find = (id) => state.historico.find((h) => h.id === id);
    if (open) {
      const b = find(open.dataset.open);
      // a chave pode ter mudado desde então: mantém o documento como foi emitido
      if (b) openBill(b);
    }
    if (rep) {
      const b = find(rep.dataset.repeat);
      if (!b) return;
      const mesRef = addMonths(b.mesRef, 1);
      resetForm({
        inquilino: b.inquilino,
        mesRef,
        vencimento: dueFor(mesRef, Number(b.vencimento.slice(8, 10))),
        itens: b.itens,
        obs: '',
      });
      show('form');
      toast('Confira os valores (luz e água mudam todo mês).', 4000);
    }
  });

  /* ================= início ================= */
  resetForm();
  show(state.config ? 'form' : 'setup');

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
