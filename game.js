(() => {
  'use strict';
  const SIZE = 8, MAX_HEIGHT = 10, GOAL = 10;
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const homeCanvas = document.getElementById('homeCanvas');
  const hctx = homeCanvas.getContext('2d');
  const nextCanvas = document.getElementById('nextCanvas');
  const nctx = nextCanvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const colors = [
    {name:'Pine planks',top:'#a6c779',left:'#779d58',right:'#5e824b'},
    {name:'River stone',top:'#83b8ad',left:'#558c83',right:'#42746e'},
    {name:'Clay brick',top:'#e7a477',left:'#bd7655',right:'#a65f49'},
    {name:'Golden oak',top:'#e0c278',left:'#b69a50',right:'#987f40'},
    {name:'Wildflower',top:'#c2a8d1',left:'#957aa7',right:'#79628e'}
  ];
  const shapes = [
    {name:'Sprout', cells:[[0,0],[1,0],[0,1],[1,1]], color:0},
    {name:'Creek', cells:[[0,0],[1,0],[2,0],[3,0]], color:1},
    {name:'Fern', cells:[[0,0],[0,1],[1,1],[2,1]], color:2},
    {name:'Moss', cells:[[1,0],[2,0],[0,1],[1,1]], color:3},
    {name:'Clover', cells:[[0,0],[1,0],[1,1],[2,1]], color:4},
    {name:'Acorn', cells:[[0,0],[1,0],[2,0],[1,1]], color:0},
    {name:'Brook', cells:[[0,0],[1,0],[2,0],[2,1]], color:1}
  ];
  const board = Array.from({length:MAX_HEIGHT}, () => Array.from({length:SIZE}, () => Array(SIZE).fill(null)));
  let active=null, next=null, running=false, paused=false, ended=false, score=0, pieces=0, floors=0;
  let lastTime=0, fallTimer=0, softDrop=false, soundOn=true, toastTimer=0, audioCtx=null;
  let dpr=1, dims={};
  const randomShape=()=>{const s=shapes[Math.floor(Math.random()*shapes.length)];return {name:s.name,cells:s.cells.map(p=>p.slice()),color:s.color};};

  function resizeCanvas(el, context) {
    const rect=el.getBoundingClientRect();
    const w=Math.max(1,rect.width), h=Math.max(1,rect.height);
    const ratio=Math.min(window.devicePixelRatio||1,2);
    if(el.width!==Math.round(w*ratio)||el.height!==Math.round(h*ratio)){el.width=Math.round(w*ratio);el.height=Math.round(h*ratio);}
    context.setTransform(ratio,0,0,ratio,0,0);
    return {w,h};
  }
  function setup() {
    const {w,h}=resizeCanvas(canvas,ctx); dpr=Math.min(window.devicePixelRatio||1,2);
    const tile=Math.max(19,Math.min((w-34)/SIZE,(h-40)/(SIZE*.63+MAX_HEIGHT*.56)));
    dims={w,h,tile,th:tile*.48,ch:tile*.57};
    const hd=resizeCanvas(homeCanvas,hctx); drawHome(hd.w,hd.h);
    const nd=resizeCanvas(nextCanvas,nctx); drawNext(nd.w,nd.h);
    render();
  }
  function project(x,z,y,originX,originY,tile,th,ch){return {x:originX+(x-z)*tile/2,y:originY+(x+z)*th/2-y*ch};}
  function diamond(x,y,tile,th,fill,stroke){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+tile/2,y+th/2);ctx.lineTo(x,y+th);ctx.lineTo(x-tile/2,y+th/2);ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
  function cubeAt(context,x,y,tile,th,ch,color,alpha=1){
    context.save();context.globalAlpha=alpha;
    const w=tile, hh=th, high=ch;
    context.beginPath();context.moveTo(x-w/2,y+hh/2);context.lineTo(x,y+hh);context.lineTo(x,y+hh+high);context.lineTo(x-w/2,y+hh/2+high);context.closePath();context.fillStyle=color.left;context.fill();
    context.beginPath();context.moveTo(x,y+hh);context.lineTo(x+w/2,y+hh/2);context.lineTo(x+w/2,y+hh/2+high);context.lineTo(x,y+hh+high);context.closePath();context.fillStyle=color.right;context.fill();
    context.beginPath();context.moveTo(x,y);context.lineTo(x+w/2,y+hh/2);context.lineTo(x,y+hh);context.lineTo(x-w/2,y+hh/2);context.closePath();context.fillStyle=color.top;context.fill();
    context.strokeStyle='rgba(20,39,35,.18)';context.lineWidth=.7;context.stroke();context.restore();
  }
  function render(){
    const {w,h,tile,th,ch}=dims;if(!w)return;
    ctx.clearRect(0,0,w,h);
    const ox=w/2, groundY=h-tile*2.2-10, oy=groundY-(SIZE-1)*th/2;
    // soft forest lights
    const glow=ctx.createRadialGradient(w*.52,h*.43,5,w*.52,h*.43,w*.47);glow.addColorStop(0,'rgba(136,181,137,.09)');glow.addColorStop(1,'rgba(136,181,137,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
    // board shadow and ground diamonds
    const base=project(0,0,0,ox,oy,tile,th,ch);
    ctx.save();ctx.globalAlpha=.18;ctx.fillStyle='#071b1c';ctx.beginPath();ctx.ellipse(ox,groundY+5,tile*4.8,th*4.2,0,0,Math.PI*2);ctx.fill();ctx.restore();
    for(let sum=0;sum<=2*(SIZE-1);sum++)for(let x=0;x<SIZE;x++){const z=sum-x;if(z<0||z>=SIZE)continue;const p=project(x,z,0,ox,oy,tile,th,ch);diamond(p.x,p.y,tile,th,(x+z)%2?'rgba(181,205,163,.10)':'rgba(181,205,163,.065)','rgba(208,225,192,.16)');}
    // subtle perimeter stakes
    const placed=[];for(let y=0;y<MAX_HEIGHT;y++)for(let x=0;x<SIZE;x++)for(let z=0;z<SIZE;z++)if(board[y][x][z])placed.push({x,z,y,color:board[y][x][z]});placed.sort((a,b)=>(a.x+a.z)-(b.x+b.z)||a.y-b.y);for(const cell of placed){const p=project(cell.x,cell.z,cell.y,ox,oy,tile,th,ch);cubeAt(ctx,p.x,p.y,tile,th,ch,cell.color);}
    if(active){
      let ghostY=active.y;while(canPlace(active.x,active.z,ghostY-1,active.cells))ghostY--;
      for(const [dx,dz] of active.cells){const p=project(active.x+dx,active.z+dz,ghostY,ox,oy,tile,th,ch);cubeAt(ctx,p.x,p.y,tile,th,ch,colors[active.color],.20);}
      for(const [dx,dz] of active.cells){const p=project(active.x+dx,active.z+dz,active.y,ox,oy,tile,th,ch);cubeAt(ctx,p.x,p.y,tile,th,ch,colors[active.color]);}
    }
    // floating little firefly pixels
    for(let i=0;i<9;i++){const x=((i*73+19)%Math.max(1,w-30))+15,y=((i*47+31)%Math.max(1,h-90))+35;ctx.fillStyle=i%3?'rgba(195,218,156,.22)':'rgba(225,195,131,.28)';ctx.beginPath();ctx.arc(x,y,1.1,0,Math.PI*2);ctx.fill();}
  }
  function canPlace(x,z,y,cells){if(y<0)return false;for(const [dx,dz] of cells){const xx=x+dx,zz=z+dz;if(xx<0||xx>=SIZE||zz<0||zz>=SIZE||y>=MAX_HEIGHT||board[y][xx][zz])return false;}return true;}
  function spawn(){active=next||randomShape();next=randomShape();active.x=2;active.z=2;active.y=MAX_HEIGHT-1;active.rotation=0;drawNext();$('nextName').textContent=next.name;if(!canPlace(active.x,active.z,active.y,active.cells))finish(false);render();}
  function start(){board.forEach(layer=>layer.forEach(row=>row.fill(null)));score=0;pieces=0;floors=0;running=true;paused=false;ended=false;fallTimer=0;next=randomShape();spawn();$('overlay').classList.add('hidden');$('pauseBtn').disabled=false;$('pauseBtn').innerHTML='<span>Ⅱ</span> Pause';$('statusText').textContent='YOUR BUILD SITE';showToast('Fresh plot. Let’s build!');updateStats();}
  function finish(won){running=false;paused=false;ended=true;$('pauseBtn').disabled=true;$('statusText').textContent=won?'HOME COMPLETE':'PLOT FULL';const card=$('overlay').querySelector('.overlay-card');card.innerHTML=`<span class="overlay-spark">${won?'⌂':'✦'}</span><p class="eyebrow">${won?'A PLACE TO CALL YOURS':'A COZY LITTLE RESET'}</p><h2>${won?'Home, sweet':'Room to'}<br><em>${won?'home.':'grow.'}</em></h2><p>${won?'You built a lovely little place, one piece at a time.':'Your plot is full. Start fresh and see how high you can build.'}</p><button class="primary-button" id="startBtn">${won?'Build another':'Try again'} <span>→</span></button><small>MADE OF LITTLE THINGS.</small>`;document.getElementById('startBtn').addEventListener('click',start);$('overlay').classList.remove('hidden');}
  function lockPiece(){if(!active)return;for(const [dx,dz] of active.cells){const y=active.y,x=active.x+dx,z=active.z+dz;if(y>=MAX_HEIGHT){finish(false);return;}board[y][x][z]=colors[active.color];}pieces+=4;score+=10;playTone(360,.035);let cleared=0;for(let y=0;y<MAX_HEIGHT;y++){let full=true;for(let x=0;x<SIZE&&full;x++)for(let z=0;z<SIZE;z++)if(!board[y][x][z]){full=false;break;}if(full){board.splice(y,1);board.push(Array.from({length:SIZE},()=>Array(SIZE).fill(null)));y--;cleared++;}}
    if(cleared){floors=Math.min(GOAL,floors+cleared);score+=cleared*250+Math.max(0,cleared-1)*150;playTone(620,.12);showToast(cleared>1?`Lovely! ${cleared} floors finished!`:'Floor finished! Your home is growing.');if(floors>=GOAL){updateStats();render();drawHome(resizeCanvas(homeCanvas,hctx).w,homeCanvas.clientHeight);finish(true);return;}}
    updateStats();active=null;spawn();render();drawHome(homeCanvas.clientWidth,homeCanvas.clientHeight);
  }
  function move(dx,dz){if(!running||paused||!active)return;if(canPlace(active.x+dx,active.z+dz,active.y,active.cells)){active.x+=dx;active.z+=dz;playTone(190,.018);render();}}
  function rotate(){if(!running||paused||!active)return;const rotated=active.cells.map(([x,z])=>[z,3-x]);const minX=Math.min(...rotated.map(p=>p[0])),minZ=Math.min(...rotated.map(p=>p[1]));const cells=rotated.map(([x,z])=>[x-minX,z-minZ]);for(const kick of [0,-1,1,-2,2])if(canPlace(active.x+kick,active.z,active.y,cells)){active.x+=kick;active.cells=cells;active.rotation=(active.rotation+1)%4;playTone(250,.04);render();return;}}
  function drop(){if(!running||paused||!active)return;let distance=0;while(canPlace(active.x,active.z,active.y-1,active.cells)){active.y--;distance++;}score+=distance*2;playTone(420,.055);lockPiece();}
  function step(now){if(!running||paused){lastTime=now;requestAnimationFrame(step);return;}const dt=Math.min(100,now-lastTime);lastTime=now;fallTimer+=dt;const speed=Math.max(130,720-floors*48);if(fallTimer>(softDrop?85:speed)){fallTimer=0;if(canPlace(active.x,active.z,active.y-1,active.cells)){active.y--;if(softDrop)score++;}else lockPiece();updateStats();render();}requestAnimationFrame(step);}
  function updateStats(){ $('blocksText').textContent=pieces.toLocaleString();$('floorsText').innerHTML=`${floors}<span> / ${GOAL}</span>`;$('levelText').innerHTML=`${String(Math.min(floors+1,GOAL)).padStart(2,'0')} <i>／</i> ${GOAL}`;$('levelProgress').style.width=`${Math.min(100,floors/GOAL*100)}%`;const total=board.flat(2).filter(Boolean).length, pct=Math.min(100,Math.round((floors*64+total)/(GOAL*64)*100));$('homePercent').textContent=`${pct}%`;$('buildProgress').style.width=`${pct}%`;$('homeStatus').textContent=floors?`${floors} ${floors===1?'floor':'floors'} built — looking good!`:'Waiting for the first floor';}
  function showToast(text){const el=$('toast');el.textContent=text;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),1900);}
  function playTone(freq,duration){if(!soundOn)return;try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(.035,audioCtx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);osc.connect(gain);gain.connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+duration);}catch(_){}}
  function drawNext(){const {w,h}=resizeCanvas(nextCanvas,nctx);nctx.clearRect(0,0,w,h);if(!next)return;const tile=Math.min(17,(w-5)/4,(h-4)/3.2),th=tile*.48,ch=tile*.5;const cells=next.cells;const maxX=Math.max(...cells.map(p=>p[0]))+1,maxZ=Math.max(...cells.map(p=>p[1]))+1;const ox=w/2-(maxX-maxZ)*tile/4,oy=h/2-(maxX+maxZ)*th/4-tile*.35;for(const [x,z] of cells){const p=project(x,z,0,ox,oy,tile,th,ch);cubeAt(nctx,p.x,p.y,tile,th,ch,colors[next.color]);}}
  function drawHome(w,h){if(!w||!h)return;hctx.clearRect(0,0,w,h);const tile=Math.min(19,(w-27)/7,(h-17)/8.6),th=tile*.48,ch=tile*.51;const ox=w/2,oy=h*.71-3*th;hctx.save();hctx.globalAlpha=.2;hctx.fillStyle='#91a97f';hctx.beginPath();hctx.ellipse(ox,oy+3*th,tile*3.6,th*3.1,0,0,Math.PI*2);hctx.fill();hctx.restore();for(let x=0;x<6;x++)for(let z=0;z<6;z++){const p=project(x,z,0,ox,oy,tile,th,ch);diamondH(hctx,p.x,p.y,tile,th,(x+z)%2?'#eaf0e4':'#e4ebdf');}
    const wood={top:'#c8ae77',left:'#9a8056',right:'#826d4b'}, wall={top:'#e8e4d4',left:'#b7b29f',right:'#9c9b8a'}, glass={top:'#92c4bf',left:'#518b83',right:'#3c746f'}, roof={top:'#cf8c69',left:'#a8604d',right:'#8f4c43'};
    const built=Math.min(floors,GOAL), wallH=Math.min(4,Math.floor(built/2)+ (built>0?1:0));
    // foundation and floor frame
    if(built>0){for(let x=1;x<5;x++)for(let z=1;z<5;z++){let p=project(x,z,0,ox,oy,tile,th,ch);cubeAt(hctx,p.x,p.y,tile,th,ch,wood);}}
    // perimeter walls rise as floors are completed; open central door and windows
    for(let y=1;y<=wallH;y++)for(let x=1;x<5;x++)for(let z=1;z<5;z++){if(x!==1&&x!==4&&z!==1&&z!==4)continue;const front=z===4;const door=front&&x===2&&y<=2;const window=(front&&(x===1||x===4)&&y===2)||(x===1&&z===2&&y===2);if(door)continue;const p=project(x,z,y,ox,oy,tile,th,ch);cubeAt(hctx,p.x,p.y,tile,th,ch,window?glass:wall,built?1:.13);}
    // floor markers scaffold the unfinished height
    if(built===0){for(let x=1;x<5;x++)for(const z of [1,4]){const p=project(x,z,0,ox,oy,tile,th,ch);cubeAt(hctx,p.x,p.y,tile,th,ch,wood,.55);}}
    if(built>=GOAL){for(let x=0;x<6;x++)for(let z=0;z<6;z++){if(x===0||x===5||z===0||z===5){const p=project(x,z,wallH+1,ox,oy,tile,th,ch);cubeAt(hctx,p.x,p.y,tile,th,ch,roof);}}for(let x=1;x<5;x++){let p=project(x,1,wallH+1,ox,oy,tile,th,ch);cubeAt(hctx,p.x,p.y,tile,th,ch,roof);}}
    else if(built>=5){for(let x=1;x<5;x++){let p=project(x,1,wallH+1,ox,oy,tile,th,ch);cubeAt(hctx,p.x,p.y,tile,th,ch,wood,.5);}}
  }
  function diamondH(c,x,y,tile,th,fill){c.beginPath();c.moveTo(x,y);c.lineTo(x+tile/2,y+th/2);c.lineTo(x,y+th);c.lineTo(x-tile/2,y+th/2);c.closePath();c.fillStyle=fill;c.fill();c.strokeStyle='#ffffff65';c.lineWidth=.6;c.stroke();}
  function togglePause(){if(!running)return;paused=!paused;$('pauseBtn').innerHTML=paused?'<span>▶</span> Resume':'<span>Ⅱ</span> Pause';$('statusText').textContent=paused?'BUILD PAUSED':'YOUR BUILD SITE';if(paused){$('overlay').querySelector('.overlay-card').innerHTML='<span class="overlay-spark">Ⅱ</span><p class="eyebrow">TAKE YOUR TIME</p><h2>Pause &<br><em>take a breath.</em></h2><p>Your plot is right where you left it.</p><button class="primary-button" id="startBtn">Back to building <span>→</span></button><small>YOUR LITTLE PLACE IS WAITING.</small>';$('overlay').classList.remove('hidden');document.getElementById('startBtn').addEventListener('click',togglePause);}else{$('overlay').classList.add('hidden');}}
  $('startBtn').addEventListener('click',start);$('pauseBtn').addEventListener('click',togglePause);$('restartBtn').addEventListener('click',()=>{if(running||ended)start();else start();});$('soundBtn').addEventListener('click',()=>{soundOn=!soundOn;$('soundBtn').innerHTML=`♫ <span>Sound ${soundOn?'on':'off'}</span>`;if(soundOn)playTone(450,.06);});
  document.querySelectorAll('.touch-btn').forEach(button=>{const action=button.dataset.action;button.addEventListener('pointerdown',e=>{e.preventDefault();if(action==='left')move(-1,0);else if(action==='right')move(1,0);else if(action==='back')move(0,-1);else if(action==='front')move(0,1);else if(action==='rotate')rotate();else if(action==='drop')drop();});});
  window.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','a','d','w','s','q','e'].includes(e.key))e.preventDefault();if(e.key==='ArrowLeft'||e.key==='a')move(-1,0);else if(e.key==='ArrowRight'||e.key==='d')move(1,0);else if(e.key==='ArrowUp'||e.key==='w')move(0,-1);else if(e.key==='ArrowDown')move(0,1);else if(e.key==='s'){softDrop=true;}else if(e.key==='q'||e.key==='e')rotate();else if(e.key===' '){drop();}else if(e.key==='Escape')togglePause();});window.addEventListener('keyup',e=>{if(e.key==='s')softDrop=false;});
  let touchStart=null;canvas.addEventListener('touchstart',e=>{if(e.touches.length===1)touchStart={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});canvas.addEventListener('touchend',e=>{if(!touchStart||!running||paused)return;const t=e.changedTouches[0],dx=t.clientX-touchStart.x,dy=t.clientY-touchStart.y;if(Math.abs(dx)>25){move(dx>0?1:-1,0);}if(dy>35)drop();if(dy< -25)rotate();touchStart=null;},{passive:true});
  window.addEventListener('resize',setup);drawHome(resizeCanvas(homeCanvas,hctx).w,homeCanvas.clientHeight);setup();requestAnimationFrame(step);
})();
