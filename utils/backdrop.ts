export const getEnglishBackdrop = (item: any) => {
    return item?.images?.backdrops?.find(({ iso_639_1 }: any) => iso_639_1 === 'en')?.file_path;
}
