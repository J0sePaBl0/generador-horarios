import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const { data: entries, error } = await supabase
    .from("minister_unavailability")
    .select("*")
    .eq("minister_id", id)
    .order("unavailable_date", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ entries: entries ?? [] });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const body = await req.json();
  const unavailable_date =
    typeof body.unavailable_date === "string"
      ? body.unavailable_date.slice(0, 10)
      : "";
  const reason =
    typeof body.reason === "string" ? body.reason.trim() || null : null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(unavailable_date)) {
    return Response.json(
      { error: "La fecha no es válida." },
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

  // Evitar fecha duplicada para el mismo ministro
  const { data: existing, error: existingError } = await supabase
    .from("minister_unavailability")
    .select("id")
    .eq("minister_id", id)
    .eq("unavailable_date", unavailable_date)
    .maybeSingle();

  if (existingError) {
    return Response.json({ error: existingError.message }, { status: 500 });
  }
  if (existing) {
    return Response.json(
      { error: "Esta fecha ya está registrada para el ministro." },
      { status: 400 }
    );
  }

  const { data: entry, error } = await supabase
    .from("minister_unavailability")
    .insert({ minister_id: id, unavailable_date, reason })
    .select()
    .single();

  if (error || !entry) {
    return Response.json(
      { error: error?.message ?? "Error agregando la fecha." },
      { status: 500 }
    );
  }

  return Response.json({ entry }, { status: 201 });
}
