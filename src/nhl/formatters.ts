export const formatSeasonId = (seasonId: number): string => {
  const start = Math.floor(seasonId / 10000);
  return `${start}-${start + 1}`;
};

export const getCurrentSeasonId = (): number => {
  const now = new Date();
  let year = now.getFullYear();
  if (now.getMonth() < 9) {
    year -= 1;
  }
  return year * 10000 + (year + 1);
};

export const formatPeriod = (period: number, gameType: number): string => {
  if (period <= 0) return 'n/a';
  if (period <= 3) {
    const suffix = period === 1 ? 'st' : period === 2 ? 'nd' : 'rd';
    return `${period}${suffix}`;
  }

  const isPlayoffs = gameType === 3;

  if (period === 4) return 'OT';
  if (period === 5 && !isPlayoffs) return 'SO';

  const overtimeNumber = period - 3;
  const suffix = overtimeNumber === 2 ? 'nd' : overtimeNumber === 3 ? 'rd' : 'th';
  return `${overtimeNumber}${suffix} OT`;
};

export const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

/** Parse "MM:SS" period time to total seconds */
export const periodTimeToSeconds = (time: string): number => {
  const [mm, ss] = time.split(':').map(Number);
  return (mm ?? 0) * 60 + (ss ?? 0);
};
