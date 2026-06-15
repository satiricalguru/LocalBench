import { ipcMain, shell } from 'electron';
import si from 'systeminformation';
import os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { deleteCachedModel } from '../utils/db';


export interface SystemInfo {
  cpuBrand: string;
  ramTotalGB: number;
  ramAvailableGB: number;
  gpuBrand: string;
  gpuVramMB?: number;
  platform: string;
  arch: string;
  isAppleSilicon: boolean;
}

interface PullState {
  child: ChildProcess;
  layers: Map<string, { percentage: number; completedBytes: number; totalBytes: number }>;
}

const activePulls = new Map<string, PullState>();
let ollamaServerProcess: ChildProcess | null = null;

export function parseSizeToBytes(valueStr: string, unit: string): number {
  const value = parseFloat(valueStr);
  if (isNaN(value)) return 0;
  const u = unit.toUpperCase();
  if (u === 'KB') return value * 1024;
  if (u === 'MB') return value * 1024 * 1024;
  if (u === 'GB') return value * 1024 * 1024 * 1024;
  return value;
}

export function registerSystemIPCHandlers() {
  ipcMain.handle('open-external', async (_event, url: string): Promise<void> => {
    try {
      await shell.openExternal(url);
    } catch (err) {
      console.error("Failed to open external link:", err);
    }
  });

  ipcMain.handle('start-pull-model', async (event, _url: string, modelName: string): Promise<boolean> => {
    if (activePulls.has(modelName)) {
      const oldPull = activePulls.get(modelName);
      if (oldPull) {
        oldPull.child.kill();
      }
      activePulls.delete(modelName);
    }

    try {
      const env = {
        ...process.env,
        PATH: [
          '/usr/local/bin',
          '/opt/homebrew/bin',
          '/usr/bin',
          '/bin',
          '/usr/sbin',
          '/sbin',
          process.env.PATH
        ].filter(Boolean).join(':')
      };
      const child = spawn('ollama', ['pull', modelName], { env });
      activePulls.set(modelName, {
        child,
        layers: new Map()
      });

      const handleStream = (data: Buffer) => {
        const text = data.toString();
        
        // Strip ANSI escape sequences
        const clean = text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
        const lines = clean.split(/[\r\n]+/);
        
        let hasProgressUpdate = false;
        let speedStr: string | null = null;
        let etaStr: string | null = null;
        
        for (const line of lines) {
          if (line.includes('pulling manifest')) {
            if (!event.sender.isDestroyed()) {
              event.sender.send('model-pull-progress', {
                modelName,
                status: "pulling manifest",
                completed: 0,
                total: 100,
                percentage: 0,
                done: false
              });
            }
            continue;
          }
          
          if (line.toLowerCase().includes('success')) {
            if (!event.sender.isDestroyed()) {
              event.sender.send('model-pull-progress', {
                modelName,
                status: "success",
                completed: 100,
                total: 100,
                percentage: 100,
                done: true
              });
            }
            continue;
          }

          // Regex matching: pulling [digest]: [percent]% [completed size]/[total size] [speed] [eta]
          const match = line.match(/pulling\s+([a-zA-Z0-9]+):\s*(\d+)%(?:\s+▕[^▏]*▏)?\s+([\d.]+)\s*([KMG]B)\s*\/\s*([\d.]+)\s*(KB|MB|GB)(?:\s+([\d.]+\s*(?:KB|MB|GB)\/s))?(?:\s+(\w+))?/i);
          if (match) {
            const digest = match[1];
            const percentage = parseInt(match[2], 10);
            const completedVal = match[3];
            const completedUnit = match[4];
            const totalVal = match[5];
            const totalUnit = match[6];
            
            if (match[7]) speedStr = match[7];
            if (match[8]) etaStr = match[8];
            
            const completedBytes = parseSizeToBytes(completedVal, completedUnit);
            const totalBytes = parseSizeToBytes(totalVal, totalUnit);
            
            const pullState = activePulls.get(modelName);
            if (pullState) {
              pullState.layers.set(digest, { percentage, completedBytes, totalBytes });
              hasProgressUpdate = true;
            }
          } else {
            // Fallback for finished layer lines or already existing layers: pulling [digest]: 100% [size]
            const simpleMatch = line.match(/pulling\s+([a-zA-Z0-9]+):\s*100%\s+▕██████████████████▏\s+([\d.]+)\s*([KMG]B)/i);
            if (simpleMatch) {
              const digest = simpleMatch[1];
              const sizeVal = simpleMatch[2];
              const sizeUnit = simpleMatch[3];
              const bytes = parseSizeToBytes(sizeVal, sizeUnit);
              const pullState = activePulls.get(modelName);
              if (pullState) {
                pullState.layers.set(digest, { percentage: 100, completedBytes: bytes, totalBytes: bytes });
                hasProgressUpdate = true;
              }
            }
          }
        }
        
        if (hasProgressUpdate) {
          const pullState = activePulls.get(modelName);
          if (pullState && pullState.layers.size > 0) {
            let totalCompletedBytes = 0;
            let totalBytes = 0;
            for (const layer of pullState.layers.values()) {
              totalCompletedBytes += layer.completedBytes;
              totalBytes += layer.totalBytes;
            }
            
            const percentage = totalBytes > 0 ? Math.round((totalCompletedBytes / totalBytes) * 100) : 0;
            
            let status = "Downloading";
            if (speedStr && etaStr) {
              status = `Downloading (${speedStr}, ${etaStr} remaining)`;
            } else if (speedStr) {
              status = `Downloading (${speedStr})`;
            }
            
            if (!event.sender.isDestroyed()) {
              event.sender.send('model-pull-progress', {
                modelName,
                status,
                completed: totalCompletedBytes,
                total: totalBytes,
                percentage,
                done: false
              });
            }
          }
        }
      };

      child.stdout.on('data', handleStream);
      child.stderr.on('data', handleStream);

      return new Promise<boolean>((resolve) => {
        child.on('close', (code) => {
          activePulls.delete(modelName);
          if (code === 0) {
            if (!event.sender.isDestroyed()) {
              event.sender.send('model-pull-progress', {
                modelName,
                status: "success",
                completed: 100,
                total: 100,
                percentage: 100,
                done: true
              });
            }
            resolve(true);
          } else {
            if (!event.sender.isDestroyed()) {
              event.sender.send('model-pull-progress', {
                modelName,
                status: child.killed ? "Cancelled" : "Failed",
                completed: 0,
                total: 100,
                percentage: 0,
                done: false,
                error: child.killed ? "CANCELLED" : `Exit code ${code}`
              });
            }
            resolve(false);
          }
        });

        child.on('error', (err) => {
          activePulls.delete(modelName);
          if (!event.sender.isDestroyed()) {
            event.sender.send('model-pull-progress', {
              modelName,
              status: "Failed",
              completed: 0,
              total: 100,
              percentage: 0,
              done: false,
              error: err.message
            });
          }
          resolve(false);
        });
      });
    } catch (err: any) {
      activePulls.delete(modelName);
      if (!event.sender.isDestroyed()) {
        event.sender.send('model-pull-progress', {
          modelName,
          status: "Failed",
          completed: 0,
          total: 100,
          percentage: 0,
          done: false,
          error: err.message ?? "Failed"
        });
      }
      return false;
    }
  });

  ipcMain.handle('cancel-pull-model', async (_event, modelName: string): Promise<void> => {
    const pullState = activePulls.get(modelName);
    if (pullState) {
      pullState.child.kill();
      activePulls.delete(modelName);
    }
  });

  ipcMain.handle('delete-model', async (_event, modelName: string): Promise<boolean> => {
    try {
      const env = {
        ...process.env,
        PATH: [
          '/usr/local/bin',
          '/opt/homebrew/bin',
          '/usr/bin',
          '/bin',
          '/usr/sbin',
          '/sbin',
          process.env.PATH
        ].filter(Boolean).join(':')
      };
      
      const success = await new Promise<boolean>((resolve) => {
        const child = spawn('ollama', ['rm', modelName], { env });
        
        child.on('close', (code) => {
          resolve(code === 0);
        });
        
        child.on('error', (err) => {
          console.error(`Failed to delete model ${modelName}:`, err);
          resolve(false);
        });
      });
      
      if (success) {
        deleteCachedModel('Ollama', modelName);
      }
      return success;
    } catch (err) {
      console.error(`Failed to delete model ${modelName}:`, err);
      return false;
    }
  });

  ipcMain.handle('start-ollama-server', async (): Promise<boolean> => {
    if (ollamaServerProcess && !ollamaServerProcess.killed) {
      return true;
    }

    try {
      const env = {
        ...process.env,
        PATH: [
          '/usr/local/bin',
          '/opt/homebrew/bin',
          '/usr/bin',
          '/bin',
          '/usr/sbin',
          '/sbin',
          process.env.PATH
        ].filter(Boolean).join(':')
      };

      const child = spawn('ollama', ['serve'], { env });
      ollamaServerProcess = child;

      child.on('error', (err) => {
        console.error("Failed to start Ollama server:", err);
      });

      return new Promise<boolean>((resolve) => {
        setTimeout(() => {
          resolve(child.exitCode === null);
        }, 1000);
      });
    } catch (err) {
      console.error("Failed to spawn Ollama serve:", err);
      return false;
    }
  });

  ipcMain.handle('stop-ollama-server', async (): Promise<boolean> => {
    try {
      let killed = false;
      if (ollamaServerProcess) {
        ollamaServerProcess.kill();
        ollamaServerProcess = null;
        killed = true;
      }

      const env = {
        ...process.env,
        PATH: [
          '/usr/local/bin',
          '/opt/homebrew/bin',
          '/usr/bin',
          '/bin',
          '/usr/sbin',
          '/sbin',
          process.env.PATH
        ].filter(Boolean).join(':')
      };

      await new Promise<void>((resolve) => {
        const cmd = process.platform === 'win32' ? 'taskkill /IM ollama.exe /F' : 'pkill -f "ollama serve"';
        const shellCmd = spawn(cmd.split(' ')[0], cmd.split(' ').slice(1), { env, shell: true });
        shellCmd.on('close', () => {
          killed = true;
          resolve();
        });
        shellCmd.on('error', () => {
          resolve();
        });
      });

      return killed;
    } catch (err) {
      console.error("Failed to stop Ollama server:", err);
      return false;
    }
  });

  ipcMain.handle('get-system-info', async (): Promise<SystemInfo> => {
    try {
      const cpu = await si.cpu();
      const mem = await si.mem();
      const graphics = await si.graphics();
      
      const cpuBrand = cpu.brand ?? os.cpus()?.[0]?.model ?? "Unknown CPU";
      const ramTotalGB = Math.round(mem.total / (1024 * 1024 * 1024) * 10) / 10;
      const ramAvailableGB = Math.round(mem.available / (1024 * 1024 * 1024) * 10) / 10;

      // Try to extract primary GPU brand and VRAM
      let gpuBrand = "Integrated Graphics";
      let gpuVramMB: number | undefined;

      const controllers = graphics.controllers ?? [];
      if (controllers.length > 0) {
        // Find the most powerful or dedicated GPU if possible, default to first controller
        const gpu = controllers.find(c => c.vram && c.vram > 0) ?? controllers[0];
        gpuBrand = gpu.model ?? gpu.vendor ?? "Unknown GPU";
        if (gpu.vram) {
          gpuVramMB = gpu.vram;
        }
      }

      const platform = os.platform(); // 'darwin' | 'win32' | etc
      const arch = os.arch();
      
      // Determine Apple Silicon
      const isAppleSilicon = platform === 'darwin' && arch === 'arm64';

      return {
        cpuBrand,
        ramTotalGB,
        ramAvailableGB,
        gpuBrand,
        gpuVramMB,
        platform,
        arch,
        isAppleSilicon
      };
    } catch (err) {
      console.error("Failed to gather system information:", err);
      // Fallback
      return {
        cpuBrand: os.cpus()?.[0]?.model ?? "Unknown CPU",
        ramTotalGB: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
        ramAvailableGB: Math.round(os.freemem() / (1024 * 1024 * 1024)),
        gpuBrand: "System Graphics",
        platform: os.platform(),
        arch: os.arch(),
        isAppleSilicon: os.platform() === 'darwin' && os.arch() === 'arm64'
      };
    }
  });
}
