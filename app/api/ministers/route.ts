import { createClient } from "@/lib/supabase/server";

const VALID_MODES = ["fixed", "pair", "flex"] as const;

export async function GET() {
  const supabase = await createClient();

  // Ministros con sus reglas fijas embebidas (FK única, seguro)
  const { data: ministers, error } = await supabase
    .from("ministers")
    .select(`*, fixed_rules:minister_fixed_rules(*)`)
    .order("full_name", { ascending: true });

  if (error || !ministers) {
    return Response.json(
      { error: error?.message ?? "Error obteniendo los ministros." },
      { status: 500 }
    );
  }

  // Parejas activas: se traen por separado y se adjunta el id de pareja a
  // cada ministro involucrado (minister_pairs tiene dos FKs a ministers, lo
  // que hace ambiguo el embed; por eso se mezcla en JS).
  const { data: pairs, error: pairsError } = await supabase
    .from("minister_pairs")
    .select("id, minister_a_id, minister_b_id")
    .eq("is_active", true);

  if (pairsError) {
    return Response.json({ error: pairsError.message }, { status: 500 });
  }

  const pairByMinister = new Map<string, { id: string; partner_id: string }>();
  for (const pair of pairs ?? []) {
    pairByMinister.set(pair.minister_a_id, {
      id: pair.id,
      partner_id: pair.minister_b_id,
    });
    pairByMinister.set(pair.minister_b_id, {
      id: pair.id,
      partner_id: pair.minister_a_id,
    });
  }

  const ministersWithPairs = ministers.map((minister) => ({
    ...minister,
    pair: pairByMinister.get(minister.id) ?? null,
  }));

  return Response.json({ ministers: ministersWithPairs });
}

export async function POST(req: Request) {
  const supabase = await createClient();

  const body = await req.json();
  const full_name = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : null;
  const assignment_mode = body.assignment_mode;

  if (!full_name) {
    return Response.json(
      { error: "El nombre es obligatorio." },
      { status: 400 }
    );
  }

  if (!VALID_MODES.includes(assignment_mode)) {
    return Response.json(
      { error: "El modo de asignación no es válido." },
      { status: 400 }
    );
  }

  // Nombre único
  const { data: existing, error: existingError } = await supabase
    .from("ministers")
    .select("id")
    .eq("full_name", full_name)
    .maybeSingle();

  if (existingError) {
    return Response.json({ error: existingError.message }, { status: 500 });
  }

  if (existing) {
    return Response.json(
      { error: "Ya existe un ministro con ese nombre." },
      { status: 400 }
    );
  }

  const { data: minister, error } = await supabase
    .from("ministers")
    .insert({ full_name, phone, assignment_mode, is_active: true })
    .select()
    .single();

  if (error || !minister) {
    return Response.json(
      { error: error?.message ?? "Error creando el ministro." },
      { status: 500 }
    );
  }

  return Response.json({ minister }, { status: 201 });
}
