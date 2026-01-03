import { useState, useEffect, useCallback, useRef } from "react";
import { SystemStatus } from "./components/SystemStatus";

import { LogViewer } from "./components/LogViewer";
import { SettingsDialog } from "./components/SettingsDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Info, Play, Square, RotateCw, Activity, Loader2 } from "lucide-react";

interface Status {
  online: boolean;
  proxyServiceReady: boolean;
  proxyCount: number;
  gost?: {
    running: boolean;
    pid: number | null;
  };
}

interface TestResult {
  site: string;
  success: boolean;
  ip?: string;
  time: number;
  error?: string;
}

function App() {
  const [status, setStatus] = useState<Status>({
    online: false,
    proxyServiceReady: false,
    proxyCount: 0,
  });

  const [settings, setSettings] = useState({
        strategy: "round",
        timeout: 10,
        maxRetries: 1
    });
  
  // Test Runner State
  const [testUrls, setTestUrls] = useState<string[]>([]);
  const [testStats, setTestStats] = useState({ total: 0, success: 0, fail: 0 });
  const [isTesting, setIsTesting] = useState(false);
  const [showNoProxiesAlert, setShowNoProxiesAlert] = useState(false);
  const abortRef = useRef(false);
  const isTestingRef = useRef(false); // Sync guard to prevent double-start
  const testTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const TEST_DURATION_LIMIT = 2 * 60 * 1000; // 2 minutes in milliseconds

  const fetchStatus = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
          fetch("/api/status"),
          fetch("/api/settings"),
          fetch("/api/test-urls")
      ]);
      
      const statusRes = results[0].status === 'fulfilled' ? results[0].value : null;
      const settingsRes = results[1].status === 'fulfilled' ? results[1].value : null;
      const urlsRes = results[2].status === 'fulfilled' ? results[2].value : null;

      if (statusRes?.ok) {
          const data = await statusRes.json();
          setStatus(data);
      } else {
          // If status endpoint fails, we are truly offline/error state
           setStatus(prev => ({ ...prev, online: false }));
      }

      if (settingsRes?.ok) {
          try {
            setSettings(await settingsRes.json());
          } catch { console.warn("Failed to parse settings"); }
      }

      if (urlsRes?.ok) {
          try {
            const data = await urlsRes.json();
            setTestUrls(data.urls || []);
          } catch { console.warn("Failed to parse test URLs"); }
      }
    } catch {
      console.error("Fetch status error");
      setStatus({ online: false, proxyServiceReady: false, proxyCount: 0 });
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const stopTest = useCallback(async () => {
    // Guard against duplicate calls
    if (abortRef.current) return;
    
    abortRef.current = true;
    isTestingRef.current = false;
    setIsTesting(false);
    // Clear the auto-stop timeout
    if (testTimeoutRef.current) {
      clearTimeout(testTimeoutRef.current);
      testTimeoutRef.current = null;
    }
    // Log test stopped
    fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "🛑 Testing stopped", level: "INFO" })
    }).catch(() => {});
  }, []);

  const handleServiceAction = async (action: "start" | "stop" | "restart") => {
    // Auto-stop testing if action is stop or restart
    if (isTesting && (action === "stop" || action === "restart")) {
        stopTest();
    }

    // Reset stats on restart
    if (action === "restart") {
        setTestStats({ total: 0, success: 0, fail: 0 });
    }

    const actionMap = { start: "Starting", stop: "Stopping", restart: "Restarting" };
    const successMap = { start: "Started", stop: "Stopped", restart: "Restarted" };
    
    const promise = async () => {
      const res = await fetch(`/api/service/${action}`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      await fetchStatus();
    };

    toast.promise(promise(), {
      loading: `${actionMap[action]} proxy service...`,
      success: `${successMap[action]} service successfully`,
      error: `Failed to ${action} service`,
    });
  };

  // --- Test Runner Logic ---
  const startTest = useCallback(async () => {
     // Sync guard to prevent double-start (React state is async)
     if (isTestingRef.current) {
         return;
     }
     isTestingRef.current = true;
     
     // Check if proxies are configured
     if (status.proxyCount === 0) {
         isTestingRef.current = false;
         setShowNoProxiesAlert(true);
         return;
     }
     
     // Refresh URLs first
     try {
         const res = await fetch("/api/test-urls");
         const data = await res.json();
         const urls = data.urls || [];
          if (urls.length === 0) {
              isTestingRef.current = false;
              toast.error("No test URLs configured");
              return;
          }
         
         setIsTesting(true);
         abortRef.current = false;
         setTestStats({ total: 0, success: 0, fail: 0 });
         
         // Log test started
         fetch("/api/logs", {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ message: `🚀 Testing started (${urls.length} URLs)`, level: "INFO" })
         }).catch(() => {});
         
         // Set 2-minute auto-stop timeout
         if (testTimeoutRef.current) {
             clearTimeout(testTimeoutRef.current);
         }
         testTimeoutRef.current = setTimeout(() => {
             if (!abortRef.current) {
                 abortRef.current = true;
                 setIsTesting(false);
                 toast.info("Testing stopped after 2 minutes");
             }
         }, TEST_DURATION_LIMIT);
         
         let siteIndex = 0;
         
         const runNext = async () => {
             if (abortRef.current) return;
             
             const url = urls[siteIndex % urls.length];
             const name = new URL(url).hostname;
             siteIndex++;
             
             const start = Date.now();
             try {
                const response = await fetch(`/api/test?url=${encodeURIComponent(url)}`);
                const data = await response.json();
                const elapsed = Date.now() - start;
                
                const result: TestResult = {
                    site: name,
                    time: elapsed,
                    success: response.ok && data.success,
                    ip: data.ip || data.result,
                    error: data.error
                };
                
                setTestStats(prev => ({
                    total: prev.total + 1,
                    success: prev.success + (result.success ? 1 : 0),
                    fail: prev.fail + (result.success ? 0 : 1)
                }));
             } catch {
                 // ignore network error for runner loop
             }
             
             if (!abortRef.current) {
                 setTimeout(runNext, 500); // 500ms delay between tests
             }
         };
         
         runNext();
     } catch {
         isTestingRef.current = false;
         toast.error("Failed to start tests");
         setIsTesting(false);
     }
  }, [status.proxyCount, TEST_DURATION_LIMIT]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
                <div className="h-8 w-8 bg-slate-900 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-lg">G</span>
                </div>
                <h1 className="text-lg font-semibold tracking-tight text-slate-900">Proxy Manager</h1>
            </div>
            
            <div className="h-6 w-px bg-slate-200 mx-2" />
            
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`gap-1.5 ${status.online ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                <span className={`h-2 w-2 rounded-full ${status.online ? "bg-emerald-500" : "bg-red-500"}`} />
                {status.online ? "System Online" : "System Offline"}
              </Badge>
              {status.proxyServiceReady && (
                <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100">Ready</Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* Controls */}
            <div className="flex items-center gap-2">
              <Button 
                size="sm"
                className={`h-9 px-3 gap-2 transition-all cursor-pointer ${
                    status.gost?.running 
                    ? "bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-100" 
                    : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-md hover:shadow-lg border-emerald-700"
                }`}
                 onClick={() => handleServiceAction("start")}
                 disabled={!!status.gost?.running}
               >
                 <Play className="h-3.5 w-3.5 fill-current" /> Start
               </Button>
               <Button 
                 size="sm"
                 className={`h-9 px-3 gap-2 transition-all cursor-pointer ${
                    isTesting 
                    ? "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200" 
                    : "bg-white text-slate-700 hover:bg-slate-50 border-slate-200"
                 }`}
                 onClick={isTesting ? stopTest : startTest}
                 disabled={!status.gost?.running}
               >
                 {isTesting ? (
                     <Loader2 className="h-3.5 w-3.5 animate-spin" />
                 ) : (
                     <Activity className={`h-3.5 w-3.5`} />
                 )}
                 {isTesting ? "Testing..." : "Test"}
               </Button>
              <Button 
                size="sm"
                className="h-9 px-3 gap-2 transition-all cursor-pointer bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg border-blue-700 disabled:opacity-50 disabled:shadow-none"
                onClick={() => handleServiceAction("restart")}
                disabled={!status.gost?.running}
              >
                <RotateCw className="h-3.5 w-3.5" /> Restart
              </Button>
              <Button 
                size="sm"
                className="h-9 px-3 gap-2 transition-all cursor-pointer bg-red-600 text-white hover:bg-red-700 shadow-md hover:shadow-lg border-red-700 disabled:opacity-50 disabled:shadow-none"
                onClick={() => handleServiceAction("stop")}
                disabled={!status.gost?.running}
              >
                <Square className="h-3.5 w-3.5 fill-current" /> Stop
              </Button>
            </div>
            
            <div className="flex items-center gap-1">
                <SettingsDialog onConfigUpdate={fetchStatus} />
                <Dialog>
                <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground cursor-pointer">
                    <Info className="h-4 w-4" />
                    </Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                    <DialogTitle>About GOST Proxy Manager</DialogTitle>
                    <DialogDescription>
                        Professional management interface for GOST forwarding chains.
                    </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                    <div className="flex justify-between border-b pb-2">
                        <span className="text-sm text-muted-foreground">Version</span>
                        <div className="flex flex-col items-end">
                            <span className="font-mono text-sm">{__APP_VERSION__}</span>
                            <span className="text-xs text-muted-foreground">{new Date(__BUILD_DATE__).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                        <span className="text-sm text-muted-foreground">Commit</span>
                        <span className="font-mono text-sm">{__COMMIT_HASH__}</span>
                    </div>
                    <div className="flex justify-between pt-2">
                        <span className="text-sm text-muted-foreground">Repository</span>
                        <a 
                        href="https://github.com/mchen-lab/gost-proxy-manager" 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-sm text-primary hover:underline cursor-pointer"
                        >
                        mchen-lab/gost-proxy-manager
                        </a>
                    </div>
                    </div>
                </DialogContent>
                </Dialog>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6">
        <div className="flex flex-col gap-6 h-[calc(100vh-140px)]">
            <SystemStatus 
                settings={settings}
                proxyCount={status.proxyCount}
                testUrlCount={testUrls.length}
                testerStats={testStats}
                pid={status.gost?.pid || null}
                port={31131}
            />
          
          {/* Main: Log Viewer */}
          <section className="flex-1 min-h-0">
            <LogViewer />
          </section>
        </div>
      </main>
      
      {/* No Proxies Alert Dialog */}
      <AlertDialog open={showNoProxiesAlert} onOpenChange={setShowNoProxiesAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No Upstream Proxies Configured</AlertDialogTitle>
            <AlertDialogDescription>
              You need to configure at least one upstream proxy before running tests. 
              Click the Settings icon in the header to add your proxy servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Got it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <Toaster />
    </div>
  );
}

export default App;
