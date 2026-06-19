import { createClient } from "@/lib/supabase/server";

// Horas de misa válidas según el día:
// - Domingo (0): 07:00, 09:00, 11:00, 17:00
// - Sábado (6): 16:00, 18:00
// - Lunes a viernes (1-5): 17:00
function timesForDay(day: number) {
  if (day === 0) return ["07:00", "09:00", "11:00", "17:00"];
  if (day === 6) return ["16:00", "18:00"];
  return ["17:00"];
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const { data: rules, error } = await supabase
    .from("minister_fixed_rules")
    .select("*")
    .eq("minister_id", id)
    .eq("is_active", true)
    .order("day_of_week", { ascending: true })
    .order("mass_time", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ rules: rules ?? [] });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const body = await req.json();
  const day_of_week = Number(body.day_of_week);
  const mass_time =
    typeof body.mass_time === "string" ? body.mass_time.slice(0, 5) : "";

  if (!Number.isInteger(day_of_week) || day_of_week < 0 || day_of_week > 6) {
    return Response.json(
      { error: "El día de la semana debe estar entre 0 y 6." },
      { status: 400 }
    );
  }

  if (!timesForDay(day_of_week).includes(mass_time)) {
    return Response.json(
      { error: "La hora no es válida para el día seleccionado." },
      { status: 400 }
    );
  }

  // Frecuencia (ordinales de semana): vacío = todas las semanas.
  const VALID_ORDINALS = [-2, -1, 1, 2, 3, 4, 5];
  const rawOrdinals = Array.isArray(body.week_ordinals)
    ? body.week_ordinals.map(Number)
    : [];
  const week_ordinals =
    rawOrdinals.length > 0
      ? Array.from(new Set<number>(rawOrdinals))
      : null;

  if (week_ordinals && week_ordinals.some((o) => !VALID_ORDINALS.includes(o))) {
    return Response.json(
      { error: "La frecuencia no es válida." },
      { status: 400 }
    );
  }

  // Verificar que el ministro existe
  const { data: minister, error: ministerError } = await supabase
    .from("ministers")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (ministerError) {
    return Response.json({ error: ministerError.message }, { status: 500 });
  }
  if (!minister) {
    return Response.json(
      { error: "Ministro no encontrado." },
      { status: 404 }
    );
  }

  // Evitar regla duplicada (mismo minister_id + day_of_week + mass_time activa)
  const { data: existing, error: existingError } = await supabase
    .from("minister_fixed_rules")
    .select("id")
    .eq("minister_id", id)
    .eq("day_of_week", day_of_week)
    .eq("mass_time", mass_time)
    .eq("is_active", true)
    .maybeSingle();

  if (existingError) {
    return Response.json({ error: existingError.message }, { status: 500 });
  }
  if (existing) {
    return Response.json(
      { error: "Esta regla fija ya existe para el ministro." },
      { status: 400 }
    );
  }

  const { data: rule, error } = await supabase
    .from("minister_fixed_rules")
    .insert({ minister_id: id, day_of_week, mass_time, week_ordinals, is_active: true })
    .select()
    .single();

  if (error || !rule) {
    return Response.json(
      { error: error?.message ?? "Error creando la regla fija." },
      { status: 500 }
    );
  }

  return Response.json({ rule }, { status: 201 });
}
