export function newId(): string {
  return crypto.randomUUID();
}

export function todayIso(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Lunes de la semana de una fecha. */
export function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - dow);
  return todayIso(dt);
}

const dayFmt = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
const shortFmt = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
const dateFmt = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

function parse(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

export const formatDay = (iso: string) => capitalize(dayFmt.format(parse(iso)));
export const formatShortDay = (iso: string) => capitalize(shortFmt.format(parse(iso)));
export const formatDate = (iso: string) => dateFmt.format(parse(iso));

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
