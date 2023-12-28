export const mapWatchListSeries = (series: any[]) => {
    series = series.map((item: any) => {
        const { next_episode_to_air, last_episode_to_air } = item;
        const dateToSort = new Date(next_episode_to_air?.air_date || last_episode_to_air?.air_date || 0).getTime();
        let infoText = `${humanizeDate(next_episode_to_air?.air_date || last_episode_to_air?.air_date || 0)}`;
        if (next_episode_to_air?.air_date) {
            infoText += ` - S${next_episode_to_air?.season_number} E${next_episode_to_air?.episode_number}`;
        }
        return {
            ...item,
            dateToSort,
            infoText
        }
    });
    series = series.sort((a: any, b: any) => b.dateToSort - a.dateToSort);
    const currentRunningSeries = [] as any[];
    const returingSeries = [] as any[];
    const completedSeries = [] as any[];
    series.forEach((item: any) => {
        if ((item.status === 'Canceled') || (item.status === 'Ended')) {
            completedSeries.push(item);
        } else {
            if (item.next_episode_to_air) {
                currentRunningSeries.push(item);
            } else {
                returingSeries.push(item);
            }
        }
    });
    return {
        currentRunningSeries: currentRunningSeries.sort((a: any, b: any) => a.dateToSort - b.dateToSort),
        returingSeries,
        completedSeries
    }
}