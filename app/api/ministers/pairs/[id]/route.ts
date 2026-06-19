import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  // Desactivar la pareja (soft delete)
  const { data: pair, error } = await supabase
    .from("minister_pairs")
    .update({ is_active: false })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!pair) {
    return Response.json({ error: "Pareja no encontrada." }, { status: 404 });
  }

  return Response.json({ ok: true });
}
