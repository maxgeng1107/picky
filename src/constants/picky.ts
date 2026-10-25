import type { CriterionStatus } from '@/lib/types';

export const Accent = '#FF3D71';
export const AccentSoft = 'rgba(255, 61, 113, 0.12)';

export const StatusColors: Record<CriterionStatus, string> = {
  confident: '#16A34A',
  leaning: '#D97706',
  doesnt_care: '#9CA3AF',
  avoid: '#DC2626',
  unknown: '#CBD5E1',
};

export const StatusLabels: Record<CriterionStatus, string> = {
  confident: 'Repeated support',
  leaning: 'Leaning',
  doesnt_care: 'Mixed evidence',
  avoid: 'Avoids',
  unknown: 'No evidence yet',
};

export const SupportColor = '#16A34A';
export const AgainstColor = '#DC2626';

export function formatMb(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}
