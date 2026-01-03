import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings } from "lucide-react";
import { toast } from "sonner";

interface AppSettings {
  strategy: string;
  maxRetries: number;
  timeout: number;
}

export function SettingsDialog({ onConfigUpdate }: { onConfigUpdate?: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Data States
  const [settings, setSettings] = useState<AppSettings>({
    strategy: "round",
    maxRetries: 1,
    timeout: 10
  });
  const [proxyText, setProxyText] = useState("");
  const [testUrlsText, setTestUrlsText] = useState("");

  const fetchData = async () => {
    try {
      const [settingsRes, proxiesRes, urlsRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/proxies"),
        fetch("/api/test-urls")
      ]);

      if (settingsRes.ok) setSettings(await settingsRes.json());
      
      if (proxiesRes.ok) {
        const data = await proxiesRes.json();
        setProxyText((data.proxies || []).join("\n"));
      }
      
      if (urlsRes.ok) {
        const data = await urlsRes.json();
        setTestUrlsText((data.urls || []).join("\n"));
      }
    } catch (error) {
      console.error("Failed to load data:", error);
      toast.error("Failed to load configuration");
    }
  };

  useEffect(() => {
    if (open) fetchData();
  }, [open]);

  const handleSave = async () => {
    setLoading(true);
    try {
      // 1. Save Settings
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });

      // 2. Save Proxies
      await fetch("/api/proxies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proxyList: proxyText })
      });

      // 3. Save Test URLs
      const urlsArray = testUrlsText.split("\n").map(s => s.trim()).filter(Boolean);
      await fetch("/api/test-urls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls: urlsArray })
      });

      toast.success("Configuration saved successfully");
      setOpen(false);
      if (onConfigUpdate) onConfigUpdate();
    } catch (error) {
      console.error("Failed to save:", error);
      toast.error("Failed to save configuration");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-full" title="Configuration">
          <Settings className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] h-[500px] flex flex-col">
        <DialogHeader>
          <DialogTitle>Configuration</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="general" className="flex-1 w-full flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="general">System Parameters</TabsTrigger>
                <TabsTrigger value="proxies">Upstream Proxies</TabsTrigger>
                <TabsTrigger value="urls">Testing URLs</TabsTrigger>
            </TabsList>
            
            <div className="flex-1 min-h-0 relative">
                <TabsContent value="general" className="absolute inset-0 overflow-y-auto py-4 space-y-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="strategy" className="text-right">Strategy</Label>
                        <Select value={settings.strategy} onValueChange={(val) => setSettings({ ...settings, strategy: val })}>
                        <SelectTrigger className="col-span-3">
                            <SelectValue placeholder="Select strategy" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="round">Round Robin</SelectItem>
                            <SelectItem value="random">Random</SelectItem>
                            <SelectItem value="fifo">FIFO</SelectItem>
                        </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="timeout" className="text-right">Timeout (s)</Label>
                        <Input id="timeout" type="number" min="1" className="col-span-3" value={settings.timeout} onChange={(e) => setSettings({ ...settings, timeout: parseInt(e.target.value) || 1 })} />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="retries" className="text-right">Max Retries</Label>
                        <Input id="retries" type="number" min="0" className="col-span-3" value={settings.maxRetries} onChange={(e) => setSettings({ ...settings, maxRetries: parseInt(e.target.value) || 0 })} />
                    </div>
                    
                </TabsContent>

                <TabsContent value="proxies" className="absolute inset-0 overflow-y-auto py-4">
                     <Textarea 
                        className="h-full font-mono text-xs resize-none" 
                        placeholder="host:port (one per line)"
                        value={proxyText}
                        onChange={(e) => setProxyText(e.target.value)}
                    />
                </TabsContent>

                <TabsContent value="urls" className="absolute inset-0 overflow-y-auto py-4">
                    <Textarea 
                        className="h-full font-mono text-xs resize-none" 
                        placeholder="http://example.com (one per line)"
                        value={testUrlsText}
                        onChange={(e) => setTestUrlsText(e.target.value)}
                    />
                </TabsContent>
            </div>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button type="submit" onClick={handleSave} disabled={loading} className="bg-slate-900 text-white">
            {loading ? "Saving..." : "Save Configuration"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
