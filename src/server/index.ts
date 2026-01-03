import express, { type Request, type Response } from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import axios from "axios";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { GostManager } from "./gostManager";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const GOST_API_URL = process.env.GOST_API_URL || "http://127.0.0.1:18080";
const GOST_PROXY_URL = process.env.GOST_PROXY_URL || "http://localhost:8080";

// Helper to get GOST env
function getGostEnv() {
    const env: NodeJS.ProcessEnv = {};
    if (currentSettings.concurrency > 0) {
        env.GOMAXPROCS = currentSettings.concurrency.toString();
    }
    return env;
}

// Initialize GostManager
const GOST_BINARY_PATH = process.env.GOST_BINARY_PATH || undefined;
const gostManager = new GostManager(GOST_BINARY_PATH);

// Start GOST on startup
loadSettingsFromFile().then(() => {
    // Start with loaded settings
    gostManager.start(undefined, getGostEnv());
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, stopping...');
    await gostManager.stop();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, stopping...');
    await gostManager.stop();
    process.exit(0);
});

// Parse proxy URL for axios config
const proxyUrlParsed = new URL(GOST_PROXY_URL);
const GOST_PROXY_HOST = proxyUrlParsed.hostname;
const GOST_PROXY_PORT = parseInt(proxyUrlParsed.port) || 8080;

app.use(cors());
app.use(express.json());

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, "../../dist")));

// Types
interface ProxyNode {
  name: string;
  addr: string;
  connector?: {
    type: string;
    auth?: {
      username: string;
      password: string;
    };
  };
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

// Store for logs (in-memory circular buffer)
const logs: LogEntry[] = [];
const MAX_LOGS = 500;

// Store for proxy list (local backup since GOST API can be inconsistent)
let savedProxyList: string[] = [];

// Persistence file path
const DATA_DIR = path.join(__dirname, "../../data");
const PROXY_FILE = path.join(DATA_DIR, "proxies.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

interface Settings {
    concurrency: number; // 0 = Auto
    strategy: string; // round, random, fifo
    maxRetries: number;
    timeout: number;
}

let currentSettings: Settings = {
    concurrency: 0,
    strategy: "round",
    maxRetries: 1,
    timeout: 10
};

// Save settings to file
async function saveSettingsToFile(settings: Settings) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
    console.log(`💾 Saved settings to ${SETTINGS_FILE}`);
  } catch (err) {
    console.error("❌ Failed to save settings:", err);
  }
}

// Load settings from file
async function loadSettingsFromFile() {
  try {
    const data = await fs.readFile(SETTINGS_FILE, "utf-8");
    const settings = JSON.parse(data);
    currentSettings = { ...currentSettings, ...settings };
    console.log(`⚙️ Loaded settings:`, currentSettings);
  } catch (err) {
    // Ignore if file doesn't exist, utilize defaults
  }
}

// Save proxies to file
async function saveProxiesToFile(proxies: string[]) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(PROXY_FILE, JSON.stringify(proxies, null, 2), "utf-8");
    console.log(`💾 Saved ${proxies.length} proxies to ${PROXY_FILE}`);
  } catch (err) {
    console.error("❌ Failed to save proxies:", err);
  }
}

// Load proxies from file
async function loadProxiesFromFile(): Promise<string[]> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const data = await fs.readFile(PROXY_FILE, "utf-8");
    const proxies = JSON.parse(data);
    if (Array.isArray(proxies)) {
      console.log(`📂 Loaded ${proxies.length} proxies from ${PROXY_FILE}`);
      return proxies;
    }
  } catch (err) {
    // Ignore error if file doesn't exist
    if ((err as any).code !== "ENOENT") {
      console.error("❌ Failed to load proxies:", err);
    }
  }
  return [];
}

// Push proxies to GOST
// --- GOST v3 Config Helpers ---

interface V3Node {
  name: string;
  addr: string;
  connector: {
    type: string;
  };
}

