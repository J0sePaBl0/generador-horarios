import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  const supabase = await createClient();
  const { id, ruleId } = await params;

  const { data: rule, error } = await supabase
    .from("minister_fixed_rules")
    .delete()
    .eq("id", ruleId)
    .eq("minister_id", id)
    .select()
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!rule) {
    return Response.json(
      { error: "Regla fija no encontrada." },
      { status: 404 }
    );
  }

  return Response.json({ ok: true });
}
