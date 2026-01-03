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
import { Settings } from "lucide-react";

interface AppSettings {
  concurrency: number;
  strategy: string;
  maxRetries: number;
  timeout: number;
}

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({
    concurrency: 0,
    strategy: "round",
    maxRetries: 1,
    timeout: 10,
  });

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        setSettings(await res.json());
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  };

  useEffect(() => {
    if (open) fetchSettings();
  }, [open]);

  const handleSave = async () => {
    setLoading(true);
    try {
        await fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(settings)
        });
        setOpen(false);
        // Optional: Notify user or trigger restart dialog if concurrency changed
    } catch (error) {
        console.error("Failed to save settings:", error);
    } finally {
        setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 ml-2" title="Performance Settings">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Performance Settings</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="concurrency" className="text-right">
              CPU Threads
            </Label>
            <div className="col-span-3">
                <Input
                id="concurrency"
                type="number"
                min="0"
                value={settings.concurrency}
                onChange={(e) => setSettings({ ...settings, concurrency: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                    0 for Auto. Set to limit CPU usage (GOMAXPROCS).
                    <span className="text-red-500 ml-1">Requires core restart.</span>
                </p>
            </div>
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="strategy" className="text-right">
              Strategy
            </Label>
            <Select 
                value={settings.strategy} 
                onValueChange={(val) => setSettings({ ...settings, strategy: val })}
            >
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
            <Label htmlFor="retries" className="text-right">
              Max Retries
            </Label>
            <Input
              id="retries"
              type="number"
              min="0"
              className="col-span-3"
              value={settings.maxRetries}
              onChange={(e) => setSettings({ ...settings, maxRetries: parseInt(e.target.value) || 0 })}
            />
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="timeout" className="text-right">
              Timeout (s)
            </Label>
            <Input
              id="timeout"
              type="number"
              min="1"
              className="col-span-3"
              value={settings.timeout}
              onChange={(e) => setSettings({ ...settings, timeout: parseInt(e.target.value) || 1 })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save options"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
