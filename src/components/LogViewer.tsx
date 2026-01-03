import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

export function LogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const connectWebSocket = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/logs`);
    
    ws.onopen = () => setConnected(true);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "history") setLogs(data.data);
      else if (data.type === "log") setLogs((prev) => [...prev.slice(-499), data.data]);
    };
    ws.onclose = () => { setConnected(false); setTimeout(connectWebSocket, 3000); };
    ws.onerror = () => setConnected(false);
    return ws;
  }, []);

  useEffect(() => {
    const ws = connectWebSocket();
    return () => ws.close();
  }, [connectWebSocket]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    setAutoScroll(target.scrollHeight - target.scrollTop <= target.clientHeight + 50);
  };

  const clearLogs = async () => {
    await fetch("/api/logs", { method: "DELETE" });
    setLogs([]);
  };

  const formatTime = (ts: string) => {
    try { return new Date(ts).toLocaleTimeString(); } catch { return ts; }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Request Logs</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={connected ? "default" : "destructive"}>
            {connected ? "Connected" : "Disconnected"}
          </Badge>
          <Badge variant="outline">{autoScroll ? "Auto-scroll" : "Paused"}</Badge>
          <Button variant="outline" size="sm" onClick={clearLogs}>Clear</Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full" onScrollCapture={handleScroll}>
          <div ref={scrollRef} className="p-4 font-mono text-sm space-y-1">
            {logs.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No logs yet</p>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className="flex gap-2 p-1 hover:bg-muted rounded">
                  <span className="text-muted-foreground shrink-0">{formatTime(log.timestamp)}</span>
                  <span className={`shrink-0 font-medium ${
                    log.level === "ERROR" ? "text-red-600" : 
                    log.level === "WARN" ? "text-yellow-600" : "text-blue-600"
                  }`}>[{log.level}]</span>
                  <span>{log.message}</span>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
