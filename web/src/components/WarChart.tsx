import type { PlayerRating } from '@web/types';

const components: Array<{ key: keyof PlayerRating; label: string }> = [
  { key: 'ev_offense_war', label: 'EV offense' },
  { key: 'ev_defense_war', label: 'EV defense' },
  { key: 'pp_war', label: 'Power play' },
  { key: 'pk_war', label: 'Penalty kill' },
];

const valueLabel = (value: number | null) => value === null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;

export function WarChart({ rating }: { rating: PlayerRating }) {
  const values = components.map(({ key }) => rating[key]).filter((value): value is number => typeof value === 'number');
  const extent = Math.max(1, ...values.map(Math.abs));

  return (
    <div className="war-chart" aria-label={`WAR components for ${rating.season}`}>
      {components.map(({ key, label }) => {
        const value = rating[key] as number | null;
        const width = value === null ? 0 : Math.min(Math.abs(value) / extent * 50, 50);
        return (
          <div className="war-component" key={key}>
            <span>{label}</span>
            <div className="war-track" aria-hidden="true">
              {value !== null && <i className={value < 0 ? 'negative' : 'positive'} style={{ width: `${width}%` }} />}
            </div>
            <strong>{valueLabel(value)}</strong>
          </div>
        );
      })}
    </div>
  );
}
