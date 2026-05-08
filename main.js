const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');

// Finds claude.exe on Windows (not in PATH) or falls back to 'claude' for Mac/Linux.
function findClaude() {
  if (process.platform === 'win32') {
    // VS Code extension — preferred since it shares auth with the active session
    const vscodeDir = path.join(os.homedir(), '.vscode', 'extensions');
    if (fs.existsSync(vscodeDir)) {
      const exts = fs.readdirSync(vscodeDir).filter(d => d.startsWith('anthropic.claude-code')).sort().reverse();
      for (const ext of exts) {
        const exe = path.join(vscodeDir, ext, 'resources', 'native-binary', 'claude.exe');
        if (fs.existsSync(exe)) return exe;
      }
    }
    // Desktop app fallback
    const appDataDir = path.join(os.homedir(), 'AppData', 'Roaming', 'Claude', 'claude-code');
    if (fs.existsSync(appDataDir)) {
      const versions = fs.readdirSync(appDataDir).sort().reverse();
      for (const v of versions) {
        const exe = path.join(appDataDir, v, 'claude.exe');
        if (fs.existsSync(exe)) return exe;
      }
    }
  }
  return 'claude';
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Dashboard'
  });
  win.loadFile('dashboard.html');
}

ipcMain.on('invoke-agent', (event, { taskContext, agentPrompt }) => {
  const fullPrompt = `${taskContext}\n\n---\n\n${agentPrompt}`;

  const claudePath = findClaude();
  const child = spawn(claudePath, ['--think', '--dangerously-skip-permissions'], {
    shell: false,
    windowsHide: true,
    cwd: os.homedir(),
    stdio: ['pipe', 'pipe', 'pipe']
  });

  child.stdin.write(fullPrompt);
  child.stdin.end();

  child.stdout.on('data', data => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('agent-output', data.toString());
    }
  });

  let stderrBuf = '';
  child.stderr.on('data', data => { stderrBuf += data.toString(); });

  child.on('close', code => {
    if (event.sender.isDestroyed()) return;
    if (code === 0) {
      event.sender.send('agent-done');
    } else {
      event.sender.send('agent-error', stderrBuf.trim() || `Process exited with code ${code}`);
    }
  });

  child.on('error', err => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('agent-error', `Could not start claude: ${err.message}. Is Claude Code installed and in your PATH?`);
    }
  });
});

ipcMain.handle('open-file', async (_event, filePath) => {
  return shell.openPath(filePath);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
