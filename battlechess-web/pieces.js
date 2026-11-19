/* Original illustrated chess characters. Each SVG owns its paint servers. */
(() => {
  let serial = 0;
  const figures = {
    p: {
      body: `<path class="cape" d="M34 47 22 62 24 92 37 101 67 98 75 88 69 58 61 47Z" fill="url(#cloth)"/><path d="M35 78 31 98 39 106 47 102 49 80M52 80 54 102 63 106 70 100 64 77" fill="url(#dark)"/><path d="m36 52 13-7 17 8 4 25-18 11-20-10Z" fill="url(#metal)"/><path d="m37 56 13 6 15-7-2 19-12 8-13-7Z" fill="url(#light)" opacity=".6"/><path d="M35 59 26 65 23 79 29 83 37 72M65 59l9 7 2 11-7 3-7-10" fill="url(#metal)"/><path d="M39 27q10-10 22 0l3 15-9 10-14-4-5-11Z" fill="url(#dark)"/><path d="M36 32q1-14 14-16 15 1 16 16l-5 2-2-5-20 4Z" fill="url(#metal)"/><path d="m38 34 23-3-3 11-9 5-9-5Z" fill="url(#face)"/><path d="m40 35 17-2M47 30l3-12M43 22l6-3" fill="none" stroke="var(--gleam)" stroke-width="2"/><path class="piece-eyes" d="m42 37 4-1m8-1 3 1" fill="none" stroke="var(--eye)" stroke-width="2"/>`,
      weapon: `<path d="m78 20-1 70" stroke="var(--outline)" stroke-width="5"/><path d="m78 21-1 68" stroke="var(--gleam)" stroke-width="2"/><path d="m78 9 5 12-5 7-5-7Z" fill="url(#light)"/><path d="m16 63 14-6 13 5-2 21-11 11-12-8Z" fill="url(#metal)"/><path d="m20 65 10-4 8 3-1 17-7 7-9-6Z" fill="url(#cloth)"/><path d="m30 64 1 18m-7-9 13-2" fill="none" stroke="var(--gleam)" stroke-width="2"/>`
    },
    r: {
      body: `<path d="m27 66-8 30 11 9 17-3 3-22 5 22 17 3 9-10-9-31Z" fill="url(#dark)"/><path d="m23 43 12-12 32 1 12 14-5 42-24 12-26-13Z" fill="url(#metal)"/><path d="m27 48 22 8 24-10-3 31-20 11-20-10Z" fill="url(#light)" opacity=".55"/><path d="m49 55 1 34M29 67l12 5m17 0 12-6" fill="none" stroke="var(--outline)" stroke-width="2"/><path d="M24 48 12 53 8 73l8 7 12-8 5-18M76 48l12 5 4 20-8 7-12-8-5-18" fill="url(#metal)"/><path d="m11 60 12 5m-12 5 10 5m68-15-12 5m12 5-10 5" fill="none" stroke="var(--gleam)" stroke-width="2"/><path d="M32 17h8v6h6v-6h8v6h6v-6h8v19L60 44H40l-8-8Z" fill="url(#metal)"/><path d="M38 30h24v9l-12 8-12-8Z" fill="url(#face)"/><path class="piece-eyes" d="m41 35 5 1m8 0 5-1" fill="none" stroke="var(--eye)" stroke-width="2.5"/><path d="m40 26 20-1M34 19v7m33-7v7" fill="none" stroke="var(--gleam)" stroke-width="2"/>`,
      weapon: `<path d="M83 74 90 59l6 3-5 18-8 4Z" fill="url(#dark)"/><path d="m85 55 4-11 9 3-2 12-8 5-7-4Z" fill="url(#light)"/><path d="m91 47-2 11m7-7-10 2" stroke="var(--outline)" stroke-width="1.5"/>`
    },
    n: {
      body: `<path d="M21 94 18 74l7-21 8-7-5-15 5-13 8 7 10-4 13 5 2 14-9 8 12 9 8 18-2 20-8 9-8-4-1-17-7-4-9 3-3 19-9 3Z" fill="url(#metal)"/><path d="m27 58 15-11 16 5 9 12-5 15-20 4-17-8Z" fill="url(#light)" opacity=".65"/><path d="m30 33 4-13 7 9 12-4 9 5-1 10-13 9-14-4Z" fill="url(#dark)"/><path d="m33 39 13-6 14-2-1 8-12 7-12-2Z" fill="url(#face)"/><path class="piece-eyes" d="m44 37 4-1" stroke="var(--eye)" stroke-width="3"/><path d="M32 68q13 7 28-1M31 77l-3 17m31-18 7 18" fill="none" stroke="var(--outline)" stroke-width="2"/><path d="m55 48 5-12 13-3 7 9-3 13-9 4Z" fill="url(#cloth)"/><path d="m59 40 3-10 10-3 8 6-1 9-9 5Z" fill="url(#metal)"/><path d="m61 35 16-2-2 9-7 3-6-3Z" fill="url(#face)"/><path class="piece-eyes" d="m67 37 4-1" stroke="var(--eye)" stroke-width="2"/><path d="m60 53 13-3 7 15-9 6-11-8Z" fill="url(#metal)"/>`,
      weapon: `<path d="m73 62 15-21" stroke="var(--outline)" stroke-width="5"/><path d="m73 62 15-21" stroke="var(--gleam)" stroke-width="2"/><path d="m87 42 4-15 5-5-2 18-5 6Z" fill="url(#light)"/><path d="m70 55 12 7" stroke="var(--gleam)" stroke-width="3"/>`
    },
    b: {
      body: `<path d="M38 43 25 58 18 95 32 104 67 104 82 94 73 57 61 43Z" fill="url(#cloth)"/><path d="m45 52 6 5 7-5 5 42-13 9-13-9Z" fill="url(#metal)"/><path d="m31 60-10 14 5 6 12-10M69 60l10 14-5 6-12-10" fill="url(#cloth)"/><path d="M33 35q0-21 17-25 17 4 17 25L62 49l-12 8-12-8Z" fill="url(#dark)"/><path d="M38 35q1-13 12-16 12 3 12 16l-4 12-8 5-8-5Z" fill="url(#face)"/><path d="m34 32 6-12 10-6 10 6 6 12-6-4-10-6-10 6Z" fill="url(#metal)"/><path class="piece-eyes" d="m42 36 4 1m8 0 4-1" fill="none" stroke="var(--eye)" stroke-width="2"/><path d="m50 61 0 22m-7-15 14-1" fill="none" stroke="var(--gleam)" stroke-width="2"/>`,
      weapon: `<path d="m78 23-2 75" stroke="var(--outline)" stroke-width="5"/><path d="m78 23-2 75" stroke="var(--gleam)" stroke-width="2"/><path d="M78 24q-11-1-10-10 1-8 10-8 8 0 8 8 0 5-5 5-4 0-4-4" fill="none" stroke="var(--gleam)" stroke-width="4"/><path d="m72 71 6-3 4 4-3 6-7-1Z" fill="url(#metal)"/>`
    },
    q: {
      body: `<path d="M36 43 23 52 14 96 30 104 71 104 86 94 75 52 64 43Z" fill="url(#dark)"/><path d="m35 50 15-6 15 6 7 44-22 11-23-11Z" fill="url(#cloth)"/><path d="m37 53 13 5 13-5-3 23-10 10-10-10Z" fill="url(#metal)"/><path d="m28 55-10 12 3 8 14-8m37-12 10 12-3 8-14-8" fill="url(#cloth)"/><path d="M37 28q0-14 13-17 13 3 13 17l-3 17-10 8-10-8Z" fill="url(#face)"/><path d="M34 30 31 15l8 5 4-10 7 8 7-8 4 10 8-5-3 15Z" fill="url(#metal)"/><path d="m35 28 31-1m-15-9v8" fill="none" stroke="var(--gleam)" stroke-width="2"/><path class="piece-eyes" d="m42 33 4 1m8 0 4-1" fill="none" stroke="var(--eye)" stroke-width="2"/><path d="m45 39 5 2 5-2M50 62v13" fill="none" stroke="var(--outline)" stroke-width="1.5"/>`,
      weapon: `<path d="m79 22-2 75" stroke="var(--outline)" stroke-width="5"/><path d="m79 22-2 75" stroke="var(--gleam)" stroke-width="2"/><path d="m79 5 8 9-8 10-8-10Z" fill="url(#light)"/><path d="m79 8 1 12m-6-6 10-1" stroke="var(--gleam)" stroke-width="1.5"/><path d="m72 70 7-3 4 4-3 6-7-1Z" fill="url(#metal)"/>`
    },
    k: {
      body: `<path d="M33 47 18 57 20 96 31 104 68 104 80 96 82 57 67 47Z" fill="url(#cloth)"/><path d="m35 78-4 20 10 7 9-5 1-19m4 0 1 19 10 5 9-8-6-19" fill="url(#dark)"/><path d="m31 51 19-8 20 8-2 30-18 11-18-11Z" fill="url(#metal)"/><path d="m35 54 15 6 15-6-2 20-13 9-13-9Z" fill="url(#light)" opacity=".55"/><path d="m31 52-11 3-5 13 11 8 9-11m35-13 11 3 5 13-11 8-9-11" fill="url(#metal)"/><path d="M37 28q1-14 13-17 13 3 13 17l-4 17-9 8-10-8Z" fill="url(#face)"/><path d="M35 28 32 15l8 4 4-9 6 8 6-8 4 9 8-4-3 13Z" fill="url(#metal)"/><path d="m35 27 30-1m-15-8v8" stroke="var(--gleam)" stroke-width="2" fill="none"/><path class="piece-eyes" d="m42 33 4 1m8 0 4-1" fill="none" stroke="var(--eye)" stroke-width="2"/><path d="m44 42 6 3 6-3M50 61v17" stroke="var(--outline)" stroke-width="2" fill="none"/>`,
      weapon: `<path d="m76 62 4-39 5-13 4 13-5 39Z" fill="url(#light)"/><path d="m84 16-4 40" stroke="var(--gleam)" stroke-width="2"/><path d="m71 61 18 3M80 64l-2 13" stroke="var(--outline)" stroke-width="5"/><path d="m71 60 18 3m-9 2-2 11" stroke="var(--gleam)" stroke-width="2"/><path d="m72 71 7-3 4 4-3 6-7-1Z" fill="url(#metal)"/>`
    }
  };
  function svg(pieceChar, { uid, className = '' } = {}) {
    const piece = String(pieceChar || '');
    const figure = figures[piece.toLowerCase()];
    if (!figure) return '';
    const white = piece === piece.toUpperCase();
    const id = `cp-${String(uid ?? ++serial).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const palette = white
      ? { outline:'#352518', dark:'#4e3424', metal:'#ad743c', light:'#f6d590', cloth:'#792f29', face:'#d7a575', gleam:'#ffe2a0', eye:'#392719' }
      : { outline:'#111d25', dark:'#182b37', metal:'#49636b', light:'#a7c6bf', cloth:'#254b4b', face:'#718e87', gleam:'#a2e0d2', eye:'#72f3d4' };
    const defs = ['dark','metal','light','cloth','face'].map((name) => `<linearGradient id="${id}-${name}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${palette[name]}"/><stop offset="1" stop-color="${palette.outline}"/></linearGradient>`).join('');
    const fill = (content) => content.replace(/url\(#(dark|metal|light|cloth|face)\)/g, `url(#${id}-$1)`);
    const safeClass = String(className).replace(/[&<>"']/g, '');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 124" class="chess-piece ${safeClass}" aria-hidden="true" style="--outline:${palette.outline};--gleam:${palette.gleam};--eye:${palette.eye}"><defs>${defs}</defs><ellipse cx="50" cy="112" rx="39" ry="8" fill="#0b1018" opacity=".35"/><path d="M16 105q34-13 68 0v6q-34 13-68 0Z" fill="url(#${id}-dark)" stroke="${palette.outline}" stroke-width="2"/><ellipse cx="50" cy="105" rx="34" ry="7" fill="url(#${id}-metal)" stroke="${palette.outline}" stroke-width="2"/><g stroke="${palette.outline}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><g class="fighter-body">${fill(figure.body)}</g><g class="fighter-weapon">${fill(figure.weapon)}</g></g></svg>`;
  }
  globalThis.ChessPieces = { svg };
})();
