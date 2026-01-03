import express, { type Request, type Response } from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import axios from "axios";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { GostManager } from "./gostManager.js";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import { HttpsProxyAgent } from "https-proxy-agent";
import { HttpProxyAgent } from "http-proxy-agent";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 31130;
const GOST_API_URL = process.env.GOST_API_URL || "http://127.0.0.1:31132";
const GOST_PROXY_URL = process.env.GOST_PROXY_URL || "http://127.0.0.1:31131";

// --- Logger Setup ---
const LOG_DIR = path.join(__dirname, "../../logs");

// Configure logger (Hardcoded rules: 5MB, keep 5 files)
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
        format: winston.format.simple()
    }),
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '5m',
      maxFiles: '5'
    })
  ]
});

// Helper to get GOST env (Thread logic removed)
function getGostEnv() {
    const env: NodeJS.ProcessEnv = {};
    return env;
}

// Initialize GostManager
const GOST_BINARY_PATH = process.env.GOST_BINARY_PATH || undefined;
const gostManager = new GostManager(GOST_BINARY_PATH);

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
const MAX_LOGS = 1000; // Hardcoded memory limit

// Persistence file path
const DATA_DIR = path.join(__dirname, "../../data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
// Legacy files to be migrated/removed
const LEGACY_PROXY_FILE = path.join(DATA_DIR, "proxies.json");
const LEGACY_URLS_FILE = path.join(DATA_DIR, "test_urls.json");

interface SystemSettings {
    strategy: string; // round, random, fifo
    maxRetries: number;
    timeout: number;
}

interface GlobalConfig {
    system: SystemSettings;
    proxies: string[];
    testUrls: string[];
}

// Default State
let globalConfig: GlobalConfig = {
    system: {
        strategy: "round",
        maxRetries: 1,
        timeout: 10
    },
    proxies: [],
    testUrls: [
        "https://api.ipify.org?format=json",
        "https://www.google.com",
        "https://www.bbc.com/news",
        "https://en.wikipedia.org/wiki/Main_Page",
        "https://www.nytimes.com",
        "https://www.reuters.com",
        "https://www.theguardian.com",
        "https://news.ycombinator.com"
    ]
};

// Unified Save
async function saveConfig() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(globalConfig, null, 2), "utf-8");
    console.log(`💾 Saved config to ${SETTINGS_FILE}`);
  } catch (err) {
    console.error("❌ Failed to save config:", err);
  }
}

// Helper to check if a file exists asynchronously
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Unified Load (with migration)
async function loadConfig() {
  // Ensure data directory exists first
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  // Check if settings.json exists
  const settingsExists = await fileExists(SETTINGS_FILE);
  
  if (settingsExists) {
    try {
      // Try to load unified file
      const data = await fs.readFile(SETTINGS_FILE, "utf-8");
      const loaded = JSON.parse(data);
      
      // Merge with defaults to ensure structure
      globalConfig = {
          system: { ...globalConfig.system, ...(loaded.system || loaded) }, // Handle potential flat legacy settings
          proxies: loaded.proxies || globalConfig.proxies,
          testUrls: loaded.testUrls || globalConfig.testUrls
      };
      
      console.log(`⚙️ Loaded settings from ${SETTINGS_FILE}`);
      console.log(`⚙️ Global Config Ready: ${globalConfig.proxies.length} proxies, ${globalConfig.testUrls.length} test URLs`);
      return;
    } catch (parseErr) {
      console.warn("⚠️ Failed to parse settings.json, will reinitialize:", parseErr);
    }
  }

  // settings.json doesn't exist or failed to parse - initialize it
  console.log("⚠️ settings.json not found, initializing...");
  
  let migrated = false;

  try {
      // Check for legacy proxy file
      if (await fileExists(LEGACY_PROXY_FILE)) {
           const pData = await fs.readFile(LEGACY_PROXY_FILE, "utf-8");
           const pJson = JSON.parse(pData);
           if (Array.isArray(pJson)) {
               globalConfig.proxies = pJson;
               migrated = true;
               console.log("✅ Migrated proxies.json");
           }
      }
      
      // Check for legacy test URLs file
      if (await fileExists(LEGACY_URLS_FILE)) {
           const uData = await fs.readFile(LEGACY_URLS_FILE, "utf-8");
           const uJson = JSON.parse(uData);
           if (Array.isArray(uJson)) {
               globalConfig.testUrls = uJson;
               migrated = true;
               console.log("✅ Migrated test_urls.json");
           }
      }
      
  } catch (migErr) {
      console.warn("Migration warning:", migErr);
  }

  // Save defaults (or migrated data) to create the file
  await saveConfig();
  console.log("🆕 Initialized settings.json with defaults" + (migrated ? " (and migrated data)" : ""));
  
  console.log(`⚙️ Global Config Ready: ${globalConfig.proxies.length} proxies, ${globalConfig.testUrls.length} test URLs`);
}


