(function () {
  const vscode = acquireVsCodeApi();

  const COLS = 10;
  const ROWS = 20;
  const NEXT_BLOCK = 16;

  const boardWrap = document.getElementById('boardWrap');
  const board = document.getElementById('board');
  const ctx = board.getContext('2d');
  const nextCanvas = document.getElementById('next');
  const nextCtx = nextCanvas.getContext('2d');

  const scoreEl = document.getElementById('score');
  const linesEl = document.getElementById('lines');
  const levelEl = document.getElementById('level');
  const statusPill = document.getElementById('statusPill');

  const lockedView = document.getElementById('lockedView');
  const ring = document.getElementById('ring');
  const countdownText = document.getElementById('countdownText');
  const overlaySubtitle = document.getElementById('overlaySubtitle');

  const idleView = document.getElementById('idleView');
  const actionBtn = document.getElementById('actionBtn');
  const gamesLeftText = document.getElementById('gamesLeftText');

  const COLORS = {
    I: '#4dd0e1', J: '#4f6bff', L: '#ffa726', O: '#ffee58',
    S: '#66bb6a', T: '#ab47bc', Z: '#ef5350'
  };

  const SHAPES = {
    I: [[1, 1, 1, 1]],
    J: [[1, 0, 0], [1, 1, 1]],
    L: [[0, 0, 1], [1, 1, 1]],
    O: [[1, 1], [1, 1]],
    S: [[0, 1, 1], [1, 1, 0]],
    T: [[0, 1, 0], [1, 1, 1]],
    Z: [[1, 1, 0], [0, 1, 1]]
  };

  let grid, current, next, score, lines, dropInterval, dropTimer, paused;
  let mode = 'idle'; // idle | locked | limit | playing | betweenGames
  let countdownTimer = null;
  let blockSize = 18;
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  function rotate(shape) {
    const rows = shape.length, cols = shape[0].length, result = [];
    for (let c = 0; c < cols; c++) {
      const row = [];
      for (let r = rows - 1; r >= 0; r--) row.push(shape[r][c]);
      result.push(row);
    }
    return result;
  }

  function randomPiece() {
    const keys = Object.keys(SHAPES);
    const key = keys[Math.floor(Math.random() * keys.length)];
    return { key, shape: SHAPES[key], x: Math.floor(COLS / 2) - 1, y: 0 };
  }

  function emptyGrid() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  function collides(shape, x, y) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const gx = x + c, gy = y + r;
        if (gx < 0 || gx >= COLS || gy >= ROWS) return true;
        if (gy >= 0 && grid[gy][gx]) return true;
      }
    }
    return false;
  }

  function merge() {
    const { shape, x, y, key } = current;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const gy = y + r;
          if (gy >= 0) grid[gy][x + c] = key;
        }
      }
    }
  }

  function clearLines() {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (grid[r].every((cell) => cell)) {
        grid.splice(r, 1);
        grid.unshift(Array(COLS).fill(null));
        cleared++;
        r++;
      }
    }
    if (cleared > 0) {
      lines += cleared;
      score += [0, 100, 300, 500, 800][cleared] || 1000;
      dropInterval = Math.max(120, 600 - Math.floor(lines / 10) * 40);
      updateMeta();
    }
  }

  function spawn() {
    current = next;
    next = randomPiece();
    drawNext();
    if (collides(current.shape, current.x, current.y)) {
      endGame();
    }
  }

  function hardDrop() {
    while (!collides(current.shape, current.x, current.y + 1)) current.y++;
    lockPiece();
  }

  function lockPiece() {
    merge();
    clearLines();
    spawn();
    draw();
  }

  function tick() {
    if (mode !== 'playing' || paused) return;
    if (!collides(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
    draw();
  }

  // ---- Rendering ----

  function roundRect(context, x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function lighten(hex, amount) {
    const num = parseInt(hex.slice(1), 16);
    let r = Math.min(255, (num >> 16) + amount);
    let g = Math.min(255, ((num >> 8) & 0xff) + amount);
    let b = Math.min(255, (num & 0xff) + amount);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function drawBlock(context, gx, gy, color, size) {
    const pad = Math.max(1, size * 0.08);
    const x = gx * size + pad / 2;
    const y = gy * size + pad / 2;
    const w = size - pad;
    const h = size - pad;
    const r = Math.min(4, size * 0.2);
    const grad = context.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, lighten(color, 35));
    grad.addColorStop(1, color);
    context.fillStyle = grad;
    roundRect(context, x, y, w, h, r);
    context.fill();
  }

  function draw() {
    ctx.clearRect(0, 0, board.width, board.height);
    if (!grid) return;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c]) drawBlock(ctx, c, r, COLORS[grid[r][c]], blockSize);
      }
    }
    if (!current) return;
    const { shape, x, y, key } = current;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) drawBlock(ctx, x + c, y + r, COLORS[key], blockSize);
      }
    }
  }

  function drawNext() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    if (!next) return;
    const shape = next.shape;
    const offsetX = (4 - shape[0].length) / 2;
    const offsetY = (4 - shape.length) / 2;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) drawBlock(nextCtx, offsetX + c, offsetY + r, COLORS[next.key], NEXT_BLOCK);
      }
    }
  }

  function resizeBoard() {
    const rect = boardWrap.getBoundingClientRect();
    if (rect.width <= 0) return;
    blockSize = rect.width / COLS;
    board.width = Math.round(rect.width * dpr);
    board.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(resizeBoard).observe(boardWrap);
  }
  window.addEventListener('resize', resizeBoard);

  function updateMeta() {
    scoreEl.textContent = String(score);
    linesEl.textContent = String(lines);
    levelEl.textContent = String(Math.floor(lines / 10) + 1);
  }

  // ---- Game lifecycle ----

  function endGame() {
    mode = 'betweenGames';
    clearInterval(dropTimer);
    vscode.postMessage({ type: 'gameOver', score, lines });
  }

  function startGame() {
    grid = emptyGrid();
    score = 0; lines = 0; dropInterval = 600; paused = false;
    mode = 'playing';
    lockedView.classList.add('hidden');
    idleView.classList.add('hidden');
    stopCountdown();
    next = randomPiece();
    spawn();
    updateMeta();
    resizeBoard();
    draw();
    clearInterval(dropTimer);
    dropTimer = setInterval(tick, dropInterval);
  }

  let lastInterval = 600;
  setInterval(() => {
    if (mode === 'playing' && dropInterval !== lastInterval) {
      lastInterval = dropInterval;
      clearInterval(dropTimer);
      dropTimer = setInterval(tick, dropInterval);
    }
  }, 200);

  document.addEventListener('keydown', (e) => {
    if (mode !== 'playing') return;
    switch (e.key) {
      case 'ArrowLeft':
        if (!collides(current.shape, current.x - 1, current.y)) current.x--;
        draw();
        break;
      case 'ArrowRight':
        if (!collides(current.shape, current.x + 1, current.y)) current.x++;
        draw();
        break;
      case 'ArrowDown':
        if (!paused) tick();
        break;
      case 'ArrowUp': {
        if (paused) break;
        const rotated = rotate(current.shape);
        if (!collides(rotated, current.x, current.y)) current.shape = rotated;
        draw();
        break;
      }
      case ' ':
        e.preventDefault();
        if (!paused) hardDrop();
        break;
      case 'p':
      case 'P':
        paused = !paused;
        break;
    }
  });

  actionBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'requestStart' });
  });

  // ---- Status UI ----

  function formatRemaining(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function stopCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function setPill(text, cls) {
    statusPill.textContent = `● ${text}`;
    statusPill.className = `pill ${cls}`;
  }

  function showOverlay(view) {
    lockedView.classList.toggle('hidden', view !== 'locked');
    idleView.classList.toggle('hidden', view !== 'idle');
  }

  function renderIdleUI(state) {
    stopCountdown();

    if (state.available) {
      mode = 'idle';
      setPill('Available', 'available');
      showOverlay('idle');
      gamesLeftText.textContent = `${state.gamesLeft} left`;
      actionBtn.textContent = '▶ Play';
    } else if (state.reason === 'cooldown' && state.cooldownUntil) {
      mode = 'locked';
      setPill('Locked', 'locked');
      showOverlay('locked');
      ring.classList.remove('hidden');
      overlaySubtitle.textContent = 'Tetrix unlocks when the countdown ends.';
      const totalMs = (state.cooldownMinutes || 30) * 60 * 1000;
      const update = () => {
        const remaining = state.cooldownUntil - Date.now();
        if (remaining <= 0) {
          stopCountdown();
          vscode.postMessage({ type: 'ready' });
          return;
        }
        countdownText.textContent = formatRemaining(remaining);
        const pct = Math.max(0, Math.min(100, (remaining / totalMs) * 100));
        ring.style.setProperty('--progress', String(pct));
      };
      update();
      countdownTimer = setInterval(update, 1000);
    } else {
      mode = 'limit';
      setPill('Limit reached', 'limit');
      showOverlay('locked');
      ring.classList.add('hidden');
      countdownText.textContent = '';
      overlaySubtitle.textContent = 'Daily break limit reached. See you tomorrow!';
      gamesLeftText.textContent = '—';
    }
  }

  window.addEventListener('message', (event) => {
    const state = event.data;
    if (state.type !== 'state') return;

    if (state.action === 'start') {
      startGame();
      return;
    }

    if (state.action === 'forceLock') {
      clearInterval(dropTimer);
      mode = 'idle';
    }

    if (mode === 'playing') return;

    if (mode === 'betweenGames' && state.available && state.reason === 'available') {
      mode = 'idle';
      setPill('Available', 'available');
      showOverlay('idle');
      gamesLeftText.textContent = `${state.gamesLeft} left`;
      actionBtn.textContent = '▶ Play again';
      return;
    }

    renderIdleUI(state);
  });

  resizeBoard();
  updateMeta();
  vscode.postMessage({ type: 'ready' });
})();
