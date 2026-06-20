/**
 * A tiny client-side event channel so a "set position" action anywhere on the
 * series page can ask the SeasonSelector to select + scroll to (and highlight)
 * the next episode to watch — without prop-drilling through the action bar.
 */
export const SERIES_RESUME_EVENT = "mb:series-resume";

export interface SeriesResumeDetail {
  seriesId: number;
  seasonNumber: number;
  episodeNumber: number;
}

export function emitSeriesResume(detail: SeriesResumeDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SeriesResumeDetail>(SERIES_RESUME_EVENT, { detail }));
}
