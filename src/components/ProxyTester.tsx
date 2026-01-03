import { useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TestResult {
  site: string;
  success: boolean;
  ip?: string;
  time: number;
  error?: string;
}

interface TestStats {
  total: number;
  success: number;
  fail: number;
}

interface ProxyTesterProps {
  isRunning: boolean;
  hasProxies: boolean;
  results: TestResult[];
  stats: TestStats;
  onStart: () => void;
  onStop: () => void;
}

export function ProxyTester({ isRunning, hasProxies, results, stats, onStart, onStop }: ProxyTesterProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logic
  useEffect(() => {
    if (isRunning && scrollRef.current) {
        // Simple auto-scroll to bottom
        const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
             viewport.scrollTop = viewport.scrollHeight;
        }
    }
  }, [results, isRunning]);

  return (
    <Card className="flex-1 flex flex-col border-0 shadow-md bg-white overflow-hidden min-h-0">
      <CardHeader className="py-4 px-5 flex flex-row items-center justify-between border-b bg-slate-50/50">
        <div className="flex flex-col gap-0.5">
            <CardTitle className="text-sm font-semibold text-slate-900">Connectivity Stream</CardTitle>
            <div className="flex gap-2 text-[10px]">
                <span className={`font-medium tracking-wide uppercase ${isRunning ? "text-emerald-600 animate-pulse" : "text-slate-500"}`}>{isRunning ? "Running" : "Idle"}</span>
                <span className="text-slate-400">|</span>
                <span className="text-emerald-600 font-medium">Pass: {stats.success}</span>
                <span className="text-red-500 font-medium">Fail: {stats.fail}</span>
            </div>
        </div>
        {isRunning ? (
        <Button variant="destructive" size="sm" onClick={onStop} className="h-7 text-xs bg-red-500 hover:bg-red-600 cursor-pointer">
            Stop Test
        </Button>
        ) : (
        <Button size="sm" onClick={onStart} disabled={!hasProxies} className="h-7 text-xs bg-slate-900 text-white hover:bg-slate-800 cursor-pointer">
            Start Test
        </Button>
        )}
      </CardHeader>
      <CardContent className="p-0 flex-1 flex flex-col min-h-0 relative">
        <ScrollArea className="flex-1 w-full bg-slate-50/30" ref={scrollRef}>
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-2">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                    <span className="text-sm">⚡</span>
                </div>
              <p className="text-xs">{!hasProxies ? "Configure proxies first" : "Ready to test"}</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {results.slice().reverse().map((result, idx) => (
                <div 
                  key={idx} 
                  className={`text-xs py-2 px-5 flex items-center justify-between border-b border-slate-100 last:border-0 ${
                    result.success ? "bg-white" : "bg-red-50/30"
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${result.success ? "bg-emerald-500" : "bg-red-500"}`} />
                      <span className={`font-medium truncate ${result.success ? "text-slate-700" : "text-red-700"}`}>{result.site}</span>
                  </div>
                  
                  <div className="flex items-center gap-2 shrink-0">
                      {result.success ? (
                          <span className="font-mono text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-[3px] text-[10px]">{result.ip}</span>
                      ) : (
                          <span className="font-mono text-red-600 bg-red-50 px-1.5 py-0.5 rounded-[3px] text-[10px]">{result.error}</span>
                      )}
                      <span className="text-[10px] text-slate-400 w-10 text-right">{result.time}ms</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