interface V3Hop {
  name: string;
  nodes: V3Node[];
  selector?: {
    strategy: string;
    maxFails?: number;
    failTimeout?: string;
  };
}

interface V3Chain {
  name: string;
  hops: V3Hop[];
}

interface V3Service {
  name: string;
  addr: string;
  handler: {
    type: string;
    chain: string;
  };
  listener: {
    type: string;
  };
}

// interface V3Config {
//   services: V3Service[];
//   chains: V3Chain[];
// }

// Update GOST Chain (v3)
async function updateGostChain(proxies: string[]) {
  const nodes: V3Node[] = [];

  for (const line of proxies) {
    try {
        // Simple manual parsing to avoid URL issues with some proxy formats
        // Format: protocol://[user:pass@]ip:port
        const parts = line.split("://");
        let protocol = "http";
        let remaining = line;

        if (parts.length > 1) {
            protocol = parts[0];
            remaining = parts[1];
        }
        
        // Basic sanitization
        if (!remaining || remaining.startsWith("#")) continue;

        nodes.push({
            name: `proxy-${nodes.length}`,
            addr: remaining, 
            connector: {
                type: protocol
            }
        });
    } catch (e) {
        console.warn("Failed to parse proxy line:", line);
    }
  }

  if (nodes.length === 0) return 0;

  // v3 Strategy Mapping
  let strategy = currentSettings.strategy || "round";
  if (strategy === "round") strategy = "round"; 

  const chainPayload = {
    name: "upstream-chain",
    hops: [{
      name: "hop-0",
      selector: {
          strategy: strategy,
          maxFails: currentSettings.maxRetries,
          failTimeout: `${currentSettings.timeout}s`
      },
      nodes: nodes
    }]
  };

  const servicePayload = {
    name: "proxy-service",
    addr: ":8080", // Main entry point
    handler: {
      type: "http",
      chain: "upstream-chain"
    },
    listener: {
      type: "tcp"
    }
  };
  
  try {
    // 1. Configure Chain
    // Try to delete existing chain first (to avoid conflict or ensure update)
    try {
        await axios.delete(`${GOST_API_URL}/config/chains/upstream-chain`);
    } catch (e) { /* ignore 404 */ }
    
    // Create Config Chain
    await axios.post(`${GOST_API_URL}/config/chains`, chainPayload);

    // 2. Configure Service
    // Try to delete existing service first
    try {
        await axios.delete(`${GOST_API_URL}/config/services/proxy-service`);
    } catch (e) { /* ignore 404 */ }

    // Create Service
    await axios.post(`${GOST_API_URL}/config/services`, servicePayload);

    broadcastLog({
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `Updated GOST v3 config (Service & Chain) with ${nodes.length} proxies`,
    });

    return nodes.length;
  } catch (error) {
    console.error("Failed to update GOST v3:", error);
    throw error;
  }
}

// WebSocket clients
const wsClients: Set<WebSocket> = new Set();

