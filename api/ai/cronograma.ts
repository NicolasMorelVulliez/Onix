/**
 * Reads a subject's schedule (cronograma) with Claude: PDF or photo in, dated classes out.
 * POST { file: base64, mediaType, subject?, year?, semester?, driveFiles?: string[] } with the
 * user's Firebase ID token. Needs ANTHROPIC_API_KEY. The only feature of Onix that uses AI.
 */
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import * as z from 'zod/v4'
import { handle, HttpError, json, preflight, requireMember } from '../_lib.js'

const Schedule = z.object({
  subject: z.string().describe('Nombre de la materia tal como figura en el cronograma, o "" si no aparece'),
  classes: z.array(
    z.object({
      date: z.string().describe('Fecha yyyy-mm-dd'),
      from: z.string().describe('Hora de inicio HH:MM (24 h); "" si no figura'),
      to: z.string().describe('Hora de fin HH:MM (24 h); "" si no figura'),
      topic: z.string().describe('Tema o contenido de ese día, breve'),
      kind: z.enum(['clase', 'parcial', 'tp', 'recuperatorio', 'final', 'feriado']),
      prep: z.string().describe('Qué conviene ver o leer antes de ese día (1 frase), o ""'),
    }),
  ),
  notes: z.string().describe('Aclaraciones: fechas ambiguas, datos que faltan; "" si no hay'),
})

const SYSTEM = `Leés cronogramas de materias universitarias argentinas (UADE) y los convertís en una lista de fechas.
- Una entrada por día de cursada o evento: clases, parciales, entregas de TP, recuperatorios, finales y feriados o días sin clase.
- Fechas en formato yyyy-mm-dd. Si el cronograma no dice el año, usá el año indicado por el usuario. Las fechas escritas dd/mm son día/mes.
- Si figuran semanas en vez de fechas, calculá la fecha con el día de cursada y el inicio del cuatrimestre si te los dan; si no se puede, explicalo en notes.
- Horarios en 24 h. Si el cronograma no los tiene, dejalos vacíos.
- "prep": una sugerencia breve y concreta de qué repasar o leer antes de ese día, basada en el tema. Si te pasan nombres de archivos del Drive de la materia, mencioná el archivo que corresponda por su nombre exacto. Para parciales, qué unidades repasar. Vacío si no hay nada útil que decir.
- No inventes clases que no estén en el cronograma.`

const MAX_BYTES = 4 * 1024 * 1024 // Vercel limits request bodies to 4.5 MB

export async function POST(request: Request) {
  return handle(request, async () => {
    await requireMember(request)
    const body = (await request.json()) as {
      file?: string
      mediaType?: string
      subject?: string
      year?: string
      semester?: string
      driveFiles?: string[]
    }
    if (!body.file || !body.mediaType) throw new HttpError(400, 'Falta el archivo del cronograma')
    if (body.file.length * 0.75 > MAX_BYTES) throw new HttpError(413, 'El archivo es muy grande (máximo 4 MB)')

    const isPdf = body.mediaType === 'application/pdf'
    const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
    const imageType = IMAGE_TYPES.find((t) => t === body.mediaType)
    if (!isPdf && !imageType) throw new HttpError(415, 'Subí el cronograma como PDF o imagen (JPG/PNG)')

    const context = [
      body.subject && `Materia: ${body.subject}`,
      `Año: ${body.year || new Date().getFullYear()}`,
      body.semester && `Cuatrimestre: ${body.semester}`,
      body.driveFiles?.length && `Archivos en el Drive de la materia:\n${body.driveFiles.slice(0, 200).map((f) => `- ${f}`).join('\n')}`,
    ]
      .filter(Boolean)
      .join('\n')

    const client = new Anthropic()
    const response = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      // If a safety classifier declines, the API retries on a suitable model within the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(Schedule) },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            isPdf
              ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: body.file } }
              : { type: 'image', source: { type: 'base64', media_type: imageType!, data: body.file } },
            { type: 'text', text: `${context}\n\nArmá la lista de fechas de este cronograma.` },
          ],
        },
      ],
    })

    if (response.stop_reason === 'refusal') throw new HttpError(422, 'No se pudo leer este archivo. Probá con otra foto o el PDF original.')
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
      throw new HttpError(502, 'El cronograma es demasiado largo o no se pudo interpretar. Probá subiendo una parte.')
    }
    return json(request, 200, response.parsed_output)
  })
}

export const OPTIONS = preflight
