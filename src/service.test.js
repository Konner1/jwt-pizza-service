const { app, request } = require('./testHelper.js');
const version = require('./version.json');

test('root returns welcome message and version', async () => {
  const res = await request(app).get('/');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ message: 'welcome to JWT Pizza', version: version.version });
});

test('docs list every endpoint and the config', async () => {
  const res = await request(app).get('/api/docs');
  expect(res.status).toBe(200);
  expect(res.body.version).toBe(version.version);
  expect(res.body.endpoints.length).toBeGreaterThan(10);
  expect(res.body.config).toEqual({ factory: expect.any(String), db: expect.any(String) });
});

test('unknown endpoint returns 404', async () => {
  const res = await request(app).get('/api/does-not-exist');
  expect(res.status).toBe(404);
  expect(res.body.message).toBe('unknown endpoint');
});

test('CORS headers are set on responses', async () => {
  const res = await request(app).get('/').set('Origin', 'https://pizza.example.com');
  expect(res.headers['access-control-allow-origin']).toBe('https://pizza.example.com');
  expect(res.headers['access-control-allow-methods']).toBe('GET, POST, PUT, DELETE');
  expect(res.headers['access-control-allow-credentials']).toBe('true');
});

test('errors thrown in a route go through the default error handler', async () => {
  const res = await request(app).put('/api/auth').send({ email: 'nobody@nowhere.com', password: 'nope' });
  expect(res.status).toBe(404);
  expect(res.body.message).toBe('unknown user');
  expect(res.body.stack).toBeDefined();
});
