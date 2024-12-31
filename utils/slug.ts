export const getUrlSlug = (item: string) => {
    if (!item) {
        return "movie";
    }
    return item.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9 ]/g, "").replace(/ +/g, "-") || "movie";
}
