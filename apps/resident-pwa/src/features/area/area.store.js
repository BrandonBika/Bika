import { createStore } from '@civicneuro/state';

export const areaStore = createStore({
  status: 'idle',
  trending: null,
  pulse: null,
  windowDays: 7,
  radiusM: 5000,
  homeAreaSet: null,
  isLoading: false,
  error: null
});

export function getAreaCardPresentation(state, card) {
  if (state.status === 'no_area') {
    return {
      copy: 'Set your home area to see local trends',
      meta: 'Tap to set home area',
      destination: 'your-area'
    };
  }

  if (state.status === 'error') {
    return {
      copy: 'Local insights are unavailable',
      meta: 'Tap to try again',
      destination: card === 'trending' ? 'trending-issues' : 'community-pulse'
    };
  }

  if (state.status === 'loading' || state.status === 'idle') {
    return {
      copy: 'Loading local reports…',
      meta: '',
      destination: card === 'trending' ? 'trending-issues' : 'community-pulse'
    };
  }

  if (card === 'trending' && state.trending) {
    return {
      copy: `${state.trending.category} - #1 reported this week`,
      meta: `${state.trending.count} reports this week`,
      destination: 'trending-issues'
    };
  }

  if (card === 'pulse' && state.pulse) {
    return {
      copy: `${state.pulse.resolved_pct}% of reports in your area were resolved this month`,
      meta: `Based on ${state.pulse.total} reports`,
      destination: 'community-pulse'
    };
  }

  return {
    copy: 'Not enough reports nearby yet',
    meta: '',
    destination: card === 'trending' ? 'trending-issues' : 'community-pulse'
  };
}
