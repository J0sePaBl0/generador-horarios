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
  is_active: boolean;
  week_ordinals: number[] | null;
};

type Pair = {
  minister_a_id: string;
  minister_b_id: string;
  is_active: boolean;
};

type Unavailability = {
  minister_id: string;
  unavailable_date: string;
  reason: string | null;
};

type Conflict = {
  type: "fixed" | "pair";
  minister_id: string;
  minister_name: string;
  date: string;
  mass_time: string;
  reason: string;
};

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

function getDayOfWeek(date: string) {
  return new Date(`${date}T00:00:00`).getDay();
}

// Ordinal de la ocurrencia de ese día de la semana dentro de su mes:
// pos = 1..5 desde el inicio; neg = -1 (último), -2 (penúltimo), ...
function weekdayOrdinals(date: string) {
  const d = new Date(`${date}T00:00:00`);
  const dayNum = d.getDate();
  const pos = Math.floor((dayNum - 1) / 7) + 1;
  const daysInMonth = new Date(
    d.getFullYear(),
    d.getMonth() + 1,
    0
  ).getDate();
  let lastSame = dayNum;
  while (lastSame + 7 <= daysInMonth) lastSame += 7;
  const neg = -((lastSame - dayNum) / 7 + 1);
  return { pos, neg };
}

function getRandomItem<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

