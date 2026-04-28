import { createClient } from "@/lib/supabase/server";
import * as XLSX from "xlsx";

function getDayName(date: string) {
  const days = [
    "domingo",
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
  ];

  return days[new Date(`${date}T00:00:00`).getDay()];
}

function formatTime(time: string) {
  const [hourStr, minute] = time.split(":");
  let hour = parseInt(hourStr);

  const ampm = hour >= 12 ? "pm" : "am";

  hour = hour % 12;
  if (hour === 0) hour = 12;

  return `${hour}:${minute}${ampm}`;
}

export async function GET(req: Request) {
  const supabase = await createClient();

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));

  if (!year || !month) {
    return Response.json(
      { ok: false, error: "Year and month are required" },
      { status: 400 }
    );
  }

  const { data: period, error: periodError } = await supabase
    .from("schedule_periods")
    .select("*")
    .eq("year", year)
    .eq("month", month)
    .single();

  if (periodError || !period) {
    return Response.json(
      { ok: false, error: "Schedule period not found" },
      { status: 404 }
    );
  }

  const { data: masses, error: massesError } = await supabase
    .from("masses")
    .select(
      `
      id,
      mass_date,
      mass_time,
      mass_type,
      required_ministers,
      mass_assignments (
        ministers (
          full_name
        )
      )
    `
    )
    .eq("schedule_period_id", period.id)
    .order("mass_date", { ascending: true })
    .order("mass_time", { ascending: true });

  if (massesError || !masses) {
    return Response.json(
      { ok: false, error: massesError?.message ?? "Error getting masses" },
      { status: 500 }
    );
  }

  const rows: any[] = [];

let previousDate = "";

masses.forEach((mass: any) => {
  if (previousDate && previousDate !== mass.mass_date) {
    rows.push({});
    rows.push({});
  }

  const ministers = mass.mass_assignments.map(
    (assignment: any) => assignment.ministers.full_name
  );

  rows.push({
    ID: mass.id,
    Fecha: mass.mass_date,
    Día: getDayName(mass.mass_date),
    Hora: formatTime(mass.mass_time),
    "Ministro 1": ministers[0] ?? "",
    "Ministro 2": ministers[1] ?? "",
    "Ministro 3": ministers[2] ?? "",
  });

  previousDate = mass.mass_date;
});
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);

// Ocultar columna ID
worksheet["!cols"] = [
  { hidden: true }, // ID
  { wch: 14 },      // Fecha
  { wch: 14 },      // Día
  { wch: 10 },      // Hora
  { wch: 25 },      // Ministro 1
  { wch: 25 },      // Ministro 2
  { wch: 25 },      // Ministro 3
];

  XLSX.utils.book_append_sheet(workbook, worksheet, "Horario");

  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  });

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="horario-${month}-${year}.xlsx"`,
    },
  });
}