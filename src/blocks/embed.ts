/** Converts a share link into something that can be shown inside an iframe. */
export function toEmbedUrl(raw: string): { src: string; ratio: string } {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { src: raw, ratio: '16 / 9' }
  }
  const host = url.hostname.replace(/^www\./, '')

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id = url.searchParams.get('v') ?? url.pathname.split('/').at(-1)
    return { src: `https://www.youtube.com/embed/${id}`, ratio: '16 / 9' }
  }
  if (host === 'youtu.be') return { src: `https://www.youtube.com/embed${url.pathname}`, ratio: '16 / 9' }
  if (host === 'vimeo.com') return { src: `https://player.vimeo.com/video${url.pathname}`, ratio: '16 / 9' }
  if (host === 'loom.com') return { src: raw.replace('/share/', '/embed/'), ratio: '16 / 9' }
  if (host === 'figma.com') {
    return { src: `https://www.figma.com/embed?embed_host=espacio&url=${encodeURIComponent(raw)}`, ratio: '4 / 3' }
  }
  if (host === 'drive.google.com') {
    // /file/d/<id>/view -> /file/d/<id>/preview
    return { src: raw.replace(/\/(view|edit)(\?.*)?$/, '/preview'), ratio: '4 / 3' }
  }
  if (host === 'docs.google.com') {
    return { src: raw.replace(/\/(edit|view)(\?.*|#.*)?$/, '/preview'), ratio: '4 / 3' }
  }
  if (url.pathname.toLowerCase().endsWith('.pdf')) return { src: raw, ratio: '3 / 4' }
  return { src: raw, ratio: '16 / 9' }
}
