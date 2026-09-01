"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import PlatformShell from "@/components/layout/PlatformShell";

type LocalMedia = {
  file: File;
  url: string;
  kind: "video" | "audio";
};

type RemovedRange = {
  start: number;
  end: number;
};

type TimelineSegment = {
  id: string;
  start: number;
  end: number;
  removed: boolean;
};

type StoredProject = {
  id: string;
  version: number;
  fileBlob: Blob;
  fileName: string;
  fileType: string;
  fileLastModified: number;
  kind: "video" | "audio";
  cuts: number[];
  removedRanges: RemovedRange[];
  trimStart: number;
  trimEnd: number;
  startMarked: boolean;
  endMarked: boolean;
  savedAt: string;
};

type ExportMode = "fast" | "precise";

const DB_NAME = "connectai-studio-local";
const DB_VERSION = 1;
const STORE_NAME = "projects";
const PROJECT_ID = "current-project";
const TIME_EPSILON = 0.05;
const MAX_REASONABLE_MEDIA_DURATION = 7 * 24 * 60 * 60;
const FFMPEG_CORE_URL =
  "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}

function formatSavedAt(value: string) {
  if (!value) return "";

  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getFiniteMediaDuration(element: HTMLMediaElement) {
  const value = element.duration;
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Gravações WebM feitas pelo MediaRecorder podem chegar ao navegador com
 * duration === Infinity. O Chrome normalmente recalcula a duração quando
 * fazemos um seek para um ponto muito distante. Depois voltamos para a
 * posição original sem alterar o arquivo do usuário.
 */
function recoverMediaRecorderDuration(element: HTMLMediaElement) {
  return new Promise<number | null>((resolve) => {
    const originalTime =
      Number.isFinite(element.currentTime) && element.currentTime >= 0
        ? element.currentTime
        : 0;

    let settled = false;
    let forcedSeek = false;
    let timeoutId: number | null = null;

    const cleanup = () => {
      element.removeEventListener("loadedmetadata", handleMetadata);
      element.removeEventListener("durationchange", handlePossibleChange);
      element.removeEventListener("timeupdate", handlePossibleChange);
      element.removeEventListener("seeked", handlePossibleChange);
      element.removeEventListener("progress", handlePossibleChange);

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const restorePosition = (resolvedDuration: number | null) => {
      if (!resolvedDuration) return;

      try {
        element.currentTime = clamp(
          originalTime,
          0,
          Math.max(0, resolvedDuration - TIME_EPSILON)
        );
      } catch {
        // A duração já foi recuperada; restaurar a posição é opcional.
      }
    };

    const finish = (resolvedDuration: number | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      restorePosition(resolvedDuration);
      resolve(resolvedDuration);
    };

    const inspect = () => {
      const duration = getFiniteMediaDuration(element);
      if (duration) {
        finish(duration);
        return true;
      }

      // Alguns WebM antigos continuam reportando Infinity em duration,
      // mas o navegador limita currentTime ao fim real após o seek forçado.
      if (forcedSeek) {
        const reachedTime = element.currentTime;
        if (
          Number.isFinite(reachedTime) &&
          reachedTime > TIME_EPSILON &&
          reachedTime < MAX_REASONABLE_MEDIA_DURATION
        ) {
          finish(reachedTime);
          return true;
        }
      }

      return false;
    };

    const forceSeekToEnd = () => {
      if (forcedSeek || settled) return;
      forcedSeek = true;

      try {
        element.currentTime = Number.MAX_SAFE_INTEGER;
      } catch {
        finish(null);
      }
    };

    function handleMetadata() {
      if (!inspect()) forceSeekToEnd();
    }

    function handlePossibleChange() {
      inspect();
    }

    element.addEventListener("loadedmetadata", handleMetadata);
    element.addEventListener("durationchange", handlePossibleChange);
    element.addEventListener("timeupdate", handlePossibleChange);
    element.addEventListener("seeked", handlePossibleChange);
    element.addEventListener("progress", handlePossibleChange);

    if (!inspect() && element.readyState >= 1) {
      forceSeekToEnd();
    }

    timeoutId = window.setTimeout(() => {
      if (!inspect()) finish(null);
    }, 3500);
  });
}

function normalizeCuts(cuts: number[], duration: number) {
  if (duration <= 0) return [];

  const safeCuts = cuts
    .filter((value) => Number.isFinite(value))
    .map((value) => clamp(value, 0, duration))
    .filter(
      (value) =>
        value > TIME_EPSILON && value < duration - TIME_EPSILON
    )
    .sort((a, b) => a - b);

  const result: number[] = [];

  for (const value of safeCuts) {
    const previous = result[result.length - 1];
    if (
      previous === undefined ||
      Math.abs(previous - value) > TIME_EPSILON
    ) {
      result.push(value);
    }
  }

  return result;
}

function normalizeRanges(ranges: RemovedRange[], duration: number) {
  if (duration <= 0) return [];

  const safeRanges = ranges
    .map((range) => ({
      start: clamp(Math.min(range.start, range.end), 0, duration),
      end: clamp(Math.max(range.start, range.end), 0, duration),
    }))
    .filter((range) => range.end - range.start > TIME_EPSILON)
    .sort((a, b) => a.start - b.start);

  const result: RemovedRange[] = [];

  for (const range of safeRanges) {
    const previous = result[result.length - 1];

    if (!previous) {
      result.push({ ...range });
      continue;
    }

    if (range.start <= previous.end + TIME_EPSILON) {
      previous.end = Math.max(previous.end, range.end);
      continue;
    }

    result.push({ ...range });
  }

  return result;
}

function subtractRange(
  ranges: RemovedRange[],
  target: RemovedRange,
  duration: number
) {
  const result: RemovedRange[] = [];

  for (const range of ranges) {
    const noOverlap = target.end <= range.start || target.start >= range.end;

    if (noOverlap) {
      result.push(range);
      continue;
    }

    if (target.start > range.start + TIME_EPSILON) {
      result.push({
        start: range.start,
        end: Math.min(target.start, range.end),
      });
    }

    if (target.end < range.end - TIME_EPSILON) {
      result.push({
        start: Math.max(target.end, range.start),
        end: range.end,
      });
    }
  }

  return normalizeRanges(result, duration);
}

function isRangeRemoved(
  start: number,
  end: number,
  ranges: RemovedRange[]
) {
  return ranges.some(
    (range) =>
      range.start <= start + TIME_EPSILON &&
      range.end >= end - TIME_EPSILON
  );
}

function getActiveRanges(duration: number, removedRanges: RemovedRange[]) {
  if (duration <= 0) return [];

  const removed = normalizeRanges(removedRanges, duration);

  if (removed.length === 0) {
    return [{ start: 0, end: duration }];
  }

  const active: RemovedRange[] = [];
  let cursor = 0;

  for (const range of removed) {
    if (range.start > cursor + TIME_EPSILON) {
      active.push({ start: cursor, end: range.start });
    }
    cursor = Math.max(cursor, range.end);
  }

  if (cursor < duration - TIME_EPSILON) {
    active.push({ start: cursor, end: duration });
  }

  return active.filter(
    (range) => range.end - range.start > TIME_EPSILON
  );
}

function openStudioDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Erro ao abrir armazenamento local."));
  });
}

