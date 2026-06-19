"use client";

import { ImagePlus, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type FileUploadFieldProps = {
  name: string;
  label: string;
  accept?: string;
  required?: boolean;
  currentUrl?: string | null;
  currentAlt?: string;
  removeName?: string;
  uploadedUrlName?: string;
  removeLabel?: string;
  help?: string;
};

export function FileUploadField({
  name,
  label,
  accept,
  required = false,
  currentUrl,
  currentAlt = "",
  removeName,
  uploadedUrlName,
  removeLabel = "Aktuelles Bild entfernen und Standardbild verwenden",
  help
}: FileUploadFieldProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "ready" | "error">("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const [removeCurrent, setRemoveCurrent] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(() => {
    if (!file || !file.type.startsWith("image/")) return "";
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form || !uploadedUrlName) return;
    const handleSubmit = (event: SubmitEvent) => {
      if (uploadState === "uploading") {
        event.preventDefault();
        setUploadMessage("Bitte warten, bis der Upload fertig ist.");
      }
      if (uploadState === "error") {
        event.preventDefault();
        setUploadMessage("Der Upload ist fehlgeschlagen. Wähle die Datei bitte erneut aus.");
      }
    };
    form.addEventListener("submit", handleSubmit);
    return () => form.removeEventListener("submit", handleSubmit);
  }, [uploadState, uploadedUrlName]);

  return (
    <div ref={rootRef} className="space-y-3">
      {uploadedUrlName ? <input type="hidden" name={uploadedUrlName} value={uploadedUrl} /> : null}
      <div className="text-sm font-medium text-graphite">{label}</div>
      {currentUrl ? (
        <div className="overflow-hidden rounded-md border border-line bg-paper">
          <div className="aspect-[16/10] bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl || currentUrl} alt={currentAlt} className="h-full w-full object-cover" />
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-graphite">
            <span>{file ? "Neue Vorschau" : "Aktuelles Bild"}</span>
            {file ? <span className="font-medium text-redbrand">{file.name}</span> : null}
          </div>
        </div>
      ) : previewUrl ? (
        <div className="overflow-hidden rounded-md border border-line bg-paper">
          <div className="aspect-[16/10] bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="px-3 py-2 text-xs font-medium text-redbrand">{file?.name}</div>
        </div>
      ) : null}

      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line bg-surface px-4 py-5 text-center text-sm text-graphite transition hover:bg-paper focus-within:outline-none focus-within:ring-2 focus-within:ring-redbrand/30 focus-within:ring-offset-2">
        <input
          ref={inputRef}
          className="sr-only"
          name={uploadedUrlName ? undefined : name}
          type="file"
          accept={accept}
          required={required}
          onChange={(event) => {
            const nextFile = event.currentTarget.files?.[0] || null;
            setFile(nextFile);
            setUploadedUrl("");
            setUploadMessage("");
            if (!nextFile) {
              setUploadState("idle");
              return;
            }
            setRemoveCurrent(false);
            if (!uploadedUrlName) {
              setUploadState("ready");
              return;
            }
            setUploadState("uploading");
            const body = new FormData();
            body.append("file", nextFile);
            fetch("/api/uploads", { method: "POST", body })
              .then(async (response) => {
                const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
                if (!response.ok || !payload.url) throw new Error(payload.error || "Upload fehlgeschlagen");
                setUploadedUrl(payload.url);
                setUploadMessage("Upload bereit. Du kannst jetzt speichern.");
                setUploadState("ready");
              })
              .catch((error) => {
                setUploadedUrl("");
                setUploadMessage(error instanceof Error ? error.message : "Upload fehlgeschlagen");
                setUploadState("error");
              });
          }}
        />
        {accept?.includes("image") ? <ImagePlus className="h-5 w-5 text-redbrand" /> : <Upload className="h-5 w-5 text-redbrand" />}
        <span className="font-semibold text-ink">{file ? file.name : "Datei auswählen"}</span>
        <span>
          {file
            ? uploadState === "uploading"
              ? `${Math.round(file.size / 1024)} KB ausgewählt, Upload läuft...`
              : `${Math.round(file.size / 1024)} KB ausgewählt`
            : help || "Tippen, um eine Datei auszuwählen."}
        </span>
      </label>

      {uploadState !== "idle" && uploadedUrlName ? (
        <div className={`rounded-md px-3 py-2 text-sm ${uploadState === "error" ? "bg-redbrand/10 text-redbrand" : "bg-paper text-graphite"}`}>
          {uploadState === "uploading" ? "Datei wird hochgeladen. Bitte kurz warten." : uploadMessage}
        </div>
      ) : null}

      {file ? (
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-paper"
          onClick={() => {
            setFile(null);
            setUploadedUrl("");
            setUploadState("idle");
            setUploadMessage("");
            if (inputRef.current) inputRef.current.value = "";
          }}
        >
          <X className="h-4 w-4" />
          Auswahl zurücksetzen
        </button>
      ) : null}

      {removeName && currentUrl && !file ? (
        <label className="flex items-center gap-3 rounded-md bg-paper p-3 text-sm text-graphite">
          <input
            name={removeName}
            type="checkbox"
            checked={removeCurrent}
            onChange={(event) => setRemoveCurrent(event.currentTarget.checked)}
            className="h-4 w-4 accent-redbrand"
          />
          {removeLabel}
        </label>
      ) : null}
    </div>
  );
}