export async function POST(req: Request) {
  const supabase = await createClient();

  const { year, month } = await req.json();

  if (!year || !month || month < 1 || month > 12) {
    return Response.json(
      { error: "El año y el mes son obligatorios." },
      { status: 400 }
    );
  }

  // 1. Revisar si ya existe un periodo para este año + mes
  const { data: existingPeriod, error: existingError } = await supabase
    .from("schedule_periods")
    .select("id, status")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (existingError) {
    return Response.json({ error: existingError.message }, { status: 500 });
  }

  if (existingPeriod) {
    if (existingPeriod.status === "confirmed") {
      return Response.json(
        { error: "Ya existe un horario confirmado para este mes." },
        { status: 409 }
      );
    }

    // Estado 'draft': borrar el periodo existente (cascada elimina misas y
    // asignaciones relacionadas) para empezar de cero.
    const { error: deleteExistingError } = await supabase
      .from("schedule_periods")
      .delete()
      .eq("id", existingPeriod.id);

    if (deleteExistingError) {
      return Response.json(
        { error: deleteExistingError.message },
        { status: 500 }
      );
    }
  }

  // 2. Crear el nuevo periodo en estado 'draft'
  const { data: period, error: periodError } = await supabase
    .from("schedule_periods")
    .insert({ year, month, status: "draft", confirmed_at: null })
    .select()
    .single();

  if (periodError || !period) {
    return Response.json(
      { error: periodError?.message ?? "Error creando el periodo." },
      { status: 500 }
    );
  }

  // A partir de aquí, cualquier fallo debe revertir el periodo creado.
  // Borrar el periodo elimina en cascada sus misas y asignaciones.
  async function rollback() {
    await supabase.from("schedule_periods").delete().eq("id", period.id);
  }

  // 3. Generar misas del mes
  const massesToInsert: MassToInsert[] = [];
  const currentDate = new Date(year, month - 1, 1);

  while (currentDate.getMonth() === month - 1) {
    const dayOfWeek = currentDate.getDay();
    const massDate = formatDate(currentDate);

    if (dayOfWeek === 0) {
      // Domingo
      for (const time of ["07:00", "09:00", "11:00", "17:00"]) {
        massesToInsert.push({
          schedule_period_id: period.id,
          mass_date: massDate,
          mass_time: time,
          mass_type: "sunday",
          required_ministers: 3,
        });
      }
    } else if (dayOfWeek === 6) {
      // Sábado
      for (const time of ["16:00", "18:00"]) {
        massesToInsert.push({
          schedule_period_id: period.id,
          mass_date: massDate,
          mass_time: time,
          mass_type: "saturday",
          required_ministers: 3,
        });
      }
    } else {
      // Lunes a viernes
      massesToInsert.push({
        schedule_period_id: period.id,
        mass_date: massDate,
        mass_time: "17:00",
        mass_type: "weekday",
        required_ministers: 2,
      });
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  const { data: masses, error: insertMassesError } = await supabase
    .from("masses")
    .insert(massesToInsert)
    .select();

  if (insertMassesError || !masses) {
    await rollback();
    return Response.json(
      { error: insertMassesError?.message ?? "Error generando las misas." },
      { status: 500 }
    );
  }

  // 4. Traer datos necesarios para la asignación
  const { data: ministers, error: ministersError } = await supabase
    .from("ministers")
    .select("*")
    .eq("is_active", true);

  if (ministersError || !ministers) {
    await rollback();
    return Response.json(
      { error: "Error obteniendo los ministros." },
      { status: 500 }
    );
  }

  const { data: fixedRules, error: fixedRulesError } = await supabase
    .from("minister_fixed_rules")
    .select("*")
    .eq("is_active", true);

  if (fixedRulesError || !fixedRules) {
    await rollback();
    return Response.json(
      { error: "Error obteniendo las reglas fijas." },
      { status: 500 }
    );
  }

  const { data: pairs, error: pairsError } = await supabase
    .from("minister_pairs")
    .select("*")
    .eq("is_active", true);

  if (pairsError || !pairs) {
    await rollback();
    return Response.json(
      { error: "Error obteniendo las parejas." },
      { status: 500 }
    );
  }

  const { data: unavailability, error: unavailabilityError } = await supabase
    .from("minister_unavailability")
    .select("*");

  if (unavailabilityError || !unavailability) {
    await rollback();
    return Response.json(
      { error: "Error obteniendo la no disponibilidad." },
      { status: 500 }
    );
  }

  // Lookup O(1) de no disponibilidad: "minister_id|YYYY-MM-DD"
  const unavailableSet = new Set<string>();
  for (const entry of unavailability as Unavailability[]) {
    const date = String(entry.unavailable_date).slice(0, 10);
    unavailableSet.add(`${entry.minister_id}|${date}`);
  }

  const ministerNameById = new Map<string, string>();
  for (const minister of ministers as Minister[]) {
    ministerNameById.set(minister.id, minister.full_name);
  }

  function isUnavailable(ministerId: string, date: string) {
    return unavailableSet.has(`${ministerId}|${date.slice(0, 10)}`);
  }

  // ----- Fin de semana libre por ministro -----
  // Cada ministro libra un fin de semana completo (sábado + domingo) al mes.
  // La elección es automática, balanceada y rota cada mes. Aplica también a
  // reglas fijas y parejas (no se considera un conflicto).
  function isoLocalDate(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // Clave del fin de semana de una fecha (la fecha del sábado). Sábado → su
  // propia fecha; domingo → el sábado anterior; entre semana → "".
  function weekendKeyOf(date: string) {
    const d = new Date(`${date.slice(0, 10)}T00:00:00`);
    const dow = d.getDay();
    if (dow === 6) return date.slice(0, 10);
    if (dow === 0) {
      const sat = new Date(d);
      sat.setDate(d.getDate() - 1);
      return isoLocalDate(sat);
    }
    return "";
  }

  // Fines de semana presentes en el mes, ordenados.
  const weekendKeys = Array.from(
    new Set(
      (masses as Mass[])
        .map((m) => weekendKeyOf(m.mass_date))
        .filter((k) => k !== "")
    )
  ).sort();

  // Parejas libran el mismo fin de semana (siempre sirven juntas).
  const partnerOf = new Map<string, string>();
  for (const pair of pairs as Pair[]) {
    partnerOf.set(pair.minister_a_id, pair.minister_b_id);
    partnerOf.set(pair.minister_b_id, pair.minister_a_id);
  }

  // Asignar a cada ministro (o pareja) un fin de semana libre, repartiendo de
  // forma balanceada y rotando según el mes para que no siempre sea el mismo.
  const freeWeekendByMinister = new Map<string, string>();
  if (weekendKeys.length > 0) {
    const sortedMinisters = [...(ministers as Minister[])].sort((a, b) =>
      a.id.localeCompare(b.id)
    );
    const monthOffset = year * 12 + (month - 1);
    let unitIndex = 0;
    for (const minister of sortedMinisters) {
      if (freeWeekendByMinister.has(minister.id)) continue;
      const key =
        weekendKeys[(unitIndex + monthOffset) % weekendKeys.length];
      freeWeekendByMinister.set(minister.id, key);
      const partner = partnerOf.get(minister.id);
      if (partner) freeWeekendByMinister.set(partner, key);
      unitIndex += 1;
    }
  }

  function isFreeWeekend(ministerId: string, date: string) {
    const key = weekendKeyOf(date);
    if (!key) return false;
    return freeWeekendByMinister.get(ministerId) === key;
  }

  // 5. Estructuras de asignación en memoria
  const assignments: {
    mass_id: string;
    minister_id: string;
    source: "fixed" | "pair" | "generated";
  }[] = [];
  const conflicts: Conflict[] = [];

  const assignmentCounter = new Map<string, number>();
  for (const minister of ministers as Minister[]) {
    assignmentCounter.set(minister.id, 0);
  }

  function addAssignment(
    massId: string,
    ministerId: string,
    source: "fixed" | "pair" | "generated"
  ) {
    const alreadyAssigned = assignments.some(
      (a) => a.mass_id === massId && a.minister_id === ministerId
    );
    if (alreadyAssigned) return false;

    assignments.push({ mass_id: massId, minister_id: ministerId, source });
    assignmentCounter.set(
      ministerId,
      (assignmentCounter.get(ministerId) ?? 0) + 1
    );
    return true;
  }

  function getAssignmentsForMass(massId: string) {
    return assignments.filter((a) => a.mass_id === massId);
  }

  function getAvailableSlots(mass: Mass) {
    return mass.required_ministers - getAssignmentsForMass(mass.id).length;
  }

  // 6a. Ministros fijos (saltar y registrar conflicto si no disponible)
  for (const mass of masses as Mass[]) {
    const dayOfWeek = getDayOfWeek(mass.mass_date);
    const ord = weekdayOrdinals(mass.mass_date);

    const matchingFixedRules = (fixedRules as FixedRule[]).filter((rule) => {
      if (rule.day_of_week !== dayOfWeek) return false;
      if (rule.mass_time.slice(0, 5) !== mass.mass_time.slice(0, 5))
        return false;

      // Sin ordinales = todas las semanas; si hay, debe coincidir la posición
      // desde el inicio o desde el final del mes.
      const w = rule.week_ordinals;
      if (!w || w.length === 0) return true;
      return w.includes(ord.pos) || w.includes(ord.neg);
    });

    for (const rule of matchingFixedRules) {
      if (getAvailableSlots(mass) <= 0) break;

      if (isUnavailable(rule.minister_id, mass.mass_date)) {
        conflicts.push({
          type: "fixed",
          minister_id: rule.minister_id,
          minister_name:
            ministerNameById.get(rule.minister_id) ?? "Desconocido",
          date: mass.mass_date,
          mass_time: mass.mass_time,
          reason: "Ministro fijo no disponible en esta fecha.",
        });
        continue;
      }

      // Fin de semana libre: se omite sin registrar conflicto (es esperado).
      if (isFreeWeekend(rule.minister_id, mass.mass_date)) continue;

      addAssignment(mass.id, rule.minister_id, "fixed");
    }
  }

  // 6b. Relleno balanceado con parejas y ministros flex.
  // Cada "unidad" rota con la misma prioridad (menos asignaciones = mayor
  // prioridad): una pareja ocupa 2 cupos y sirve junta; un flex ocupa 1. Así la
  // pareja participa de la rotación como cualquier otro, en lugar de asignarse
  // a todas las misas.
  type FillUnit = {
    id: string;
    memberIds: string[];
    size: number;
    source: "pair" | "generated";
  };

  const fillUnits: FillUnit[] = [];
  for (const pair of pairs as Pair[]) {
    fillUnits.push({
      id: `pair:${pair.minister_a_id}:${pair.minister_b_id}`,
      memberIds: [pair.minister_a_id, pair.minister_b_id],
      size: 2,
      source: "pair",
    });
  }
  for (const minister of ministers as Minister[]) {
    if (minister.assignment_mode === "flex") {
      fillUnits.push({
        id: `flex:${minister.id}`,
        memberIds: [minister.id],
        size: 1,
        source: "generated",
      });
    }
  }

  const unitCounter = new Map<string, number>();
  for (const unit of fillUnits) unitCounter.set(unit.id, 0);

  for (const mass of masses as Mass[]) {
    while (getAvailableSlots(mass) > 0) {
      const remaining = getAvailableSlots(mass);
      const assignedIds = new Set(
        getAssignmentsForMass(mass.id).map((a) => a.minister_id)
      );

      // Unidades que caben y cuyos integrantes están libres (no asignados ya a
      // esta misa, disponibles y sin fin de semana libre).
      const eligible = fillUnits.filter((unit) => {
        if (unit.size > remaining) return false;
        return unit.memberIds.every(
          (id) =>
            !assignedIds.has(id) &&
            !isUnavailable(id, mass.mass_date) &&
            !isFreeWeekend(id, mass.mass_date)
        );
      });

      if (eligible.length === 0) break;

      const lowestCount = Math.min(
        ...eligible.map((unit) => unitCounter.get(unit.id) ?? 0)
      );
      const bestUnits = eligible.filter(
        (unit) => (unitCounter.get(unit.id) ?? 0) === lowestCount
      );

      const chosen = getRandomItem(bestUnits);
      for (const id of chosen.memberIds) {
        addAssignment(mass.id, id, chosen.source);
      }
      unitCounter.set(chosen.id, lowestCount + 1);
    }
  }

  // 7. Guardar asignaciones (no bloquear por misas incompletas)
  if (assignments.length > 0) {
    const { error: insertAssignmentsError } = await supabase
      .from("mass_assignments")
      .insert(assignments);

    if (insertAssignmentsError) {
      await rollback();
      return Response.json(
        { error: insertAssignmentsError.message },
        { status: 500 }
      );
    }
  }

  // Misas que quedaron incompletas (informativo, no bloquea)
  const incompleteMasses = (masses as Mass[])
    .map((mass) => ({
      mass_date: mass.mass_date,
      mass_time: mass.mass_time,
      assigned: getAssignmentsForMass(mass.id).length,
      required: mass.required_ministers,
    }))
    .filter((item) => item.assigned < item.required);

  return Response.json({
    ok: true,
    periodId: period.id,
    totalMasses: masses.length,
    totalAssignments: assignments.length,
    conflicts,
    incompleteMasses,
  });
}
