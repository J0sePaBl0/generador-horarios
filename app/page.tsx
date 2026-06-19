"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  FileSpreadsheet,
  Trash2,
  Upload,
  Paperclip,
  Lock,
  Users,
  Download,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  X,
  Printer,
} from "lucide-react";

type UploadedFile = {
  file: File;
  name: string;
  sizeLabel: string;
};

type Notice = {
  type: "success" | "warning" | "error";
  title: string;
  detail?: string;
};

const months = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
];

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export default function HomePage() {
  const [selectedMonth, setSelectedMonth] = useState(1);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedMonthLabel = useMemo(() => {
    return (
      months.find((month) => month.value === selectedMonth)?.label ?? "Enero"
    );
  }, [selectedMonth]);

  const handleGenerate = async () => {
    try {
      setIsGenerating(true);
      setNotice(null);

      const year = new Date().getFullYear();

      const generateResponse = await fetch("/api/schedules/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month: selectedMonth }),
      });

      const generateData = await generateResponse.json();

      if (!generateResponse.ok) {
        throw new Error(generateData.error || "Error generando el horario");
      }

      const conflicts = Array.isArray(generateData.conflicts)
        ? generateData.conflicts
        : [];

      const exportResponse = await fetch(
        `/api/schedules/export?year=${year}&month=${selectedMonth}`
      );

      if (!exportResponse.ok) {
        throw new Error("Error exportando el horario");
      }

      const blob = await exportResponse.blob();
      const fileName = `horario-${selectedMonthLabel.toLowerCase()}-${year}.xlsx`;
      const generatedFile = new File([blob], fileName, {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      setUploadedFile({
        file: generatedFile,
        name: generatedFile.name,
        sizeLabel: formatFileSize(generatedFile.size),
      });

      if (conflicts.length > 0) {
        const detail = conflicts
          .map(
            (c: { minister_name: string; date: string; mass_time: string }) =>
              `${c.minister_name} — ${c.date} ${c.mass_time}`
          )
          .join(" · ");
        setNotice({
          type: "warning",
          title: `Horario generado con ${conflicts.length} conflicto(s) por no disponibilidad`,
          detail,
        });
      } else {
        setNotice({
          type: "success",
          title: "Horario generado correctamente",
        });
      }
    } catch (error) {
      console.error(error);
      setNotice({
        type: "error",
        title: error instanceof Error ? error.message : "Error inesperado",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;

    setUploadedFile({
      file: selected,
      name: selected.name,
      sizeLabel: formatFileSize(selected.size),
    });

    event.target.value = "";
  };

  const handleOpenFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
  };

  const handleDownloadFile = () => {
    if (!uploadedFile) return;

    const url = URL.createObjectURL(uploadedFile.file);
    const link = document.createElement("a");
    link.href = url;
    link.download = uploadedFile.name;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadRol = async () => {
    try {
      setNotice(null);
      const year = new Date().getFullYear();
      const res = await fetch(
        `/api/schedules/export-rol?year=${year}&month=${selectedMonth}`
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error descargando el rol");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `rol-ministros-${selectedMonthLabel.toLowerCase()}-${year}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      setNotice({
        type: "error",
        title: error instanceof Error ? error.message : "Error inesperado",
      });
    }
  };

  const handleConfirm = async () => {
    if (!uploadedFile) return;

    try {
      setIsConfirming(true);
      setNotice(null);

      const year = new Date().getFullYear();

      const formData = new FormData();
      formData.append("file", uploadedFile.file);
      formData.append("year", String(year));
      formData.append("month", String(selectedMonth));

      const response = await fetch("/api/schedules/confirm", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error confirmando el horario");
      }

      setNotice({
        type: "success",
        title: "Horario confirmado correctamente",
      });
    } catch (error) {
      console.error(error);
      setNotice({
        type: "error",
        title: error instanceof Error ? error.message : "Error inesperado",
      });
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <main className="min-h-screen">
      {/* Barra superior */}
      <header className="border-b border-stone-200/70 bg-white/60 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-4">
          <span className="text-sm font-medium tracking-tight text-stone-500">
            Horarios de ministros
          </span>
          <Link
            href="/ministers"
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3.5 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50"
          >
            <Users className="h-4 w-4" />
            Gestionar ministros
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-6 pb-20 pt-14">
        {/* Hero */}
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
            Generador de horarios
          </h1>
          <p className="mt-3 text-base text-stone-500">
            Selecciona un mes, genera el horario y confírmalo cuando esté listo.
          </p>
        </div>

        {/* Notificación */}
        {notice && (
          <div
            className={`mt-8 flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm ${
              notice.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : notice.type === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {notice.type === "success" ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium">{notice.title}</p>
              {notice.detail && (
                <p className="mt-1 break-words text-xs opacity-80">
                  {notice.detail}
                </p>
              )}
            </div>
            <button
              onClick={() => setNotice(null)}
              className="shrink-0 rounded-md p-0.5 opacity-60 transition hover:opacity-100"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Controles */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="h-12 w-full appearance-none rounded-xl border border-stone-200 bg-white px-4 pr-11 text-base font-medium text-stone-900 outline-none transition focus:border-stone-400 focus:ring-2 focus:ring-stone-200"
            >
              {months.map((month) => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-stone-900 px-6 text-base font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-44"
          >
            <Sparkles className="h-4 w-4" />
            {isGenerating ? "Generando…" : "Generar"}
          </button>
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={handleDownloadRol}
            className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
          >
            <Printer className="h-4 w-4" />
            Descargar rol para imprimir
          </button>
        </div>

        {/* Área de archivo */}
        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="hidden"
          />

          {!uploadedFile ? (
            <button
              type="button"
              onClick={handleOpenFilePicker}
              className="flex min-h-[240px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-stone-50/50 px-6 py-10 text-center transition hover:border-stone-400 hover:bg-stone-50"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-stone-100 text-stone-500">
                <Upload className="h-6 w-6" />
              </span>
              <span className="mt-4 text-base font-medium text-stone-900">
                Adjunta el archivo cuando esté listo
              </span>
              <span className="mt-1 inline-flex items-center gap-1.5 text-sm text-stone-500">
                <Paperclip className="h-4 w-4" />
                Haz clic para seleccionar
              </span>
              <span className="mt-3 text-xs text-stone-400">
                Excel o CSV · máximo 20 MB
              </span>
            </button>
          ) : (
            <div className="flex flex-col gap-4 rounded-xl border border-stone-200 bg-white p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <FileSpreadsheet className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-stone-900">
                    {uploadedFile.name}
                  </p>
                  <p className="text-xs text-stone-500">
                    Listo para confirmar · {uploadedFile.sizeLabel}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadFile}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
                >
                  <Download className="h-4 w-4" />
                  Descargar
                </button>
                <button
                  type="button"
                  onClick={handleOpenFilePicker}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
                >
                  <Upload className="h-4 w-4" />
                  Reemplazar
                </button>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </button>
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-col items-stretch gap-3 border-t border-stone-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1.5 text-xs text-stone-400">
              <Lock className="h-3.5 w-3.5" />
              <span>Solo podrás confirmar si el archivo es válido</span>
            </div>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!uploadedFile || isConfirming}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CheckCircle2 className="h-4 w-4" />
              {isConfirming ? "Confirmando…" : "Confirmar horario"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
