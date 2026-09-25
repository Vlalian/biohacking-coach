/** The mutable fields of a session the Head Coach may set. */
export type PrescriptionInput = {
  date: string;
  type: string;
  duration?: number | null;
  zone?: string | null;
  title?: string | null;
  note?: string | null;
  isTraining?: boolean;
};

/**
 * The columns a Head Coach's add or edit writes: the optional fields
 * normalised, the type trimmed, and training by default.
 *
 * Pure and client-safe on purpose (showable-version/44). The server writes
 * these columns, and the calendar shows the same edit before the server
 * answers, so both read this one rule rather than two copies of it.
 */
export function prescriptionColumns(input: PrescriptionInput) {
  return {
    date: input.date,
    type: input.type.trim(),
    duration: input.duration ?? null,
    zone: input.zone ?? null,
    title: input.title ?? null,
    note: input.note ?? null,
    isTraining: input.isTraining ?? true,
  };
}
