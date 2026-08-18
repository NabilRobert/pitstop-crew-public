import type { ForcedState } from '../../shared/api/types'

// Matches demo_state_overrides' CHECK constraint in schema.sql.
export const STATES: ForcedState[] = ['good', 'bad', 'standstill', 'volatile']
