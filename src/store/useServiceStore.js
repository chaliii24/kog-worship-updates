import { create } from 'zustand';

// SERVICE STORE
//
// The service plan list, the plan currently open, and which saved service it
// came from. Item mutations still run through App's existing functions, which
// write through these setters — one source of truth, without moving the
// database layer or the ordering UI into the store.

export const blankServicePlan = () => ({
  id: null,
  name: 'Sunday Service',
  date: new Date().toISOString().slice(0, 10),
  items: [],
});

const resolve = (value, prev) => (typeof value === 'function' ? value(prev) : value);

export const useServiceStore = create((set) => ({
  services: [],
  activeService: blankServicePlan(),
  selectedServiceId: '',

  setServices: (value) => set((state) => ({
    services: resolve(value, state.services) || [],
  })),

  setActiveService: (value) => set((state) => ({
    activeService: resolve(value, state.activeService) || blankServicePlan(),
  })),

  setSelectedServiceId: (value) => set((state) => ({
    selectedServiceId: resolve(value, state.selectedServiceId) || '',
  })),

  resetActiveService: () => set({
    activeService: blankServicePlan(),
    selectedServiceId: '',
  }),
}));
