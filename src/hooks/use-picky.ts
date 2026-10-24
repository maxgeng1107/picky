// The one place the UI gets Picky's state from.
// Real data on the phone; the mock on web (no photo library there) or with EXPO_PUBLIC_USE_MOCK=1.
import { Platform } from 'react-native';

import * as real from '@/lib/use-picky';
import * as mock from '@/mock/picky-mock';

const useMock = Platform.OS === 'web' || process.env.EXPO_PUBLIC_USE_MOCK === '1';

export const PickyProvider = useMock ? mock.PickyMockProvider : real.PickyProvider;
export const usePicky = useMock ? mock.usePickyMock : real.usePicky;
