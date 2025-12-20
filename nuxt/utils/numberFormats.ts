export const formatNumber = (num: number) => {
    if (num >= 1e9) {
        return (num / 1e9).toFixed(0) + 'B';
    } else if (num >= 1e6) {
        return (num / 1e6).toFixed(0) + 'M';
    } else if (num >= 1e3) {
        return (num / 1e3).toFixed(0) + 'K';
    } else {
        return num.toString();
    }
}
