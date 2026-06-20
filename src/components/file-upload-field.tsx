"use client";

import { Check, Crop, ImagePlus, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type CropAspect = "landscape" | "square" | "portrait" | "free";

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
  enableImageCrop?: boolean;
  imageCropAspect?: CropAspect;
};

const cropAspectLabels: Record<CropAspect, string> = {
  landscape: "Quer 16:10",
  square: "Quadrat",
  portrait: "Hoch 4:5",
  free: "Original"
};

const cropAspectValues: Record<CropAspect, number | null> = {
  landscape: 16 / 10,
  square: 1,
  portrait: 4 / 5,
  free: null
};

function canCropFile(file: File | null, accept?: string, enableImageCrop = true) {
  return Boolean(enableImageCrop && accept?.includes("image") && file?.type.startsWith("image/"));
}

function outputSize(aspect: CropAspect, width: number, height: number) {
  if (aspect === "square") return { width: 1200, height: 1200 };
  if (aspect === "portrait") return { width: 1080, height: 1350 };
  if (aspect === "landscape") return { width: 1400, height: 875 };
  const max = 1600;
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Bild konnte nicht geladen werden."));
    image.src = url;
  });
}

async function cropImageFile(file: File, sourceUrl: string, aspect: CropAspect, x: number, y: number, zoom: number) {
  const image = await loadImage(sourceUrl);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  const ratio = cropAspectValues[aspect] || sourceWidth / sourceHeight;
  const sourceRatio = sourceWidth / sourceHeight;
  const baseWidth = sourceRatio > ratio ? sourceHeight * ratio : sourceWidth;
  const baseHeight = sourceRatio > ratio ? sourceHeight : sourceWidth / ratio;
  const cropWidth = Math.max(1, baseWidth / zoom);
  const cropHeight = Math.max(1, baseHeight / zoom);
  const sourceX = (sourceWidth - cropWidth) * (x / 100);
  const sourceY = (sourceHeight - cropHeight) * (y / 100);
  const size = outputSize(aspect, cropWidth, cropHeight);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Bildbearbeitung wird in diesem Browser nicht unterstützt.");
  context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, size.width, size.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("Ausschnitt konnte nicht erzeugt werden."))), "image/jpeg", 0.9);
  });
  const baseName = file.name.replace(/\.[^.]+$/, "") || "bild";
  return new File([blob], `${baseName}-ausschnitt.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

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
  help,
  enableImageCrop = true,
  imageCropAspect = "landscape"
}: FileUploadFieldProps) {
  const [file, setFile] = useState<File | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [uploadState, setUploadState] = useState<"idle" | "cropping" | "uploading" | "ready" | "error">("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const [removeCurrent, setRemoveCurrent] = useState(false);
  const [cropAspect, setCropAspect] = useState<CropAspect>(imageCropAspect);
  const [cropX, setCropX] = useState(50);
  const [cropY, setCropY] = useState(50);
  const [cropZoom, setCropZoom] = useState(1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sourceUrl = useMemo(() => {
    if (!sourceFile || !sourceFile.type.startsWith("image/")) return "";
    return URL.createObjectURL(sourceFile);
  }, [sourceFile]);
  const previewUrl = useMemo(() => {
    if (!file || !file.type.startsWith("image/")) return "";
    return URL.createObjectURL(file);
  }, [file]);
  const cropEnabled = canCropFile(sourceFile, accept, enableImageCrop);
  const cropApplied = Boolean(file && sourceFile && file !== sourceFile);

  useEffect(() => {
    return () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [sourceUrl, previewUrl]);

  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form) return;
    const handleSubmit = (event: SubmitEvent) => {
      if (cropEnabled && !cropApplied) {
        event.preventDefault();
        setUploadMessage("Bitte zuerst den Bildausschnitt übernehmen.");
        return;
      }
      if (uploadedUrlName && uploadState === "uploading") {
        event.preventDefault();
        setUploadMessage("Bitte warten, bis der Upload fertig ist.");
      }
      if (uploadedUrlName && uploadState === "error") {
        event.preventDefault();
        setUploadMessage("Der Upload ist fehlgeschlagen. Wähle die Datei bitte erneut aus.");
      }
    };
    form.addEventListener("submit", handleSubmit);
    return () => form.removeEventListener("submit", handleSubmit);
  }, [cropApplied, cropEnabled, uploadState, uploadedUrlName]);

  async function uploadFile(nextFile: File) {
    setUploadState("uploading");
    setUploadMessage("");
    const body = new FormData();
    body.append("file", nextFile);
    try {
      const response = await fetch("/api/uploads", { method: "POST", body });
      const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error || "Upload fehlgeschlagen");
      setUploadedUrl(payload.url);
      setUploadMessage("Upload bereit. Du kannst jetzt speichern.");
      setUploadState("ready");
    } catch (error) {
      setUploadedUrl("");
      setUploadMessage(error instanceof Error ? error.message : "Upload fehlgeschlagen");
      setUploadState("error");
    }
  }

  function setInputFile(nextFile: File) {
    if (!inputRef.current || uploadedUrlName || typeof DataTransfer === "undefined") return;
    const transfer = new DataTransfer();
    transfer.items.add(nextFile);
    inputRef.current.files = transfer.files;
  }

  function markCropDirty() {
    if (!cropEnabled || !sourceFile) return;
    setFile(sourceFile);
    setInputFile(sourceFile);
    setUploadedUrl("");
    setUploadState("cropping");
    setUploadMessage("Ausschnitt geändert. Bitte erneut übernehmen.");
  }

  async function applyCrop() {
    if (!sourceFile || !sourceUrl) return;
    setUploadState("uploading");
    setUploadMessage("Ausschnitt wird erstellt...");
    try {
      const cropped = await cropImageFile(sourceFile, sourceUrl, cropAspect, cropX, cropY, cropZoom);
      setFile(cropped);
      setInputFile(cropped);
      setRemoveCurrent(false);
      if (uploadedUrlName) await uploadFile(cropped);
      else {
        setUploadMessage("Ausschnitt bereit. Du kannst jetzt speichern.");
        setUploadState("ready");
      }
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "Ausschnitt konnte nicht erstellt werden.");
      setUploadState("error");
    }
  }

  function resetSelection() {
    setFile(null);
    setSourceFile(null);
    setUploadedUrl("");
    setUploadState("idle");
    setUploadMessage("");
    setCropX(50);
    setCropY(50);
    setCropZoom(1);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div ref={rootRef} className="space-y-3">
      {uploadedUrlName ? <input type="hidden" name={uploadedUrlName} value={uploadedUrl} /> : null}
      <div className="text-sm font-medium text-graphite">{label}</div>
      {currentUrl || previewUrl ? (
        <div className="overflow-hidden rounded-md border border-line bg-paper">
          <div className="aspect-[16/10] bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl || currentUrl || ""} alt={currentAlt} className="h-full w-full object-cover" />
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-graphite">
            <span>{file ? "Übernommener Ausschnitt" : "Aktuelles Bild"}</span>
            {file ? <span className="font-medium text-redbrand">{file.name}</span> : null}
          </div>
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
            setSourceFile(nextFile);
            setFile(nextFile);
            setUploadedUrl("");
            setUploadMessage("");
            setCropX(50);
            setCropY(50);
            setCropZoom(1);
            if (!nextFile) {
              setUploadState("idle");
              return;
            }
            setRemoveCurrent(false);
            if (canCropFile(nextFile, accept, enableImageCrop)) {
              setUploadState("cropping");
              setUploadMessage("Wähle den Bildausschnitt und übernimm ihn danach.");
              return;
            }
            if (uploadedUrlName) void uploadFile(nextFile);
            else setUploadState("ready");
          }}
        />
        {accept?.includes("image") ? <ImagePlus className="h-5 w-5 text-redbrand" /> : <Upload className="h-5 w-5 text-redbrand" />}
        <span className="font-semibold text-ink">{sourceFile ? sourceFile.name : "Datei auswählen"}</span>
        <span>
          {sourceFile
            ? uploadState === "uploading"
              ? `${Math.round(sourceFile.size / 1024)} KB ausgewählt, Verarbeitung läuft...`
              : `${Math.round(sourceFile.size / 1024)} KB ausgewählt`
            : help || "Tippen, um eine Datei auszuwählen."}
        </span>
      </label>

      {cropEnabled ? (
        <div className="rounded-lg border border-line bg-paper p-3">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Crop className="h-4 w-4 text-redbrand" />
            Ausschnitt wählen
          </div>
          <div className={`overflow-hidden rounded-md bg-black ${cropAspect === "square" ? "aspect-square" : cropAspect === "portrait" ? "aspect-[4/5]" : cropAspect === "free" ? "aspect-[16/10]" : "aspect-[16/10]"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sourceUrl}
              alt=""
              className="h-full w-full object-cover"
              style={{ objectPosition: `${cropX}% ${cropY}%`, transform: `scale(${cropZoom})`, transformOrigin: `${cropX}% ${cropY}%` }}
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-graphite">
              Format
              <select className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" value={cropAspect} onChange={(event) => { setCropAspect(event.currentTarget.value as CropAspect); markCropDirty(); }}>
                {Object.entries(cropAspectLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-graphite">
              Zoom
              <input className="mt-2 w-full accent-redbrand" type="range" min="1" max="2.2" step="0.05" value={cropZoom} onChange={(event) => { setCropZoom(Number(event.currentTarget.value)); markCropDirty(); }} />
            </label>
            <label className="text-sm font-medium text-graphite">
              Horizontal
              <input className="mt-2 w-full accent-redbrand" type="range" min="0" max="100" step="1" value={cropX} onChange={(event) => { setCropX(Number(event.currentTarget.value)); markCropDirty(); }} />
            </label>
            <label className="text-sm font-medium text-graphite">
              Vertikal
              <input className="mt-2 w-full accent-redbrand" type="range" min="0" max="100" step="1" value={cropY} onChange={(event) => { setCropY(Number(event.currentTarget.value)); markCropDirty(); }} />
            </label>
          </div>
          <button type="button" className="focus-ring mt-3 inline-flex min-h-10 items-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover" onClick={applyCrop}>
            <Check className="h-4 w-4" />
            Ausschnitt übernehmen
          </button>
        </div>
      ) : null}

      {uploadState !== "idle" ? (
        <div className={`rounded-md px-3 py-2 text-sm ${uploadState === "error" ? "bg-redbrand/10 text-redbrand" : uploadState === "ready" ? "bg-emerald-50 text-emerald-800" : "bg-paper text-graphite"}`}>
          {uploadState === "uploading" ? "Datei wird verarbeitet. Bitte kurz warten." : uploadMessage}
        </div>
      ) : null}

      {sourceFile ? (
        <button type="button" className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-paper" onClick={resetSelection}>
          <X className="h-4 w-4" />
          Auswahl zurücksetzen
        </button>
      ) : null}

      {removeName && currentUrl && !sourceFile ? (
        <label className="flex items-center gap-3 rounded-md bg-paper p-3 text-sm text-graphite">
          <input name={removeName} type="checkbox" checked={removeCurrent} onChange={(event) => setRemoveCurrent(event.currentTarget.checked)} className="h-4 w-4 accent-redbrand" />
          {removeLabel}
        </label>
      ) : null}
    </div>
  );
}