// --- GOST v3 Config Helpers ---

interface V3Node {
  name: string;
  addr: string;
  connector: {
    type: string;
  };
}

// Update GOST Chain (v3)
async function updateGostChain() {
  const proxies = globalConfig.proxies;
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
    } catch {
        console.warn("Failed to parse proxy line:", line);
    }
  }

  if (nodes.length === 0) return 0;

  // v3 Strategy Mapping
  let strategy = globalConfig.system.strategy || "round";
  if (strategy === "round") strategy = "round"; 

  const chainPayload = {
    name: "upstream-chain",
    hops: [{
      name: "hop-0",
      selector: {
          strategy: strategy,
          maxFails: globalConfig.system.maxRetries,
          failTimeout: `${globalConfig.system.timeout}s`
      },
      nodes: nodes
    }]
  };

  const servicePayload = {
    name: "proxy-service",
    addr: `:${GOST_PROXY_PORT}`, // Main entry point
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
    try {
        await axios.delete(`${GOST_API_URL}/config/chains/upstream-chain`);
    } catch { /* ignore 404 */ }
    
    // Create Config Chain
    await axios.post(`${GOST_API_URL}/config/chains`, chainPayload);

    // 2. Configure Service
    try {
        await axios.delete(`${GOST_API_URL}/config/services/proxy-service`);
    } catch { /* ignore 404 */ }

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
  // Respect memory limit
  
  if (logs.length > MAX_LOGS) {
     // remove overflow
    logs.splice(0, logs.length - MAX_LOGS);
  }

  // Also enable winston logging
  if (log.level === "INFO") logger.info(log.message);
  else if (log.level === "ERROR") logger.error(log.message);
  else logger.info(`[${log.level}] ${log.message}`);

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

// Get current proxies
app.get("/api/proxies", (_req: Request, res: Response) => {
  res.json({ proxies: globalConfig.proxies });
});

// Update proxies
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

    // Update global config
    globalConfig.proxies = lines.filter(line => line.trim() && !line.trim().startsWith("#"));
    
    // Update GOST
    try {
        await updateGostChain();
    } catch (error) {
        console.error("Failed to update GOST chain:", error);
    }

    // Save
    await saveConfig();

    res.json({ success: true, count: nodes.length });
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
        globalConfig.system = { ...globalConfig.system, ...settings };
        await saveConfig();
        
        // Push chain update incase strategy changed
        if (globalConfig.proxies.length > 0) {
             updateGostChain().catch(err => console.error("Failed to update chain after settings change", err));
        }
        
        res.json({ success: true, settings: globalConfig.system });
    } catch {
        res.status(500).json({ error: "Failed to save settings" });
    }
});

// Get settings
app.get("/api/settings", (_req: Request, res: Response) => {
    res.json(globalConfig.system);
});

// Get test URLs
app.get("/api/test-urls", (_req: Request, res: Response) => {
    res.json({ urls: globalConfig.testUrls });
});

// Update test URLs
app.post("/api/test-urls", async (req: Request, res: Response) => {
    try {
        const { urls } = req.body;
        if (!Array.isArray(urls)) {
            res.status(400).json({ error: "urls must be an array" });
            return;
        }
        globalConfig.testUrls = urls;
        await saveConfig();
        res.json({ success: true, count: urls.length });
    } catch {
        res.status(500).json({ error: "Failed to save test URLs" });
    }
});

// Restore Proxies Helper
async function restoreProxies() {
    // Wait for a moment for GOST to be ready (it starts async)
    await new Promise(r => setTimeout(r, 2000));
    
    if (globalConfig.proxies.length > 0) {
        console.log(`🔄 Restoring ${globalConfig.proxies.length} proxies to GOST...`);
        try {
            await updateGostChain();
            console.log("✅ Proxies restored successfully");
        } catch (error) {
            console.error("❌ Failed to restore proxies:", error);
        }
    }
}

// --- GOST Log Handler ---
// Parse GOST's JSON logs and broadcast to UI
gostManager.setLogCallback((logLine: string) => {
    try {
        // GOST outputs JSON logs
        const parsed = JSON.parse(logLine);
        
        // Filter to show interesting logs (handler events with routing info)
        if (parsed.kind === "handler" && parsed.host) {
            // This is a request being routed
            const host = parsed.host || "unknown";
            const dst = parsed.dst || "direct"; // Upstream proxy used
            const msg = parsed.msg || "";
            
            // Format: "<->" means connection established, ">-<" means connection closed
            if (msg.includes("<->")) {
                broadcastLog({
                    timestamp: new Date().toISOString(),
                    level: "GOST",
                    message: `🔗 ${host} via ${dst}`,
                });
            }
        } else if (parsed.kind === "service" && parsed.msg) {
            // Service status messages
            broadcastLog({
                timestamp: new Date().toISOString(),
                level: "GOST",
                message: `⚙️ ${parsed.msg}`,
            });
        }
    } catch {
        // Not JSON or parse error - log raw if it looks important
        if (logLine.includes("error") || logLine.includes("Error")) {
            broadcastLog({
                timestamp: new Date().toISOString(),
                level: "ERROR",
                message: `GOST: ${logLine}`,
            });
        }
    }
});

