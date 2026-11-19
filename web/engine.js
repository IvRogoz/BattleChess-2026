class ChessGame {
  constructor(fen) { this.reset(fen); }
  reset(fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') {
    const p = fen.split(' '); this.board = [];
    for (const c of p[0]) { if (c === '/') continue; if (/\d/.test(c)) this.board.push(...Array(+c).fill(null)); else this.board.push(c); }
    this.turn = p[1]; this.castle = p[2] === '-' ? '' : p[2]; this.ep = p[3] === '-' ? -1 : ChessGame.index(p[3]); this.half = +(p[4] || 0); this.full = +(p[5] || 1); this.history = []; this.states = []; this.positions = [this.key()];
  }
  static index(s) { return (8 - +s[1]) * 8 + s.charCodeAt(0) - 97; }
  static square(i) { return String.fromCharCode(97 + i % 8) + (8 - Math.floor(i / 8)); }
  color(p) { return p === p.toUpperCase() ? 'w' : 'b'; }
  fen() {
    let rows = []; for (let r = 0; r < 8; r++) { let row = '', n = 0; for (let c = 0; c < 8; c++) { const p = this.board[r*8+c]; if (!p) n++; else { if (n) row += n; n = 0; row += p; } } if (n) row += n; rows.push(row); }
    return rows.join('/') + ' ' + this.turn + ' ' + (this.castle || '-') + ' ' + (this.ep < 0 ? '-' : ChessGame.square(this.ep)) + ' ' + this.half + ' ' + this.full;
  }
  key() { const f = this.fen().split(' '); if (this.ep >= 0 && !this.legalMoves().some(m => m.ep)) f[3] = '-'; return f.slice(0,4).join(' '); }
  attacked(s, by) {
    const r = s >> 3, c = s % 8, b = this.board;
    for (let i = 0; i < 64; i++) { const p = b[i]; if (!p || this.color(p) !== by) continue; const pr = i >> 3, pc = i % 8, dr = r-pr, dc = c-pc, t = p.toLowerCase();
      if (t === 'p' && dr === (by === 'w' ? -1 : 1) && Math.abs(dc) === 1) return true;
      if (t === 'n' && ((Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2))) return true;
      if (t === 'k' && Math.max(Math.abs(dr),Math.abs(dc)) === 1) return true;
      if ((t === 'b' || t === 'q' || t === 'r') && ((dr === 0 || dc === 0) && t !== 'b' || Math.abs(dr) === Math.abs(dc) && t !== 'r')) { const sr = Math.sign(dr), sc = Math.sign(dc); let rr = pr+sr, cc = pc+sc, clear = true; while (rr !== r || cc !== c) { if (b[rr*8+cc]) { clear = false; break; } rr += sr; cc += sc; } if (clear) return true; }
    } return false;
  }
  inCheck(color) { const k = this.board.indexOf(color === 'w' ? 'K' : 'k'); return k < 0 || this.attacked(k, color === 'w' ? 'b' : 'w'); }
  pseudo() {
    const moves = [], b = this.board, side = this.turn, enemy = side === 'w' ? 'b' : 'w';
    const add = (from, to, extra = {}) => { const target = b[to]; if (target && (this.color(target) === side || target.toLowerCase() === 'k')) return; moves.push({from,to,...(target ? {captured:target} : {}),...extra}); };
    for (let i=0;i<64;i++) { const p=b[i]; if (!p || this.color(p)!==side) continue; const r=i>>3,c=i%8,t=p.toLowerCase();
      if (t==='p') { const d=side==='w'?-1:1, nr=r+d; const pawnAdd=(to,extra={})=>{ if(nr===0||nr===7) for(const promotion of ['q','r','b','n']) add(i,to,{...extra,promotion}); else add(i,to,extra); };
        if(nr>=0&&nr<8) { const to=nr*8+c; if(!b[to]) { pawnAdd(to); const rr=r+2*d; if(r===(side==='w'?6:1)&&!b[rr*8+c]) add(i,rr*8+c); } for(const dc of [-1,1]) { const cc=c+dc; if(cc<0||cc>7) continue; const dest=nr*8+cc; if(b[dest]&&this.color(b[dest])===enemy) pawnAdd(dest); else if(dest===this.ep && b[r*8+cc]===(side==='w'?'p':'P')) pawnAdd(dest,{ep:true,captured:b[r*8+cc]}); } } continue; }
      if(t==='n'||t==='k') { const dirs=t==='n'?[[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]]:[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]; for(const [dr,dc] of dirs) {const rr=r+dr,cc=c+dc;if(rr>=0&&rr<8&&cc>=0&&cc<8)add(i,rr*8+cc);} }
      else { const dirs=[]; if(t==='r'||t==='q') dirs.push([1,0],[-1,0],[0,1],[0,-1]); if(t==='b'||t==='q') dirs.push([1,1],[1,-1],[-1,1],[-1,-1]); for(const [dr,dc] of dirs) {let rr=r+dr,cc=c+dc;while(rr>=0&&rr<8&&cc>=0&&cc<8){const dest=rr*8+cc;add(i,dest);if(b[dest])break;rr+=dr;cc+=dc;}} }
      if(t==='k' && i===(side==='w'?60:4) && !this.inCheck(side)) { const base=side==='w'?56:0, rights=side==='w'?['K','Q']:['k','q'], rook=side==='w'?'R':'r'; if(this.castle.includes(rights[0])&&b[base+7]===rook&&!b[base+5]&&!b[base+6]&&!this.attacked(base+5,enemy)&&!this.attacked(base+6,enemy)) add(i,base+6,{castle:'k'}); if(this.castle.includes(rights[1])&&b[base]===rook&&!b[base+1]&&!b[base+2]&&!b[base+3]&&!this.attacked(base+3,enemy)&&!this.attacked(base+2,enemy)) add(i,base+2,{castle:'q'}); }
    } return moves;
  }
  apply(m) { const p=this.board[m.from], side=this.turn, captured=m.ep?this.board[m.to+(side==='w'?8:-8)]:this.board[m.to]; this.board[m.from]=null; if(m.ep)this.board[m.to+(side==='w'?8:-8)]=null; this.board[m.to]=m.promotion?(side==='w'?m.promotion.toUpperCase():m.promotion):p;
    if(m.castle) {const base=side==='w'?56:0, a=base+(m.castle==='k'?7:0), z=base+(m.castle==='k'?5:3); this.board[z]=this.board[a];this.board[a]=null;}
    if(p==='K')this.castle=this.castle.replace(/[KQ]/g,''); if(p==='k')this.castle=this.castle.replace(/[kq]/g,''); for(const [sq,right] of [[0,'q'],[7,'k'],[56,'Q'],[63,'K']]) if(m.from===sq||m.to===sq)this.castle=this.castle.replace(right,'');
    this.ep=p.toLowerCase()==='p'&&Math.abs(m.to-m.from)===16?(m.to+m.from)/2:-1; this.half=p.toLowerCase()==='p'||captured?0:this.half+1; if(side==='b')this.full++; this.turn=side==='w'?'b':'w';
  }
  snapshot() {return {board:this.board.slice(),turn:this.turn,castle:this.castle,ep:this.ep,half:this.half,full:this.full};}
  restore(s) {Object.assign(this,s);}
  legalMoves(squareIndex) {const side=this.turn, list=[]; for(const m of this.pseudo()) { if(squareIndex!==undefined&&m.from!==squareIndex)continue; const s=this.snapshot();this.apply(m);const valid=!this.inCheck(side);this.restore(s);if(valid)list.push(m); }return list;}
  move(from,to,promotion='q') { const legal=this.legalMoves(), m=legal.find(x=>x.from===from&&x.to===to&&(!x.promotion||x.promotion===promotion.toLowerCase())); if(!m)return null; const p=this.board[from], captured=m.captured||null, s=this.snapshot(); let san;
    if(m.castle) san=m.castle==='k'?'O-O':'O-O-O'; else {const t=p.toLowerCase(), others=legal.filter(x=>x.to===to&&x.from!==from&&this.board[x.from]?.toLowerCase()===t); let dis=''; if(t!=='p'&&others.length){const file=from%8,rank=from>>3;if(others.every(x=>x.from%8!==file))dis=ChessGame.square(from)[0];else if(others.every(x=>(x.from>>3)!==rank))dis=ChessGame.square(from)[1];else dis=ChessGame.square(from);} san=(t==='p'?(captured?ChessGame.square(from)[0]:''):p.toUpperCase()+dis)+(captured?'x':'')+ChessGame.square(to)+(m.promotion?'='+m.promotion.toUpperCase():''); }
    this.apply(m); if(this.inCheck(this.turn)) san+=this.legalMoves().length?'+':'#'; const record={from,to,piece:p,captured,promotion:m.promotion||null,san}; this.states.push(s);this.history.push(record);this.positions.push(this.key());return record;
  }
  undo() {if(!this.history.length)return null; const record=this.history.pop();this.positions.pop();this.restore(this.states.pop());return record;}
  status() {const check=this.inCheck(this.turn), moves=this.legalMoves();if(!moves.length)return {over:true,check,winner:check?(this.turn==='w'?'b':'w'):null,reason:check?'checkmate':'stalemate'};
    const pieces=this.board.map((p,i)=>p?{p:p.toLowerCase(),i}:null).filter(Boolean), minor=pieces.filter(x=>x.p!=='k'); let reason=null;
    if(!minor.length||minor.length===1&&['b','n'].includes(minor[0].p)||minor.every(x=>x.p==='b')&&minor.every(x=>((x.i>>3)+x.i%8)%2===((minor[0].i>>3)+minor[0].i%8)%2))reason='insufficient-material'; else if(this.half>=100)reason='fifty-move'; else if(this.positions.filter(x=>x===this.positions[this.positions.length-1]).length>=3)reason='threefold';
    return {over:!!reason,check,winner:null,reason}; }
}
globalThis.ChessGame = ChessGame;
