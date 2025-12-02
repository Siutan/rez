import { writable } from 'svelte/store';
import type { DraftState } from './types';

export const draftState = writable<DraftState | null>(null);


