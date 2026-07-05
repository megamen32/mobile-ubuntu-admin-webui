"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { apiFetch, apiPost, clearApiCache } from "@/lib/api-client";
import { useHashRoute } from "@/lib/use-hash-route";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ArrowLeft,
  Save,
  Play,
  Loader2,
  Download,
  WrapText,
  Check,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// CodeMirror must be loaded client-side only
const CodeMirrorComponent = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      Loading editor...
    </div>
  ),
});

interface Props {
  filePath: string;
}

function inferLang(p: string): string {
  const ext = p.split(".").pop()?.toLowerCase() || "";
  if (ext === "ts" || ext === "tsx") return "ts";
  if (["js", "jsx", "mjs", "cjs"].includes(ext)) return "js";
  if (ext === "py") return "py";
  if (ext === "go") return "go";
  if (ext === "toml") return "toml";
  if (["html", "htm"].includes(ext)) return "html";
  if (ext === "css") return "css";
  if (ext === "json") return "json";
  if (ext === "rs") return "rust";
  if (["md", "markdown"].includes(ext)) return "md";
  return "txt";
}

export function FileEditor({ filePath }: Props) {
  const [, navigate] = useHashRoute();
  const [content, setContent] = useState<string>("");
  const [original, setOriginal] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [wrap, setWrap] = useState<boolean>(() => {
    return localStorage.getItem("ub-admin:editor-wrap") === "true";
  });
  const lang = inferLang(filePath);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ content: string }>(
        `/api/files?path=${encodeURIComponent(filePath)}`
      );
      setContent(data.content);
      setOriginal(data.content);
    } catch (e: any) {
      // New file: start empty
      if (e?.message?.includes("404") || e?.message?.includes("not found")) {
        setContent("");
        setOriginal("");
      } else {
        toast.error(`Failed to load: ${e?.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    localStorage.setItem("ub-admin:editor-wrap", String(wrap));
  }, [wrap]);

  const dirty = content !== original;

  async function handleSave() {
    setSaving(true);
    try {
      await apiPost(`/api/files/save`, { path: filePath, content });
      setOriginal(content);
      clearApiCache(`files:${filePath}`);
      toast.success("Saved");
    } catch (e: any) {
      toast.error(`Save failed: ${e?.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleFormat() {
    setFormatting(true);
    try {
      const r = await apiPost<{ content: string; formatter: string; mock: boolean }>(
        `/api/files/format`,
        { path: filePath, content, lang }
      );
      setContent(r.content);
      toast.success(`Formatted with ${r.formatter}${r.mock ? " (built-in)" : ""}`);
    } catch (e: any) {
      toast.error(`Format failed: ${e?.message}`);
    } finally {
      setFormatting(false);
    }
  }

  async function handleDownload() {
    const auth = JSON.parse(localStorage.getItem("ub-admin:auth") || "{}");
    const res = await fetch(
      `/api/files/download?path=${encodeURIComponent(filePath)}`,
      { headers: { Authorization: "Basic " + btoa(`${auth.username}:${auth.password}`) } }
    );
    if (!res.ok) {
      toast.error("Download failed");
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filePath.split("/").pop() || "file";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Keyboard shortcut: Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !saving) handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dirty, saving, content]);

  // Load language extensions dynamically
  const [extensions, setExtensions] = useState<any[]>([]);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const exts: any[] = [];
        const editorView = await import("@codemirror/view");
        const editorState = await import("@codemirror/state");
        const commands = await import("@codemirror/commands");
        const language = await import("@codemirror/language");
        const autocomplete = await import("@codemirror/autocomplete");
        const oneDark = await import("@codemirror/theme-one-dark");

        // Line wrapping
        if (wrap) exts.push(editorView.EditorView.lineWrapping);

        // Language support
        if (lang === "js" || lang === "ts") {
          const mod = await import("@codemirror/lang-javascript");
          exts.push(mod.javascript({ jsx: lang === "js" || lang === "ts", typescript: lang === "ts" }));
        } else if (lang === "py") {
          const mod = await import("@codemirror/lang-python");
          exts.push(mod.python());
        } else if (lang === "html") {
          const mod = await import("@codemirror/lang-html");
          exts.push(mod.html());
        } else if (lang === "css") {
          const mod = await import("@codemirror/lang-css");
          exts.push(mod.css());
        } else if (lang === "json") {
          const mod = await import("@codemirror/lang-json");
          exts.push(mod.json());
        } else if (lang === "go") {
          const mod = await import("@codemirror/lang-go");
          exts.push(mod.go());
        } else if (lang === "toml") {
          // Use StreamLanguage with toml legacy mode
          const langMod = await import("@codemirror/language");
          const tomlDef = await import("@codemirror/legacy-modes/mode/toml");
          exts.push(langMod.StreamLanguage.define(tomlDef.toml));
        } else if (lang === "rust") {
          const mod = await import("@codemirror/lang-rust");
          exts.push(mod.rust());
        } else if (lang === "md") {
          const mod = await import("@codemirror/lang-markdown");
          exts.push(mod.markdown());
        }

        // Theme + base config
        exts.push(oneDark.oneDark);
        exts.push(editorView.EditorView.theme({
          "&": { backgroundColor: "transparent", fontSize: "13px" },
          ".cm-gutters": { backgroundColor: "transparent" },
        }));
        exts.push(language.bracketMatching());
        exts.push(language.indentOnInput());
        exts.push(autocomplete.closeBrackets());
        exts.push(autocomplete.autocompletion());
        exts.push(editorView.highlightActiveLine());
        exts.push(editorView.highlightSpecialChars());
        exts.push(editorView.keymap.of([
          ...commands.defaultKeymap,
          ...commands.historyKeymap,
          ...autocomplete.completionKeymap,
        ]));

        if (mounted) setExtensions(exts);
      } catch (e) {
        console.error("Failed to load CodeMirror extensions", e);
      }
    })();
    return () => { mounted = false; };
  }, [lang, wrap]);

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Header */}
      <div className="px-3 py-2 flex items-center gap-2 border-b border-border">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate("/files")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-mono truncate">{filePath}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {lang} · {dirty ? <span className="text-yellow-400">modified</span> : <span className="text-emerald-400">saved</span>}
          </div>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 p-0", wrap && "text-primary")}
            onClick={() => setWrap(w => !w)}
            title="Toggle word wrap"
          >
            <WrapText className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={handleDownload}
            title="Download"
          >
            <Download className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={handleFormat}
            disabled={formatting}
            title="Auto-format"
          >
            {formatting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span className="ml-1 text-xs hidden sm:inline">Format</span>
          </Button>
          <Button
            variant={dirty ? "default" : "secondary"}
            size="sm"
            className="h-8 px-3"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span className="ml-1 text-xs">Save</span>
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden bg-black/30">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Loading file...
          </div>
        ) : (
          <CodeMirrorComponent
            value={content}
            onChange={(val) => setContent(val)}
            extensions={extensions}
            theme="dark"
            basicSetup={{
              lineNumbers: true,
              highlightActiveLine: true,
              highlightActiveLineGutter: true,
              foldGutter: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: true,
              tabSize: 2,
              indentOnInput: true,
            }}
            height="100%"
            className="h-full overflow-y-auto scrollbar-thin"
          />
        )}
      </div>

      {/* Status bar */}
      <div className="px-3 py-1 border-t border-border bg-secondary/30 flex items-center justify-between text-[10px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>{content.split("\n").length} lines</span>
          <span>{content.length} chars</span>
          <span className="uppercase">{lang}</span>
        </div>
        <div className="flex items-center gap-2">
          {dirty ? (
            <span className="flex items-center gap-1 text-yellow-400">
              <AlertCircle className="w-3 h-3" /> Unsaved changes · Ctrl+S
            </span>
          ) : (
            <span className="flex items-center gap-1 text-emerald-400">
              <Check className="w-3 h-3" /> Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
