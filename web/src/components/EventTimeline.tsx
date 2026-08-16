import { teamAbbreviation } from '@web/teams';
import type { GameEvent, Highlight } from '@web/types';

const periodLabel = (period: number) => period <= 3 ? `P${period}` : period === 4 ? 'OT' : `${period - 3}OT`;
const eventLabel = (event: GameEvent) => event.type_desc.replaceAll('-', ' ').replaceAll('_', ' ').toLowerCase();

function eventDetails(event: GameEvent): string[] {
  const details: string[] = [];
  if (event.owner_team_id) details.push(teamAbbreviation(event.owner_team_id));
  if (event.shot_type) details.push(event.shot_type.replaceAll('-', ' ').toLowerCase());
  if (event.xg !== null) details.push(`xG ${event.xg.toFixed(3)}`);
  if (event.situation_code && event.situation_code !== '1551') details.push(event.situation_code);
  return details;
}

type Props = { events: GameEvent[]; highlights: Highlight[] };

export function EventTimeline({ events, highlights }: Props) {
  const highlightsByEvent = new Map(highlights.map((highlight) => [highlight.event_id, highlight]));
  let previousPeriod = 0;

  return (
    <div className="timeline">
      {events.map((event) => {
        const startsPeriod = event.period !== previousPeriod;
        previousPeriod = event.period;
        const highlight = highlightsByEvent.get(event.event_id);
        const scorer = highlight ? [highlight.first_name, highlight.last_name].filter(Boolean).join(' ') : '';
        return (
          <div key={event.id}>
            {startsPeriod && <h3 className="period-heading">{periodLabel(event.period)}</h3>}
            <article className={highlight ? 'event highlight-event' : 'event'}>
              <div className="event-marker" aria-hidden="true" />
              <div className="event-body">
                <div className="event-heading">
                  <time>{event.time_in_period}</time>
                  <strong>{eventLabel(event)}</strong>
                  {eventDetails(event).map((detail) => <span key={detail}>{detail}</span>)}
                </div>
                {highlight && (
                  <section className="clip">
                    <div className="clip-heading">
                      <strong>{scorer || 'Goal highlight'}</strong>
                      <span>{teamAbbreviation(highlight.team_id)}</span>
                    </div>
                    {highlight.stream_url ? (
                      <video controls playsInline preload="metadata" src={highlight.stream_url}>
                        Your browser does not support HTML video.
                      </video>
                    ) : <p className="clip-unavailable">Video is not available.</p>}
                    {highlight.transcript && (
                      <div className="transcript">
                        <span>Transcript</span>
                        <p>{highlight.transcript}</p>
                      </div>
                    )}
                  </section>
                )}
              </div>
            </article>
          </div>
        );
      })}
    </div>
  );
}
