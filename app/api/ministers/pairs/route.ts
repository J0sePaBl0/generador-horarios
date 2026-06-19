import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const { data: pairs, error } = await supabase
    .from("minister_pairs")
    .select("id, minister_a_id, minister_b_id, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Adjuntar nombres de ambos ministros (embed ambiguo por doble FK → se
  // resuelve con una consulta de nombres y mezcla en JS).
  const ministerIds = Array.from(
    new Set((pairs ?? []).flatMap((p) => [p.minister_a_id, p.minister_b_id]))
  );

  const nameById = new Map<string, string>();
  if (ministerIds.length > 0) {
    const { data: ministers, error: ministersError } = await supabase
      .from("ministers")
      .select("id, full_name")
      .in("id", ministerIds);

    if (ministersError) {
      return Response.json({ error: ministersError.message }, { status: 500 });
    }
    for (const m of ministers ?? []) {
      nameById.set(m.id, m.full_name);
    }
  }

  const result = (pairs ?? []).map((p) => ({
    id: p.id,
    minister_a_id: p.minister_a_id,
    minister_b_id: p.minister_b_id,
    minister_a_name: nameById.get(p.minister_a_id) ?? "Desconocido",
    minister_b_name: nameById.get(p.minister_b_id) ?? "Desconocido",
  }));

  return Response.json({ pairs: result });
}

export async function POST(req: Request) {
  const supabase = await createClient();

  const body = await req.json();
  const minister_a_id = body.minister_a_id;
  const minister_b_id = body.minister_b_id;

  if (!minister_a_id || !minister_b_id) {
    return Response.json(
      { error: "Debe seleccionar dos ministros." },
      { status: 400 }
    );
  }
  if (minister_a_id === minister_b_id) {
    return Response.json(
      { error: "Una pareja debe tener dos ministros distintos." },
      { status: 400 }
    );
  }

  // Verificar que ambos ministros existen
  const { data: ministers, error: ministersError } = await supabase
    .from("ministers")
    .select("id")
    .in("id", [minister_a_id, minister_b_id]);

  if (ministersError) {
    return Response.json({ error: ministersError.message }, { status: 500 });
  }
  if (!ministers || ministers.length < 2) {
    return Response.json(
      { error: "Uno de los ministros no existe." },
      { status: 404 }
    );
  }

  // Un ministro no puede estar en más de una pareja activa
  const { data: existingPairs, error: existingError } = await supabase
    .from("minister_pairs")
    .select("minister_a_id, minister_b_id")
    .eq("is_active", true)
    .or(
      `minister_a_id.in.(${minister_a_id},${minister_b_id}),minister_b_id.in.(${minister_a_id},${minister_b_id})`
    );

  if (existingError) {
    return Response.json({ error: existingError.message }, { status: 500 });
  }
  if (existingPairs && existingPairs.length > 0) {
    return Response.json(
      { error: "Uno de los ministros ya pertenece a una pareja activa." },
      { status: 400 }
    );
  }

  const { data: pair, error } = await supabase
    .from("minister_pairs")
    .insert({ minister_a_id, minister_b_id, is_active: true })
    .select()
    .single();

  if (error || !pair) {
    return Response.json(
      { error: error?.message ?? "Error creando la pareja." },
      { status: 500 }
    );
  }

  return Response.json({ pair }, { status: 201 });
}
