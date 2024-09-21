export default defineEventHandler(async (event) => {
    return {
        countryCode: getHeader(event, 'X-Country-Code') || 'IN',
        countryName: getHeader(event, 'X-Country-Name'),
        cityName: getHeader(event, 'X-City-Name'),
        stateName: getHeader(event, 'X-State-Name'),
        timezone: getHeader(event, 'X-Timezone'),
    }
});
