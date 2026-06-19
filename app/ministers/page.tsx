"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  UserPlus,
  Pencil,
  X,
} from "lucide-react";

// ----- Tipos -----

type AssignmentMode = "fixed" | "pair" | "flex";

type FixedRule = {
  id: string;
  minister_id: string;
  day_of_week: number;
  mass_time: string;
  week_ordinals: number[] | null;
};

type Minister = {
  id: string;
  full_name: string;
  phone: string | null;
  assignment_mode: AssignmentMode;
  is_active: boolean;
  fixed_rules: FixedRule[];
  pair: { id: string; partner_id: string } | null;
};

type Pair = {
  id: string;
  minister_a_id: string;
  minister_b_id: string;
  minister_a_name: string;
  minister_b_name: string;
};

type UnavailabilityEntry = {
  id: string;
  minister_id: string;
  unavailable_date: string;
  reason: string | null;
};

type Tab = "ministros" | "parejas" | "no-disponibilidad";

// ----- Constantes -----

const DAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
];

const MODE_LABELS: Record<AssignmentMode, string> = {
  fixed: "Fijo",
  pair: "Pareja",
  flex: "Flex",
};

// Horas de misa válidas según el día:
// - Domingo (0): 07:00, 09:00, 11:00, 17:00
// - Sábado (6): 16:00, 18:00
// - Lunes a viernes (1-5): 17:00
function timesForDay(day: number) {
  if (day === 0) return ["07:00", "09:00", "11:00", "17:00"];
  if (day === 6) return ["16:00", "18:00"];
  return ["17:00"];
}

// Frecuencia por ocurrencia de la semana dentro del mes.
const ORDINAL_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "1.º" },
  { value: 2, label: "2.º" },
  { value: 3, label: "3.º" },
  { value: 4, label: "4.º" },
  { value: 5, label: "5.º" },
  { value: -1, label: "Último" },
  { value: -2, label: "Penúltimo" },
];

