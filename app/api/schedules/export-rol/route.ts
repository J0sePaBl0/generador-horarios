import { createClient } from "@/lib/supabase/server";
import ExcelJS from "exceljs";

const MONTHS_ES = [
  "",
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];

const MONTHS_FILE = [
  "",
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

// Colores (ARGB)
const C = {
  titleBg: "FF1F4E79",
  subBg: "FF2E5496",
  headBg: "FF8EAADB",
  dateBg: "FFD9E1F2",
  white: "FFFFFFFF",
  black: "FF000000",
  border: "FFBFBFBF",
};

const THIN = { style: "thin" as const, color: { argb: C.border } };
const ALL_BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN };

type CellOpts = {
  fill?: string;
  bold?: boolean;
  color?: string;
  size?: number;
  align?: "left" | "center" | "right";
};

function getDay(dateStr: string) {
  return new Date(`${dateStr.slice(0, 10)}T00:00:00`).getDay();
}

function dayOfMonth(dateStr: string) {
  return Number(dateStr.slice(8, 10));
}

function formatTime(time: string) {
  const [hourStr, minute] = time.split(":");
  let hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${ampm}`;
}

type Sheet = ExcelJS.Worksheet;

function paint(cell: ExcelJS.Cell, opts: CellOpts) {
  if (opts.fill) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: opts.fill },
    };
  }
  cell.font = {
    bold: !!opts.bold,
    color: { argb: opts.color ?? C.black },
    size: opts.size ?? 11,
    name: "Calibri",
  };
  cell.alignment = {
    horizontal: opts.align ?? "left",
    vertical: "middle",
    wrapText: true,
  };
  cell.border = ALL_BORDERS;
}

function setCell(
  ws: Sheet,
  row: number,
  col: number,
  value: string | number,
  opts: CellOpts
) {
  const cell = ws.getRow(row).getCell(col);
  cell.value = value;
  paint(cell, opts);
}

function setMerged(
  ws: Sheet,
  top: number,
  left: number,
  bottom: number,
  right: number,
  value: string | number,
  opts: CellOpts
) {
  ws.mergeCells(top, left, bottom, right);
  for (let r = top; r <= bottom; r++) {
    for (let c = left; c <= right; c++) {
      const cell = ws.getRow(r).getCell(c);
      cell.border = ALL_BORDERS;
      if (opts.fill) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: opts.fill },
        };
      }
    }
  }
  const tl = ws.getRow(top).getCell(left);
  tl.value = value;
  tl.font = {
    bold: !!opts.bold,
    color: { argb: opts.color ?? C.black },
    size: opts.size ?? 11,
    name: "Calibri",
  };
  tl.alignment = {
    horizontal: opts.align ?? "center",
    vertical: "middle",
    wrapText: true,
  };
}

type MassRow = {
  date: string;
  time: string;
  ministers: string[];
};

export async function GET(req: Request) {
  const supabase = await createClient();

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));

  if (!year || !month || month < 1 || month > 12) {
    return Response.json(
      { error: "El año y el mes son obligatorios." },
      { status: 400 }
    );
  }

  const { data: period, error: periodError } = await supabase
    .from("schedule_periods")
    .select("id")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (periodError) {
    return Response.json({ error: periodError.message }, { status: 500 });
  }
  if (!period) {
    return Response.json(
      { error: "No existe un horario para este mes." },
      { status: 404 }
    );
  }

  const { data: masses, error: massesError } = await supabase
    .from("masses")
    .select(
      `
      mass_date,
      mass_time,
      mass_assignments ( ministers ( full_name ) )
      `
    )
    .eq("schedule_period_id", period.id)
    .order("mass_date", { ascending: true })
    .order("mass_time", { ascending: true });

  if (massesError || !masses) {
    return Response.json(
      { error: massesError?.message ?? "Error obteniendo las misas." },
      { status: 500 }
    );
  }

  // Separar fin de semana (izquierda) y entre semana (derecha).
  const weekendByDate = new Map<string, MassRow[]>();
  const weekdayRows: MassRow[] = [];

  for (const mass of masses as unknown as Array<{
    mass_date: string;
    mass_time: string;
    mass_assignments: Array<{ ministers: { full_name: string } | null }>;
  }>) {
    const ministers = mass.mass_assignments
      .map((a) => a.ministers?.full_name)
      .filter((n): n is string => Boolean(n));

    const row: MassRow = {
      date: mass.mass_date,
      time: mass.mass_time,
      ministers,
    };

    const dow = getDay(mass.mass_date);
    if (dow === 0 || dow === 6) {
      const list = weekendByDate.get(mass.mass_date) ?? [];
      list.push(row);
      weekendByDate.set(mass.mass_date, list);
    } else {
      weekdayRows.push(row);
    }
  }

  // ----- Construir hoja -----
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Rol", {
    pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.getColumn(1).width = 7; // FECHA
  ws.getColumn(2).width = 11; // HORA
  ws.getColumn(3).width = 28; // Ministro col 1
  ws.getColumn(4).width = 28; // Ministro col 2
  ws.getColumn(5).width = 3; // espaciador
  ws.getColumn(6).width = 6; // día (entre semana)
  ws.getColumn(7).width = 36; // ministros entre semana

  // Título
  setMerged(ws, 1, 1, 1, 7, `ROL DE MINISTROS (AS) ${MONTHS_ES[month]} ${year}`, {
    fill: C.titleBg,
    bold: true,
    color: C.white,
    size: 14,
    align: "center",
  });
  ws.getRow(1).height = 26;

  setMerged(ws, 2, 1, 2, 7, "TEMPLO PARROQUIAL", {
    fill: C.subBg,
    bold: true,
    color: C.white,
    size: 12,
    align: "center",
  });
  ws.getRow(2).height = 20;

  // Encabezados (fila 3)
  setCell(ws, 3, 1, "FECHA", { fill: C.headBg, bold: true, align: "center" });
  setCell(ws, 3, 2, "HORA", { fill: C.headBg, bold: true, align: "center" });
  setMerged(ws, 3, 3, 3, 4, "MINISTROS (AS)", {
    fill: C.headBg,
    bold: true,
    align: "center",
  });
  setMerged(ws, 3, 6, 3, 7, "ENTRE SEMANA", {
    fill: C.headBg,
    bold: true,
    align: "center",
  });

  // ----- Bloque izquierdo: fines de semana -----
  const weekendDates = Array.from(weekendByDate.keys()).sort();
  let r = 4;

  for (const date of weekendDates) {
    const dayMasses = weekendByDate.get(date)!;
    const startRow = r;

    for (const mass of dayMasses) {
      const m1 = mass.ministers[0] ?? "";
      const m2 = mass.ministers[1] ?? "";
      const m3 = mass.ministers[2] ?? "";
      const m4 = mass.ministers[3] ?? "----------";

      setCell(ws, r, 3, m1, { align: "left" });
      setCell(ws, r, 4, m2, { align: "left" });
      setCell(ws, r + 1, 3, m3, { align: "left" });
      setCell(ws, r + 1, 4, m4, {
        align: m4 === "----------" ? "center" : "left",
        color: m4 === "----------" ? C.border : C.black,
      });

      // HORA combinada en las dos filas de la misa
      setMerged(ws, r, 2, r + 1, 2, formatTime(mass.time), { align: "center" });

      r += 2;
    }

    // FECHA combinada en todas las filas del día
    setMerged(ws, startRow, 1, r - 1, 1, dayOfMonth(date), {
      fill: C.dateBg,
      bold: true,
      align: "center",
    });
  }

  // ----- Bloque derecho: entre semana -----
  let wr = 4;
  for (const mass of weekdayRows) {
    setCell(ws, wr, 6, dayOfMonth(mass.date), { bold: true, align: "center" });
    setCell(ws, wr, 7, mass.ministers.join(" - "), { align: "left" });
    wr += 1;
  }

  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `rol-ministros-${MONTHS_FILE[month]}-${year}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
