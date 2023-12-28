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

export const humanizeDateFull = (inputDate: string | number, locale = 'en') => {
    const now = new Date();
    const date = new Date(inputDate);
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

    const diffInSeconds = (date.getTime() - now.getTime()) / 1000;
    const diffInMinutes = diffInSeconds / 60;
    const diffInHours = diffInMinutes / 60;
    const diffInDays = diffInHours / 24;
    const diffInMonths = diffInDays / 30;

    if (Math.abs(diffInMonths) > 1) {
        return date.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
    } else if (Math.abs(diffInDays) > 1) {
        return formatter.format(Math.round(diffInDays), 'day');
    } else if (Math.abs(diffInHours) > 1) {
        return formatter.format(Math.round(diffInHours), 'hour');
    } else if (Math.abs(diffInMinutes) > 1) {
        return formatter.format(Math.round(diffInMinutes), 'minute');
    } else {
        return formatter.format(Math.round(diffInSeconds), 'second');
    }
}
