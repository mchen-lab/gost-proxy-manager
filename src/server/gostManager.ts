import { spawn, ChildProcess } from "child_process";
import fs from "fs";

export type GostLogCallback = (log: string) => void;

export class GostManager {
  private process: ChildProcess | null = null;
  private binPath: string;
  private defaultArgs: string[];
  private isShuttingDown: boolean = false;
  private onLog: GostLogCallback | null = null;

  // v3: Launch with API service enabled.
  // We use -L="api://:18080" to start the API service.
  // The actual proxy service will be created dynamically via this API.
  constructor(binPath: string = "/usr/local/bin/gost", defaultArgs: string[] = ["-api", "127.0.0.1:18080"]) {
    // If binPath is empty/undefined (handled by default param, but explicit empty string override needs check)
    if (!binPath) {
        binPath = "/usr/local/bin/gost";
    }

    // If not absolute path, check if it's in PATH or local
    if (!binPath.startsWith("/")) {
       // simple fallback or assumption for now
    }
    this.binPath = binPath;
    this.defaultArgs = defaultArgs;
  }

  // Set a callback to receive GOST log output
  public setLogCallback(callback: GostLogCallback): void {
    this.onLog = callback;
  }

  public start(args?: string[], env?: NodeJS.ProcessEnv): void {
    if (this.process) {
      console.warn("⚠️ GOST is already running.");
      return;
    }

    const launchArgs = args || this.defaultArgs;
    console.log(`🚀 Spawning GOST (v3): ${this.binPath} ${launchArgs.join(" ")}`);
    if (env && env.GOMAXPROCS) {
        console.log(`   Detailed Env: GOMAXPROCS=${env.GOMAXPROCS}`);
    }

    // Check if binary exists
    if (!fs.existsSync(this.binPath) && this.binPath.startsWith("/")) {
        console.error(`❌ GOST binary not found at ${this.binPath}`);
        // Fallback for local dev if not found (e.g. might be in path)
        // launching simple 'gost' if path fails
        try {
            this.spawnProcess("gost", launchArgs, env);
        } catch(e) {
            console.error("Failed to spawn 'gost' from PATH as fallback.", e);
        }
        return;
    }

    this.spawnProcess(this.binPath, launchArgs, env);
  }

  private spawnProcess(command: string, args: string[], env?: NodeJS.ProcessEnv) {
    // GOST v3 logs to stderr only
    this.process = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"], // Capture stderr only (GOST logs here)
      detached: false,
      env: { ...process.env, ...env } // Merge with existing env
    });

    // Handle stderr (where GOST v3 logs go)
    this.process.stderr?.on("data", (data: Buffer) => {
      const lines = data.toString().trim().split("\n");
      for (const line of lines) {
        if (line.trim()) {
          console.log(line); // Also log to console
          if (this.onLog) {
            this.onLog(line);
          }
        }
      }
    });

    this.process.on("error", (err) => {
      console.error("❌ GOST process error:", err);
    });

    this.process.on("exit", (code, signal) => {
      console.log(`🛑 GOST process exited with code ${code} signal ${signal}`);
      this.process = null;
      
      // Auto-restart logic? 
      // For now, let's keep it simple. If it crashes unexpectedly (not shutting down), maybe warn.
      if (!this.isShuttingDown) {
          console.warn("⚠️ GOST exited unexpectedly.");
      }
    });

    if (this.process.pid) {
        console.log(`✅ GOST started with PID: ${this.process.pid}`);
    }
  }

  public stop(): Promise<void> {
    this.isShuttingDown = true;
    return new Promise((resolve) => {
      if (!this.process) {
        this.isShuttingDown = false;
        resolve();
        return;
      }

      console.log("🛑 Stopping GOST...");
      
      // Attempt graceful kill
      this.process.kill('SIGTERM');

      // Force kill after timeout
      const killTimeout = setTimeout(() => {
        if (this.process) {
            console.warn("⚠️ Force killing GOST...");
            this.process.kill('SIGKILL');
        }
      }, 5000);

      // Wait for exit
      const checkInterval = setInterval(() => {
        if (!this.process) {
            clearTimeout(killTimeout);
            clearInterval(checkInterval);
            this.isShuttingDown = false;
            resolve();
        }
      }, 200);
    });
  }

  public async restart(args?: string[], env?: NodeJS.ProcessEnv): Promise<void> {
    await this.stop();
    this.start(args, env);
  }

  public getStatus() {
    return {
      running: !!this.process,
      pid: this.process?.pid || null,
    };
  }
}
