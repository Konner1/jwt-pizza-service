// Grafana Cloud metrics for the JWT Pizza Service.
// All observability code lives here so the application code stays almost untouched.
const os = require('os');
const config = require('./config.js');

const REPORT_PERIOD_MS = 10000;
const ACTIVE_USER_WINDOW_MS = 5 * 60 * 1000;

class Metrics {
  constructor() {
    // counters (cumulative)
    this.requests = { GET: 0, PUT: 0, POST: 0, DELETE: 0 };
    this.authSuccess = 0;
    this.authFailure = 0;
    this.pizzasSold = 0;
    this.pizzaFailures = 0;
    this.revenue = 0;

    // latency accumulators (reset every report => average latency for the period)
    this.resetLatency();
    this.lastEndpointLatency = 0;
    this.lastPizzaLatency = 0;

    // userId -> last seen timestamp
    this.activeUsers = new Map();

    this.timer = null;
    this.startPeriodicReporting(REPORT_PERIOD_MS);
  }

  resetLatency() {
    this.endpointLatencySum = 0;
    this.endpointLatencyCount = 0;
    this.pizzaLatencySum = 0;
    this.pizzaLatencyCount = 0;
  }

  // Express middleware: app.use(metrics.requestTracker)
  requestTracker = (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      if (this.requests[req.method] !== undefined) this.requests[req.method]++;
      this.endpointLatencySum += ms;
      this.endpointLatencyCount++;

      // active users: anybody who made an authenticated request recently
      if (req.user && req.user.id !== undefined) this.activeUsers.set(req.user.id, Date.now());

      // authentication attempts: login (PUT) and register (POST) on /api/auth
      const url = req.originalUrl.split('?')[0].replace(/\/$/, '');
      if (url === '/api/auth' && (req.method === 'PUT' || req.method === 'POST')) {
        if (res.statusCode < 400) this.authSuccess++;
        else this.authFailure++;
      }
      // logout removes the user from the active set
      if (url === '/api/auth' && req.method === 'DELETE' && req.user) this.activeUsers.delete(req.user.id);
    });
    next();
  };

  // Call after the pizza factory responds. items = array of order items ({price})
  pizzaPurchase(success, latencyMs, items = []) {
    this.pizzaLatencySum += latencyMs;
    this.pizzaLatencyCount++;
    if (success) {
      this.pizzasSold += items.length;
      this.revenue += items.reduce((sum, i) => sum + (Number(i.price) || 0), 0);
    } else {
      this.pizzaFailures++;
    }
  }

  // ---- system ----
  cpuPercent() {
    return Number(((os.loadavg()[0] / os.cpus().length) * 100).toFixed(2));
  }
  memoryPercent() {
    const total = os.totalmem();
    return Number((((total - os.freemem()) / total) * 100).toFixed(2));
  }
  activeUserCount() {
    const cutoff = Date.now() - ACTIVE_USER_WINDOW_MS;
    for (const [id, seen] of this.activeUsers) if (seen < cutoff) this.activeUsers.delete(id);
    return this.activeUsers.size;
  }

  // ---- OTLP building ----
  buildPayload() {
    const now = String(Date.now() * 1e6);
    const source = config.metrics.source;
    const attrs = (extra = {}) =>
      Object.entries({ source, ...extra }).map(([key, v]) => ({ key, value: { stringValue: String(v) } }));
    const point = (value, extra) => ({ asDouble: value, timeUnixNano: now, attributes: attrs(extra) });
    const gauge = (name, value, extra) => ({ name, unit: '', gauge: { dataPoints: [point(value, extra)] } });
    const sum = (name, points) => ({
      name,
      unit: '',
      sum: { dataPoints: points, aggregationTemporality: 2, isMonotonic: true }, // 2 = cumulative
    });

    if (this.endpointLatencyCount) this.lastEndpointLatency = this.endpointLatencySum / this.endpointLatencyCount;
    if (this.pizzaLatencyCount) this.lastPizzaLatency = this.pizzaLatencySum / this.pizzaLatencyCount;
    const endpointLatency = this.endpointLatencyCount ? this.lastEndpointLatency : 0;
    const pizzaLatency = this.pizzaLatencyCount ? this.lastPizzaLatency : 0;
    this.resetLatency();

    const total = Object.values(this.requests).reduce((a, b) => a + b, 0);
    const metrics = [
      sum('http_requests_total', [
        point(total, { method: 'ALL' }),
        ...Object.entries(this.requests).map(([method, n]) => point(n, { method })),
      ]),
      gauge('active_users', this.activeUserCount()),
      sum('auth_attempts_total', [
        point(this.authSuccess, { result: 'success' }),
        point(this.authFailure, { result: 'failure' }),
      ]),
      gauge('cpu_usage_percent', this.cpuPercent()),
      gauge('memory_usage_percent', this.memoryPercent()),
      sum('pizzas_sold_total', [point(this.pizzasSold)]),
      sum('pizza_creation_failures_total', [point(this.pizzaFailures)]),
      sum('pizza_revenue_total', [point(this.revenue)]),
      gauge('endpoint_latency_ms', endpointLatency),
      gauge('pizza_creation_latency_ms', pizzaLatency),
    ];

    return {
      resourceMetrics: [
        {
          resource: { attributes: attrs({ 'service.name': source }) },
          scopeMetrics: [{ scope: { name: 'jwt-pizza-service' }, metrics }],
        },
      ],
    };
  }

  async sendToGrafana() {
    const cfg = config.metrics;
    if (!cfg || !cfg.endpointUrl || !cfg.apiKey) return; // not configured (e.g. tests)
    const body = JSON.stringify(this.buildPayload());
    try {
      const res = await fetch(cfg.endpointUrl, {
        method: 'POST',
        body,
        headers: {
          Authorization: 'Basic ' + Buffer.from(cfg.accountId + ':' + cfg.apiKey).toString('base64'),
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) console.error('Failed to push metrics:', res.status, await res.text());
    } catch (error) {
      console.error('Error pushing metrics:', error.message);
    }
  }

  startPeriodicReporting(period) {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.sendToGrafana(), period);
    this.timer.unref(); // never keep the process (or jest) alive
  }
}

module.exports = new Metrics();
