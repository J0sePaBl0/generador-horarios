import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const supabase = await createClient();
  const { id, entryId } = await params;

  const { data: entry, error } = await supabase
    .from("minister_unavailability")
    .delete()
    .eq("id", entryId)
    .eq("minister_id", id)
    .select()
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!entry) {
    return Response.json(
      { error: "Fecha de no disponibilidad no encontrada." },
      { status: 404 }
    );
  }

  return Response.json({ ok: true });
}