// Broadcast log to all WebSocket clients
function broadcastLog(log: LogEntry) {
  logs.push(log);
  if (logs.length > MAX_LOGS) {
    logs.shift();
  }

  const message = JSON.stringify({ type: "log", data: log });
  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Parse proxy string into ProxyNode
function parseProxyString(proxyStr: string): ProxyNode | null {
  const trimmed = proxyStr.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  let addr = trimmed;
  let username = "";
  let password = "";

  // Check for auth format: user:pass@host:port
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex > 0) {
    const authPart = trimmed.substring(0, atIndex);
    addr = trimmed.substring(atIndex + 1);
    const colonIndex = authPart.indexOf(":");
    if (colonIndex > 0) {
      username = authPart.substring(0, colonIndex);
      password = authPart.substring(colonIndex + 1);
    }
  }

  // Remove protocol prefix if present
  addr = addr.replace(/^https?:\/\//, "");

  const name = `proxy-${addr.replace(/[:.@]/g, "-")}`;

  const node: ProxyNode = {
    name,
    addr,
    connector: {
      type: "http",
    },
  };

  if (username && password) {
    node.connector!.auth = { username, password };
  }

  return node;
}

// API Routes

// Get current proxies (return locally stored list)
app.get("/api/proxies", (_req: Request, res: Response) => {
  res.json({ proxies: savedProxyList });
});

// Update proxies (replace all)
app.post("/api/proxies", async (req: Request, res: Response) => {
  try {
    const { proxyList } = req.body;
    if (!proxyList || typeof proxyList !== "string") {
      res.status(400).json({ error: "proxyList is required" });
      return;
    }

    const lines = proxyList.split("\n");
    const nodes: ProxyNode[] = [];

    for (const line of lines) {
      const node = parseProxyString(line);
      if (node) {
        nodes.push(node);
      }
    }

    if (nodes.length === 0) {
      res.status(400).json({ error: "No valid proxies provided" });
      return;
    }

    // Update GOST
    try {
        await updateGostChain(lines);
    } catch (error) {
        console.error("Failed to update GOST chain (GOST might be offline):", error);
        // Continue to save locally so user doesn't lose data
    }

    // Update local state and save to file
    savedProxyList = lines.filter(line => line.trim() && !line.trim().startsWith("#"));
    await saveProxiesToFile(savedProxyList);

    res.json({ success: true, count: nodes.length, warning: "Saved locally, but GOST update failed (is it running?)" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error updating proxies:", error);
    res.status(500).json({ error: message });
  }
});

// Update settings
app.post("/api/settings", async (req: Request, res: Response) => {
    try {
        const settings = req.body;
        // Validate? (skip for brevity, assume UI sends correct types or cast)
        const oldConcurrency = currentSettings.concurrency;
        currentSettings = { ...currentSettings, ...settings };
        await saveSettingsToFile(currentSettings);

        // If strategy/retries changed, we should re-apply the chain if proxies exist
        if (savedProxyList.length > 0) {
             // Re-push chain with new strategy
             updateGostChain(savedProxyList).catch(err => console.error("Failed to update chain after settings change", err));
        }
        
        // If concurrency changed, we might need to restart GOST to apply GOMAXPROCS
        if (settings.concurrency !== undefined && settings.concurrency !== oldConcurrency) {
            // We won't auto-restart, UI should handle that or notify user to restart
        }

        res.json({ success: true, settings: currentSettings });
    } catch (error) {
        res.status(500).json({ error: "Failed to save settings" });
    }
});

// Get settings
app.get("/api/settings", (_req: Request, res: Response) => {
    res.json(currentSettings);
});

// Get GOST status
app.get("/api/status", async (_req: Request, res: Response) => {
  try {
    await axios.get(`${GOST_API_URL}/api/config`);
    // const config = response.data;

    // const services = config.services || [];
    // v3 status check logic
    // We might need to fetch /config or /service/proxy-service to check status
    // For now, assume if savedProxyList has items and gost is running, it's roughly ready.
    // Or we can query the API.
    
    res.json({
      online: true,
      proxyServiceReady: true, // v3 usually applies immediately
      proxyCount: savedProxyList.length, // Use local truth for now
      gost: gostManager.getStatus()
    });
  } catch {
    // API failed, but process might be running (e.g. no config yet or v3 startup delay)
    // We should differentiate "Process Running" from "API Ready"
    // For "Online" badge, we usually mean "Services Ready".
    // But if process is running, we should show that.
    
    // Check if process is actually running via manager
    const mgrStatus = gostManager.getStatus();
    const isProcessRunning = mgrStatus.running;

    res.json({
        online: isProcessRunning, // Mark online if process is up, even if API isn't responding yet
        proxyServiceReady: false,
        proxyCount: savedProxyList.length,
        gost: mgrStatus
    });
  }
});

app.post("/api/service/start", (_req, res) => {
    gostManager.start(undefined, getGostEnv());
    res.json(gostManager.getStatus());
});

app.post("/api/service/stop", async (_req, res) => {
    await gostManager.stop();
    res.json(gostManager.getStatus());
});

app.post("/api/service/restart", async (_req, res) => {
    await gostManager.restart(undefined, getGostEnv());
    res.json(gostManager.getStatus());
});

// Get logs
app.get("/api/logs", (_req: Request, res: Response) => {
  res.json({ logs });
});

// Clear logs
app.delete("/api/logs", (_req: Request, res: Response) => {
  logs.length = 0;
  res.json({ success: true });
});

// Test proxy endpoint - makes request through the GOST proxy
app.get("/api/test", async (req: Request, res: Response) => {
  const url = req.query.url as string;
  if (!url) {
    res.status(400).json({ success: false, error: "URL required" });
    return;
  }

  try {
    // Use axios with proxy config to route through GOST
    const response = await axios.get(url, {
      proxy: {
        host: GOST_PROXY_HOST,
        port: GOST_PROXY_PORT,
        protocol: 'http'
      },
      timeout: 10000,
    });

    // Try to extract IP from response
    let ip = "";
    if (typeof response.data === "string") {
      ip = response.data.trim().substring(0, 50);
    } else if (response.data.origin) {
      ip = response.data.origin;
    } else if (response.data.ip) {
      ip = response.data.ip;
    } else {
      ip = JSON.stringify(response.data).substring(0, 50);
    }

    broadcastLog({
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `Test ${url} -> ${ip}`,
    });

    res.json({ success: true, ip, result: response.data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    
    broadcastLog({
      timestamp: new Date().toISOString(),
      level: "ERROR",
      message: `Test ${url} failed: ${message}`,
    });

    res.json({ success: false, error: message });
  }
});

// Catch-all route to serve React app (Express v5 syntax)
app.get("/{*splat}", (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "../../dist/index.html"));
});

// Create HTTP server
const server = createServer(app);

// WebSocket server for real-time logs
const wss = new WebSocketServer({ server, path: "/ws/logs" });

wss.on("connection", (ws: WebSocket) => {
  wsClients.add(ws);
  
  // Send recent logs to new client
  ws.send(JSON.stringify({ type: "history", data: logs }));
  
  ws.on("close", () => {
    wsClients.delete(ws);
  });
});

// Simulate log generation from GOST (in production, you would tail GOST logs)
// For now, we'll poll GOST status periodically
setInterval(async () => {
  try {
    const response = await axios.get(`${GOST_API_URL}/api/config`);
    const services = response.data.services || [];
    const proxyService = services.find((s: { name: string }) => s.name === "proxy-service");
    
    if (proxyService?.status?.events) {
      const latestEvent = proxyService.status.events[proxyService.status.events.length - 1];
      if (latestEvent) {
        // Only log if it's a new event (simple check)
        const existingLog = logs.find(l => l.message === latestEvent.msg);
        if (!existingLog) {
          broadcastLog({
            timestamp: new Date(latestEvent.time * 1000).toISOString(),
            level: "INFO",
            message: latestEvent.msg,
          });
        }
      }
    }
  } catch {
    // GOST not available
  }
}, 5000);

// Start server
server.listen(PORT, async () => {
  console.log(`🚀 GOST Proxy Manager running on http://localhost:${PORT}`);
  console.log(`📡 GOST API: ${GOST_API_URL}`);
  
  // Load saved proxies on startup
  savedProxyList = await loadProxiesFromFile();
  if (savedProxyList.length > 0) {
    console.log(`🔄 Restoring ${savedProxyList.length} proxies to GOST...`);
    // We need to wait a bit for GOST to be ready, or just try and let it fail/retry
    // For now, we'll try once after a short delay
    setTimeout(async () => {
      try {
        await updateGostChain(savedProxyList);
        console.log("✅ Proxies restored successfully");
      } catch (err) {
        console.error("⚠️ Failed to restore proxies on startup (GOST might not be ready)", err);
      }
    }, 2000);
  }

  broadcastLog({
    timestamp: new Date().toISOString(),
    level: "INFO",
    message: "GOST Proxy Manager started",
  });
});
