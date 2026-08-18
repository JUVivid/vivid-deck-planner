import { useApp } from '../model/store'
import { computeProject, type ProjectComputed } from '../engine'

/** Recomputes only when the project object changes (WeakMap-memoized). */
export function useComputed(): ProjectComputed {
  const project = useApp((s) => s.project)
  return computeProject(project)
}
