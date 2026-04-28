import { createClient } from "@/lib/supabase/server";

type MassToInsert = {
  schedule_period_id: string;
  mass_date: string;
  mass_time: string;
  mass_type: "weekday" | "saturday" | "sunday";
  required_ministers: number;
};

function formatDate(date: Date) {
  return date.toISOString().split("T")[0];
}

export async function POST(req: Request) {
  const supabase = await createClient();

  const { year, month } = await req.json();

  if (!year || !month || month < 1 || month > 12) {
    return Response.json(
      { ok: false, error: "Year and month are required" },
      { status: 400 }
    );
  }

  // 1. Crear o reutilizar el periodo del mes
  const { data: period, error: periodError } = await supabase
    .from("schedule_periods")
    .upsert(
      {
        year,
        month,
        status: "draft",
        confirmed_at: null,
      },
      {
        onConflict: "year,month",
      }
    )
    .select()
    .single();

  if (periodError || !period) {
    return Response.json(
      { ok: false, error: periodError?.message ?? "Error creating period" },
      { status: 500 }
    );
  }

  // 2. Limpiar misas anteriores de ese periodo
  const { error: deleteError } = await supabase
    .from("masses")
    .delete()
    .eq("schedule_period_id", period.id);

  if (deleteError) {
    return Response.json(
      { ok: false, error: deleteError.message },
      { status: 500 }
    );
  }

  // 3. Generar misas del mes
  const masses: MassToInsert[] = [];

  const currentDate = new Date(year, month - 1, 1);

  while (currentDate.getMonth() === month - 1) {
    const dayOfWeek = currentDate.getDay();
    const massDate = formatDate(currentDate);

    // Domingo
    if (dayOfWeek === 0) {
      masses.push(
        {
          schedule_period_id: period.id,
          mass_date: massDate,
          mass_time: "07:00",
          mass_type: "sunday",
          required_ministers: 3,
        },
        {
          schedule_period_id: period.id,
          mass_date: massDate,
          mass_time: "09:00",
          mass_type: "sunday",
          required_ministers: 3,
        },
        {
          schedule_period_id: period.id,
          mass_date: massDate,
          mass_time: "11:00",
          mass_type: "sunday",
          required_ministers: 3,
        },
        {
          schedule_period_id: period.id,
          mass_date: massDate,
          mass_time: "17:00",
          mass_type: "sunday",
          required_ministers: 3,
        }
      );
    }

    // Sábado
    else if (dayOfWeek === 6) {
      masses.push(
        {
          schedule_period_id: period.id,
          mass_date: massDate,
          mass_time: "16:00",
          mass_type: "saturday",
          required_ministers: 3,
        },
        {
          schedule_period_id: period.id,
          mass_date: massDate,
          mass_time: "18:00",
          mass_type: "saturday",
          required_ministers: 3,
        }
      );
    }

    // Lunes a viernes
    else {
      masses.push({
        schedule_period_id: period.id,
        mass_date: massDate,
        mass_time: "17:00",
        mass_type: "weekday",
        required_ministers: 2,
      });
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  // 4. Insertar misas
  const { data: insertedMasses, error: insertError } = await supabase
    .from("masses")
    .insert(masses)
    .select();

  if (insertError) {
    return Response.json(
      { ok: false, error: insertError.message },
      { status: 500 }
    );
  }

  return Response.json({
    ok: true,
    message: "Masses generated successfully",
    period,
    totalMasses: insertedMasses.length,
    masses: insertedMasses,
  });
}