async function saveStoredProject(project: StoredProject) {
  const db = await openStudioDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(project);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Erro ao salvar projeto."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Salvamento cancelado."));
  });

  db.close();
}

async function loadStoredProject() {
  const db = await openStudioDatabase();

  const project = await new Promise<StoredProject | null>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(PROJECT_ID);

    request.onsuccess = () =>
      resolve((request.result as StoredProject | undefined) ?? null);
    request.onerror = () =>
      reject(request.error ?? new Error("Erro ao carregar projeto."));
  });

  db.close();
  return project;
}

async function deleteStoredProject() {
  const db = await openStudioDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(PROJECT_ID);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Erro ao excluir projeto."));
  });

  db.close();
}

async function waitForVideoMetadata(video: HTMLVideoElement) {
  if (video.readyState < 1) {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        video.removeEventListener("loadedmetadata", handleLoaded);
        video.removeEventListener("error", handleError);
      };

      function handleLoaded() {
        cleanup();
        resolve();
      }

      function handleError() {
        cleanup();
        reject(new Error("Não foi possível carregar o vídeo."));
      }

      video.addEventListener("loadedmetadata", handleLoaded);
      video.addEventListener("error", handleError);
    });
  }

  if (!getFiniteMediaDuration(video)) {
    const recoveredDuration = await recoverMediaRecorderDuration(video);
    if (!recoveredDuration) {
      throw new Error("Não foi possível descobrir a duração do vídeo.");
    }
  }
}

function seekPreviewVideo(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    const finiteDuration = getFiniteMediaDuration(video);
    const maximum = finiteDuration
      ? Math.max(0, finiteDuration - 0.05)
      : Math.max(time, 0);
    const safeTime = clamp(time, 0, maximum);

    if (
      Math.abs(video.currentTime - safeTime) < 0.02 &&
      video.readyState >= 2
    ) {
      resolve();
      return;
    }

    const cleanup = () => {
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
    };

    function handleSeeked() {
      cleanup();
      resolve();
    }

    function handleError() {
      cleanup();
      reject(new Error("Não foi possível acessar o frame."));
    }

    video.addEventListener("seeked", handleSeeked);
    video.addEventListener("error", handleError);
    video.currentTime = safeTime;
  });
}

async function captureThumbnail(video: HTMLVideoElement, time: number) {
  await seekPreviewVideo(video, time);

  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("Dimensões inválidas.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponível.");

  context.fillStyle = "#050505";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const scale = Math.min(
    canvas.width / sourceWidth,
    canvas.height / sourceHeight
  );
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  context.drawImage(
    video,
    (canvas.width - width) / 2,
    (canvas.height - height) / 2,
    width,
    height
  );

  return canvas.toDataURL("image/jpeg", 0.72);
}

function buildAudioVideoFilter(ranges: RemovedRange[]) {
  const filters: string[] = [];
  const concatInputs: string[] = [];

  ranges.forEach((range, index) => {
    const start = range.start.toFixed(3);
    const end = range.end.toFixed(3);

    filters.push(
      `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${index}]`
    );
    filters.push(
      `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${index}]`
    );
    concatInputs.push(`[v${index}][a${index}]`);
  });

  filters.push(
    `${concatInputs.join("")}concat=n=${ranges.length}:v=1:a=1[outv][outa]`
  );

  return filters.join(";");
}

function buildVideoOnlyFilter(ranges: RemovedRange[]) {
  const filters: string[] = [];
  const concatInputs: string[] = [];

  ranges.forEach((range, index) => {
    const start = range.start.toFixed(3);
    const end = range.end.toFixed(3);

    filters.push(
      `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${index}]`
    );
    concatInputs.push(`[v${index}]`);
  });

  filters.push(
    `${concatInputs.join("")}concat=n=${ranges.length}:v=1:a=0[outv]`
  );

  return filters.join(";");
}

async function safeDeleteFFmpegFile(ffmpeg: FFmpeg, name: string) {
  try {
    await ffmpeg.deleteFile(name);
  } catch {
    // O arquivo pode não existir.
  }
}

