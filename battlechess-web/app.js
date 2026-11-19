(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const names = {p:'Pawn',n:'Knight',b:'Bishop',r:'Rook',q:'Queen',k:'King'};
  const armies = {w:'The Royal Guard',b:'The Obsidian Court'};
  const levels = {1:'SQUIRE',2:'TACTICIAN',3:'WARLORD'};
  const storageKey = 'kings-table-match-v1';
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let game = new ChessGame();
  let settings = {mode:'ai',human:'w',depth:2,battles:!reducedMotion,sound:false};
  let flipped = false, selected = null, legal = [], busy = false, thinking = false, session = 0;
  let buttons = [], focusSquare = 52, movingTo = null, worker = null, aiTimer = null;
  let duelFinish = null, promotionFinish = null, lastBattle = null, audio = null, renderNumber = 0;
  let storageWarning = false;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const color = p => p === p.toUpperCase() ? 'w' : 'b';
  const squareName = i => ChessGame.square(i);
  const other = side => side === 'w' ? 'b' : 'w';
  const svg = (piece, uid) => ChessPieces.svg(piece,{uid});

  function save() {
    try {
      localStorage.setItem(storageKey,JSON.stringify({version:1,settings,flipped,
        moves:game.history.map(m=>[m.from,m.to,m.promotion||'q'])}));
    } catch (_) {
      storageWarning = true;
      byId('gameStatus').textContent = 'Browser storage is unavailable. This match will not be saved.';
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.version !== 1 || !Array.isArray(saved.moves) || saved.moves.length > 2000) return;
      const restored = new ChessGame();
      for (const move of saved.moves) {
        if (!Array.isArray(move) || !Number.isInteger(move[0]) || !Number.isInteger(move[1]) ||
          !restored.move(move[0],move[1],String(move[2]||'q'))) throw Error('Invalid saved move');
      }
      const s = saved.settings || {};
      settings = {mode:s.mode==='local'?'local':'ai',human:s.human==='b'?'b':'w',
        depth:[1,2,3].includes(s.depth)?s.depth:2,battles:!!s.battles&&!reducedMotion,sound:!!s.sound};
      game = restored;
      flipped = !!saved.flipped;
      lastBattle = [...game.history].reverse().find(m=>m.captured) || null;
    } catch (_) { /* A corrupt or unavailable save must not prevent playing a new match. */ }
  }

  function statusText(state) {
    if (state.reason==='checkmate') return `${armies[state.winner]} wins by checkmate.`;
    const draw = {'stalemate':'Stalemate','insufficient-material':'Insufficient material',
      'threefold':'Threefold repetition','fifty-move':'Fifty-move rule'};
    if (state.over) return `Draw · ${draw[state.reason] || 'The battle ends'}.`;
    if (thinking) return 'The court is planning its next move…';
    if (busy) return 'Your pieces are taking the field…';
    if (state.check) return `${game.turn==='w'?'White':'Black'} is in check. Protect your king.`;
    if (selected !== null) return `${names[game.board[selected].toLowerCase()]} on ${squareName(selected)} · choose a highlighted square.`;
    if (storageWarning) return 'Browser storage is unavailable. This match will not be saved.';
    return settings.mode==='local'?`${game.turn==='w'?'White':'Black'} to move. Select a piece.`:'Select a piece to command your army.';
  }

  function renderArmies() {
    const friendly = settings.mode==='local'?'w':settings.human;
    const enemy = other(friendly);
    byId('enemyPortrait').innerHTML = svg(enemy==='w'?'K':'k','enemy-portrait');
    byId('friendlyPortrait').innerHTML = svg(friendly==='w'?'K':'k','friendly-portrait');
    byId('enemyName').textContent = armies[enemy];
    byId('friendlyName').textContent = armies[friendly];
    byId('friendlyRole').textContent = settings.mode==='local'?'THE WHITE ARMY':'YOUR ARMY';
    byId('opponentBadge').textContent = settings.mode==='ai'?`COMPUTER · ${levels[settings.depth]}`:'PLAYER TWO · BLACK';
    byId('playerBadge').textContent = `${settings.mode==='ai'?'YOU':'PLAYER ONE'} · ${friendly==='w'?'WHITE':'BLACK'} PIECES`;
    byId('opponentDescription').textContent = settings.mode==='ai'?'A calculating foe. An unforgiving board.':'A worthy rival, across the table.';
    byId('enemyFallenLabel').textContent = `FALLEN ${friendly==='w'?'ROYAL GUARD':'OBSIDIAN COURT'}`;
    byId('friendlyFallenLabel').textContent = `FALLEN ${enemy==='w'?'ROYAL GUARD':'OBSIDIAN COURT'}`;
    for (const [id,side] of [['capturedWhite',friendly],['capturedBlack',enemy]]) {
      const captured = game.history.filter(m=>m.captured&&color(m.captured)===side).map(m=>m.captured);
      byId(id).innerHTML = captured.length?captured.map((p,i)=>`<span class="captured-piece" title="${names[p.toLowerCase()]}">${svg(p,`${id}-${i}`)}</span>`).join(''):'<span class="empty-captures">No pieces fallen</span>';
      byId(id).setAttribute('aria-label',`Captured ${side==='w'?'white':'black'} pieces: ${captured.length}`);
    }
  }

  function renderHistory() {
    const history = byId('moveHistory');
    history.replaceChildren();
    for (let i=0;i<game.history.length;i+=2) {
      const row = document.createElement('div');row.className='history-row';
      for (const [text,last] of [[`${i/2+1}.`,false],[game.history[i].san,i===game.history.length-1],
        [game.history[i+1]?.san||'—',i+1===game.history.length-1]]) {
        const cell=document.createElement('span');cell.textContent=text;
        if(last)cell.className='latest';row.appendChild(cell);
      }
      history.appendChild(row);
    }
    history.hidden = !game.history.length;
    byId('historyEmpty').hidden = !!game.history.length;
    byId('moveCount').textContent=`${game.history.length} ${game.history.length===1?'MOVE':'MOVES'}`;
    history.scrollTop=history.scrollHeight;
    byId('lastClash').textContent=lastBattle?`${names[lastBattle.piece.toLowerCase()]} defeated ${names[lastBattle.captured.toLowerCase()].toLowerCase()} on ${squareName(lastBattle.to)}.`:'When pieces meet, legends are made.';
    byId('replayButton').hidden=!lastBattle;
  }

  function render() {
    const previousFocus=document.activeElement?.dataset?.index;
    const state=game.status();
    const last=game.history[game.history.length-1];
    const board=byId('board');board.replaceChildren();buttons=[];renderNumber++;
    for(let row=0;row<8;row++) {
      const rowElement=document.createElement('div');rowElement.setAttribute('role','row');rowElement.style.display='contents';
      for(let col=0;col<8;col++) {
        const display=row*8+col,index=flipped?63-display:display,piece=game.board[index];
        const button=document.createElement('button');button.type='button';button.className='square';button.dataset.index=String(index);
        button.setAttribute('role','gridcell');button.setAttribute('aria-rowindex',String(row+1));button.setAttribute('aria-colindex',String(col+1));
        button.classList.toggle('dark',((index>>3)+index%8)%2===1);
        button.classList.toggle('selected',index===selected);
        button.classList.toggle('last-move',!!last&&(last.from===index||last.to===index));
        const moves=legal.filter(m=>m.to===index);
        button.classList.toggle('legal',!!moves.length);
        button.classList.toggle('capture',moves.some(m=>m.captured));
        button.classList.toggle('in-check',state.check&&piece===(game.turn==='w'?'K':'k'));
        button.classList.toggle('moving-to',index===movingTo);
        button.setAttribute('aria-label',`${squareName(index)}${piece?', '+(color(piece)==='w'?'white ':'black ')+names[piece.toLowerCase()]:' empty'}${moves.length?', legal destination':''}`);
        button.setAttribute('aria-selected',String(index===selected));
        button.setAttribute('aria-disabled',String(busy||state.over));
        button.tabIndex=index===focusSquare?0:-1;
        button.style.zIndex=String(row+1+(index===selected?20:0));
        if(piece)button.innerHTML=`<span class="board-piece">${svg(piece,`board-${renderNumber}-${index}`)}</span>`;
        button.addEventListener('click',()=>onSquare(index).catch(recoverMove));
        button.addEventListener('keydown',event=>onBoardKey(event,index));
        buttons.push(button);rowElement.appendChild(button);
      }
      board.appendChild(rowElement);
    }
    byId('rankLabels').innerHTML=Array.from({length:8},(_,i)=>`<span>${flipped?i+1:8-i}</span>`).join('');
    byId('fileLabels').innerHTML=(flipped?'hgfedcba':'abcdefgh').split('').map(f=>`<span>${f}</span>`).join('');
    const turn=state.over?(state.winner?'Checkmate':'Draw'):thinking?'The court is thinking…':`${game.turn==='w'?'White':'Black'} to move`;
    byId('turnLabel').textContent=turn;
    byId('gameStatus').textContent=statusText(state);
    byId('modeLabel').textContent=settings.mode==='ai'?'SOLO CAMPAIGN':'LOCAL TWO PLAYER';
    byId('chronicleStatus').textContent=state.over?'The battle is over.':thinking?'Considering the battlefield…':settings.mode==='local'?`${game.turn==='w'?'White':'Black'} has the command.`:'Your move, commander.';
    byId('turnRing').classList.toggle('thinking',thinking);
    byId('undoButton').disabled=!game.history.length;
    byId('flipButton').disabled=busy;
    byId('replayButton').disabled=busy;
    byId('soundLabel').textContent=settings.sound?'Sound on':'Sound off';
    byId('soundButton').setAttribute('aria-pressed',String(settings.sound));
    byId('soundButton').title=settings.sound?'Mute battle sounds':'Enable battle sounds';
    byId('soundWaves').setAttribute('d',settings.sound?'M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14':'m16 9 6 6m0-6-6 6');
    renderArmies();renderHistory();
    if(previousFocus!==undefined)buttons.find(b=>b.dataset.index===previousFocus)?.focus({preventScroll:true});
  }

  function onBoardKey(event,index) {
    const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-8,ArrowDown:8}[event.key];
    if(delta!==undefined) {
      event.preventDefault();const display=flipped?63-index:index;
      const next=display+delta;
      if(next<0||next>63||(Math.abs(delta)===1&&(next>>3)!==(display>>3)))return;
      focusSquare=flipped?63-next:next;
      buttons.forEach(b=>b.tabIndex=Number(b.dataset.index)===focusSquare?0:-1);
      buttons.find(b=>Number(b.dataset.index)===focusSquare)?.focus({preventScroll:true});
    } else if(event.key==='Escape') {selected=null;legal=[];render();}
  }

  async function onSquare(index) {
    if(busy||game.status().over||(settings.mode==='ai'&&game.turn!==settings.human))return;
    focusSquare=index;
    if(selected!==null) {
      const destinations=legal.filter(m=>m.to===index);
      if(destinations.length) {
        let promotion='q';
        if(destinations.some(m=>m.promotion)) {
          const promotionSession=session;
          busy=true;render();promotion=await choosePromotion(game.turn);
          if(promotionSession!==session)return;
          busy=false;
          if(!promotion){selected=null;legal=[];render();return;}
        }
        await playMove({from:selected,to:index,promotion});return;
      }
    }
    if(index===selected){selected=null;legal=[];}
    else if(game.board[index]&&color(game.board[index])===game.turn){selected=index;legal=game.legalMoves(index);}
    else{selected=null;legal=[];}
    render();
  }

  function choosePromotion(side) {
    return new Promise(resolve=>{
      const dialog=byId('promotionDialog'),choices=byId('promotionChoices');choices.replaceChildren();
      promotionFinish=value=>{if(!promotionFinish)return;promotionFinish=null;dialog.close();resolve(value);};
      for(const type of ['q','r','b','n']) {
        const button=document.createElement('button');button.type='button';button.setAttribute('aria-label',`Promote to ${names[type]}`);
        button.innerHTML=svg(side==='w'?type.toUpperCase():type,`promotion-${type}`)+`<span>${names[type]}</span>`;
        button.addEventListener('click',()=>promotionFinish?.(type));choices.appendChild(button);
      }
      dialog.showModal();
    });
  }

  function tone(kind) {
    if(!settings.sound)return;
    try {
      const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;
      if(!audio)audio=new Context();
      if(audio.state==='suspended')audio.resume().catch(()=>{});
      const now=audio.currentTime;
      for(const [delay,frequency,duration] of kind==='capture'?[[0,170,.15],[.08,95,.27],[.18,54,.3]]:[[0,310,.045],[.035,160,.08]]) {
        const osc=audio.createOscillator(),gain=audio.createGain();osc.type=kind==='capture'?'triangle':'sine';
        osc.frequency.setValueAtTime(frequency,now+delay);osc.frequency.exponentialRampToValueAtTime(Math.max(30,frequency*.55),now+delay+duration);
        gain.gain.setValueAtTime(.0001,now+delay);gain.gain.exponentialRampToValueAtTime(.09,now+delay+.008);gain.gain.exponentialRampToValueAtTime(.0001,now+delay+duration);
        osc.connect(gain);gain.connect(audio.destination);osc.start(now+delay);osc.stop(now+delay+duration);
      }
    } catch (_) { /* Sound is optional, and restricted audio must not interrupt a move. */ }
  }

  function showBattle(record) {
    if(!settings.battles||reducedMotion)return Promise.resolve();
    return new Promise(resolve=>{
      const dialog=byId('duelDialog');
      byId('duelTitle').textContent=`${names[record.piece.toLowerCase()]} takes ${names[record.captured.toLowerCase()].toLowerCase()}.`;
      byId('duelDescription').textContent=`${squareName(record.from)} to ${squareName(record.to)} · ${armies[color(record.piece)]}`;
      byId('duelAttacker').innerHTML=svg(record.piece,`duel-attacker-${session}`);
      byId('duelDefender').innerHTML=svg(record.captured,`duel-defender-${session}`);
      byId('duelArena').className=`duel-arena attack-${record.piece.toLowerCase()}`;
      byId('duelResult').textContent=`${names[record.piece.toLowerCase()]} claims ${squareName(record.to)}.`;
      let timer;
      duelFinish=()=>{if(!duelFinish)return;duelFinish=null;clearTimeout(timer);dialog.close();resolve();};
      dialog.showModal();timer=setTimeout(()=>duelFinish?.(),1600);
    });
  }

  async function walk(record,token) {
    if(reducedMotion)return;
    const layer=byId('moveLayer'),ghost=document.createElement('div');
    const position=index=>{const d=flipped?63-index:index;return{left:`${d%8*12.5}%`,top:`${(d>>3)*12.5}%`};};
    ghost.className='moving-piece';ghost.innerHTML=svg(record.piece,`walk-${token}-${game.history.length}`);
    Object.assign(ghost.style,position(record.from));layer.appendChild(ghost);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    Object.assign(ghost.style,position(record.to));await sleep(350);ghost.remove();
  }

  async function playMove(move) {
    const candidate=game.legalMoves(move.from).find(m=>m.to===move.to&&(!m.promotion||m.promotion===(move.promotion||'q')));
    if(!candidate)return false;
    const token=session,piece=game.board[move.from];busy=true;thinking=false;selected=null;legal=[];
    const preview={...candidate,piece};
    render();
    if(candidate.captured){tone('capture');await showBattle(preview);}
    if(token!==session)return false;
    const record=game.move(move.from,move.to,move.promotion||'q');
    if(!record){busy=false;render();return false;}
    if(record.captured)lastBattle=record;
    if(!record.captured)tone('move');
    movingTo=reducedMotion?null:record.to;
    render();save();await walk(record,token);
    if(token!==session)return false;
    movingTo=null;busy=false;render();scheduleAI();return true;
  }

  function scheduleAI() {
    if(busy||settings.mode!=='ai'||game.turn===settings.human||game.status().over)return;
    const token=session,fen=game.fen();busy=true;thinking=true;render();
    aiTimer=setTimeout(()=>{
      aiTimer=null;if(token!==session)return;
      const receive=move=>{
        if(token!==session||fen!==game.fen())return;
        if(worker){worker.terminate();worker=null;}
        thinking=false;
        if(move)playMove(move).catch(recoverMove);
        else{busy=false;render();}
      };
      const fallback=()=>{
        if(token!==session)return;
        try{receive(chooseChessMove(fen,{depth:Math.min(2,settings.depth),timeMs:180}));}
        catch(error){busy=false;thinking=false;render();byId('gameStatus').textContent='The computer could not move. Undo the turn or start a new battle.';}
      };
      try {
        if(typeof Worker==='undefined'){fallback();return;}
        worker=new Worker('ai-worker.js');
        worker.onmessage=event=>{
          if(token!==session||event.data.id!==token)return;
          if(event.data.error){worker.terminate();worker=null;fallback();}else receive(event.data.move);
        };
        worker.onerror=()=>{if(worker){worker.terminate();worker=null;}fallback();};
        worker.postMessage({id:token,fen,depth:settings.depth});
      } catch(_){fallback();}
    },280);
  }

  function recoverMove(error) {
    busy=false;thinking=false;movingTo=null;render();
    byId('gameStatus').textContent='That move was interrupted. Take back the turn to try again.';
    console.error(error);
  }

  function cancelPending() {
    session++;if(aiTimer!==null)clearTimeout(aiTimer);aiTimer=null;
    if(worker){worker.terminate();worker=null;}
    duelFinish?.();promotionFinish?.(null);
    byId('moveLayer').replaceChildren();busy=false;thinking=false;movingTo=null;selected=null;legal=[];
  }

  function newGame(options) {
    cancelPending();settings={...settings,...options};
    settings.mode=settings.mode==='local'?'local':'ai';settings.human=settings.human==='b'?'b':'w';
    settings.depth=[1,2,3].includes(Number(settings.depth))?Number(settings.depth):2;
    settings.battles=!!settings.battles&&!reducedMotion;
    game=new ChessGame();flipped=settings.mode==='ai'&&settings.human==='b';lastBattle=null;focusSquare=flipped?12:52;
    save();render();scheduleAI();
  }

  function undo() {
    if(!game.history.length)return;
    const count=settings.mode==='local'?1:(game.turn===settings.human?Math.min(2,game.history.length):1);
    cancelPending();for(let i=0;i<count;i++)game.undo();
    lastBattle=[...game.history].reverse().find(m=>m.captured)||null;
    save();render();scheduleAI();
  }

  byId('newGameButton').addEventListener('click',()=>{
    cancelPending();render();
    byId('gameMode').value=settings.mode;byId('playerSide').value=settings.human;
    byId('difficulty').value=String(settings.depth);byId('battleAnimations').checked=settings.battles;
    byId('computerOptions').hidden=settings.mode==='local';byId('setupDialog').showModal();
  });
  byId('gameMode').addEventListener('change',()=>byId('computerOptions').hidden=byId('gameMode').value==='local');
  byId('setupForm').addEventListener('submit',event=>{
    event.preventDefault();byId('setupDialog').close();
    newGame({mode:byId('gameMode').value,human:byId('playerSide').value,depth:Number(byId('difficulty').value),battles:byId('battleAnimations').checked});
  });
  byId('closeSetup').addEventListener('click',()=>{byId('setupDialog').close();scheduleAI();});
  byId('setupDialog').addEventListener('cancel',()=>scheduleAI());
  byId('rulesButton').addEventListener('click',()=>byId('rulesDialog').showModal());
  byId('closeRules').addEventListener('click',()=>byId('rulesDialog').close());
  byId('soundButton').addEventListener('click',()=>{settings.sound=!settings.sound;save();render();if(settings.sound)tone('move');});
  byId('undoButton').addEventListener('click',undo);
  byId('flipButton').addEventListener('click',()=>{if(busy)return;flipped=!flipped;save();render();});
  byId('skipBattle').addEventListener('click',()=>duelFinish?.());
  byId('duelDialog').addEventListener('cancel',event=>{event.preventDefault();duelFinish?.();});
  byId('cancelPromotion').addEventListener('click',()=>promotionFinish?.(null));
  byId('promotionDialog').addEventListener('cancel',event=>{event.preventDefault();promotionFinish?.(null);});
  byId('replayButton').addEventListener('click',async()=>{
    if(busy||!lastBattle)return;const token=session;busy=true;render();
    await showBattle(lastBattle);if(token===session){busy=false;render();}
  });

  // Small public control surface is also exercised by the non-browser regression harness.
  window.BattleChessApp={newGame,undo,select:onSquare,
    snapshot:()=>({fen:game.fen(),turn:game.turn,history:game.history.slice(),selected,busy,thinking,flipped,settings:{...settings}})};
  load();render();scheduleAI();
})();