// --- Application Startup ---
// Load config first (creates settings.json if missing), then start GOST
loadConfig().then(() => {
    // Start GOST only after config is ready
    gostManager.start(undefined, getGostEnv());
    restoreProxies();
}).catch(err => {
    console.error("❌ Failed to load config during startup:", err);
});

// Service Controls
app.post("/api/service/restart", async (_req: Request, res: Response) => {
    try {
        await gostManager.restart(undefined, getGostEnv());
        restoreProxies(); // Re-apply config
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: "Failed to restart" });
    }
});

app.post("/api/service/start", async (_req: Request, res: Response) => {
    try {
        gostManager.start(undefined, getGostEnv());
        restoreProxies(); // Re-apply config
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: "Failed to start" });
    }
});

app.post("/api/service/stop", async (_req: Request, res: Response) => {
    try {
        await gostManager.stop();
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: "Failed to stop" });
    }
});

app.get("/api/status", async (_req: Request, res: Response) => {
    const gostStatus = gostManager.getStatus();
    
    // Check if GOST API is responding (indicates service is ready)
    let apiResponding = false;
    try {
        // GOST v3 uses /config not /api/config
        await axios.get(`${GOST_API_URL}/config`, { timeout: 2000 });
        apiResponding = true;
    } catch {
        // API not responding
    }
    
    res.json({
        online: gostStatus.running,
        proxyServiceReady: apiResponding && globalConfig.proxies.length > 0,
        proxyCount: globalConfig.proxies.length,
        gost: gostStatus
    });
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

// Add a log entry (for frontend to send test start/stop etc.)
app.post("/api/logs", (req: Request, res: Response) => {
  const { message, level } = req.body;
  if (!message) {
    res.status(400).json({ error: "message required" });
    return;
  }
  broadcastLog({
    timestamp: new Date().toISOString(),
    level: level || "INFO",
    message
  });
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
    // Create proper proxy agents for HTTP/HTTPS requests
    const proxyUrl = `http://${GOST_PROXY_HOST}:${GOST_PROXY_PORT}`;
    const isHttps = url.startsWith('https://');
    const agent = isHttps 
      ? new HttpsProxyAgent(proxyUrl)
      : new HttpProxyAgent(proxyUrl);
    
    // Complete Chrome browser headers to bypass anti-bot detection
    const browserHeaders = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=0',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
    };
    
    // Use axios with proper agent for proxy routing
    const response = await axios.get(url, {
      httpAgent: isHttps ? undefined : agent,
      httpsAgent: isHttps ? agent : undefined,
      headers: browserHeaders,
      timeout: 15000,
      maxRedirects: 10,
      decompress: true,
      // Accept 2xx and 3xx as success (some sites redirect)
      validateStatus: (status) => status >= 200 && status < 400,
    });

    // Try to extract IP from response
    let ip = "";
    const status = response.status;
    
    // IP Regex (simple)
    const ipRegex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;

    if (typeof response.data === "string") {
        const trimmed = response.data.trim();
        if (ipRegex.test(trimmed) && trimmed.length < 20) {
            ip = trimmed;
        }
    } else if (response.data.origin) {
        ip = response.data.origin;
    } else if (response.data.ip) {
        ip = response.data.ip;
    }

    // Note: Per-test logs removed - GOST logs show routing details
    res.json({ success: true, ip: ip || "hidden", status, result: response.data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    // Check if it's an axios error with response
    const status = (error as { response?: { status?: number } }).response?.status || "ERR";

    // Keep error logs for debugging
    broadcastLog({
      timestamp: new Date().toISOString(),
      level: "ERROR",
      message: `Test ${url} [${status}]: ${message}`,
    });

    res.json({ success: false, error: message });
  }
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
    const response = await axios.get(`${GOST_API_URL}/config`);
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



// Catch-all route to serve React app (Express v5 syntax)
// MUST BE LAST
app.get("/{*splat}", (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "../../dist/index.html"));
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 GOST Proxy Manager running on http://localhost:${PORT}`);
  console.log(`📡 GOST API: ${GOST_API_URL}`);

  broadcastLog({
    timestamp: new Date().toISOString(),
    level: "INFO",
    message: "GOST Proxy Manager started",
  });
});