function ordinalLabel(value: number) {
  return ORDINAL_OPTIONS.find((o) => o.value === value)?.label ?? `${value}.º`;
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Nombre del día en singular ("domingo") y plural ("domingos").
function daySingular(day: number) {
  return dayLabel(day).toLowerCase();
}

function dayPlural(day: number) {
  const name = daySingular(day);
  return name.endsWith("s") ? name : `${name}s`; // lunes→lunes, domingo→domingos
}

// Une elementos con comas y "y": ["1.º","3.º"] → "1.º y 3.º"
function joinEs(parts: string[]) {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

function sortOrdinals(ordinals: number[]) {
  // Positivos en orden (1..5), luego último (-1) y penúltimo (-2).
  return [...ordinals].sort((a, b) => (a > 0 ? a : 100 - a) - (b > 0 ? b : 100 - b));
}

// Frase en lenguaje natural de cuándo aplica la regla, sin la hora.
// p.ej. "Todos los domingos" · "1.º y 3.º lunes del mes" · "último sábado del mes"
function frequencyPhrase(ordinals: number[] | null, day: number) {
  if (!ordinals || ordinals.length === 0) return `Todos los ${dayPlural(day)}`;
  const labels = sortOrdinals(ordinals).map((o) =>
    ordinalLabel(o).toLowerCase()
  );
  return `${joinEs(labels)} ${daySingular(day)} del mes`;
}

// Descripción completa de una regla, con hora. p.ej.
// "1.º y 3.º domingo del mes a las 09:00"
function describeRule(rule: FixedRule) {
  const phrase = frequencyPhrase(rule.week_ordinals, rule.day_of_week);
  return `${phrase} a las ${rule.mass_time.slice(0, 5)}`;
}

// ----- Estilos reutilizables -----

const inputClass =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-200";
const primaryBtn =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50";
const ghostBtn =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50";
const dangerBtn =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50";

function dayLabel(day: number) {
  return DAYS.find((d) => d.value === day)?.label ?? String(day);
}

function formatDateLabel(date: string) {
  const d = new Date(`${date.slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ----- Componente principal -----

export default function MinistersPage() {
  const [tab, setTab] = useState<Tab>("ministros");

  const [ministers, setMinisters] = useState<Minister[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadMinisters() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ministers");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error cargando ministros");
      setMinisters(data.ministers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMinisters();
  }, []);

  const tabs: [Tab, string][] = [
    ["ministros", "Ministros"],
    ["parejas", "Parejas"],
    ["no-disponibilidad", "No disponibilidad"],
  ];

  return (
    <main className="min-h-screen">
      {/* Barra superior */}
      <header className="border-b border-stone-200/70 bg-white/60 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-4">
          <span className="text-sm font-medium tracking-tight text-stone-500">
            Gestión de ministros
          </span>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3.5 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl px-6 pb-20 pt-10">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900 md:text-3xl">
          Ministros
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          Administra ministros, parejas y fechas de no disponibilidad.
        </p>

        {/* Tabs */}
        <div className="mt-8 flex gap-6 border-b border-stone-200">
          {tabs.map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`-mb-px border-b-2 pb-3 text-sm font-medium transition ${
                tab === value
                  ? "border-stone-900 text-stone-900"
                  : "border-transparent text-stone-400 hover:text-stone-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6">
          {loading ? (
            <p className="text-sm text-stone-400">Cargando…</p>
          ) : tab === "ministros" ? (
            <MinistersTab ministers={ministers} onChange={loadMinisters} />
          ) : tab === "parejas" ? (
            <PairsTab ministers={ministers} onChange={loadMinisters} />
          ) : (
            <UnavailabilityTab ministers={ministers} />
          )}
        </div>
      </div>
    </main>
  );
}

// ----- Tab 1: Ministros -----

function MinistersTab({
  ministers,
  onChange,
}: {
  ministers: Minister[];
  onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setAdding((v) => !v)} className={primaryBtn}>
          <UserPlus className="h-4 w-4" />
          Agregar ministro
        </button>
      </div>

      {adding && (
        <MinisterForm
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            onChange();
          }}
        />
      )}

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-stone-100 text-xs uppercase tracking-wide text-stone-400">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Teléfono</th>
              <th className="px-4 py-3 font-medium">Modo</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ministers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-stone-400">
                  No hay ministros registrados.
                </td>
              </tr>
            )}
            {ministers.map((minister) => (
              <MinisterRow
                key={minister.id}
                minister={minister}
                expanded={expandedId === minister.id}
                editing={editingId === minister.id}
                onToggleExpand={() =>
                  setExpandedId((id) =>
                    id === minister.id ? null : minister.id
                  )
                }
                onEdit={() => setEditingId(minister.id)}
                onStopEdit={() => setEditingId(null)}
                onChange={onChange}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MinisterRow({
  minister,
  expanded,
  editing,
  onToggleExpand,
  onEdit,
  onStopEdit,
  onChange,
}: {
  minister: Minister;
  expanded: boolean;
  editing: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onStopEdit: () => void;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function deactivate() {
    if (!confirm(`¿Desactivar a ${minister.full_name}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/ministers/${minister.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      onChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <tr className="border-b border-stone-100 last:border-0 hover:bg-stone-50/50">
        <td className="px-4 py-3">
          <button
            onClick={onToggleExpand}
            className="inline-flex items-center gap-1.5 font-medium text-stone-900 transition hover:text-stone-600"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-stone-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-stone-400" />
            )}
            {minister.full_name}
          </button>
        </td>
        <td className="px-4 py-3 text-stone-500">{minister.phone || "—"}</td>
        <td className="px-4 py-3 text-stone-500">
          {MODE_LABELS[minister.assignment_mode]}
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              minister.is_active
                ? "bg-emerald-50 text-emerald-700"
                : "bg-stone-100 text-stone-500"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                minister.is_active ? "bg-emerald-500" : "bg-stone-400"
              }`}
            />
            {minister.is_active ? "Activo" : "Inactivo"}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex justify-end gap-1">
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-stone-600 transition hover:bg-stone-100"
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </button>
            {minister.is_active && (
              <button onClick={deactivate} disabled={busy} className={dangerBtn}>
                <Trash2 className="h-3.5 w-3.5" />
                Desactivar
              </button>
            )}
          </div>
        </td>
      </tr>

      {editing && (
        <tr className="border-b border-stone-100 bg-stone-50/60">
          <td colSpan={5} className="px-4 py-4">
            <MinisterForm
              minister={minister}
              onCancel={onStopEdit}
              onSaved={() => {
                onStopEdit();
                onChange();
              }}
            />
          </td>
        </tr>
      )}

      {expanded && (
        <tr className="border-b border-stone-100 bg-stone-50/60">
          <td colSpan={5} className="px-4 py-4">
            <FixedRulesSection minister={minister} onChange={onChange} />
          </td>
        </tr>
      )}
    </>
  );
}

function MinisterForm({
  minister,
  onCancel,
  onSaved,
}: {
  minister?: Minister;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(minister?.full_name ?? "");
  const [phone, setPhone] = useState(minister?.phone ?? "");
  const [mode, setMode] = useState<AssignmentMode>(
    minister?.assignment_mode ?? "flex"
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        minister ? `/api/ministers/${minister.id}` : "/api/ministers",
        {
          method: minister ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            full_name: fullName,
            phone,
            assignment_mode: mode,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error guardando");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-stone-500">
            Nombre
          </label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputClass}
            placeholder="Nombre completo"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-stone-500">
            Teléfono
          </label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            placeholder="Opcional"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-stone-500">
            Modo
          </label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as AssignmentMode)}
            className={inputClass}
          >
            <option value="fixed">Fijo</option>
            <option value="pair">Pareja</option>
            <option value="flex">Flex</option>
          </select>
        </div>
      </div>

      {err && <p className="mt-3 text-sm font-medium text-red-600">{err}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onCancel} className={ghostBtn}>
          Cancelar
        </button>
        <button onClick={save} disabled={busy} className={primaryBtn}>
          {busy ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}

function FixedRulesSection({
  minister,
  onChange,
}: {
  minister: Minister;
  onChange: () => void;
}) {
  const [day, setDay] = useState(1);
  const [time, setTime] = useState("17:00");
  const [ordinals, setOrdinals] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const rules = minister.fixed_rules ?? [];
  const validTimes = timesForDay(day);

  function handleDayChange(nextDay: number) {
    setDay(nextDay);
    const times = timesForDay(nextDay);
    // Si la hora actual no es válida para el nuevo día, usar la primera válida.
    if (!times.includes(time)) setTime(times[0]);
  }

  function toggleOrdinal(value: number) {
    setOrdinals((prev) =>
      prev.includes(value)
        ? prev.filter((o) => o !== value)
        : [...prev, value]
    );
  }

  async function addRule() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/ministers/${minister.id}/fixed-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day_of_week: day,
          mass_time: time,
          week_ordinals: ordinals.length > 0 ? ordinals : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setOrdinals([]);
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRule(ruleId: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/ministers/${minister.id}/fixed-rules/${ruleId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
        Reglas fijas
      </h3>
      <p className="mb-3 mt-1 text-sm text-stone-500">
        Días y horas en que este ministro se asigna automáticamente. Cada
        ministro libra un fin de semana al mes, así que aunque diga «todos», el
        generador deja libre un sábado y domingo.
      </p>

      {rules.length === 0 ? (
        <p className="mb-4 text-sm text-stone-400">
          Este ministro no tiene reglas fijas.
        </p>
      ) : (
        <ul className="mb-4 divide-y divide-stone-100 overflow-hidden rounded-lg border border-stone-200 bg-white">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex items-center justify-between px-3 py-2.5 text-sm"
            >
              <span className="text-stone-700">
                {capitalize(describeRule(rule))}
              </span>
              <button
                onClick={() => deleteRule(rule.id)}
                disabled={busy}
                className="ml-3 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-stone-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border border-stone-200 bg-stone-50/60 p-4">
        <p className="mb-3 text-sm font-medium text-stone-700">
          Agregar una nueva regla
        </p>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-stone-500">
              Día
            </label>
            <select
              value={day}
              onChange={(e) => handleDayChange(Number(e.target.value))}
              className={`${inputClass} w-auto`}
            >
              {DAYS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-stone-500">
              Hora de la misa
            </label>
            <select
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={`${inputClass} w-auto`}
            >
              {validTimes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-stone-500">
            ¿Qué {daySingular(day)}s del mes?
          </label>
          <p className="mb-2 text-xs text-stone-400">
            Si no eliges ninguno, se asignará todos los {dayPlural(day)} del mes.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ORDINAL_OPTIONS.map((opt) => {
              const active = ordinals.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleOrdinal(opt.value)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    active
                      ? "border-stone-900 bg-stone-900 text-white"
                      : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                  }`}
                >
                  {opt.label} {daySingular(day)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-3">
          <p className="text-sm text-stone-500">
            Se asignará:{" "}
            <span className="font-medium text-stone-800">
              {frequencyPhrase(ordinals, day)} a las {time}
            </span>
          </p>
          <button onClick={addRule} disabled={busy} className={primaryBtn}>
            <Plus className="h-4 w-4" />
            Agregar regla
          </button>
        </div>

        {err && <p className="mt-2 text-sm font-medium text-red-600">{err}</p>}
      </div>
    </div>
  );
}

// ----- Tab 2: Parejas -----

function PairsTab({
  ministers,
  onChange,
}: {
  ministers: Minister[];
  onChange: () => void;
}) {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const [busy, setBusy] = useState(false);

  const pairMinisters = useMemo(
    () => ministers.filter((m) => m.assignment_mode === "pair" && m.is_active),
    [ministers]
  );

  async function loadPairs() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/ministers/pairs");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setPairs(data.pairs);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPairs();
  }, []);

  async function addPair() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/ministers/pairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minister_a_id: aId, minister_b_id: bId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setAId("");
      setBId("");
      await loadPairs();
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  async function deletePair(id: string) {
    if (!confirm("¿Desactivar esta pareja?")) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/ministers/pairs/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      await loadPairs();
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-400">
          Agregar pareja
        </h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1.5 block text-xs font-medium text-stone-500">
              Ministro 1
            </label>
            <select
              value={aId}
              onChange={(e) => setAId(e.target.value)}
              className={inputClass}
            >
              <option value="">Seleccionar…</option>
              {pairMinisters
                .filter((m) => m.id !== bId)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
            </select>
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="mb-1.5 block text-xs font-medium text-stone-500">
              Ministro 2
            </label>
            <select
              value={bId}
              onChange={(e) => setBId(e.target.value)}
              className={inputClass}
            >
              <option value="">Seleccionar…</option>
              {pairMinisters
                .filter((m) => m.id !== aId)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
            </select>
          </div>
          <button
            onClick={addPair}
            disabled={busy || !aId || !bId}
            className={primaryBtn}
          >
            <Plus className="h-4 w-4" />
            Agregar
          </button>
        </div>
        {pairMinisters.length < 2 && (
          <p className="mt-2 text-sm text-stone-400">
            Necesitas al menos dos ministros con modo «Pareja» para crear una
            pareja.
          </p>
        )}
        {err && <p className="mt-2 text-sm font-medium text-red-600">{err}</p>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-stone-100 text-xs uppercase tracking-wide text-stone-400">
              <th className="px-4 py-3 font-medium">Ministro 1</th>
              <th className="px-4 py-3 font-medium">Ministro 2</th>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-stone-400">
                  Cargando…
                </td>
              </tr>
            ) : pairs.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-stone-400">
                  No hay parejas activas.
                </td>
              </tr>
            ) : (
              pairs.map((pair) => (
                <tr
                  key={pair.id}
                  className="border-b border-stone-100 last:border-0 hover:bg-stone-50/50"
                >
                  <td className="px-4 py-3 font-medium text-stone-900">
                    {pair.minister_a_name}
                  </td>
                  <td className="px-4 py-3 font-medium text-stone-900">
                    {pair.minister_b_name}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => deletePair(pair.id)}
                      disabled={busy}
                      className={dangerBtn}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ----- Tab 3: No Disponibilidad -----

function UnavailabilityTab({ ministers }: { ministers: Minister[] }) {
  const [ministerId, setMinisterId] = useState("");
  const [entries, setEntries] = useState<UnavailabilityEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const activeMinisters = useMemo(
    () => ministers.filter((m) => m.is_active),
    [ministers]
  );

  async function loadEntries(id: string) {
    if (!id) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/ministers/${id}/unavailability`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setEntries(data.entries);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEntries(ministerId);
  }, [ministerId]);

  async function addEntry() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/ministers/${ministerId}/unavailability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unavailable_date: date, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setDate("");
      setReason("");
      await loadEntries(ministerId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(entryId: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/ministers/${ministerId}/unavailability/${entryId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      await loadEntries(ministerId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <label className="mb-1.5 block text-xs font-medium text-stone-500">
          Ministro
        </label>
        <select
          value={ministerId}
          onChange={(e) => setMinisterId(e.target.value)}
          className={`${inputClass} md:max-w-md`}
        >
          <option value="">Seleccionar ministro…</option>
          {activeMinisters.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name}
            </option>
          ))}
        </select>
      </div>

      {ministerId && (
        <>
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-400">
              Agregar fecha no disponible
            </h3>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-stone-500">
                  Fecha
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={`${inputClass} w-auto`}
                />
              </div>
              <div className="min-w-[200px] flex-1">
                <label className="mb-1.5 block text-xs font-medium text-stone-500">
                  Motivo (opcional)
                </label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className={inputClass}
                  placeholder="Motivo"
                />
              </div>
              <button
                onClick={addEntry}
                disabled={busy || !date}
                className={primaryBtn}
              >
                <Plus className="h-4 w-4" />
                Agregar
              </button>
            </div>
            {err && (
              <p className="mt-2 text-sm font-medium text-red-600">{err}</p>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {loading ? (
              <p className="px-4 py-10 text-center text-stone-400">Cargando…</p>
            ) : entries.length === 0 ? (
              <p className="px-4 py-10 text-center text-stone-400">
                Este ministro no tiene fechas no disponibles.
              </p>
            ) : (
              <ul>
                {entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between border-b border-stone-100 px-4 py-3 last:border-0"
                  >
                    <div>
                      <p className="font-medium capitalize text-stone-900">
                        {formatDateLabel(entry.unavailable_date)}
                      </p>
                      {entry.reason && (
                        <p className="text-sm text-stone-500">{entry.reason}</p>
                      )}
                    </div>
                    <button
                      onClick={() => removeEntry(entry.id)}
                      disabled={busy}
                      className={dangerBtn}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
