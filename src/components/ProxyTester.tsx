import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ProxyTesterProps {
  proxyCount: number;
}

const TEST_SITES = [
  { name: "httpbin.org/ip", url: "http://httpbin.org/ip" },
  { name: "ipinfo.io", url: "http://ipinfo.io/json" },
  { name: "api.ipify.org", url: "http://api.ipify.org?format=json" },
  { name: "ifconfig.me", url: "http://ifconfig.me/ip" },
  { name: "checkip.amazonaws.com", url: "http://checkip.amazonaws.com" },
];

interface TestResult {
  site: string;
  success: boolean;
  ip?: string;
  time: number;
  error?: string;
}

export function ProxyTester({ proxyCount }: ProxyTesterProps) {
  const [running, setRunning] = useState(false);
  const [requestCount, setRequestCount] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const [results, setResults] = useState<TestResult[]>([]);
  const abortRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const runTest = useCallback(async (site: { name: string; url: string }) => {
    const start = Date.now();
    try {
      const response = await fetch(`/api/test?url=${encodeURIComponent(site.url)}`);
      const data = await response.json();
      const elapsed = Date.now() - start;
      
      if (response.ok && data.success) {
        setSuccessCount(prev => prev + 1);
        return { site: site.name, success: true, ip: data.ip || data.result, time: elapsed };
      } else {
        setFailCount(prev => prev + 1);
        return { site: site.name, success: false, error: data.error || "Failed", time: elapsed };
      }
    } catch (err) {
      const elapsed = Date.now() - start;
      setFailCount(prev => prev + 1);
      return { site: site.name, success: false, error: "Network error", time: elapsed };
    }
  }, []);

  const startTest = useCallback(() => {
    setRunning(true);
    abortRef.current = false;
    setRequestCount(0);
    setSuccessCount(0);
    setFailCount(0);
    setResults([]);

    let siteIndex = 0;
    
    intervalRef.current = setInterval(async () => {
      if (abortRef.current) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setRunning(false);
        return;
      }

      const site = TEST_SITES[siteIndex % TEST_SITES.length];
      siteIndex++;
      setRequestCount(prev => prev + 1);
      
      const result = await runTest(site);
      setResults(prev => [...prev.slice(-19), result]); // Keep last 20 results
    }, 500); // 2 requests per second
  }, [runTest]);

  const stopTest = useCallback(() => {
    abortRef.current = true;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setRunning(false);
  }, []);

  return (
    <Card className="flex-1 flex flex-col">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Proxy Tester</CardTitle>
          {running ? (
            <Button variant="destructive" size="sm" onClick={stopTest}>
              Stop
            </Button>
          ) : (
            <Button size="sm" onClick={startTest} disabled={proxyCount === 0}>
              Start Test
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="py-2 px-4 flex-1 flex flex-col gap-3">
        {/* Stats */}
        <div className="flex gap-2 text-xs">
          <Badge variant="outline" className="font-mono">
            Requests: {requestCount}
          </Badge>
          <Badge variant="outline" className="text-green-600 border-green-200">
            ✓ {successCount}
          </Badge>
          <Badge variant="outline" className="text-red-600 border-red-200">
            ✗ {failCount}
          </Badge>
        </div>

        {/* Test Sites */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Test Sites:</p>
          <div className="flex flex-wrap gap-1">
            {TEST_SITES.map(site => (
              <Badge key={site.name} variant="secondary" className="text-[10px]">
                {site.name}
              </Badge>
            ))}
          </div>
        </div>

        {/* Results */}
        <ScrollArea className="flex-1 min-h-[100px]">
          {results.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              {proxyCount === 0 ? "Configure proxies first" : "Click Start Test to begin"}
            </p>
          ) : (
            <div className="space-y-1">
              {results.slice().reverse().map((result, idx) => (
                <div 
                  key={idx} 
                  className={`text-xs py-1 px-2 rounded flex justify-between ${
                    result.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                  }`}
                >
                  <span className="truncate">{result.site}</span>
                  <span className="font-mono shrink-0 ml-2">
                    {result.success ? result.ip?.substring(0, 15) : result.error} ({result.time}ms)
                  </span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
