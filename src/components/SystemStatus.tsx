import { Card, CardContent } from "@/components/ui/card";

interface SystemStatusProps {
  settings: {
    strategy: string;
    maxRetries: number;
    timeout: number;
  };
  proxyCount: number;
  testUrlCount: number;
  testerStats: {
    total: number;
    success: number;
    fail: number;
  };
  port: number;
  pid: number | null;
}

export function SystemStatus({ settings, proxyCount, testUrlCount, testerStats, port, pid }: SystemStatusProps) {
  const errorRate = testerStats.total > 0 
    ? ((testerStats.fail / testerStats.total) * 100).toFixed(1) 
    : "0.0";

  return (
      <Card className="flex flex-col border-0 shadow-md bg-white overflow-hidden">
        <CardContent className="p-5">
            {/* Row 1: Config */}
            <div className="flex flex-wrap gap-x-8 gap-y-4 border-b border-slate-100 pb-4 mb-4">
                 <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Strategy</span>
                    <span className="font-mono text-sm font-medium text-slate-900 truncate max-w-[120px]">{settings.strategy}</span>
                </div>
                 <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Timeout</span>
                    <span className="font-mono text-sm font-medium text-slate-900">{settings.timeout}s</span>
                </div>
                 <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">PID</span>
                    <span className="font-mono text-sm font-medium text-slate-900">{pid || "N/A"}</span>
                </div>
                 <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Max Retries</span>
                    <span className="font-mono text-sm font-medium text-slate-900">{settings.maxRetries}</span>
                </div>
                 <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Upstreams</span>
                    <span className="font-mono text-sm font-medium text-slate-900">{proxyCount}</span>
                </div>
                 <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Testing URLs</span>
                    <span className="font-mono text-sm font-medium text-slate-900">{testUrlCount}</span>
                </div>
                 <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Proxy URL</span>
                    <span className="font-mono text-sm font-medium text-slate-900">http://localhost:{port}</span>
                </div>
            </div>

            {/* Row 2: Status */}
            <div className="flex flex-wrap gap-x-8 gap-y-4">
                <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Requests</span>
                    <span className="font-mono text-sm font-medium text-slate-900">{testerStats.total}</span>
                </div>
                
                 <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Errors</span>
                    <span className="font-mono text-sm font-medium text-slate-900">{testerStats.fail}</span>
                </div>

                <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Error Rate</span>
                    <span className={`font-mono text-sm font-medium ${Number(errorRate) > 50 ? "text-red-500" : "text-emerald-600"}`}>{errorRate}%</span>
                </div>
            </div>
      </CardContent>
    </Card>
  );
}
