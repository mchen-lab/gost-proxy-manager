import { useState, useEffect, useCallback } from "react";
import { ProxyList } from "./components/ProxyList";
import { ProxyTester } from "./components/ProxyTester";
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
import { Info, Play, Square, RotateCw } from "lucide-react";

interface Status {
  online: boolean;
  proxyServiceReady: boolean;
  proxyCount: number;
  gost?: {
    running: boolean;
    pid: number | null;
  };
}

function App() {
  const [status, setStatus] = useState<Status>({
    online: false,
    proxyServiceReady: false,
    proxyCount: 0,
  });

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/status");
      const data = await response.json();
      setStatus(data);
    } catch {
      setStatus({ online: false, proxyServiceReady: false, proxyCount: 0 });
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleServiceAction = async (action: "start" | "stop" | "restart") => {
    try {
      await fetch(`/api/service/${action}`, { method: "POST" });
      fetchStatus();
    } catch (err) {
      console.error(`Failed to ${action} service:`, err);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold">GOST Proxy Manager</h1>
            <div className="flex items-center gap-2">
              <Badge variant={status.online ? "default" : "destructive"}>
                {status.online ? "Online" : "Offline"}
              </Badge>
              {status.proxyServiceReady && (
                <Badge variant="secondary">Ready</Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {/* Process Controls */}
            <div className="flex items-center gap-1 mr-4 border-r pr-4">
              <Button 
                variant="outline" 
                size="icon" 
                className="h-8 w-8" 
                onClick={() => handleServiceAction("start")}
                disabled={status.gost?.running}
                title="Start Proxy"
              >
                <Play className="h-4 w-4 text-green-600" />
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                className="h-8 w-8" 
                onClick={() => handleServiceAction("restart")}
                disabled={!status.gost?.running}
                title="Restart Proxy"
              >
                <RotateCw className="h-4 w-4 text-blue-600" />
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                className="h-8 w-8" 
                onClick={() => handleServiceAction("stop")}
                disabled={!status.gost?.running}
                title="Stop Proxy"
              >
                <Square className="h-4 w-4 text-red-600" />
              </Button>
            </div>
            
            <span>Proxies: <strong className="text-foreground">{status.proxyCount}</strong></span>
            <span>PID: <strong className="text-foreground">{status.gost?.pid || "-"}</strong></span>
            <span>Port: <code className="text-foreground">31131</code></span>
            
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 ml-2">
                  <Info className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>About GOST Proxy Manager</DialogTitle>
                  <DialogDescription>
                    A simple UI for managing GOST forward proxies.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-sm text-muted-foreground">Version</span>
                    <span className="font-mono text-sm">{__APP_VERSION__}</span>
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
                      className="text-sm text-primary hover:underline"
                    >
                      mchen-lab/gost-proxy-manager
                    </a>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            
            <SettingsDialog />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-4">
        <div className="flex gap-4 h-[calc(100vh-80px)]">
          {/* Left Sidebar */}
          <aside className="w-[320px] flex-shrink-0 flex flex-col gap-4">
            <ProxyList onProxiesUpdated={fetchStatus} />
            <ProxyTester proxyCount={status.proxyCount} />
          </aside>
          
          {/* Main: Log Viewer */}
          <section className="flex-1 min-w-0">
            <LogViewer />
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;
