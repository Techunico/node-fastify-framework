import client from 'prom-client'

export const register = new client.Registry()

// collect default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register })

// HTTP request counter
export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
})

// Request duration
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.3, 0.5, 1, 2, 5],
})

register.registerMetric(httpRequestsTotal)
register.registerMetric(httpRequestDuration)