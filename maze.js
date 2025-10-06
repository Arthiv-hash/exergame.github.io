// ------------------ CONFIG ------------------
const HOLD_MS = 3000;        // required continuous hold (player)
const PLAYER_COOLDOWN = 3000; // ensure at least this gap between player moves
const ENEMY_DELAY = 3000;     // enemy moves ENEMY_DELAY after player move
const FPS = 60;

// ------------------ DOM ------------------
const gameCanvas = document.getElementById('gameCanvas');
const overlayCanvas = document.getElementById('overlayCanvas');
const overlayCtx = overlayCanvas.getContext('2d');
const ctx = gameCanvas.getContext('2d');
const videoEl = document.getElementById('input_video');
const statusEl = document.getElementById('status');
const introEl = document.getElementById('intro');

let canvasW = 800, canvasH = 600;
const MAZE_COLS = 20, MAZE_ROWS = 11;
let tileSize = 40;

// responsive sizing - fits the entire maze centered
function resizeAll() {
  const wrap = document.getElementById('gameWrap');
  const r = wrap.getBoundingClientRect();
  canvasW = r.width; canvasH = r.height;
  gameCanvas.width = canvasW; gameCanvas.height = canvasH;
  overlayCanvas.width = canvasW; overlayCanvas.height = canvasH;
  tileSize = Math.floor(Math.min(canvasW / MAZE_COLS, canvasH / MAZE_ROWS));
  // ensure tileSize at least 16
  if (tileSize < 12) tileSize = 12;
}
window.addEventListener('resize', resizeAll);
resizeAll();

// ------------------ Maze and state ------------------
// Move goal to bottom right
let maze = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,2,0,0,0,1,0,5,0,4,0,1,0,4,0,0,0,0,0,1], // <-- removed goal from here
  [1,0,1,1,0,1,0,1,1,1,0,1,0,1,0,1,1,0,1,1],
  [1,0,0,1,0,0,0,0,4,0,5,0,0,1,0,0,0,0,0,1],
  [1,1,0,1,1,1,0,1,1,1,1,0,1,1,0,1,1,1,0,1],
  [1,0,0,0,4,0,0,0,0,1,0,0,0,0,0,4,0,0,0,1],
  [1,0,1,1,1,1,1,1,0,1,0,1,1,1,1,1,0,1,0,1],
  [1,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,1,0,1],
  [1,1,1,1,1,1,0,1,1,1,0,1,0,1,1,1,1,1,0,1],
  [1,4,0,0,0,0,0,0,0,4,0,0,0,4,0,0,5,0,4,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3,1] // <-- goal at bottom right
];

// locate start
let player = {x:1, y:1, facing:'RIGHT'};
let enemy = {x:18, y:1};
let startPos = {x:1, y:1};

for (let r=0;r<MAZE_ROWS;r++){
  for (let c=0;c<MAZE_COLS;c++){
    if (maze[r][c] === 2){ startPos = {x:c,y:r}; player.x=c; player.y=r; maze[r][c]=0; }
  }
}

let score = 0, lives = 3, timerSeconds = 0;
let gameRunning = false;

// ------------------ Gesture detection state ------------------
let currentGesture = 'NONE';
let gestureStart = 0;
let gestureAllowed = true; // prevents repeating while holding (release required)
let lastPlayerMoveTime = 0;
let lastPlayerAction = null;

// ------------------ Pathfinding (A* with cost) ------------------
// cost map: walls(1) => impassable (skip), destructible(5) => high cost (100), path/coin/goal => 1
function tileCost(r,c){
  const t = maze[r][c];
  if (t === 1) return Infinity;   // impassable
  if (t === 5) return 100;        // destructible - enemy avoids unless no alternative
  return 1;
}

