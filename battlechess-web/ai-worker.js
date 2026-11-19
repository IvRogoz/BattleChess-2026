'use strict';
importScripts('engine.js', 'ai.js');
onmessage = function (event) {
  const { id, fen, depth } = event.data;
  try {
    postMessage({ id, move: chooseChessMove(fen, { depth, timeMs: 800 }) });
  } catch (error) {
    postMessage({ id, move: null, error: String(error && error.message || error) });
  }
};
