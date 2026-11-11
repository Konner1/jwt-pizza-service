const { AsyncLocalStorage } = require('node:async_hooks');
const config = require('./config.js');

const SENSITIVE_KEYS = /^(password|token|jwt|authorization|apikey|api_key|secret|jwtsecret)$/i;

class Logger {
  // Carries the authenticated user through async calls so DB logs can include it.
  context = new AsyncLocalStorage();

  // Express middleware. Install AFTER the auth middleware so req.user is populated.
  httpLogger = (req, res, next) => {
    const send = res.send;
    this.context.run({ req }, () => {
      res.send = (resBody) => {
        this.log(this.statusToLogLevel(res.statusCode), 'http', {
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          authorized: !!req.headers.authorization,
          user: this.userInfo(req.user),
          reqBody: req.body,
          resBody,
        });
        res.send = send;
        return res.send(resBody);
      };
      next();
    });
  };

  dbQuery(sql) {
    const store = this.context.getStore();
    this.log('info', 'db', { sql, user: this.userInfo(store?.req?.user) });
  }

  factoryRequest(user, reqBody, resBody, ok) {
    this.log(ok ? 'info' : 'error', 'factory', { user: this.userInfo(user), reqBody, resBody });
  }

  unhandledError(err, req) {
    this.log('error', 'exception', {
      message: err?.message,
      stack: err?.stack,
      method: req?.method,
      path: req?.originalUrl,
      user: this.userInfo(req?.user),
    });
  }

  userInfo(user) {
    return user ? { id: user.id, name: user.name } : null;
  }

  log(level, type, logData) {
    const cfg = config.logging;
    if (!cfg) return;
    const labels = { component: cfg.source, level, type };
    const values = [this.nowString(), this.sanitize(logData)];
    this.sendLogToGrafana({ streams: [{ stream: labels, values: [values] }] });
  }

  statusToLogLevel(statusCode) {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    return 'info';
  }

  nowString() {
    return (BigInt(Date.now()) * 1000000n).toString();
  }

  sanitize(logData) {
    const clean = (v, key) => {
      if (key && SENSITIVE_KEYS.test(key)) return '*****';
      if (typeof v === 'string') return this.scrubString(v);
      if (Array.isArray(v)) return v.map((x) => clean(x));
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x, k)]));
      return v;
    };
    return JSON.stringify(clean(logData));
  }

  // Handles bodies that arrive as JSON strings (res.send) and bearer tokens.
  scrubString(s) {
    return s
      .replace(/("(?:password|token|jwt|apiKey|authorization)"\s*:\s*")[^"]*"/gi, '$1*****"')
      .replace(/Bearer\s+[\w.-]+/gi, 'Bearer *****');
  }

  sendLogToGrafana(event) {
    const cfg = config.logging;
    fetch(cfg.endpointUrl, {
      method: 'post',
      body: JSON.stringify(event),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.accountId}:${cfg.apiKey}` },
    })
      .then((res) => {
        if (!res.ok) console.log('Failed to send log to Grafana');
      })
      .catch(() => console.log('Failed to send log to Grafana'));
  }
}

module.exports = new Logger();
