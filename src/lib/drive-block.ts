import type { DriveFile } from './google'

/** Editor block that links a Drive file (see blocks/schema.tsx). */
export function driveBlock(file: DriveFile, accountId: string) {
  return {
    type: 'driveFile' as const,
    props: {
      accountId,
      fileId: file.id,
      name: file.name,
      mimeType: file.mimeType,
      iconLink: file.iconLink ?? '',
      webViewLink: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`,
    },
  }
}
