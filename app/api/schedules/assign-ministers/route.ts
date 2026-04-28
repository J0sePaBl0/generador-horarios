import { createClient } from "@/lib/supabase/server";

type Minister = {
  id: string;
  full_name: string;
  assignment_mode: "fixed" | "pair" | "flex";
  is_active: boolean;
};

type Mass = {
  id: string;
  mass_date: string;
  mass_time: string;
  mass_type: "weekday" | "saturday" | "sunday";
  required_ministers: number;
};

type FixedRule = {
  minister_id: string;
  day_of_week: number;
  mass_time: string;
};

type Pair = {
  minister_a_id: string;
  minister_b_id: string;
};

function getDayOfWeek(date: string) {
  return new Date(`${date}T00:00:00`).getDay();
}

function getRandomItem<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

export async function POST(req: Request) {
  const supabase = await createClient();

  const { year, month } = await req.json();

  if (!year || !month) {
    return Response.json(
      { ok: false, error: "Year and month are required" },
      { status: 400 }
    );
  }

  // 1. Buscar periodo
  const { data: period, error: periodError } = await supabase
    .from("schedule_periods")
    .select("*")
    .eq("year", year)
    .eq("month", month)
    .single();

  if (periodError || !period) {
    return Response.json(
      { ok: false, error: "Schedule period not found. Generate masses first." },
      { status: 404 }
    );
  }

  // 2. Traer misas
  const { data: masses, error: massesError } = await supabase
    .from("masses")
    .select("*")
    .eq("schedule_period_id", period.id)
    .order("mass_date", { ascending: true })
    .order("mass_time", { ascending: true });

  if (massesError || !masses) {
    return Response.json(
      { ok: false, error: "Error getting masses" },
      { status: 500 }
    );
  }

  // 3. Traer ministros activos
  const { data: ministers, error: ministersError } = await supabase
    .from("ministers")
    .select("*")
    .eq("is_active", true);

  if (ministersError || !ministers) {
    return Response.json(
      { ok: false, error: "Error getting ministers" },
      { status: 500 }
    );
  }

  // 4. Traer reglas fijas
  const { data: fixedRules, error: fixedRulesError } = await supabase
    .from("minister_fixed_rules")
    .select("*")
    .eq("is_active", true);

  if (fixedRulesError || !fixedRules) {
    return Response.json(
      { ok: false, error: "Error getting fixed rules" },
      { status: 500 }
    );
  }

  // 5. Traer parejas
  const { data: pairs, error: pairsError } = await supabase
    .from("minister_pairs")
    .select("*")
    .eq("is_active", true);

  if (pairsError || !pairs) {
    return Response.json(
      { ok: false, error: "Error getting pairs" },
      { status: 500 }
    );
  }

  // 6. Limpiar asignaciones anteriores del periodo
  const massIds = masses.map((mass) => mass.id);

  if (massIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("mass_assignments")
      .delete()
      .in("mass_id", massIds);

    if (deleteError) {
      return Response.json(
        { ok: false, error: "Error cleaning previous assignments" },
        { status: 500 }
      );
    }
  }

  const assignments: {
    mass_id: string;
    minister_id: string;
    source: "fixed" | "pair" | "generated";
  }[] = [];

  const assignmentCounter = new Map<string, number>();

  ministers.forEach((minister: Minister) => {
    assignmentCounter.set(minister.id, 0);
  });

  function addAssignment(
    massId: string,
    ministerId: string,
    source: "fixed" | "pair" | "generated"
  ) {
    const alreadyAssigned = assignments.some(
      (assignment) =>
        assignment.mass_id === massId && assignment.minister_id === ministerId
    );

    if (alreadyAssigned) return false;

    assignments.push({
      mass_id: massId,
      minister_id: ministerId,
      source,
    });

    assignmentCounter.set(
      ministerId,
      (assignmentCounter.get(ministerId) ?? 0) + 1
    );

    return true;
  }

  function getAssignmentsForMass(massId: string) {
    return assignments.filter((assignment) => assignment.mass_id === massId);
  }

  function getAvailableSlots(mass: Mass) {
    return mass.required_ministers - getAssignmentsForMass(mass.id).length;
  }

  // 7. Aplicar ministros fijos
  for (const mass of masses as Mass[]) {
    const dayOfWeek = getDayOfWeek(mass.mass_date);

    const matchingFixedRules = (fixedRules as FixedRule[]).filter(
      (rule) =>
        rule.day_of_week === dayOfWeek &&
        rule.mass_time.slice(0, 5) === mass.mass_time.slice(0, 5)
    );

    for (const rule of matchingFixedRules) {
      if (getAvailableSlots(mass) > 0) {
        addAssignment(mass.id, rule.minister_id, "fixed");
      }
    }
  }

  // 8. Aplicar parejas
  for (const mass of masses as Mass[]) {
    const availableSlots = getAvailableSlots(mass);

    if (availableSlots < 2) continue;

    const shuffledPairs = [...(pairs as Pair[])].sort(() => Math.random() - 0.5);

    for (const pair of shuffledPairs) {
      const currentSlots = getAvailableSlots(mass);

      if (currentSlots < 2) break;

      const massAssignments = getAssignmentsForMass(mass.id);
      const alreadyHasPairMember = massAssignments.some(
        (assignment) =>
          assignment.minister_id === pair.minister_a_id ||
          assignment.minister_id === pair.minister_b_id
      );

      if (alreadyHasPairMember) continue;

      addAssignment(mass.id, pair.minister_a_id, "pair");
      addAssignment(mass.id, pair.minister_b_id, "pair");

      break;
    }
  }

  // 9. Completar espacios con ministros flex
  const flexMinisters = (ministers as Minister[]).filter(
    (minister) => minister.assignment_mode === "flex"
  );

  for (const mass of masses as Mass[]) {
    while (getAvailableSlots(mass) > 0) {
      const assignedMinisterIds = getAssignmentsForMass(mass.id).map(
        (assignment) => assignment.minister_id
      );

      const candidates = flexMinisters
        .filter((minister) => !assignedMinisterIds.includes(minister.id))
        .sort(
          (a, b) =>
            (assignmentCounter.get(a.id) ?? 0) -
            (assignmentCounter.get(b.id) ?? 0)
        );

      if (candidates.length === 0) break;

      const lowestCount = assignmentCounter.get(candidates[0].id) ?? 0;

      const bestCandidates = candidates.filter(
        (minister) => (assignmentCounter.get(minister.id) ?? 0) === lowestCount
      );

      const selectedMinister = getRandomItem(bestCandidates);

      addAssignment(mass.id, selectedMinister.id, "generated");
    }
  }

  // 10. Validar misas incompletas
  const incompleteMasses = (masses as Mass[])
    .map((mass) => ({
      mass,
      assigned: getAssignmentsForMass(mass.id).length,
      required: mass.required_ministers,
    }))
    .filter((item) => item.assigned < item.required);

  if (incompleteMasses.length > 0) {
    return Response.json(
      {
        ok: false,
        error: "Some masses could not be completed",
        incompleteMasses,
      },
      { status: 400 }
    );
  }

  // 11. Guardar asignaciones
  const { error: insertError } = await supabase
    .from("mass_assignments")
    .insert(assignments);

  if (insertError) {
    return Response.json(
      { ok: false, error: insertError.message },
      { status: 500 }
    );
  }

  return Response.json({
    ok: true,
    message: "Ministers assigned successfully",
    totalMasses: masses.length,
    totalAssignments: assignments.length,
    assignments,
  });
}