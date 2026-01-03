import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ProxyListProps {
  onProxiesUpdated: () => void;
}

export function ProxyList({ onProxiesUpdated }: ProxyListProps) {
  const [proxyList, setProxyList] = useState<string[]>([]);
  const [editText, setEditText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchProxies();
  }, []);

  const fetchProxies = async () => {
    try {
      const response = await fetch("/api/proxies");
      const data = await response.json();
      const proxies = data.proxies || [];
      setProxyList(proxies);
    } catch {
      console.error("Failed to fetch proxies");
    }
  };

  const handleEdit = () => {
    // Load current proxy list into textarea
    setEditText(proxyList.join("\n"));
    setMessage(null);
    setIsEditing(true);
  };

  const handleSave = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/proxies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxyList: editText }),
      });
      const data = await response.json();
      if (response.ok) {
        setMessage({ type: "success", text: `Saved ${data.count} proxies` });
        await fetchProxies();
        onProxiesUpdated();
        setIsEditing(false);
      } else {
        setMessage({ type: "error", text: data.error || "Failed" });
      }
    } catch {
      setMessage({ type: "error", text: "Connection error" });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setEditText("");
    setIsEditing(false);
    setMessage(null);
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">Upstream Proxies ({proxyList.length})</CardTitle>
        {!isEditing ? (
          <Button variant="outline" size="sm" onClick={handleEdit}>
            Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={loading}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={loading || !editText.trim()}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="py-2 px-4 flex-1">
        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              placeholder="host:port (one per line)"
              className="h-[140px] font-mono text-xs resize-none"
            />
            {message && (
              <p className={`text-xs ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
                {message.text}
              </p>
            )}
          </div>
        ) : (
          <ScrollArea className="h-[140px]">
            {proxyList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No proxies configured</p>
            ) : (
              <div className="space-y-0.5">
                {proxyList.map((proxy, idx) => (
                  <div key={idx} className="py-1 px-2 bg-muted/50 rounded text-xs font-mono truncate">
                    {idx + 1}. {proxy}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
