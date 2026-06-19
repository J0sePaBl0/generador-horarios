import { createClient } from "@/lib/supabase/server";

const VALID_MODES = ["fixed", "pair", "flex"] as const;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.full_name !== undefined) {
    const full_name =
      typeof body.full_name === "string" ? body.full_name.trim() : "";
    if (!full_name) {
      return Response.json(
        { error: "El nombre es obligatorio." },
        { status: 400 }
      );
    }

    // Nombre único (excluyendo al propio ministro)
    const { data: existing, error: existingError } = await supabase
      .from("ministers")
      .select("id")
      .eq("full_name", full_name)
      .neq("id", id)
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

    updates.full_name = full_name;
  }

  if (body.phone !== undefined) {
    updates.phone =
      typeof body.phone === "string" ? body.phone.trim() || null : null;
  }

  if (body.assignment_mode !== undefined) {
    if (!VALID_MODES.includes(body.assignment_mode)) {
      return Response.json(
        { error: "El modo de asignación no es válido." },
        { status: 400 }
      );
    }
    updates.assignment_mode = body.assignment_mode;
  }

  if (body.is_active !== undefined) {
    updates.is_active = Boolean(body.is_active);
  }

  if (Object.keys(updates).length === 0) {
    return Response.json(
      { error: "No hay cambios para guardar." },
      { status: 400 }
    );
  }

  const { data: minister, error } = await supabase
    .from("ministers")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!minister) {
    return Response.json(
      { error: "Ministro no encontrado." },
      { status: 404 }
    );
  }

  return Response.json({ minister });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  // Soft delete
  const { data: minister, error } = await supabase
    .from("ministers")
    .update({ is_active: false })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!minister) {
    return Response.json(
      { error: "Ministro no encontrado." },
      { status: 404 }
    );
  }

  return Response.json({ ok: true });
}
