import { createStore } from 'zustand/vanilla';
import { Kire } from 'kire';

interface KireState {
    kireInstance: Kire | null;
    setKireInstance: (instance: Kire) => void;
}

export const useKireStore = createStore<KireState>((set) => ({
    kireInstance: null,
    setKireInstance: (instance) => set({ kireInstance: instance }),
}));
