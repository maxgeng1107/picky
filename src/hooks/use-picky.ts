// The one place the UI gets Picky's state from.
// Integration (checkpoint B): point these two exports at the real implementation in src/lib.
export { PickyMockProvider as PickyProvider, usePickyMock as usePicky } from '@/mock/picky-mock';
