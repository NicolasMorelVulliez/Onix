import { supabase } from './supabase'
import { uid } from './util'

const TEN_YEARS = 60 * 60 * 24 * 365 * 10

/** Uploads a file (image, PDF, video…) and returns a URL usable inside a page. */
export async function uploadFile(file: File): Promise<string> {
  if (!supabase) {
    // Local-only mode: keep the file inline.
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result as string)
      r.onerror = () => reject(r.error)
      r.readAsDataURL(file)
    })
  }
  const { data: auth } = await supabase.auth.getUser()
  const ext = file.name.split('.').pop()
  const path = `${auth.user!.id}/${uid()}${ext ? `.${ext}` : ''}`
  const { error } = await supabase.storage.from('files').upload(path, file, { contentType: file.type })
  if (error) throw error
  const { data, error: signError } = await supabase.storage.from('files').createSignedUrl(path, TEN_YEARS)
  if (signError) throw signError
  return data.signedUrl
}
