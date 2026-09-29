/**
 * Understands a dictated task: "comprar yerba mañana a las 10" →
 * { title: "Comprar yerba", date: tomorrow, time: "10:00" }. Spanish, in the user's time zone.
 */
import { localParts } from './notify.js'

export interface QuickTask {
  title: string
  date?: string // yyyy-mm-dd
  time?: string // HH:MM
}

const DAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const pad = (n: number) => String(n).padStart(2, '0')

export function parseQuickTask(input: string, now: Date, timeZone: string): QuickTask {
  const today = localParts(now, timeZone)
  let text = ` ${input.trim()} `
  let date: string | undefined
  let time: string | undefined
  // Work on an accent-free copy and cut the same range from the original.
  // `fn` returns false to reject a match and keep looking.
  const cut = (re: RegExp, fn: (m: RegExpExecArray) => boolean | void) => {
    const g = new RegExp(re.source, 'g')
    for (const m of strip(text).matchAll(g)) {
      if (fn(m as RegExpExecArray) === false) continue
      text = text.slice(0, m.index) + ' ' + text.slice(m.index! + m[0].length)
      return
    }
  }

  cut(/\s(para\s)?pasado\s+manana\b/, () => void (date = addDays(today.date, 2)))
  if (!date) cut(/\s(para\s)?manana\b/, () => void (date = addDays(today.date, 1)))
  if (!date) cut(/\s(para\s)?hoy\b/, () => void (date = today.date))
  if (!date)
    cut(/\s(el\s|este\s|para\s(el\s)?)?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)(\s+que\s+viene)?\b/, (m) => {
      const target = DAYS.indexOf(m[3])
      const diff = (target - today.weekday + 7) % 7 || 7
      date = addDays(today.date, diff)
    })
  if (!date)
    cut(/\s(el\s|para\s(el\s)?)?(\d{1,2})\/(\d{1,2})(\/(\d{2,4}))?\b/, (m) => {
      const [y] = today.date.split('-').map(Number)
      let year = m[6] ? Number(m[6].length === 2 ? `20${m[6]}` : m[6]) : y
      let candidate = `${year}-${pad(Number(m[4]))}-${pad(Number(m[3]))}`
      if (!m[6] && candidate < today.date) candidate = `${++year}-${pad(Number(m[4]))}-${pad(Number(m[3]))}`
      date = candidate
    })

  // "a las 10", "a las 18:30", "10hs", "15:45", "9 pm" (a bare number isn't a time)
  cut(/\s(a\s+las?\s+)?(\d{1,2})(:(\d{2}))?\s*(hs|h|am|pm)?(?=\s|$)/, (m) => {
    if (!m[1] && !m[3] && !m[5]) return false
    let h = Number(m[2])
    if (m[5] === 'pm' && h < 12) h += 12
    if (m[5] === 'am' && h === 12) h = 0
    if (h > 23 || Number(m[4] ?? 0) > 59) return false
    time = `${pad(h)}:${m[4] ?? '00'}`
  })

  // A time without a day: today if it's still ahead, else tomorrow.
  if (time && !date) date = time > today.time ? today.date : addDays(today.date, 1)

  const title = text.replace(/\s+/g, ' ').trim().replace(/\s+(el|a|para)$/i, '')
  return { title: title.charAt(0).toUpperCase() + title.slice(1) || 'Nueva tarea', date, time }
}
