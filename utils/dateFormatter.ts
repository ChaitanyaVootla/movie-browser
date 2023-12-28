export const humanizeDate = (inputDate: string | number, locale = 'en') => {
    const now = new Date();
    const date = new Date(inputDate);
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

    const diffInSeconds = (date.getTime() - now.getTime()) / 1000;
    const diffInDays = Math.round(diffInSeconds / (60 * 60 * 24));
    const diffInMonths = diffInDays / 30;

    if (Math.abs(diffInMonths) > 1) {
        return date.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
    } else {
        // Even if it's less than a day, round it to 1 day
        return formatter.format(diffInDays === 0 ? 1 : diffInDays, 'day');
    }
}
