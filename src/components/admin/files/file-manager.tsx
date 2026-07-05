"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { apiFetch, clearApiCache } from "@/lib/api-client";
import { useHashRoute } from "@/lib/use-hash-route";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Folder,
  File as FileIcon,
  FileCode,
  FileText,
  ChevronRight,
  Home,
  ArrowUp,
  RefreshCw,
  Download,
  Upload,
  Loader2,
  HardDrive,
  Pencil,
  MoreVertical,
  Trash2,
  FolderPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface DirEntry {
  name: string;
  isDir: boolean;
  size: number;
  mtime: number;
  mode: string;
}

export function FileManager() {
  const [, navigate] = useHashRoute();
  const [path, setPath] = useState<string>("/");
  const [pathInput, setPathInput] = useState<string>("/");
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load(targetPath: string, force = false) {
    if (force) { setRefreshing(true); clearApiCache("files"); }
    else setLoading(true);
    try {
      const data = await apiFetch<{ path: string; entries: DirEntry[] }>(
        `/api/files?path=${encodeURIComponent(targetPath)}`,
        { cacheKey: `files:${targetPath}`, maxAge: force ? 0 : 30_000 }
      );
      setPath(data.path);
      setPathInput(data.path);
      setEntries(data.entries);
      setSelected(null);
    } catch (e: any) {
      toast.error(`Failed: ${e?.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(path); }, []);

  function navigateTo(newPath: string) {
    load(newPath);
  }

  function goUp() {
    if (path === "/") return;
    const parts = path.split("/").filter(Boolean);
    parts.pop();
    load(parts.length === 0 ? "/" : "/" + parts.join("/"));
  }

  function goHome() {
    load("/root");
  }

  function handlePathSubmit(e: React.FormEvent) {
    e.preventDefault();
    navigateTo(pathInput);
  }

  async function handleDownload(entry: DirEntry) {
    if (entry.isDir) return;
    const auth = JSON.parse(localStorage.getItem("ub-admin:auth") || "{}");
    const url = `/api/files/download?path=${encodeURIComponent(path === "/" ? "/" + entry.name : path + "/" + entry.name)}`;
    const res = await fetch(url, {
      headers: { Authorization: "Basic " + btoa(`${auth.username}:${auth.password}`) },
    });
    if (!res.ok) {
      toast.error("Download failed");
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = entry.name;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`Downloaded ${entry.name}`);
  }

  async function handleUpload(file: File) {
    try {
      const auth = JSON.parse(localStorage.getItem("ub-admin:auth") || "{}");
      const form = new FormData();
      form.append("dest", path);
      form.append("file", file);
      const res = await fetch("/api/files/upload", {
        method: "POST",
        headers: { Authorization: "Basic " + btoa(`${auth.username}:${auth.password}`) },
        body: form,
      });
      if (!res.ok) throw new Error("Upload failed");
      toast.success(`Uploaded ${file.name}`);
      clearApiCache(`files:${path}`);
      load(path, true);
    } catch (e: any) {
      toast.error(`Upload failed: ${e?.message}`);
    }
  }

  async function handleDelete(entry: DirEntry) {
    if (!confirm(`Delete ${entry.name}?`)) return;
    try {
      await apiFetch(`/api/files`, {
        method: "POST",
        body: JSON.stringify({
          action: "delete",
          path: path === "/" ? "/" + entry.name : path + "/" + entry.name,
        }),
      });
      toast.success(`Deleted ${entry.name}`);
      clearApiCache(`files:${path}`);
      load(path, true);
    } catch (e: any) {
      toast.error(`Delete failed: ${e?.message}`);
    }
  }

  async function handleMkdir() {
    const name = prompt("New folder name:");
    if (!name) return;
    try {
      await apiFetch(`/api/files`, {
        method: "POST",
        body: JSON.stringify({
          action: "mkdir",
          path: path === "/" ? "/" + name : path + "/" + name,
        }),
      });
      toast.success(`Created ${name}`);
      clearApiCache(`files:${path}`);
      load(path, true);
    } catch (e: any) {
      toast.error(`Mkdir failed: ${e?.message}`);
    }
  }

  const breadcrumbs = path.split("/").filter(Boolean);

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Files</h1>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleMkdir} title="New folder">
            <FolderPlus className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => fileInputRef.current?.click()} title="Upload">
            <Upload className="w-4 h-4" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = "";
            }}
          />
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => load(path, true)} disabled={refreshing}>
            <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Address bar */}
      <form onSubmit={handlePathSubmit} className="flex gap-1.5">
        <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={goHome} title="Home">
          <Home className="w-4 h-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={goUp} disabled={path === "/"} title="Up">
          <ArrowUp className="w-4 h-4" />
        </Button>
        <Input
          type="text"
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          className="flex-1 h-9 font-mono text-xs bg-card"
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
        />
        <Button type="submit" variant="secondary" size="sm" className="h-9">Go</Button>
      </form>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 text-xs overflow-x-auto no-scrollbar -mx-3 px-3">
        <button
          onClick={() => navigateTo("/")}
          className="shrink-0 px-1.5 py-0.5 rounded hover:bg-accent text-muted-foreground"
        >
          /
        </button>
        {breadcrumbs.map((part, i) => {
          const target = "/" + breadcrumbs.slice(0, i + 1).join("/");
          const isLast = i === breadcrumbs.length - 1;
          return (
            <div key={target} className="flex items-center shrink-0">
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
              <button
                onClick={() => navigateTo(target)}
                className={cn(
                  "px-1.5 py-0.5 rounded hover:bg-accent truncate max-w-[120px]",
                  isLast ? "text-foreground font-medium" : "text-muted-foreground"
                )}
              >
                {part}
              </button>
            </div>
          );
        })}
      </div>

      {/* Entries */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          Loading...
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-12">
          Empty directory
        </div>
      ) : (
        <div className="space-y-0.5">
          {entries.map(entry => (
            <FileRow
              key={entry.name}
              entry={entry}
              selected={selected === entry.name}
              onSelect={() => setSelected(entry.name)}
              onOpen={() => {
                if (entry.isDir) {
                  navigateTo(path === "/" ? "/" + entry.name : path + "/" + entry.name);
                } else {
                  const fullPath = path === "/" ? "/" + entry.name : path + "/" + entry.name;
                  navigate(`/files/edit?path=${encodeURIComponent(fullPath)}`);
                }
              }}
              onDownload={() => handleDownload(entry)}
              onDelete={() => handleDelete(entry)}
              onEdit={() => {
                const fullPath = path === "/" ? "/" + entry.name : path + "/" + entry.name;
                navigate(`/files/edit?path=${encodeURIComponent(fullPath)}`);
              }}
            />
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground text-center pt-2">
        {entries.length} entries · cached, refreshes every 30s
      </div>
    </div>
  );
}

function FileRow({
  entry, selected, onSelect, onOpen, onDownload, onDelete, onEdit,
}: {
  entry: DirEntry;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const icon = getIcon(entry);
  return (
    <Card
      className={cn(
        "flex items-center gap-2.5 px-2.5 py-2 cursor-pointer transition-colors",
        selected ? "bg-accent" : "hover:bg-accent/50",
      )}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <div className={cn("shrink-0", entry.isDir ? "text-primary" : "text-muted-foreground")}>
        {icon}
      </div>
      <div className="min-w-0 flex-1" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
        <div className="text-sm font-medium truncate">{entry.name}</div>
        <div className="text-[10px] text-muted-foreground font-mono">
          {entry.isDir ? entry.mode : formatSize(entry.size)} · {formatDate(entry.mtime)}
        </div>
      </div>
      {!entry.isDir && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 shrink-0"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          title="Edit"
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!entry.isDir && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDownload(); }}>
              <Download className="w-3.5 h-3.5 mr-2" />
              Download
            </DropdownMenuItem>
          )}
          {!entry.isDir && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
              <Pencil className="w-3.5 h-3.5 mr-2" />
              Edit
            </DropdownMenuItem>
          )}
          {entry.isDir && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpen(); }}>
              <Folder className="w-3.5 h-3.5 mr-2" />
              Open
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 className="w-3.5 h-3.5 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Card>
  );
}

function getIcon(entry: DirEntry): React.ReactNode {
  if (entry.isDir) return <Folder className="w-4 h-4 fill-current" />;
  const ext = entry.name.split(".").pop()?.toLowerCase();
  if (["js", "ts", "jsx", "tsx", "py", "go", "rs", "java", "c", "cpp", "rb"].includes(ext || "")) {
    return <FileCode className="w-4 h-4" />;
  }
  if (["md", "txt", "log", "conf", "cfg"].includes(ext || "")) {
    return <FileText className="w-4 h-4" />;
  }
  return <FileIcon className="w-4 h-4" />;
}

function formatSize(b: number): string {
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  if (b < 1024 * 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + " MB";
  return (b / 1024 / 1024 / 1024).toFixed(2) + " GB";
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
