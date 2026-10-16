// ─────────────────────────────────────────────────────────────
//  PixCity · compresseur DEFLATE (LZ77 + Huffman fixe) + zlib
//  Écrit à la main : aucune dépendance, et indispensable pour
//  produire des PNG légers sans outil externe.
//  Vérifié par les tests : les fichiers produits sont décompressés
//  par zlib (Node ET Python) pour garantir la conformité.
// ─────────────────────────────────────────────────────────────

const MAX_MATCH = 258;
const MIN_MATCH = 3;
const WINDOW = 32768;
const HASH_BITS = 15;
const HASH_SIZE = 1 << HASH_BITS;
const HASH_MASK = HASH_SIZE - 1;
const MAX_CHAIN = 128;

// ── Tables de codes (RFC 1951) ───────────────────────────────

const LEN_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59,
  67, 83, 99, 115, 131, 163, 195, 227, 258,
];
const LEN_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3,
  4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513,
  769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8,
  9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];

class BitWriter {
  constructor(initial = 1 << 16) {
    this.buf = Buffer.allocUnsafe(initial);
    this.len = 0;
    this.bit = 0;   // bits déjà écrits dans l'octet courant
    this.acc = 0;   // accumulateur
  }
  _byte(b) {
    if (this.len === this.buf.length) {
      const next = Buffer.allocUnsafe(this.buf.length * 2);
      this.buf.copy(next, 0, 0, this.len);
      this.buf = next;
    }
    this.buf[this.len++] = b;
  }
  /** Écrit n bits, poids faible d'abord (extra bits, en-têtes). */
  bits(value, n) {
    this.acc |= (value & ((1 << n) - 1)) << this.bit;
    this.bit += n;
    while (this.bit >= 8) {
      this._byte(this.acc & 255);
      this.acc >>>= 8;
      this.bit -= 8;
    }
  }
  /** Écrit un code de Huffman de n bits, poids FORT d'abord. */
  code(value, n) {
    for (let i = n - 1; i >= 0; i--) this.bits((value >> i) & 1, 1);
  }
  flush() {
    if (this.bit > 0) {
      this._byte(this.acc & 255);
      this.acc = 0;
      this.bit = 0;
    }
    return this.buf.subarray(0, this.len);
  }
}

/** Codes de longueur littérale/distance en Huffman FIXE. */
function fixedLiteral(v) {
  if (v <= 143) return { code: 0x30 + v, bits: 8 };
  if (v <= 255) return { code: 0x190 + (v - 144), bits: 9 };
  if (v <= 279) return { code: v - 256, bits: 7 };
  return { code: 0xC0 + (v - 280), bits: 8 };
}

function lenCode(len) {
  let i = LEN_BASE.length - 1;
  while (i > 0 && LEN_BASE[i] > len) i--;
  return { sym: 257 + i, extra: len - LEN_BASE[i], extraBits: LEN_EXTRA[i] };
}

function distCode(d) {
  let i = DIST_BASE.length - 1;
  while (i > 0 && DIST_BASE[i] > d) i--;
  return { sym: i, extra: d - DIST_BASE[i], extraBits: DIST_EXTRA[i] };
}

/**
 * Compresse un buffer en flux DEFLATE (un seul bloc, Huffman fixe).
 * @param {Uint8Array|Buffer} data
 * @returns {Buffer}
 */
export function deflate(data) {
  const w = new BitWriter(Math.max(1 << 16, data.length >> 1));
  w.bits(1, 1);  // BFINAL = 1
  w.bits(1, 2);  // BTYPE = 01 (Huffman fixe)

  const head = new Int32Array(HASH_SIZE).fill(-1);
  const prev = new Int32Array(data.length);

  const hash = (i) => (((data[i] << 10) ^ (data[i + 1] << 5) ^ data[i + 2]) & HASH_MASK);

  let i = 0;
  const n = data.length;
  while (i < n) {
    let bestLen = 0, bestDist = 0;

    if (i + MIN_MATCH <= n) {
      const h = hash(i);
      let cand = head[h];
      let chain = 0;
      const limit = Math.max(0, i - WINDOW);
      const maxLen = Math.min(MAX_MATCH, n - i);
      // `cand < i` est essentiel : l'insertion paresseuse place dans la
      // chaîne des positions qui peuvent être égales à i, ce qui donnerait
      // une distance 0 (invalide) et un flux corrompu silencieusement.
      while (cand >= limit && cand < i && chain++ < MAX_CHAIN) {
        // comparaison rapide : on commence par la fin de la fenêtre
        let l = 0;
        while (l < maxLen && data[cand + l] === data[i + l]) l++;
        if (l > bestLen) {
          bestLen = l;
          bestDist = i - cand;
          if (l >= maxLen) break;
        }
        cand = prev[cand];
      }
      head[h] = i;
      prev[i] = -1;
      // insertion paresseuse des positions couvertes pour de meilleures chaînes
      if (bestLen >= MIN_MATCH) {
        const end = Math.min(i + bestLen, n - MIN_MATCH);
        for (let k = i + 1; k <= end; k++) {
          const hk = hash(k);
          prev[k] = head[hk];
          head[hk] = k;
        }
      }
    }

    if (bestLen >= MIN_MATCH) {
      const lc = lenCode(bestLen);
      const lit = fixedLiteral(lc.sym);
      w.code(lit.code, lit.bits);
      if (lc.extraBits) w.bits(lc.extra, lc.extraBits);

      const dc = distCode(bestDist);
      w.code(dc.sym, 5);
      if (dc.extraBits) w.bits(dc.extra, dc.extraBits);

      i += bestLen;
    } else {
      const lit = fixedLiteral(data[i]);
      w.code(lit.code, lit.bits);
      i++;
    }
  }

  const end = fixedLiteral(256);
  w.code(end.code, end.bits);
  return Buffer.from(w.flush());
}

function adler32(buf) {
  let a = 1, b = 0;
  const MOD = 65521;
  // traitement par blocs pour éviter les gros entiers
  for (let i = 0; i < buf.length; ) {
    const end = Math.min(i + 5552, buf.length);
    for (; i < end; i++) {
      a += buf[i];
      b += a;
    }
    a %= MOD;
    b %= MOD;
  }
  return ((b << 16) | a) >>> 0;
}

/** Flux zlib complet (en-tête + deflate + Adler-32) */
export function zlibDeflate(data) {
  const body = deflate(data);
  const out = Buffer.allocUnsafe(body.length + 6);
  out[0] = 0x78;
  out[1] = 0x9c;         // niveau par défaut
  body.copy(out, 2);
  out.writeUInt32BE(adler32(data), body.length + 2);
  return out;
}
