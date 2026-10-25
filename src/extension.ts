import * as vscode from 'vscode';
import { TetrixStateStore, getConfig, checkAvailability, formatRemaining } from './state';
import { TetrixViewProvider } from './tetrixViewProvider';

let statusBarItem: vscode.StatusBarItem | undefined;
let statusBarInterval: NodeJS.Timeout | undefined;
let stateStore: TetrixStateStore;
let viewProvider: TetrixViewProvider;

export function activate(context: vscode.ExtensionContext) {
  stateStore = new TetrixStateStore(context.globalState);

  viewProvider = new TetrixViewProvider(context.extensionUri, stateStore, () => refreshStatusBar());

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TetrixViewProvider.viewType, viewProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tetrix.play', () => playCommand())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('tetrix.status', () => showStatusMessage())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('tetrix.resetState', async () => {
      await stateStore.reset();
      vscode.window.showInformationMessage('Tetrix: state reset.');
      refreshStatusBar();
      viewProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('tetrix')) {
        setupStatusBar(context);
        viewProvider.refresh();
      }
    })
  );

  setupStatusBar(context);
}

function setupStatusBar(context: vscode.ExtensionContext) {
  const config = getConfig();

  if (statusBarInterval) {
    clearInterval(statusBarInterval);
    statusBarInterval = undefined;
  }

  if (!config.showStatusBarItem) {
    statusBarItem?.hide();
    return;
  }

  if (!statusBarItem) {
    statusBarItem            = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command    = 'tetrix.play';
    context.subscriptions.push(statusBarItem);
  }

  statusBarItem.show();
  refreshStatusBar();
  statusBarInterval = setInterval(refreshStatusBar, 15000);
  context.subscriptions.push({ dispose: () => statusBarInterval && clearInterval(statusBarInterval) });
}

function refreshStatusBar() {
  if (!statusBarItem) {
    return;
  }
  const state           = stateStore.get();
  const availability    = checkAvailability(state);

  if (availability.available) {
    statusBarItem.text       = '$(game) Tetrix ready';
    statusBarItem.tooltip    = 'Click to open Tetrix in the sidebar';
  } else if (availability.reason === 'cooldown' && availability.remainingMs) {
    statusBarItem.text       = `$(lock) Tetrix (${formatRemaining(availability.remainingMs)})`;
    statusBarItem.tooltip    = 'Tetrix is locked, hang in there';
  } else if (availability.reason === 'daily-limit') {
    statusBarItem.text       = '$(circle-slash) Tetrix (daily limit)';
    statusBarItem.tooltip    = 'You have reached the maximum number of breaks for today';
  }
}

async function playCommand() {
  await vscode.commands.executeCommand('workbench.view.extension.tetrix');
  viewProvider.refresh();
}

function showStatusMessage() {
  const state           = stateStore.get();
  const config          = getConfig();
  const availability    = checkAvailability(state);

  if (availability.available) {
    const gamesLeft = config.maxGamesPerBreak - state.gamesPlayedThisBreak;
    vscode.window.showInformationMessage(
      `Tetrix is available. Games left before locking: ${gamesLeft}/${config.maxGamesPerBreak}.`
    );
  } else if (availability.reason === 'cooldown' && availability.remainingMs) {
    vscode.window.showInformationMessage(
      `Tetrix is locked for ${formatRemaining(availability.remainingMs)} more.`
    );
  } else {
    vscode.window.showInformationMessage(
      'Daily Tetrix break limit reached.'
    );
  }
}

export function deactivate() {
  if (statusBarInterval) {
    clearInterval(statusBarInterval);
  }
}
