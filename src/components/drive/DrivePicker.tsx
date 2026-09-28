import { create } from 'zustand'
import type { DriveFile } from '../../lib/google'
import { Dialog } from '../calendar/Dialog'
import { DriveBrowser } from './DriveBrowser'

type OnPick = (file: DriveFile, accountId: string) => void

/** Global Drive picker so the editor's slash menu can open it. */
export const useDrivePicker = create<{ onPick: OnPick | null; open: (onPick: OnPick) => void; close: () => void }>((set) => ({
  onPick: null,
  open: (onPick) => set({ onPick }),
  close: () => set({ onPick: null }),
}))

export function DrivePicker() {
  const { onPick, close } = useDrivePicker()
  if (!onPick) return null
  return (
    <Dialog title="Elegí un archivo de Drive" onClose={close}>
      <DriveBrowser
        onSelect={(file, accountId) => {
          close()
          onPick(file, accountId)
        }}
      />
    </Dialog>
  )
}
