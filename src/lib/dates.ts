/**
 * Date helpers. All-day values are "yyyy-mm-dd"; values with a time are full ISO instants
 * (with Z) so the server, which runs in UTC, reads the same moment as the phone.
 */

const pad = (n: number) => String(n).padStart(2, '0')

export const isTimed = (v: string) => v.length > 10

/** yyyy-mm-dd of a Date in the device's time zone. */
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** Local calendar day of a stored value. */
export const dayOf = (v: string) => (isTimed(v) ? ymd(new Date(v)) : v.slice(0, 10))

/** "yyyy-mm-dd" + "HH:MM" (local) → ISO instant. */
export const combine = (date: string, time: string) => new Date(`${date}T${time}`).toISOString()

export function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00`)
  d.setDate(d.getDate() + n)
  return ymd(d)
}

export const todayYmd = () => ymd(new Date())

export function longDay(date: string) {
  const s = new Date(`${date}T12:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
