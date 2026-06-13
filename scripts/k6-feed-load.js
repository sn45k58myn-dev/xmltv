/* global __ENV, __ITER */
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: Number(__ENV.K6_TARGET_VUS || 5) },
    { duration: __ENV.K6_HOLD || '1m', target: Number(__ENV.K6_TARGET_VUS || 5) },
    { duration: '30s', target: 0 }
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000']
  }
};

const baseUrl = __ENV.BASE_URL || 'http://localhost:3001';
const endpoints = (__ENV.K6_ENDPOINTS || [
  '/health',
  '/ready',
  '/manifest.json',
  '/api/discovery/metadata'
].join(','))
  .split(',')
  .map((endpoint) => endpoint.trim())
  .filter(Boolean);

export default function () {
  const endpoint = endpoints[__ITER % endpoints.length];
  const response = http.get(`${baseUrl}${endpoint}`, {
    headers: __ENV.K6_EXPORT_TOKEN
      ? { 'x-export-token': __ENV.K6_EXPORT_TOKEN }
      : {},
    timeout: __ENV.K6_TIMEOUT || '30s'
  });

  check(response, {
    'status is 2xx': (res) => res.status >= 200 && res.status < 300,
    'has body': (res) => res.body && res.body.length > 0
  });

  sleep(Number(__ENV.K6_SLEEP_SECONDS || 1));
}