function neighbors(node){
  const dirs = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
  const out = [];
  for (const d of dirs){
    const nx = node.x + d.x, ny = node.y + d.y;
    if (ny<0||ny>=MAZE_ROWS||nx<0||nx>=MAZE_COLS) continue;
    if (maze[ny][nx] === 1) continue; // do not step on solid bricks
    out.push({x:nx,y:ny});
  }
  return out;
}

function heuristic(a,b){
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// A* that prefers low-cost tiles (prefers avoid destructible)
function findPathAStar(sx,sy,tx,ty){
  const key = (n)=>`${n.x},${n.y}`;
  const open = new Map();
  const cameFrom = new Map();
  const gScore = new Map();
  const fScore = new Map();

  function setG(n, val){ gScore.set(key(n), val); }
  function getG(n){ return gScore.get(key(n)) ?? Infinity; }
  function setF(n, val){ fScore.set(key(n), val); }
  function getF(n){ return fScore.get(key(n)) ?? Infinity; }

  const start = {x:sx,y:sy};
  setG(start, 0);
  setF(start, heuristic(start, {x:tx,y:ty}));
  open.set(key(start), start);

  while (open.size){
    // pick node in open with lowest fScore
    let currentKey = null, current = null, bestF = Infinity;
    for (const [k,n] of open.entries()){
      const f = getF(n);
      if (f < bestF){ bestF = f; currentKey = k; current = n; }
    }
    if (!current) break;
    if (current.x === tx && current.y === ty){
      // reconstruct path
      const path = [];
      let curKey = key(current);
      while (curKey){
        const parts = curKey.split(',').map(Number);
        path.unshift({x:parts[0], y:parts[1]});
        curKey = cameFrom.get(curKey);
      }
      return path;
    }

    // remove current
    open.delete(currentKey);

    for (const nb of neighbors(current)){
      // tentative g = g(current) + cost(nb)
      const tentativeG = getG(current) + tileCost(nb.y, nb.x);
      const nbKey = key(nb);
      if (tentativeG < (gScore.get(nbKey) ?? Infinity)){
        cameFrom.set(nbKey, currentKey);
        setG(nb, tentativeG);
        setF(nb, tentativeG + heuristic(nb, {x:tx,y:ty}));
        if (!open.has(nbKey)) open.set(nbKey, nb);
      }
    }
  }
  return null; // no path found
}

// ------------------ Movement & actions ------------------
function getDirDeltaByGesture(gesture){
  if (gesture === 'UP') return {dx:0, dy:-1, facing:'UP'};
  if (gesture === 'DOWN') return {dx:0, dy:1, facing:'DOWN'};
  if (gesture === 'LEFT') return {dx:-1, dy:0, facing:'LEFT'};
  if (gesture === 'RIGHT') return {dx:1, dy:0, facing:'RIGHT'};
  return {dx:0, dy:0, facing:player.facing};
}

function attemptPlayerAction(gesture){
  if (gesture === 'FIRE'){
    // Use facing direction for fire
    let dir;
    if (player.facing === 'UP') dir = {dx:0, dy:-1};
    else if (player.facing === 'DOWN') dir = {dx:0, dy:1};
    else if (player.facing === 'LEFT') dir = {dx:-1, dy:0};
    else if (player.facing === 'RIGHT') dir = {dx:1, dy:0};
    else dir = {dx:0, dy:0};

    const tx = player.x + dir.dx, ty = player.y + dir.dy;
    if (tx>=0 && tx<MAZE_COLS && ty>=0 && ty<MAZE_ROWS && maze[ty][tx] === 5){
      maze[ty][tx] = 0;
      statusEl.textContent = 'Destroyed obstacle!';
      score += 5;
    } else {
      statusEl.textContent = 'Nothing to fire at.';
    }
    lastPlayerMoveTime = Date.now();
    setTimeout(()=>enemyTakeStep(), ENEMY_DELAY);
    return;
  }

  const d = getDirDeltaByGesture(gesture);
  if (d.dx === 0 && d.dy === 0) return;

  const nx = player.x + d.dx, ny = player.y + d.dy;
  // check bounds + no bricks/walls
  if (nx < 0 || nx >= MAZE_COLS || ny < 0 || ny >= MAZE_ROWS) {
    statusEl.textContent = 'Blocked by border';
    return;
  }
  if (maze[ny][nx] === 1) {
    statusEl.textContent = 'Blocked by brick';
    return;
  }
  if (maze[ny][nx] === 5) {
    statusEl.textContent = 'Destructible in the way — FIRE to remove';
    return;
  }

  // perform move
  player.x = nx; player.y = ny;
  player.facing = d.facing;

  // Collect coin if present
  if (maze[ny][nx] === 4) {
    maze[ny][nx] = 0;
    score += 10;
    statusEl.textContent = `Collected coin! Score: ${score}`;
  } else if (maze[ny][nx] === 3) {
    statusEl.textContent = 'You reached the goal!';
    gameRunning = false;
    showWinModal();
  } else {
    statusEl.textContent = `Moved ${gesture}`;
  }

  lastPlayerMoveTime = Date.now();
  setTimeout(()=>enemyTakeStep(), ENEMY_DELAY);
}

// enemy step using A* path; enemy must not pass through bricks; destructible = high cost
function enemyTakeStep(){
  if (!gameRunning) return;
  // compute A* path from enemy to player
  const path = findPathAStar(enemy.x, enemy.y, player.x, player.y);
  if (path && path.length > 1){
    // move one step along path (path[0] is current)
    enemy.x = path[1].x; enemy.y = path[1].y;
  } else {
    // no A* path found (blocked). Try a fallback: greedy safe move toward player (no bricks)
    const dx = player.x - enemy.x, dy = player.y - enemy.y;
    const candidates = [];
    if (Math.abs(dx) >= Math.abs(dy)){
      candidates.push({x: Math.sign(dx), y:0});
      if (dy !== 0) candidates.push({x:0, y: Math.sign(dy)});
    } else {
      candidates.push({x:0, y: Math.sign(dy)});
      if (dx !== 0) candidates.push({x: Math.sign(dx), y:0});
    }
    let moved = false;
    for (const c of candidates){
      const nx = enemy.x + c.x, ny = enemy.y + c.y;
      if (nx>=0 && nx<MAZE_COLS && ny>=0 && ny<MAZE_ROWS && maze[ny][nx] !== 1 && maze[ny][nx] !== 5){
        enemy.x = nx; enemy.y = ny; moved = true; break;
      }
    }
    // If still not moved, try exploring any adjacent walkable cell (to avoid freezing)
    if (!moved){
      const dirs = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
      for (const d of dirs){
        const nx = enemy.x + d.x, ny = enemy.y + d.y;
        if (nx>=0 && nx<MAZE_COLS && ny>=0 && ny<MAZE_ROWS && maze[ny][nx] !== 1){
          enemy.x = nx; enemy.y = ny; break;
        }
      }
    }
  }

  // collision check
  if (enemy.x === player.x && enemy.y === player.y){
    lives -= 1;
    statusEl.textContent = `Enemy hit you! Lives left: ${lives}`;
    if (lives <= 0){
      statusEl.textContent = 'Game Over. Reload to try again.';
      gameRunning = false;
    } else {
      // reset player to start pos
      player.x = startPos.x; player.y = startPos.y;
    }
  }
}

// ------------------ Draw functions ------------------
function drawEverything(){
  // recalc center offsets & tile size on each frame (to avoid cutoffs)
  const totalW = tileSize * MAZE_COLS;
  const totalH = tileSize * MAZE_ROWS;
  const offsetX = Math.floor((canvasW - totalW) / 2);
  const offsetY = Math.floor((canvasH - totalH) / 2);
  drawEverything.offsetX = offsetX; drawEverything.offsetY = offsetY;

  // background
  ctx.fillStyle = '#0f1220';
  ctx.fillRect(0,0,canvasW,canvasH);

  // draw maze tiles
  for (let r=0;r<MAZE_ROWS;r++){
    for (let c=0;c<MAZE_COLS;c++){
      const tile = maze[r][c];
      const x = offsetX + c*tileSize, y = offsetY + r*tileSize;
      if (tile === 1){
        // brick style
        ctx.fillStyle = '#3a3a3a'; ctx.fillRect(x,y,tileSize,tileSize);
        ctx.fillStyle = '#2f2f2f'; ctx.fillRect(x+4,y+4,tileSize-8,tileSize-8);
      } else if (tile === 5){
        ctx.fillStyle = '#6b4f3a'; ctx.fillRect(x,y,tileSize,tileSize);
        ctx.fillStyle = '#7d6148'; ctx.fillRect(x+3,y+3,tileSize-6,tileSize-6);
      } else {
        ctx.fillStyle = '#1e2230'; ctx.fillRect(x,y,tileSize,tileSize);
      }
      if (tile === 4){
        ctx.fillStyle = '#ffd369'; ctx.beginPath(); ctx.arc(x+tileSize/2,y+tileSize/2,tileSize*0.18,0,Math.PI*2); ctx.fill();
      }
      if (tile === 3){
        ctx.fillStyle = '#ff6b6b'; ctx.fillRect(x+tileSize*0.2,y+tileSize*0.2,tileSize*0.6,tileSize*0.6);
      }
    }
  }

  // draw player and enemy (pixel avatars)
  drawPixelAt(player.x, player.y, '#00cc66');
  drawPixelAt(enemy.x, enemy.y, '#cc3333');

  // UI - top left: score; top right: lives; bottom center: timer
  ctx.fillStyle = '#fff';
  ctx.font = `${Math.max(12, tileSize/3)}px "Press Start 2P"`;
  ctx.textAlign = 'left';
  ctx.fillText(`Score: ${score}`, 12, 30);
  ctx.textAlign = 'center';
  ctx.fillText(`Time: ${timerSeconds}s`, canvasW/2, canvasH - 12);
  ctx.textAlign = 'right';
  ctx.fillText(`Lives: ${'❤'.repeat(lives)}`, canvasW - 12, 30);
}

function drawPixelAt(gridX, gridY, color){
  const x = drawEverything.offsetX + gridX*tileSize;
  const y = drawEverything.offsetY + gridY*tileSize;
  const w = tileSize, h = tileSize;
  ctx.fillStyle = color;
  ctx.fillRect(x + w*0.28, y + h*0.08, w*0.44, h*0.22); // head
  ctx.fillRect(x + w*0.22, y + h*0.38, w*0.56, h*0.26); // torso
  ctx.fillRect(x + w*0.22, y + h*0.7, w*0.18, h*0.22); // left leg
  ctx.fillRect(x + w*0.6, y + h*0.7, w*0.18, h*0.22); // right leg
  ctx.fillStyle = '#000';
  ctx.fillRect(x + w*0.36, y + h*0.14, w*0.06, h*0.06); // eye
  ctx.fillRect(x + w*0.58, y + h*0.14, w*0.06, h*0.06); // eye
}

// ------------------ Overlay (gesture progress, landmarks) ------------------
let lastResults = null;
function drawOverlay(){
  overlayCtx.clearRect(0,0,overlayCanvas.width, overlayCanvas.height);

  // show gesture name
  overlayCtx.fillStyle = 'rgba(255,255,255,0.95)';
  overlayCtx.font = `${Math.max(12, tileSize/3)}px "Press Start 2P"`;
  overlayCtx.textAlign = 'center';
  overlayCtx.fillText(`Gesture: ${currentGesture}`, canvasW/2, 40);

  // progress ring bottom center
  const radius = Math.min(60, tileSize*0.9);
  const cx = canvasW/2, cy = canvasH - 80;
  const elapsed = (gestureStart>0) ? (Date.now() - gestureStart) : 0;
  const frac = (currentGesture !== 'NONE' && gestureStart>0) ? Math.min(1, elapsed / HOLD_MS) : 0;

  overlayCtx.beginPath(); overlayCtx.strokeStyle = 'rgba(255,255,255,0.12)'; overlayCtx.lineWidth = 8;
  overlayCtx.arc(cx, cy, radius, 0, Math.PI*2); overlayCtx.stroke();

  if (frac>0){
    overlayCtx.beginPath(); overlayCtx.strokeStyle = 'rgba(255,200,60,0.95)'; overlayCtx.lineWidth = 8;
    overlayCtx.arc(cx, cy, radius, -Math.PI/2, -Math.PI/2 + Math.PI*2*frac); overlayCtx.stroke();
    const remain = Math.max(0, Math.ceil((HOLD_MS - elapsed)/1000));
    overlayCtx.fillStyle = 'white'; overlayCtx.font = `${Math.max(10, tileSize/4)}px "Press Start 2P"`;
    overlayCtx.fillText(`${remain}s`, cx, cy + 6);
  } else {
    overlayCtx.fillStyle = 'rgba(255,255,255,0.6)'; overlayCtx.font = `${Math.max(10, tileSize/4)}px "Press Start 2P"`;
    overlayCtx.fillText(`Hold ${HOLD_MS/1000}s`, cx, cy + 4);
  }

  // draw mini landmarks if available
  if (lastResults && lastResults.multiHandLandmarks && lastResults.multiHandLandmarks.length > 0){
    const lm = lastResults.multiHandLandmarks[0];
    const boxX = 12, boxY = 60, boxW = 150, boxH = 150;
    overlayCtx.save();
    overlayCtx.fillStyle = 'rgba(0,0,0,0.35)'; overlayCtx.fillRect(boxX-6,boxY-6,boxW+12,boxH+12);
    overlayCtx.translate(boxX + boxW/2, boxY + boxH/2); overlayCtx.scale(-1,1); overlayCtx.translate(-(boxX + boxW/2), -(boxY + boxH/2));
    overlayCtx.fillStyle = 'rgba(255,255,255,0.04)'; overlayCtx.fillRect(boxX,boxY,boxW,boxH);
    for (const p of lm){
      const px = boxX + p.x*boxW, py = boxY + p.y*boxH;
      overlayCtx.beginPath(); overlayCtx.fillStyle = 'rgba(255,255,255,0.9)'; overlayCtx.arc(px,py,3,0,Math.PI*2); overlayCtx.fill();
    }
    overlayCtx.restore();
  }
}

// ------------------ MediaPipe & gestures ------------------
const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.6 });
hands.onResults(onResults);

