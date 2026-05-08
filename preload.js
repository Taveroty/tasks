const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  invokeAgent(taskContext, agentPrompt) {
    ipcRenderer.send('invoke-agent', { taskContext, agentPrompt });
  },

  onAgentOutput(cb) {
    ipcRenderer.on('agent-output', (_e, chunk) => cb(chunk));
  },

  onAgentDone(cb) {
    ipcRenderer.on('agent-done', () => cb());
  },

  onAgentError(cb) {
    ipcRenderer.on('agent-error', (_e, msg) => cb(msg));
  },

  openFile(filePath) {
    return ipcRenderer.invoke('open-file', filePath);
  }
});
