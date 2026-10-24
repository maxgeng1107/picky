// Select once at bundle time; restart Expo after changing this flag.
import * as current from './use-picky-current';
import * as experimental from './experimental/use-picky';

const usePersonalRanker = process.env.EXPO_PUBLIC_PERSONAL_RANKER === '1';
export const PickyProvider = usePersonalRanker ? experimental.PickyProvider : current.PickyProvider;
export const usePicky = usePersonalRanker ? experimental.usePicky : current.usePicky;