const camera = new Camera(videoEl, { onFrame: async ()=> { await hands.send({image: videoEl}); }, width:640, height:480 });
camera.start().then(()=> { statusEl.textContent = 'Camera active — show gestures (hold 3s).'; }).catch(e=>{ statusEl.textContent = 'Camera not available'; });

function onResults(results){
  lastResults = results;
  if (results.multiHandLandmarks && results.multiHandLandmarks.length>0){
    const lm = results.multiHandLandmarks[0];
    const g = recognizeGestureFromLandmarks(lm);
    if (g !== currentGesture){
      currentGesture = g;
      gestureStart = Date.now();
    } else {
      // same continued gesture
      if (currentGesture !== 'NONE') {
        if (Date.now() - gestureStart >= HOLD_MS){
          if (!gameRunning && currentGesture === 'FIRE'){
            startGame();
            return;
          }
          if (gameRunning){
            attemptPlayerAction(currentGesture);
            gestureStart = Date.now(); // <-- ADD THIS LINE to allow repeated actions
          }
        }
      }
    }
  } else {
    currentGesture = 'NONE';
    gestureStart = 0;
    // gestureAllowed logic not needed anymore
  }
}

// gesture recognition rules (index/middle/fist/index+middle/open palm)
function recognizeGestureFromLandmarks(lm){
  const open = (tip, pip) => (lm[tip].y < lm[pip].y - 0.03);
  const indexOpen = open(8,6);
  const middleOpen = open(12,10);
  const ringOpen = open(16,14);
  const pinkyOpen = open(20,18);
  if (!indexOpen && !middleOpen && !ringOpen && !pinkyOpen) return 'LEFT'; // pinky
  if (indexOpen && middleOpen && ringOpen && pinkyOpen) return 'FIRE'; // open palm
  if (indexOpen && !middleOpen && !ringOpen && !pinkyOpen) return 'UP';
  if (!indexOpen && !middleOpen && !ringOpen && pinkyOpen) return 'DOWN';
  if (indexOpen && middleOpen && !ringOpen && !pinkyOpen) return 'RIGHT';
  return 'NONE';
}

