const MAX_SIDE = 1600
const MAX_BYTES = 600 * 1024

/**
 * Images uploaded in the editor are stored inside the page (Firestore's free plan has no
 * file storage), shrunk to 1600px so a page stays under Firestore's 1 MB document limit.
 * Anything else belongs in Drive: link it with "/Archivo de Drive".
 */
export async function uploadFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Subí el archivo a Google Drive y vinculalo con /drive')
  }
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const url = canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.82)
  if (url.length > MAX_BYTES) return canvas.toDataURL('image/jpeg', 0.7)
  return url
}
