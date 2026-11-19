/* Original 8x8 glyphs: DOS executable DS:4424; Amiga Kickstart 1.3 Topaz/8.
 * Extraction offsets and font provenance: analysis/fonts/README.md. */
globalThis.OriginalMessageBox = (() => {
  'use strict';
  const fonts = {
    dos: 'AAAAAAAAAAAweHgwMAAwAGxsbAAAAAAAbGz+bP5sbAAwfMB4DPgwAADGzBgwZsYAOGw4dtzMdgBgYMAAAAAAABgwYGBgMBgAYDAYGBgwYAAAZjz/PGYAAAAwMPwwMAAAAAAAAAAwMGAAAAD8AAAAAAAAAAAAMDAABgwYMGDAgAB8xs7e9uZ8ADBwMDAwMPwAeMwMOGDM/AB4zAw4DMx4ABw8bMz+DB4A/MD4DAzMeAA4YMD4zMx4APzMDBgwMDAAeMzMeMzMeAB4zMx8DBhwAAAwMAAAMDAAADAwAAAwMGAYMGDAYDAYAAAA/AAA/AAAYDAYDBgwYAB4zAwYMAAwAHzG3t7ewHgAMHjMzPzMzAD8ZmZ8Zmb8ADxmwMDAZjwA+GxmZmZs+AD+Ymh4aGL+AP5iaHhoYPAAPGbAwM5mPgDMzMz8zMzMAHgwMDAwMHgAHgwMDMzMeADmZmx4bGbmAPBgYGBiZv4Axu7+/tbGxgDG5vbezsbGADhsxsbGbDgA/GZmfGBg8AB4zMzM3HgcAPxmZnxsZuYAeMzgcBzMeAD8tDAwMDB4AMzMzMzMzPwAzMzMzMx4MADGxsbW/u7GAMbGbDg4bMYAzMzMeDAweAD+xowYMmb+AAAAAAAAAAAAAAAAAAAAAAAPDwMDDw8AABg8fhgYfjwYAAAAAAAAAP8wMBgAAAAAAAAAeAx8zHYA4GBgfGZm3AAAAHjMwMx4ABwMDHzMzHYAAAB4zPzAeAA4bGDwYGDwAAAAdszMfAz44GBsdmZm5gAwAHAwMDB4AAwADAwMzMx44GBmbHhs5gBwMDAwMDB4AAAAzP7+1sYAAAD4zMzMzAAAAHjMzMx4AAAA3GZmfGDwAAB2zMx8DB4AANx2ZmDwAAAAfMB4DPgAEDB8MDA0GAAAAMzMzMx2AAAAzMzMeDAAAADG1v7+bAAAAMZsOGzGAAAAzMzMfAz4AAD8mDBk/AADmZmDn58P/zMzM4fPz4f/AAAAAAAAAAAfMDAwMDAfAA==',
    amiga: 'AAAAAAAAAAAYPDwYGAAYAGxsAAAAAAAAbGz+bP5sbAAYPmA8BnwYAADGzBgwZsYAOGxodtzMdgAYGDAAAAAAAAwYMDAwGAwAMBgMDAwYMAAAZjz/PGYAAAAYGH4YGAAAAAAAAAAYGDAAAAB+AAAAAAAAAAAAGBgAAwYMGDBgwAA8Zm5+dmY8ABg4GBgYGH4APGYGHDBmfgA8ZgYcBmY8ABw8bMz+DB4AfmB8BgZmPAAcMGB8ZmY8AH5mBgwYGBgAPGZmPGZmPAA8ZmY+Bgw4AAAYGAAAGBgAABgYAAAYGDAMGDBgMBgMAAAAfgAAfgAAMBgMBgwYMAA8ZgYMGAAYAHzG3t7ewHgAGDw8Zn7DwwD8ZmZ8Zmb8ADxmwMDAZjwA+GxmZmZs+AD+ZmB4YGb+AP5mYHhgYPAAPGbAzsZmPgBmZmZ+ZmZmAH4YGBgYGH4ADgYGBmZmPADmZmx4bGbmAPBgYGBiZv4Agsbu/tbGxgDG5vbezsbGADhsxsbGbDgA/GZmfGBg8AA4bMbGxmw8BvxmZnxsZuMAPGZwOA5mPAB+WhgYGBg8AGZmZmZmZj4Aw8NmZjw8GADGxsbW/u7GAMNmPBg8ZsMAw8NmPBgYPAD+xowYMmb+ADwwMDAwMDwAwGAwGAwGAwA8DAwMDAw8ABA4bMYAAAAAAAAAAAAAAP4YGAwAAAAAAAAAPAYeZjsA4GBsdmZmPAAAADxmYGY8AA4GNm5mZjsAAAA8Zn5gPAAcNjB4MDB4AAAAO2ZmPMZ84GBsdmZm5gAYADgYGBg8AAYABgYGBmY84GBmbHhs5gA4GBgYGBg8AAAAZndrY2MAAAB8ZmZmZgAAADxmZmY8AAAA3GZmfGDwAAA9ZmY+BgcAAOx2ZmDwAAAAPmA8BnwACBg+GBgaDAAAAGZmZmY7AAAAZmZmPBgAAABja2s2NgAAAGM2HDZjAAAAZmZmPBhwAAB+TBgyfgAOGBhwGBgOABgYGBgYGBgAcBgYDhgYcABynAAAAAAAAA=='
  };
  for (const key of Object.keys(fonts)) fonts[key] = Uint8Array.from(atob(fonts[key]), c => c.charCodeAt(0));

  function draw(canvas, sprites, state) {
    const amiga = sprites === 'amiga';
    const message = state.winner ? 'Check and mate...Game over.' : {
      stalemate: amiga ? 'Stalemate. How boring!!' : 'Stalemate. How boring!',
      threefold: 'Draw by threefold repetition.',
      'fifty-move': 'Draw by the fifty-move rule.',
      'insufficient-material': 'Draw: insufficient material.'
    }[state.reason];
    const prompt = amiga ? '=Left Button= to continue.' : 'Left Button or <Enter> for New Game.';
    const resume = amiga ? '' : 'Right Button or <Esc> to Resume.';
    const half = Math.floor((Math.max(message.length, amiga ? 26 : 36) + 1) / 2);
    const width = half * 16 + 16, height = amiga ? 41 : 53;
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'), image = context.createImageData(width, height);
    const background = amiga ? [17, 17, 102] : [0, 0, 170];
    const white = amiga ? [238, 221, 221] : [255, 255, 255];
    const yellow = amiga ? [255, 238, 0] : [255, 255, 85];
    const pixel = (x, y, rgb) => image.data.set([...rgb, 255], (y * width + x) * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixel(x, y, background);
    const borders = amiga ? [[102, 0, 68], [153, 0, 102], [187, 17, 119], [238, 34, 119]] : [background, yellow, yellow, yellow];
    borders.forEach((rgb, inset) => {
      for (let x = inset; x < width - inset; x++) { pixel(x, inset, rgb); pixel(x, height - 1 - inset, rgb); }
      for (let y = inset; y < height - inset; y++) { pixel(inset, y, rgb); pixel(width - 1 - inset, y, rgb); }
    });
    function text(value, y, rgb) {
      for (let i = 0; i < value.length; i++) for (let row = 0; row < 8; row++) {
        const bits = fonts[sprites][(value.charCodeAt(i) - 32) * 8 + row];
        for (let col = 0; col < 8; col++) if (bits & (128 >> col)) pixel(8 + i * 8 + col, y + row, rgb);
      }
    }
    text(message, 8, white); text(prompt, 24, yellow);
    if (resume) text(resume, 35, yellow);
    context.putImageData(image, 0, 0);
    return { left: 160 - width / 2, top: 80, width, height, message, prompt, resume };
  }
  return { draw };
})();
