import { useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { inkRoute, type OpenTarget } from '../../lib/ink/store'

/** Opens a notebook (local id) or a Drive file in the pencil editor. */
export function useOpenInk() {
  const navigate = useNavigate()
  return useCallback(
    async (target: OpenTarget) => {
      const { docId, search } = await inkRoute(target)
      navigate({ to: '/ink/$docId', params: { docId }, search })
    },
    [navigate],
  )
}
