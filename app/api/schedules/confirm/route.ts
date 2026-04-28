import { createClient } from "@/lib/supabase/server";
import * as XLSX from "xlsx";

function parseExcelTime(timeValue: unknown) {
  if (typeof timeValue === "number") {
    const totalMinutes = Math.round(timeValue * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
  }

  const raw = String(timeValue ?? "").trim().toLowerCase().replace(/\s/g, "");

  const match = raw.match(/^(\d{1,2}):(\d{2})(am|pm)$/);

  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2];
  const period = match[3];

  if (period === "pm" && hour !== 12) hour += 12;
  if (period === "am" && hour === 12) hour = 0;

  return `${String(hour).padStart(2, "0")}:${minute}:00`;
}

function parseExcelDate(value: unknown) {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;

    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(
      parsed.d
    ).padStart(2, "0")}`;
  }

  const raw = String(value ?? "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  return null;
}

export async function POST(req: Request) {
  const supabase = await createClient();

  const formData = await req.formData();

  const file = formData.get("file");
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));

  if (!(file instanceof File) || !year || !month) {
    return Response.json(
      { ok: false, error: "File, year and month are required" },
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
      { ok: false, error: "No existe un horario generado para ese mes" },
      { status: 404 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  const validRows = rows.filter((row) => row.Fecha && row.Hora);

  if (validRows.length === 0) {
    return Response.json(
      { ok: false, error: "El archivo no contiene filas válidas" },
      { status: 400 }
    );
  }

  for (const row of validRows) {
    const massDate = parseExcelDate(row.Fecha);
    const massTime = parseExcelTime(row.Hora);

    if (!massDate || !massTime) {
      return Response.json(
        {
          ok: false,
          error: `Fecha u hora inválida en una fila: ${JSON.stringify(row)}`,
        },
        { status: 400 }
      );
    }

    const ministerNames = [
      String(row["Ministro 1"] ?? "").trim(),
      String(row["Ministro 2"] ?? "").trim(),
      String(row["Ministro 3"] ?? "").trim(),
    ].filter(Boolean);

    if (ministerNames.length === 0) {
      return Response.json(
        {
          ok: false,
          error: `La misa del ${massDate} a las ${massTime} no tiene ministros`,
        },
        { status: 400 }
      );
    }

    const uniqueMinisterNames = new Set(ministerNames);

    if (uniqueMinisterNames.size !== ministerNames.length) {
      return Response.json(
        {
          ok: false,
          error: `Hay ministros repetidos en la misa del ${massDate} a las ${massTime}`,
        },
        { status: 400 }
      );
    }

    const { data: mass, error: massError } = await supabase
      .from("masses")
      .select("*")
      .eq("schedule_period_id", period.id)
      .eq("mass_date", massDate)
      .eq("mass_time", massTime)
      .single();

    if (massError || !mass) {
      return Response.json(
        {
          ok: false,
          error: `No se encontró la misa del ${massDate} a las ${massTime}`,
        },
        { status: 400 }
      );
    }

    if (ministerNames.length !== mass.required_ministers) {
      return Response.json(
        {
          ok: false,
          error: `La misa del ${massDate} a las ${massTime} requiere ${mass.required_ministers} ministros`,
        },
        { status: 400 }
      );
    }

    const { data: ministers, error: ministersError } = await supabase
      .from("ministers")
      .select("id, full_name")
      .in("full_name", ministerNames)
      .eq("is_active", true);

    if (ministersError || !ministers) {
      return Response.json(
        { ok: false, error: "Error buscando ministros" },
        { status: 500 }
      );
    }

    if (ministers.length !== ministerNames.length) {
      const foundNames = ministers.map((minister) => minister.full_name);
      const missing = ministerNames.filter((name) => !foundNames.includes(name));

      return Response.json(
        {
          ok: false,
          error: `Estos ministros no existen o están inactivos: ${missing.join(
            ", "
          )}`,
        },
        { status: 400 }
      );
    }

    await supabase.from("mass_assignments").delete().eq("mass_id", mass.id);

    const newAssignments = ministers.map((minister) => ({
      mass_id: mass.id,
      minister_id: minister.id,
      source: "imported",
    }));

    const { error: insertError } = await supabase
      .from("mass_assignments")
      .insert(newAssignments);

    if (insertError) {
      return Response.json(
        { ok: false, error: insertError.message },
        { status: 500 }
      );
    }
  }

  const { error: confirmError } = await supabase
    .from("schedule_periods")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", period.id);

  if (confirmError) {
    return Response.json(
      { ok: false, error: confirmError.message },
      { status: 500 }
    );
  }

  return Response.json({
    ok: true,
    message: "Horario confirmado correctamente",
    importedRows: validRows.length,
  });
}