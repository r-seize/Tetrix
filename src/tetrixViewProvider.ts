import * as vscode from 'vscode';
import { TetrixStateStore, getConfig, checkAvailability } from './state';

export class TetrixViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'tetrix.gameView';

  private view?: vscode.WebviewView;
  private breakTimer?: NodeJS.Timeout;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly stateStore: TetrixStateStore,
    private readonly onStateChanged: () => void
  ) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          this.sendState();
          break;
        case 'requestStart':
          await this.handleStartRequest();
          break;
        case 'gameOver':
          await this.handleGameOver();
          break;
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.sendState();
      }
    });
  }

  public refresh(): void {
    this.sendState();
  }

  private async handleStartRequest(): Promise<void> {
    const config          = getConfig();
    const state           = this.stateStore.get();
    const availability    = checkAvailability(state);

    if (!availability.available) {
      this.sendState();
      return;
    }

    if (state.gamesPlayedThisBreak === 0) {
      state.breaksToday += 1;
      await this.stateStore.save(state);
      this.onStateChanged();

      if (this.breakTimer) {
        clearTimeout(this.breakTimer);
      }
      if (config.breakDurationMinutes > 0) {
        this.breakTimer = setTimeout(() => this.forceLock(), config.breakDurationMinutes * 60 * 1000);
      }
    }

    this.sendState('start');
  }

  private async handleGameOver(): Promise<void> {
    const config    = getConfig();
    const state     = this.stateStore.get();
    state.gamesPlayedThisBreak += 1;
    const gamesLeft = Math.max(0, config.maxGamesPerBreak - state.gamesPlayedThisBreak);

    if (gamesLeft <= 0) {
      state.cooldownUntil           = Date.now() + config.cooldownMinutes * 60 * 1000;
      state.gamesPlayedThisBreak    = 0;
      await this.stateStore.save(state);
      this.onStateChanged();
      if (this.breakTimer) {
        clearTimeout(this.breakTimer);
        this.breakTimer = undefined;
      }
    } else {
      await this.stateStore.save(state);
    }

    this.sendState();
  }

  private async forceLock(): Promise<void> {
    const config                  = getConfig();
    const state                   = this.stateStore.get();
    state.cooldownUntil           = Date.now() + config.cooldownMinutes * 60 * 1000;
    state.gamesPlayedThisBreak    = 0;
    await this.stateStore.save(state);
    this.onStateChanged();
    this.sendState('forceLock');
  }

  private sendState(action?: string): void {
    if (!this.view) {
      return;
    }
    const config          = getConfig();
    const state           = this.stateStore.get();
    const availability    = checkAvailability(state);
    const gamesLeft       = Math.max(0, config.maxGamesPerBreak - state.gamesPlayedThisBreak);

    this.view.webview.postMessage({
      type: 'state',
      available: availability.available,
      reason: availability.reason,
      cooldownUntil: state.cooldownUntil,
      cooldownMinutes: config.cooldownMinutes,
      gamesLeft,
      maxGamesPerBreak: config.maxGamesPerBreak,
      action
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'sidebar.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'sidebar.css')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>Tetrix</title>
</head>
<body>
  <div id="app">
    <header class="header">
      <div class="brand">
        <div class="logo"><span></span><span></span><span></span><span></span></div>
        <h1>TETRIX</h1>
      </div>
      <span id="statusPill" class="pill">● --</span>
    </header>

    <div class="stats">
      <div class="stat">
        <span class="stat-label">Score</span>
        <span id="score" class="stat-value">0</span>
      </div>
      <div class="stat">
        <span class="stat-label">Lines</span>
        <span id="lines" class="stat-value">0</span>
      </div>
      <div class="stat">
        <span class="stat-label">Level</span>
        <span id="level" class="stat-value">1</span>
      </div>
    </div>

    <div id="boardWrap" class="board-wrap">
      <canvas id="board"></canvas>

      <div id="lockedView" class="overlay-view hidden">
        <div id="ring" class="ring">
          <div class="ring-content">
            <span id="countdownText" class="countdown-text">--:--</span>
            <span class="countdown-label">left</span>
          </div>
        </div>
        <p class="overlay-title">Back to code</p>
        <p id="overlaySubtitle" class="overlay-subtitle">Tetrix unlocks when the countdown ends.</p>
      </div>

      <div id="idleView" class="overlay-view hidden">
        <button id="actionBtn" class="action-btn">▶ Play</button>
      </div>
    </div>

    <div class="bottom-row">
      <div class="card">
        <span class="card-label">Next</span>
        <canvas id="next" width="64" height="64"></canvas>
      </div>
      <div class="card">
        <span class="card-label">Games</span>
        <div class="games-icon"><span></span><span></span><span></span></div>
        <span id="gamesLeftText" class="games-left-text">—</span>
      </div>
    </div>

    <div class="legend">
      <div class="legend-item"><span class="key">←</span><span class="key">→</span><span class="legend-text">move</span></div>
      <div class="legend-item"><span class="key">↑</span><span class="legend-text">rotate</span></div>
      <div class="legend-item"><span class="key">↓</span><span class="legend-text">drop</span></div>
      <div class="legend-item"><span class="key">Space</span><span class="legend-text">hard drop</span></div>
      <div class="legend-item"><span class="key">P</span><span class="legend-text">pause</span></div>
      <div class="legend-item"><span class="key">Enter</span><span class="legend-text">replay</span></div>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text          = '';
  const possible    = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
