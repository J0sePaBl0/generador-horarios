"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  FileSpreadsheet,
  Trash2,
  Upload,
  Paperclip,
  Lock,
} from "lucide-react";

type UploadedFile = {
  file: File;
  name: string;
  sizeLabel: string;
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

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedMonthLabel = useMemo(() => {
    return months.find((month) => month.value === selectedMonth)?.label ?? "Enero";
  }, [selectedMonth]);

  const handleGenerate = async () => {
    try {
      setIsGenerating(true);

      // Aquí luego conectas tu endpoint real:
      // await fetch("/api/schedules/generate", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ year: 2026, month: selectedMonth }),
      // });

      // Simulación de archivo generado
      const fakeContent = `Horario generado para ${selectedMonthLabel}`;
      const generatedFile = new File(
        [fakeContent],
        `horario-${selectedMonthLabel.toLowerCase()}-2026.xlsx`,
        {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }
      );

      setUploadedFile({
        file: generatedFile,
        name: generatedFile.name,
        sizeLabel: formatFileSize(generatedFile.size),
      });
    } catch (error) {
      console.error("Error generating schedule:", error);
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

  const handleConfirm = async () => {
    if (!uploadedFile) return;

    try {
      setIsConfirming(true);

      // Aquí luego conectas tu endpoint real:
      // const formData = new FormData();
      // formData.append("file", uploadedFile.file);
      // formData.append("month", String(selectedMonth));
      //
      // await fetch("/api/schedules/confirm", {
      //   method: "POST",
      //   body: formData,
      // });

      console.log("Archivo confirmado:", uploadedFile.name);
      alert("Horario confirmado correctamente.");
    } catch (error) {
      console.error("Error confirming schedule:", error);
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#ece8e5]">
      <section className="relative min-h-screen overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/church-bg.jpg')" }}
        />
        <div className="absolute inset-0 bg-white/70" />

        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center px-6 py-14">
          <h1 className="mt-20 text-center text-4xl font-black italic tracking-tight text-black md:text-6xl">
            GENERADOR DE HORARIOS
          </h1>

          <div className="mt-14 grid w-full max-w-2xl grid-cols-1 gap-5 md:grid-cols-2">
            <div className="relative">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="h-16 w-full appearance-none rounded-2xl border-0 bg-[#ad8368] px-6 pr-14 text-center text-2xl font-bold italic text-white shadow-md outline-none transition focus:ring-2 focus:ring-[#8b6249]"
              >
                {months.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>

              <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-7 w-7 -translate-y-1/2 text-white" />
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="h-16 rounded-2xl bg-[#ad8368] px-6 text-2xl font-bold italic text-white shadow-md transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isGenerating ? "Generando..." : "Generar"}
            </button>
          </div>

          <div className="mt-14 w-full max-w-3xl rounded-2xl border border-[#c9c3bf] bg-white/55 p-6 shadow-sm backdrop-blur-sm">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />

            {!uploadedFile ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#d5cfca] bg-white/40 px-6 py-10 text-center">
                <p className="text-lg font-bold italic text-black">
                  Adjunte el archivo cuando esté listo
                </p>

                <div className="mt-7 rounded-2xl bg-[#f2ebe7] p-5 text-[#605b59]">
                  <Upload className="h-16 w-16" />
                </div>

                <button
                  type="button"
                  onClick={handleOpenFilePicker}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#f0e7e1] px-5 py-3 text-base font-semibold text-[#7d5841] transition hover:bg-[#eadfd7]"
                >
                  <Paperclip className="h-5 w-5" />
                  Adjuntar archivo
                </button>

                <p className="mt-4 text-sm text-[#6d6763]">
                  Excel o CSV. Tamaño máximo 20MB.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <p className="text-center text-lg font-bold italic text-black">
                  Archivo listo para confirmar
                </p>

                <div className="flex flex-col gap-4 rounded-xl border border-[#d5cfca] bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="rounded-xl bg-[#eef6ee] p-3">
                      <FileSpreadsheet className="h-10 w-10 text-green-700" />
                    </div>

                    <div>
                      <p className="break-all text-lg font-bold text-black">
                        {uploadedFile.name}
                      </p>
                      <p className="text-sm text-[#6f6864]">
                        Archivo cargado • {uploadedFile.sizeLabel}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleOpenFilePicker}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#f0e7e1] px-4 py-2.5 font-semibold text-[#7d5841] transition hover:bg-[#eadfd7]"
                    >
                      <Upload className="h-4 w-4" />
                      Reemplazar
                    </button>

                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 font-semibold text-red-700 transition hover:bg-red-100"
                    >
                      <Trash2 className="h-4 w-4" />
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-col items-end gap-3">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!uploadedFile || isConfirming}
                className="rounded-xl bg-green-700 px-6 py-3 text-base font-bold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-green-400"
              >
                {isConfirming ? "Confirmando..." : "Confirmar horario"}
              </button>

              <div className="flex items-center gap-2 text-sm text-[#6d6763]">
                <Lock className="h-4 w-4" />
                <span>Solo podrás confirmar si el archivo es válido</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}