/*
 * Geração do "Pix Copia e Cola" (BR Code estático) conforme o
 * Manual de Padrões para Iniciação do Pix (Banco Central) — formato EMV-MPM.
 */
(function (global) {
  'use strict';

  // Remove acentos e caracteres fora do conjunto aceito pelo BR Code.
  function sanitize(text, max) {
    return String(text || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9 .\-]/g, ' ')
      .replace(/\s+/g, ' ').trim()
      .toUpperCase()
      .slice(0, max);
  }

  function tlv(id, value) {
    const len = String(value.length).padStart(2, '0');
    return id + len + value;
  }

  // CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF).
  function crc16(payload) {
    let crc = 0xffff;
    for (let i = 0; i < payload.length; i++) {
      crc ^= payload.charCodeAt(i) << 8;
      for (let b = 0; b < 8; b++) {
        crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
        crc &= 0xffff;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  function onlyDigits(s) { return String(s || '').replace(/\D/g, ''); }

  function validCPF(cpf) {
    if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
    for (let t = 9; t < 11; t++) {
      let sum = 0;
      for (let i = 0; i < t; i++) sum += Number(cpf[i]) * (t + 1 - i);
      if (((sum * 10) % 11) % 10 !== Number(cpf[t])) return false;
    }
    return true;
  }

  function validCNPJ(cnpj) {
    if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
    const calc = (len) => {
      let sum = 0, pos = len - 7;
      for (let i = 0; i < len; i++) {
        sum += Number(cnpj[i]) * pos--;
        if (pos < 2) pos = 9;
      }
      const r = sum % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
  }

  /*
   * Normaliza a chave conforme o tipo escolhido.
   * Retorna { ok, key, error }.
   */
  function normalizeKey(type, raw) {
    const value = String(raw || '').trim();
    switch (type) {
      case 'cpf': {
        const d = onlyDigits(value);
        return validCPF(d) ? { ok: true, key: d } : { ok: false, error: 'CPF inválido. Confira os números.' };
      }
      case 'cnpj': {
        const d = onlyDigits(value);
        return validCNPJ(d) ? { ok: true, key: d } : { ok: false, error: 'CNPJ inválido. Confira os números.' };
      }
      case 'celular': {
        let d = onlyDigits(value);
        if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
        if (d.length !== 10 && d.length !== 11) {
          return { ok: false, error: 'Celular inválido. Use DDD + número, ex.: (11) 98765-4321.' };
        }
        return { ok: true, key: '+55' + d };
      }
      case 'email': {
        const e = value.toLowerCase();
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 77
          ? { ok: true, key: e }
          : { ok: false, error: 'E-mail inválido.' };
      }
      case 'aleatoria': {
        const k = value.toLowerCase();
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(k)
          ? { ok: true, key: k }
          : { ok: false, error: 'Chave aleatória inválida. Copie e cole do app do banco.' };
      }
      default:
        return { ok: false, error: 'Escolha o tipo da chave.' };
    }
  }

  /*
   * Monta o payload.
   * opts: { key, name, city, amount (número em reais), txid, message }
   */
  function buildPayload(opts) {
    const gui = tlv('00', 'br.gov.bcb.pix');
    const keyField = tlv('01', opts.key);
    const extra = opts.message ? tlv('02', sanitize(opts.message, 40)) : '';
    let merchant = gui + keyField + extra;
    // O campo 26 tem limite de 99 caracteres; se a mensagem estourar, descarta-a.
    if (merchant.length > 99) merchant = gui + keyField;

    const txid = (String(opts.txid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25)) || '***';
    const amount = Number(opts.amount);

    let payload =
      tlv('00', '01') +
      tlv('26', merchant) +
      tlv('52', '0000') +
      tlv('53', '986') +
      (amount > 0 ? tlv('54', amount.toFixed(2)) : '') +
      tlv('58', 'BR') +
      tlv('59', sanitize(opts.name, 25) || 'RECEBEDOR') +
      tlv('60', sanitize(opts.city, 15) || 'BRASIL') +
      tlv('62', tlv('05', txid)) +
      '6304';
    return payload + crc16(payload);
  }

  global.Pix = { buildPayload, normalizeKey, crc16, sanitize };
})(typeof window !== 'undefined' ? window : globalThis);
