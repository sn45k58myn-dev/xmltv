const SAFE_ROUTE_ID = /^[A-Za-z0-9_.-]+$/;
const COUNTRY_CODE = /^[A-Za-z]{2,3}$/;

export function safeRouteId(value: string) {
  if (!SAFE_ROUTE_ID.test(value)) {
    throw new Error('Invalid route id.');
  }

  return value;
}

export function normalizeCountryParam(value: string) {
  if (!COUNTRY_CODE.test(value)) {
    throw new Error('Invalid country code.');
  }

  return value.toLowerCase() === 'uk'
    ? 'GB'
    : value.toUpperCase();
}
