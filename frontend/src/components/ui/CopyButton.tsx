import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useToast } from "../../context/ToastContext";

export function CopyButton({ text, label = "Copier" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const { notify } = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for browsers without the async clipboard API
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (!ok) {
        notify("Impossible de copier dans le presse-papiers", "error");
        return;
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={copy} disabled={!text}>
      {copied ? <Check size={14} /> : <Copy size={14} />}
      <span>{copied ? "Copié" : label}</span>
    </button>
  );
}