// ------------------ Game start / timer ------------------
let timerInterval = null;
function startGame(){
  introEl.style.display = 'none';
  gameRunning = true;
  timerSeconds = 0;
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(()=>{ if (gameRunning) timerSeconds++; }, 1000);
  statusEl.textContent = 'Game started — use gestures. Hold 3s.';
}

// ------------------ Animation loop ------------------
function frame(){
  // recalc sizes
  resizeAll();
  drawEverything();
  drawOverlay();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ------------------ drawEverything wrapper ------------------
function drawEverything(){
  drawEverything.canvasW = canvasW; drawEverything.canvasH = canvasH;
  drawEverything.offsetX = Math.floor((canvasW - tileSize*MAZE_COLS)/2);
  drawEverything.offsetY = Math.floor((canvasH - tileSize*MAZE_ROWS)/2);
  drawEverything.offsetX = Math.max(8, drawEverything.offsetX);
  drawEverything.offsetY = Math.max(8, drawEverything.offsetY);
  drawEverythingCore();
}

function drawEverythingCore(){
  // main draw
  const offsetX = drawEverything.offsetX, offsetY = drawEverything.offsetY;
  ctx.clearRect(0,0,canvasW,canvasH);
  // background
  ctx.fillStyle = '#0f1220'; ctx.fillRect(0,0,canvasW,canvasH);

  // tiles
  for (let r=0;r<MAZE_ROWS;r++){
    for (let c=0;c<MAZE_COLS;c++){
      const tile = maze[r][c];
      const x = offsetX + c*tileSize, y = offsetY + r*tileSize;
      if (tile === 1){
        ctx.fillStyle = '#3a3a3a'; ctx.fillRect(x,y,tileSize,tileSize);
        ctx.fillStyle = '#2f2f2f'; ctx.fillRect(x+4,y+4,tileSize-8,tileSize-8);
      } else if (tile === 5){
        ctx.fillStyle = '#6b4f3a'; ctx.fillRect(x,y,tileSize,tileSize);
        ctx.fillStyle = '#7d6148'; ctx.fillRect(x+3,y+3,tileSize-6,tileSize-6);
      } else {
        ctx.fillStyle = '#1e2230'; ctx.fillRect(x,y,tileSize,tileSize);
      }
      if (tile === 4){
        ctx.fillStyle = '#ffd369'; ctx.beginPath(); ctx.arc(x+tileSize/2,y+tileSize/2,tileSize*0.18,0,Math.PI*2); ctx.fill();
      }
      if (tile === 3){
        ctx.fillStyle = '#ff6b6b'; ctx.fillRect(x+tileSize*0.2,y+tileSize*0.2,tileSize*0.6,tileSize*0.6);
      }
    }
  }

  // avatars
  drawPixelAt(player.x, player.y, '#00cc66');
  drawPixelAt(enemy.x, enemy.y, '#cc3333');

  // UI
  ctx.fillStyle = '#fff';
  ctx.font = `${Math.max(12,tileSize/3)}px "Press Start 2P"`;
  ctx.textAlign = 'left'; ctx.fillText(`Score: ${score}`, 12, 30);
  ctx.textAlign = 'center'; ctx.fillText(`Time: ${timerSeconds}s`, canvasW/2, canvasH - 12);
  ctx.textAlign = 'right'; ctx.fillText(`Lives: ${'❤'.repeat(lives)}`, canvasW - 12, 30);
}

function drawPixelAt(gx,gy,color){
  const x = drawEverything.offsetX + gx*tileSize;
  const y = drawEverything.offsetY + gy*tileSize;
  const w = tileSize, h = tileSize;
  ctx.fillStyle = color;
  ctx.fillRect(x + w*0.28, y + h*0.08, w*0.44, h*0.22); // head
  ctx.fillRect(x + w*0.22, y + h*0.38, w*0.56, h*0.26); // torso
  ctx.fillRect(x + w*0.22, y + h*0.7, w*0.18, h*0.22); // left leg
  ctx.fillRect(x + w*0.6, y + h*0.7, w*0.18, h*0.22); // right leg
  ctx.fillStyle = '#000';
  ctx.fillRect(x + w*0.36, y + h*0.14, w*0.06, h*0.06);
  ctx.fillRect(x + w*0.58, y + h*0.14, w*0.06, h*0.06);
}

// ------------------ Win Modal ------------------
function showWinModal() {
  const modal = document.getElementById('winModal');
  const stats = document.getElementById('winStats');
  stats.innerHTML =
    `Time taken: <span style="color:#fff">${timerSeconds}s</span><br>` +
    `Score: <span style="color:#fff">${score}</span><br>` +
    `Lives left: <span style="color:#fff">${lives}</span>`;
  modal.style.display = 'flex';
}

function hideWinModalAndRestart() {
  const modal = document.getElementById('winModal');
  modal.style.display = 'none';
  restartGame();
}

function restartGame() {
  // Reset maze, player, enemy, score, lives, timer
  // (re-initialize maze array if you want coins/destructibles back)
  maze = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,2,0,0,0,1,0,5,0,4,0,1,0,4,0,0,0,0,0,1],
    [1,0,1,1,0,1,0,1,1,1,0,1,0,1,0,1,1,0,1,1],
    [1,0,0,1,0,0,0,0,4,0,5,0,0,1,0,0,0,0,0,1],
    [1,1,0,1,1,1,0,1,1,1,1,0,1,1,0,1,1,1,0,1],
    [1,0,0,0,4,0,0,0,0,1,0,0,0,0,0,4,0,0,0,1],
    [1,0,1,1,1,1,1,1,0,1,0,1,1,1,1,1,0,1,0,1],
    [1,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,1,0,1],
    [1,1,1,1,1,1,0,1,1,1,0,1,0,1,1,1,1,1,0,1],
    [1,4,0,0,0,0,0,0,0,4,0,0,0,4,0,0,5,0,4,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3,1]
  ];
  for (let r=0;r<MAZE_ROWS;r++){
    for (let c=0;c<MAZE_COLS;c++){
      if (maze[r][c] === 2){ startPos = {x:c,y:r}; player.x=c; player.y=r; maze[r][c]=0; }
    }
  }
  enemy.x = 18; enemy.y = 1;
  score = 0; lives = 3; timerSeconds = 0;
  gameRunning = true;
  statusEl.textContent = 'Game restarted — use gestures. Hold 3s.';
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(()=>{ if (gameRunning) timerSeconds++; }, 1000);
}

// Attach event listener (run once after DOM loaded)
window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('winCloseBtn');
  if (btn) btn.onclick = hideWinModalAndRestart;
});

// ------------------ end of file ------------------