export default function EdicaoPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaElementRef = useRef<HTMLMediaElement | null>(null);
  const restoredProjectRef = useRef<StoredProject | null>(null);
  const initializedMediaRef = useRef(false);
  const durationRecoveryRef = useRef(false);
  const thumbnailGenerationRef = useRef(0);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const preciseProgressRef = useRef(false);
  const exportUrlRef = useRef("");

  const [media, setMedia] = useState<LocalMedia | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [startMarked, setStartMarked] = useState(false);
  const [endMarked, setEndMarked] = useState(false);
  const [cuts, setCuts] = useState<number[]>([]);
  const [removedRanges, setRemovedRanges] = useState<RemovedRange[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [previewEdit, setPreviewEdit] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isRestoring, setIsRestoring] = useState(true);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isResolvingDuration, setIsResolvingDuration] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>("fast");
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState("");
  const [exportedUrl, setExportedUrl] = useState("");
  const [exportedName, setExportedName] = useState("");

  useEffect(() => {
    let active = true;

    async function restoreProject() {
      try {
        const project = await loadStoredProject();
        if (!active || !project) return;

        const restoredFile = new File([project.fileBlob], project.fileName, {
          type: project.fileType,
          lastModified: project.fileLastModified,
        });

        const localUrl = URL.createObjectURL(restoredFile);
        restoredProjectRef.current = project;
        initializedMediaRef.current = false;
        durationRecoveryRef.current = false;

        setMedia({
          file: restoredFile,
          url: localUrl,
          kind: project.kind,
        });
        setSavedAt(project.savedAt);
        setHasUnsavedChanges(false);
      } catch (error) {
        console.error("Erro ao restaurar projeto:", error);
      } finally {
        if (active) setIsRestoring(false);
      }
    }

    void restoreProject();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (media?.url) URL.revokeObjectURL(media.url);
    };
  }, [media]);

  useEffect(() => {
    return () => {
      if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
    };
  }, []);

  const selectedDuration = Math.max(0, trimEnd - trimStart);

  const timelineSegments = useMemo<TimelineSegment[]>(() => {
    if (duration <= 0) return [];

    const points = [0, ...normalizeCuts(cuts, duration), duration];
    const result: TimelineSegment[] = [];

    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (end - start <= TIME_EPSILON) continue;

      result.push({
        id: `${start.toFixed(3)}-${end.toFixed(3)}`,
        start,
        end,
        removed: isRangeRemoved(start, end, removedRanges),
      });
    }

    return result;
  }, [cuts, duration, removedRanges]);

  useEffect(() => {
    const generationId = thumbnailGenerationRef.current + 1;
    thumbnailGenerationRef.current = generationId;

    if (
      !media ||
      media.kind !== "video" ||
      duration <= 0 ||
      timelineSegments.length === 0
    ) {
      setThumbnails({});
      return;
    }

    const mediaUrl = media.url;
    let cancelled = false;
    const activeIds = new Set(timelineSegments.map((segment) => segment.id));

    setThumbnails((current) => {
      const next: Record<string, string> = {};
      for (const [id, image] of Object.entries(current)) {
        if (activeIds.has(id)) next[id] = image;
      }
      return next;
    });

    const timeout = window.setTimeout(() => {
      async function generateThumbnails() {
        const previewVideo = document.createElement("video");
        previewVideo.preload = "auto";
        previewVideo.muted = true;
        previewVideo.playsInline = true;
        previewVideo.src = mediaUrl;

        try {
          await waitForVideoMetadata(previewVideo);

          for (const segment of timelineSegments) {
            if (
              cancelled ||
              thumbnailGenerationRef.current !== generationId
            ) {
              return;
            }

            const segmentDuration = segment.end - segment.start;
            let sampleTime = segment.start + segmentDuration * 0.5;

            if (segmentDuration > 1) {
              sampleTime = Math.max(
                segment.start + 0.25,
                Math.min(sampleTime, segment.end - 0.25)
              );
            }

            try {
              const image = await captureThumbnail(previewVideo, sampleTime);
              if (
                cancelled ||
                thumbnailGenerationRef.current !== generationId
              ) {
                return;
              }

              setThumbnails((current) => ({
                ...current,
                [segment.id]: image,
              }));
            } catch (error) {
              console.error("Erro ao gerar miniatura:", error);
            }
          }
        } catch (error) {
          console.error("Erro ao preparar miniaturas:", error);
        } finally {
          previewVideo.pause();
          previewVideo.removeAttribute("src");
          previewVideo.load();
        }
      }

      void generateThumbnails();
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [duration, media, timelineSegments]);

  const totalRemovedDuration = useMemo(
    () =>
      removedRanges.reduce(
        (total, range) => total + Math.max(0, range.end - range.start),
        0
      ),
    [removedRanges]
  );

  const finalDuration = Math.max(0, duration - totalRemovedDuration);

  function clearExportResult() {
    if (exportUrlRef.current) {
      URL.revokeObjectURL(exportUrlRef.current);
      exportUrlRef.current = "";
    }
    setExportedUrl("");
    setExportedName("");
  }

  function markProjectChanged() {
    setHasUnsavedChanges(true);
    clearExportResult();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setErrorMessage("");
    setFeedback("");
    setIsResolvingDuration(false);

    const lowerName = file.name.toLowerCase();
    const isVideo =
      file.type.startsWith("video/") ||
      /\.(mp4|webm|mov|m4v|ogv|ogg)$/i.test(lowerName);
    const isAudio =
      file.type.startsWith("audio/") ||
      /\.(mp3|wav|m4a|aac|opus|oga)$/i.test(lowerName);

    if (!isVideo && !isAudio) {
      setErrorMessage("Escolha um arquivo de vídeo ou áudio.");
      event.target.value = "";
      return;
    }

    if (media?.url) URL.revokeObjectURL(media.url);
    clearExportResult();

    restoredProjectRef.current = null;
    initializedMediaRef.current = false;
    durationRecoveryRef.current = false;

    const localUrl = URL.createObjectURL(file);

    setMedia({
      file,
      url: localUrl,
      kind: isVideo ? "video" : "audio",
    });

    setDuration(0);
    setCurrentTime(0);
    setTrimStart(0);
    setTrimEnd(0);
    setStartMarked(false);
    setEndMarked(false);
    setCuts([]);
    setRemovedRanges([]);
    setThumbnails({});
    setPreviewEdit(false);
    setSavedAt("");
    setExportProgress(0);
    setExportStatus("");
    setHasUnsavedChanges(true);
  }

  function applyMediaDuration(element: HTMLMediaElement, mediaDuration: number) {
    if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) return;

    setDuration(mediaDuration);
    setErrorMessage("");

    if (initializedMediaRef.current) return;
    initializedMediaRef.current = true;

    const restored = restoredProjectRef.current;

    if (restored) {
      setCuts(normalizeCuts(restored.cuts, mediaDuration));
      setRemovedRanges(normalizeRanges(restored.removedRanges, mediaDuration));

      const restoredStart = clamp(restored.trimStart, 0, mediaDuration);
      const restoredEnd = clamp(
        restored.trimEnd,
        restoredStart,
        mediaDuration
      );

      setTrimStart(restoredStart);
      setTrimEnd(restoredEnd);
      setStartMarked(restored.startMarked);
      setEndMarked(restored.endMarked);
      setCurrentTime(0);
      setFeedback("Projeto local restaurado.");
      setHasUnsavedChanges(false);
      restoredProjectRef.current = null;
      return;
    }

    setTrimStart(0);
    setTrimEnd(mediaDuration);
    setCurrentTime(
      Number.isFinite(element.currentTime) ? element.currentTime : 0
    );
  }

  function updateMediaDuration() {
    const element = mediaElementRef.current;
    if (!element) return;

    const mediaDuration = getFiniteMediaDuration(element);
    if (mediaDuration) {
      applyMediaDuration(element, mediaDuration);
      return;
    }

    if (durationRecoveryRef.current) return;

    durationRecoveryRef.current = true;
    setIsResolvingDuration(true);
    setErrorMessage("");

    void recoverMediaRecorderDuration(element)
      .then((recoveredDuration) => {
        if (mediaElementRef.current !== element) return;

        if (!recoveredDuration) {
          setErrorMessage(
            "Não foi possível identificar a duração desta gravação. Tente trocar o arquivo e selecioná-lo novamente."
          );
          return;
        }

        applyMediaDuration(element, recoveredDuration);

        const isWebM =
          media?.file.type.toLowerCase().includes("webm") ||
          media?.file.name.toLowerCase().endsWith(".webm");

        if (isWebM) {
          setFeedback("Gravação do ConnectAI pronta para edição.");
        }
      })
      .catch((error) => {
        console.error("Erro ao recuperar duração da gravação:", error);
        setErrorMessage(
          "Não foi possível preparar esta gravação para edição."
        );
      })
      .finally(() => {
        durationRecoveryRef.current = false;
        setIsResolvingDuration(false);
      });
  }

  function handleTimeUpdate() {
    const element = mediaElementRef.current;
    if (!element) return;

    const time = element.currentTime;
    if (!Number.isFinite(time)) return;

    if (previewEdit) {
      const removed = removedRanges.find(
        (range) =>
          time >= range.start - TIME_EPSILON &&
          time < range.end - TIME_EPSILON
      );

      if (removed) {
        const nextTime = Math.min(removed.end + 0.02, duration);

        if (nextTime >= duration - TIME_EPSILON) {
          element.pause();
          element.currentTime = duration;
          setCurrentTime(duration);
          return;
        }

        element.currentTime = nextTime;
        setCurrentTime(nextTime);
        return;
      }
    }

    // Durante a recuperação do WebM o navegador faz um seek artificial.
    // Não refletimos esse valor na interface.
    if (!durationRecoveryRef.current) {
      setCurrentTime(time);
    }
  }

  function handleSeeked() {
    const element = mediaElementRef.current;
    if (!element || durationRecoveryRef.current) return;
    setCurrentTime(element.currentTime);
  }

  function seekTo(time: number) {
    const element = mediaElementRef.current;
    if (!element || duration <= 0) return;

    const safeTime = clamp(time, 0, duration);
    element.currentTime = safeTime;
    setCurrentTime(safeTime);
  }

  function handlePlaybackSlider(event: ChangeEvent<HTMLInputElement>) {
    seekTo(Number(event.target.value));
  }

  function markStart() {
    const element = mediaElementRef.current;
    if (!element || duration <= 0) return;

    const exactTime = clamp(element.currentTime, 0, duration);
    const newStart = endMarked ? Math.min(exactTime, trimEnd) : exactTime;

    setTrimStart(newStart);
    setStartMarked(true);
    setCurrentTime(exactTime);
    setFeedback(`Início marcado em ${formatTime(newStart)}.`);
    markProjectChanged();
  }

  function markEnd() {
    const element = mediaElementRef.current;
    if (!element || duration <= 0) return;

    const exactTime = clamp(element.currentTime, 0, duration);
    const newEnd = startMarked ? Math.max(exactTime, trimStart) : exactTime;

    setTrimEnd(newEnd);
    setEndMarked(true);
    setCurrentTime(exactTime);
    setFeedback(`Fim marcado em ${formatTime(newEnd)}.`);
    markProjectChanged();
  }

  function handleStartChange(event: ChangeEvent<HTMLInputElement>) {
    const value = Number(event.target.value);
    const maximum = endMarked ? trimEnd : duration;
    const newStart = clamp(value, 0, maximum);

    setTrimStart(newStart);
    setStartMarked(true);
    seekTo(newStart);
    markProjectChanged();
  }

  function handleEndChange(event: ChangeEvent<HTMLInputElement>) {
    const value = Number(event.target.value);
    const minimum = startMarked ? trimStart : 0;
    const newEnd = clamp(value, minimum, duration);

    setTrimEnd(newEnd);
    setEndMarked(true);
    seekTo(newEnd);
    markProjectChanged();
  }

  function sliceAtCurrentTime() {
    const element = mediaElementRef.current;
    if (!element || duration <= 0) return;

    const exactTime = clamp(element.currentTime, 0, duration);

    if (
      exactTime <= TIME_EPSILON ||
      exactTime >= duration - TIME_EPSILON
    ) {
      setFeedback("Escolha um ponto dentro do vídeo para fatiar.");
      return;
    }

    const alreadyExists = cuts.some(
      (value) => Math.abs(value - exactTime) <= TIME_EPSILON
    );

    if (alreadyExists) {
      setFeedback("Já existe um corte muito próximo desse ponto.");
      return;
    }

    setCuts((current) =>
      normalizeCuts([...current, exactTime], duration)
    );
    setFeedback(`Vídeo fatiado em ${formatTime(exactTime)}.`);
    markProjectChanged();
  }

  function removeSelectedPart() {
    if (!startMarked || !endMarked) {
      setFeedback("Marque o início e o fim da parte que deseja remover.");
      return;
    }

    if (selectedDuration <= TIME_EPSILON) {
      setFeedback("O trecho selecionado é muito pequeno.");
      return;
    }

    setCuts((current) =>
      normalizeCuts([...current, trimStart, trimEnd], duration)
    );
    setRemovedRanges((current) =>
      normalizeRanges(
        [...current, { start: trimStart, end: trimEnd }],
        duration
      )
    );

    setFeedback(
      `Trecho ${formatTime(trimStart)} → ${formatTime(trimEnd)} removido.`
    );
    seekTo(trimEnd);
    markProjectChanged();
  }

  function removeSegment(segment: TimelineSegment) {
    setRemovedRanges((current) =>
      normalizeRanges(
        [...current, { start: segment.start, end: segment.end }],
        duration
      )
    );
    setFeedback(
      `Fatia ${formatTime(segment.start)} → ${formatTime(segment.end)} removida.`
    );
    markProjectChanged();
  }

  function restoreSegment(segment: TimelineSegment) {
    setRemovedRanges((current) =>
      subtractRange(
        current,
        { start: segment.start, end: segment.end },
        duration
      )
    );
    setFeedback("Fatia restaurada.");
    markProjectChanged();
  }

  function resetSelection() {
    setTrimStart(0);
    setTrimEnd(duration);
    setStartMarked(false);
    setEndMarked(false);
    setFeedback("Marcações limpas.");
    seekTo(0);
    markProjectChanged();
  }

  function restoreCompleteEdit() {
    setCuts([]);
    setRemovedRanges([]);
    setTrimStart(0);
    setTrimEnd(duration);
    setStartMarked(false);
    setEndMarked(false);
    setPreviewEdit(false);
    setFeedback("Edição restaurada para o vídeo completo.");
    seekTo(0);
    markProjectChanged();
  }

  async function togglePreview() {
    const element = mediaElementRef.current;
    if (!element) return;

    if (previewEdit) {
      setPreviewEdit(false);
      element.pause();
      setFeedback("Prévia encerrada.");
      return;
    }

    setPreviewEdit(true);
    seekTo(0);

    try {
      await element.play();
      setFeedback("Prévia ativa. As partes removidas serão puladas.");
    } catch {
      setFeedback("Prévia ativada. Toque em play.");
    }
  }

  async function saveProjectLocally() {
    if (!media || isSavingProject) return;

    setIsSavingProject(true);
    setErrorMessage("");

    try {
      const now = new Date().toISOString();
      const project: StoredProject = {
        id: PROJECT_ID,
        version: 1,
        fileBlob: media.file,
        fileName: media.file.name,
        fileType: media.file.type,
        fileLastModified: media.file.lastModified,
        kind: media.kind,
        cuts: normalizeCuts(cuts, duration),
        removedRanges: normalizeRanges(removedRanges, duration),
        trimStart,
        trimEnd,
        startMarked,
        endMarked,
        savedAt: now,
      };

      await saveStoredProject(project);
      setSavedAt(now);
      setHasUnsavedChanges(false);
      setFeedback("Edição salva localmente neste aparelho.");
    } catch (error) {
      console.error("Erro ao salvar projeto:", error);
      setErrorMessage("Não foi possível salvar o projeto localmente.");
    } finally {
      setIsSavingProject(false);
    }
  }

  async function ensureFFmpeg() {
    if (ffmpegRef.current && ffmpegLoaded) return ffmpegRef.current;

    setExportStatus("Carregando motor de exportação...");
    setExportProgress(0);

    let ffmpeg = ffmpegRef.current;

    if (!ffmpeg) {
      ffmpeg = new FFmpeg();
      ffmpeg.on("progress", ({ progress }) => {
        if (!preciseProgressRef.current) return;
        const value = Math.round(progress * 100);
        setExportProgress(clamp(value, 0, 100));
      });
      ffmpegRef.current = ffmpeg;
    }

    await ffmpeg.load({
      coreURL: await toBlobURL(
        `${FFMPEG_CORE_URL}/ffmpeg-core.js`,
        "text/javascript"
      ),
      wasmURL: await toBlobURL(
        `${FFMPEG_CORE_URL}/ffmpeg-core.wasm`,
        "application/wasm"
      ),
    });

    setFfmpegLoaded(true);
    return ffmpeg;
  }

  async function exportFast(
    ffmpeg: FFmpeg,
    inputName: string,
    outputName: string,
    activeRanges: RemovedRange[]
  ) {
    preciseProgressRef.current = false;
    const segmentNames: string[] = [];

    if (activeRanges.length === 1) {
      const range = activeRanges[0];
      const segmentDuration = Math.max(0, range.end - range.start);

      setExportStatus("Copiando trecho sem recodificar...");
      setExportProgress(35);

      const exitCode = await ffmpeg.exec([
        "-y",
        "-ss",
        range.start.toFixed(3),
        "-i",
        inputName,
        "-t",
        segmentDuration.toFixed(3),
        "-map",
        "0:v:0?",
        "-map",
        "0:a:0?",
        "-c",
        "copy",
        "-avoid_negative_ts",
        "make_zero",
        "-movflags",
        "+faststart",
        outputName,
      ]);

      if (exitCode !== 0) throw new Error("FAST_EXPORT_FAILED");
      setExportProgress(90);
      return;
    }

    for (let index = 0; index < activeRanges.length; index += 1) {
      const range = activeRanges[index];
      const segmentDuration = Math.max(0, range.end - range.start);
      const segmentName = `connectai-segment-${index}.mp4`;

      segmentNames.push(segmentName);
      await safeDeleteFFmpegFile(ffmpeg, segmentName);
      setExportStatus(
        `Preparando trecho ${index + 1} de ${activeRanges.length}...`
      );
      setExportProgress(
        10 + Math.round((index / activeRanges.length) * 65)
      );

      const exitCode = await ffmpeg.exec([
        "-y",
        "-ss",
        range.start.toFixed(3),
        "-i",
        inputName,
        "-t",
        segmentDuration.toFixed(3),
        "-map",
        "0:v:0?",
        "-map",
        "0:a:0?",
        "-c",
        "copy",
        "-avoid_negative_ts",
        "make_zero",
        segmentName,
      ]);

      if (exitCode !== 0) throw new Error("FAST_EXPORT_FAILED");
    }

    setExportStatus("Unindo trechos...");
    setExportProgress(80);

    const concatName = "connectai-concat.txt";
    const concatContent = segmentNames
      .map((name) => `file '${name}'`)
      .join("\n");

    await ffmpeg.writeFile(
      concatName,
      new TextEncoder().encode(concatContent)
    );

    const concatExitCode = await ffmpeg.exec([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatName,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      outputName,
    ]);

    await safeDeleteFFmpegFile(ffmpeg, concatName);
    for (const segmentName of segmentNames) {
      await safeDeleteFFmpegFile(ffmpeg, segmentName);
    }

    if (concatExitCode !== 0) throw new Error("FAST_EXPORT_FAILED");
    setExportProgress(90);
  }

  async function exportPrecise(
    ffmpeg: FFmpeg,
    inputName: string,
    outputName: string,
    activeRanges: RemovedRange[]
  ) {
    preciseProgressRef.current = true;
    setExportStatus("Recodificando vídeo com cortes precisos...");
    setExportProgress(1);

    const audioVideoFilter = buildAudioVideoFilter(activeRanges);

    let exitCode = await ffmpeg.exec([
      "-y",
      "-i",
      inputName,
      "-filter_complex",
      audioVideoFilter,
      "-map",
      "[outv]",
      "-map",
      "[outa]",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outputName,
    ]);

    if (exitCode !== 0) {
      await safeDeleteFFmpegFile(ffmpeg, outputName);
      setExportStatus("Tentando exportar vídeo sem áudio...");

      const videoOnlyFilter = buildVideoOnlyFilter(activeRanges);

      exitCode = await ffmpeg.exec([
        "-y",
        "-i",
        inputName,
        "-filter_complex",
        videoOnlyFilter,
        "-map",
        "[outv]",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        outputName,
      ]);
    }

    preciseProgressRef.current = false;
    if (exitCode !== 0) throw new Error("PRECISE_EXPORT_FAILED");
  }

  async function exportVideo() {
    if (
      !media ||
      media.kind !== "video" ||
      duration <= 0 ||
      isExporting
    ) {
      return;
    }

    const activeRanges = getActiveRanges(duration, removedRanges);

    if (activeRanges.length === 0) {
      setErrorMessage("Não existe nenhuma parte ativa para exportar.");
      return;
    }

    setIsExporting(true);
    setExportProgress(0);
    setErrorMessage("");
    setExportStatus(
      exportMode === "fast"
        ? "Preparando exportação rápida..."
        : "Preparando exportação precisa..."
    );
    clearExportResult();

    const extension =
      media.file.name
        .split(".")
        .pop()
        ?.replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase() || "mp4";

    const inputName = `connectai-input.${extension}`;
    const outputName = "connectai-export.mp4";

    try {
      const ffmpeg = await ensureFFmpeg();
      await safeDeleteFFmpegFile(ffmpeg, inputName);
      await safeDeleteFFmpegFile(ffmpeg, outputName);

      setExportStatus("Carregando vídeo no editor...");
      setExportProgress(5);

      await ffmpeg.writeFile(inputName, await fetchFile(media.file));

      if (exportMode === "fast") {
        await exportFast(ffmpeg, inputName, outputName, activeRanges);
      } else {
        await exportPrecise(ffmpeg, inputName, outputName, activeRanges);
      }

      preciseProgressRef.current = false;
      setExportStatus("Finalizando MP4...");
      setExportProgress(95);

      const data = await ffmpeg.readFile(outputName);
      if (typeof data === "string") {
        throw new Error("Formato de saída inesperado.");
      }

      const bytes = new Uint8Array(data);
      const arrayBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer;
      const blob = new Blob([arrayBuffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      const modeName = exportMode === "fast" ? "rapido" : "preciso";
      const fileName = `ConnectAI-${modeName}-${Date.now()}.mp4`;

      exportUrlRef.current = url;
      setExportedUrl(url);
      setExportedName(fileName);
      setExportProgress(100);
      setExportStatus(
        exportMode === "fast"
          ? "Exportação rápida concluída."
          : "Exportação precisa concluída."
      );

      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();

      await safeDeleteFFmpegFile(ffmpeg, inputName);
      await safeDeleteFFmpegFile(ffmpeg, outputName);
    } catch (error) {
      console.error("Erro ao exportar vídeo:", error);
      preciseProgressRef.current = false;
      setExportStatus("");

      if (error instanceof Error && error.message === "FAST_EXPORT_FAILED") {
        setErrorMessage(
          "A exportação rápida não funcionou com este vídeo. Gravações WebM do ConnectAI podem usar codecs que não entram em MP4 sem recodificação. Selecione o modo Preciso e tente novamente."
        );
      } else {
        setErrorMessage(
          "Não foi possível exportar este vídeo. Arquivos grandes podem exigir bastante memória do computador."
        );
      }
    } finally {
      setIsExporting(false);
    }
  }

  async function clearMedia() {
    const shouldDelete = window.confirm(
      "Excluir esta mídia e o projeto salvo localmente neste navegador?"
    );
    if (!shouldDelete) return;

    if (media?.url) URL.revokeObjectURL(media.url);
    clearExportResult();

    try {
      await deleteStoredProject();
    } catch (error) {
      console.error("Erro ao excluir projeto:", error);
    }

    setMedia(null);
    setDuration(0);
    setCurrentTime(0);
    setTrimStart(0);
    setTrimEnd(0);
    setStartMarked(false);
    setEndMarked(false);
    setCuts([]);
    setRemovedRanges([]);
    setThumbnails({});
    setPreviewEdit(false);
    setFeedback("");
    setErrorMessage("");
    setSavedAt("");
    setHasUnsavedChanges(false);
    setExportProgress(0);
    setExportStatus("");
    setIsResolvingDuration(false);

    mediaElementRef.current = null;
    initializedMediaRef.current = false;
    durationRecoveryRef.current = false;
    restoredProjectRef.current = null;

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <PlatformShell>
      <div className="space-y-5 sm:space-y-6">
        <section className="relative overflow-hidden rounded-[1.75rem] border border-fuchsia-400/15 bg-white/[0.035] p-4 shadow-2xl shadow-black/10 backdrop-blur-2xl sm:p-6">
          <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-fuchsia-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-purple-500/10 blur-3xl" />

          <div className="relative">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-fuchsia-400 shadow-[0_0_14px_rgba(232,121,249,0.9)]" />
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-fuchsia-300">
                ConnectAI Studio
              </p>
            </div>

            <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Edição inteligente
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Fatia, remova partes, salve o projeto e escolha entre exportação
              rápida ou precisa.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-500/[0.06] px-3 py-1.5 text-[10px] font-medium text-emerald-300">
                ● Processamento local
              </span>

              {savedAt && (
                <span className="inline-flex items-center gap-2 rounded-full border border-fuchsia-400/15 bg-fuchsia-500/[0.06] px-3 py-1.5 text-[10px] text-fuchsia-200">
                  ✓ Projeto salvo {formatSavedAt(savedAt)}
                </span>
              )}

              {hasUnsavedChanges && media && (
                <span className="inline-flex items-center rounded-full border border-amber-400/15 bg-amber-500/[0.06] px-3 py-1.5 text-[10px] text-amber-300">
                  Alterações não salvas
                </span>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-fuchsia-400/10 bg-white/[0.025] p-4 backdrop-blur-xl sm:p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-fuchsia-400">
            Projeto local
          </p>
          <h2 className="mt-1 text-lg font-bold text-white">Mídia</h2>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,audio/*,.webm"
            onChange={handleFileChange}
            className="hidden"
          />

          {isRestoring && !media ? (
            <div className="mt-5 flex min-h-36 items-center justify-center rounded-[1.5rem] border border-white/[0.08] bg-white/[0.025]">
              <p className="text-xs text-zinc-500">Procurando projeto local...</p>
            </div>
          ) : !media ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-5 flex min-h-40 w-full flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-fuchsia-400/20 bg-fuchsia-500/[0.035] px-5 text-center"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/10 text-2xl">
                +
              </span>
              <span className="mt-4 text-sm font-bold text-white">
                Escolher vídeo ou áudio
              </span>
            </button>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-11 rounded-xl border border-fuchsia-400/15 bg-fuchsia-500/[0.06] text-xs font-semibold text-fuchsia-200"
                >
                  ↻ Trocar arquivo
                </button>
                <button
                  type="button"
                  onClick={() => void clearMedia()}
                  className="min-h-11 rounded-xl border border-red-400/10 bg-red-500/[0.035] text-xs font-semibold text-red-300"
                >
                  × Excluir
                </button>
              </div>

              <div className="overflow-hidden rounded-[1.5rem] border border-white/[0.08] bg-black/30">
                {media.kind === "video" ? (
                  <video
                    ref={(element) => {
                      mediaElementRef.current = element;
                    }}
                    src={media.url}
                    controls
                    playsInline
                    preload="metadata"
                    onLoadedMetadata={updateMediaDuration}
                    onDurationChange={updateMediaDuration}
                    onTimeUpdate={handleTimeUpdate}
                    onSeeked={handleSeeked}
                    className="max-h-[32rem] w-full bg-black object-contain"
                  />
                ) : (
                  <div className="p-5">
                    <audio
                      ref={(element) => {
                        mediaElementRef.current = element;
                      }}
                      src={media.url}
                      controls
                      preload="metadata"
                      onLoadedMetadata={updateMediaDuration}
                      onDurationChange={updateMediaDuration}
                      onTimeUpdate={handleTimeUpdate}
                      onSeeked={handleSeeked}
                      className="w-full"
                    />
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-3">
                <p className="truncate text-sm font-semibold text-white">
                  {media.file.name}
                </p>
                <p className="mt-1 text-[10px] text-zinc-500">
                  {formatFileSize(media.file.size)} • {formatTime(duration)}
                </p>

                {isResolvingDuration && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-cyan-400/10 bg-cyan-500/[0.05] px-3 py-2 text-[10px] text-cyan-200">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
                    Preparando duração da gravação para o editor...
                  </div>
                )}
              </div>
            </div>
          )}

          {errorMessage && (
            <p className="mt-3 rounded-xl border border-red-400/15 bg-red-500/[0.08] px-3 py-2.5 text-xs leading-5 text-red-200">
              {errorMessage}
            </p>
          )}
        </section>

        {media && duration > 0 && (
          <>
            <section className="rounded-[1.5rem] border border-pink-400/10 bg-white/[0.025] p-4 backdrop-blur-xl sm:p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-pink-400">
                Editor
              </p>
              <h2 className="mt-1 text-lg font-bold text-white">Ferramentas</h2>

              <div className="mt-5 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Posição atual</span>
                  <span className="text-sm font-bold text-fuchsia-200">
                    {formatTime(currentTime)}
                  </span>
                </div>

                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.05}
                  value={currentTime}
                  onChange={handlePlaybackSlider}
                  className="mt-3 w-full accent-fuchsia-400"
                />

                <div className="mt-5 grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={sliceAtCurrentTime}
                    className="min-h-16 rounded-2xl border border-violet-400/15 bg-violet-500/[0.06] px-3 text-left"
                  >
                    <span className="text-lg">✂</span>
                    <span className="mt-1 block text-xs font-bold text-white">
                      Fatiar aqui
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={removeSelectedPart}
                    disabled={!startMarked || !endMarked}
                    className="min-h-16 rounded-2xl border border-red-400/15 bg-red-500/[0.05] px-3 text-left disabled:opacity-35"
                  >
                    <span className="text-lg text-red-300">×</span>
                    <span className="mt-1 block text-xs font-bold text-white">
                      Remover parte
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void togglePreview()}
                    className="min-h-16 rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.05] px-3 text-left"
                  >
                    <span className="text-lg text-emerald-300">▶</span>
                    <span className="mt-1 block text-xs font-bold text-white">
                      {previewEdit ? "Parar prévia" : "Prévia da edição"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void saveProjectLocally()}
                    disabled={isSavingProject}
                    className="min-h-16 rounded-2xl border border-cyan-400/15 bg-cyan-500/[0.06] px-3 text-left disabled:opacity-50"
                  >
                    <span className="text-lg text-cyan-300">↓</span>
                    <span className="mt-1 block text-xs font-bold text-white">
                      Salvar projeto
                    </span>
                  </button>
                </div>

                {feedback && (
                  <p className="mt-3 rounded-xl border border-fuchsia-400/10 bg-fuchsia-500/[0.05] px-3 py-2.5 text-xs text-fuchsia-100">
                    {feedback}
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-emerald-400/10 bg-white/[0.025] p-4 backdrop-blur-xl sm:p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">
                Seleção
              </p>
              <h2 className="mt-1 text-lg font-bold text-white">
                Marcar uma parte
              </h2>

              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={markStart}
                  className="min-h-20 rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.06] px-3 text-left"
                >
                  <span className="block text-[9px] uppercase text-emerald-400">
                    Marcar início
                  </span>
                  <span className="mt-1 block text-lg font-bold text-emerald-100">
                    {startMarked ? formatTime(trimStart) : "--:--"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={markEnd}
                  className="min-h-20 rounded-2xl border border-pink-400/15 bg-pink-500/[0.06] px-3 text-left"
                >
                  <span className="block text-[9px] uppercase text-pink-400">
                    Marcar fim
                  </span>
                  <span className="mt-1 block text-lg font-bold text-pink-100">
                    {endMarked ? formatTime(trimEnd) : "--:--"}
                  </span>
                </button>
              </div>

              {startMarked && (
                <div className="mt-3 rounded-2xl border border-emerald-400/10 bg-emerald-500/[0.035] p-4">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Ajustar início</span>
                    <span className="font-bold text-emerald-300">
                      {formatTime(trimStart)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={endMarked ? trimEnd : duration}
                    step={0.05}
                    value={trimStart}
                    onChange={handleStartChange}
                    className="mt-3 w-full accent-emerald-400"
                  />
                </div>
              )}

              {endMarked && (
                <div className="mt-3 rounded-2xl border border-pink-400/10 bg-pink-500/[0.035] p-4">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Ajustar fim</span>
                    <span className="font-bold text-pink-300">
                      {formatTime(trimEnd)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={startMarked ? trimStart : 0}
                    max={duration}
                    step={0.05}
                    value={trimEnd}
                    onChange={handleEndChange}
                    className="mt-3 w-full accent-pink-400"
                  />
                </div>
              )}

              {startMarked && endMarked && (
                <button
                  type="button"
                  onClick={removeSelectedPart}
                  className="mt-3 min-h-12 w-full rounded-xl border border-red-400/20 bg-red-500/[0.07] text-xs font-bold text-red-200"
                >
                  Remover esta parte
                </button>
              )}

              <button
                type="button"
                onClick={resetSelection}
                className="mt-3 min-h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.025] text-xs font-semibold text-zinc-400"
              >
                Limpar marcações
              </button>
            </section>

            <section className="rounded-[1.5rem] border border-violet-400/10 bg-white/[0.025] p-4 backdrop-blur-xl sm:p-6">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-400">
                    Linha do tempo
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-white">Fatias</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    Clique na miniatura para ir até o trecho.
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-[9px] uppercase text-zinc-600">Resultado</p>
                  <p className="mt-1 text-sm font-bold text-violet-200">
                    {formatTime(finalDuration)}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2.5">
                {timelineSegments.map((segment, index) => (
                  <article
                    key={segment.id}
                    className={[
                      "rounded-2xl border p-3",
                      segment.removed
                        ? "border-red-400/15 bg-red-500/[0.045]"
                        : "border-white/[0.08] bg-white/[0.025]",
                    ].join(" ")}
                  >
                    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center">
                      <button
                        type="button"
                        onClick={() => seekTo(segment.start)}
                        className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black/40"
                      >
                        {media.kind === "video" ? (
                          thumbnails[segment.id] ? (
                            <img
                              src={thumbnails[segment.id]}
                              alt={`Miniatura da fatia ${index + 1}`}
                              className={[
                                "h-full w-full object-cover",
                                segment.removed ? "opacity-35 grayscale" : "",
                              ].join(" ")}
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-[9px] text-zinc-600">
                              Gerando...
                            </span>
                          )
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-2xl text-violet-300">
                            ♪
                          </span>
                        )}

                        <span className="absolute bottom-1 right-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[8px] text-white">
                          {formatTime(segment.start)}
                        </span>

                        {segment.removed && (
                          <span className="absolute inset-0 flex items-center justify-center bg-red-950/25 text-[9px] font-bold uppercase text-red-200">
                            Removida
                          </span>
                        )}
                      </button>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-semibold text-white">
                            Fatia {index + 1}
                          </p>
                          <span
                            className={[
                              "rounded-full border px-2 py-0.5 text-[8px] font-semibold uppercase",
                              segment.removed
                                ? "border-red-400/15 bg-red-500/[0.08] text-red-300"
                                : "border-emerald-400/15 bg-emerald-500/[0.06] text-emerald-300",
                            ].join(" ")}
                          >
                            {segment.removed ? "Removida" : "Ativa"}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-zinc-500">
                          {formatTime(segment.start)} → {formatTime(segment.end)}
                        </p>
                        <p className="mt-1 text-[9px] text-zinc-600">
                          Duração {formatTime(segment.end - segment.start)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (segment.removed) {
                            restoreSegment(segment);
                          } else {
                            removeSegment(segment);
                          }
                        }}
                        className={[
                          "col-span-2 min-h-10 rounded-xl border px-3 text-[10px] font-semibold sm:col-span-1",
                          segment.removed
                            ? "border-emerald-400/15 bg-emerald-500/[0.06] text-emerald-300"
                            : "border-red-400/15 bg-red-500/[0.05] text-red-300",
                        ].join(" ")}
                      >
                        {segment.removed ? "Restaurar" : "Remover"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 text-center">
                  <p className="text-sm font-bold text-white">
                    {timelineSegments.length}
                  </p>
                  <p className="mt-1 text-[8px] uppercase text-zinc-600">
                    Fatias
                  </p>
                </div>

                <div className="rounded-xl border border-red-400/10 bg-red-500/[0.025] p-2.5 text-center">
                  <p className="text-sm font-bold text-red-200">
                    {formatTime(totalRemovedDuration)}
                  </p>
                  <p className="mt-1 text-[8px] uppercase text-zinc-600">
                    Removido
                  </p>
                </div>

                <div className="rounded-xl border border-emerald-400/10 bg-emerald-500/[0.025] p-2.5 text-center">
                  <p className="text-sm font-bold text-emerald-200">
                    {formatTime(finalDuration)}
                  </p>
                  <p className="mt-1 text-[8px] uppercase text-zinc-600">
                    Final
                  </p>
                </div>
              </div>
            </section>

            {media.kind === "video" && (
              <section className="rounded-[1.5rem] border border-cyan-400/15 bg-cyan-500/[0.035] p-4 backdrop-blur-xl sm:p-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">
                  Exportação
                </p>
                <h2 className="mt-1 text-lg font-bold text-white">
                  Gerar vídeo final
                </h2>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Escolha entre velocidade máxima ou maior precisão nos pontos de
                  corte.
                </p>

                <div className="mt-5 grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (isExporting) return;
                      setExportMode("fast");
                      setErrorMessage("");
                      clearExportResult();
                    }}
                    className={[
                      "rounded-2xl border p-3 text-left transition",
                      exportMode === "fast"
                        ? "border-amber-400/30 bg-amber-500/10 shadow-[0_10px_30px_rgba(245,158,11,0.06)]"
                        : "border-white/[0.08] bg-white/[0.025]",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xl">⚡</span>
                      {exportMode === "fast" && (
                        <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-1 text-[8px] font-bold uppercase text-amber-300">
                          Selecionado
                        </span>
                      )}
                    </div>
                    <p className="mt-3 text-sm font-bold text-white">Rápido</p>
                    <p className="mt-1 text-[10px] leading-4 text-zinc-500">
                      Sem recodificação. Mantém a qualidade original.
                    </p>
                    <p className="mt-2 text-[9px] leading-4 text-amber-300/70">
                      O ponto pode variar alguns frames.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (isExporting) return;
                      setExportMode("precise");
                      setErrorMessage("");
                      clearExportResult();
                    }}
                    className={[
                      "rounded-2xl border p-3 text-left transition",
                      exportMode === "precise"
                        ? "border-cyan-400/30 bg-cyan-500/10 shadow-[0_10px_30px_rgba(34,211,238,0.06)]"
                        : "border-white/[0.08] bg-white/[0.025]",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xl">🎯</span>
                      {exportMode === "precise" && (
                        <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-1 text-[8px] font-bold uppercase text-cyan-300">
                          Selecionado
                        </span>
                      )}
                    </div>
                    <p className="mt-3 text-sm font-bold text-white">Preciso</p>
                    <p className="mt-1 text-[10px] leading-4 text-zinc-500">
                      Recodifica o vídeo e respeita melhor os cortes.
                    </p>
                    <p className="mt-2 text-[9px] leading-4 text-cyan-300/70">
                      Mais demorado e usa mais CPU.
                    </p>
                  </button>
                </div>

                <div className="mt-4 rounded-2xl border border-white/[0.07] bg-black/15 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[9px] uppercase tracking-wide text-zinc-600">
                        Modo atual
                      </p>
                      <p className="mt-1 text-xs font-bold text-white">
                        {exportMode === "fast"
                          ? "⚡ Exportação rápida"
                          : "🎯 Exportação precisa"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] uppercase tracking-wide text-zinc-600">
                        Vídeo final
                      </p>
                      <p className="mt-1 text-xs font-bold text-emerald-300">
                        {formatTime(finalDuration)}
                      </p>
                    </div>
                  </div>
                </div>

                {isExporting && (
                  <div className="mt-4 rounded-2xl border border-cyan-400/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 text-xs text-cyan-100">
                        {exportStatus}
                      </span>
                      <span className="shrink-0 text-xs font-bold text-cyan-300">
                        {exportProgress}%
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-cyan-400 transition-all duration-300"
                        style={{ width: `${exportProgress}%` }}
                      />
                    </div>
                    <p className="mt-3 text-[10px] leading-4 text-zinc-600">
                      Não feche esta página durante a exportação.
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void exportVideo()}
                  disabled={isExporting || finalDuration <= TIME_EPSILON}
                  className={[
                    "mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-bold shadow-[0_12px_35px_rgba(34,211,238,0.08)] transition disabled:cursor-not-allowed disabled:opacity-50",
                    exportMode === "fast"
                      ? "border-amber-300/20 bg-amber-500/[0.10] text-amber-100 hover:bg-amber-500/[0.15]"
                      : "border-cyan-300/20 bg-cyan-500/[0.10] text-cyan-100 hover:bg-cyan-500/[0.15]",
                  ].join(" ")}
                >
                  <span>{exportMode === "fast" ? "⚡" : "🎬"}</span>
                  {isExporting
                    ? "Exportando..."
                    : exportMode === "fast"
                      ? "Exportar rapidamente"
                      : "Exportar com precisão"}
                </button>

                {exportedUrl && (
                  <div className="mt-4 rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.05] p-4">
                    <p className="text-sm font-bold text-emerald-100">
                      ✓ Vídeo pronto
                    </p>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      O arquivo foi processado localmente e o download já foi
                      solicitado.
                    </p>
                    <a
                      href={exportedUrl}
                      download={exportedName}
                      className="mt-3 flex min-h-12 w-full items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-500/[0.08] text-xs font-bold text-emerald-200"
                    >
                      ↓ Baixar MP4 novamente
                    </a>
                  </div>
                )}
              </section>
            )}

            <section className="pb-6">
              <div className="rounded-[1.5rem] border border-fuchsia-400/10 bg-fuchsia-500/[0.035] p-4">
                <button
                  type="button"
                  onClick={() => void saveProjectLocally()}
                  disabled={isSavingProject || isExporting}
                  className="min-h-14 w-full rounded-2xl border border-fuchsia-300/20 bg-fuchsia-500/[0.08] text-sm font-bold text-fuchsia-100 disabled:opacity-50"
                >
                  {isSavingProject
                    ? "Salvando..."
                    : "↓ Salvar projeto de edição"}
                </button>

                <button
                  type="button"
                  onClick={restoreCompleteEdit}
                  disabled={isExporting}
                  className="mt-3 min-h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.025] text-xs font-semibold text-zinc-400 disabled:opacity-50"
                >
                  Desfazer todos os cortes e remoções
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </PlatformShell>
  );
}
