const { app, request, DB, randomName, expectValidJwt, registerDiner } = require('../testHelper.js');

test('register creates a diner and returns a token', async () => {
  const newUser = { name: randomName(), email: `${randomName()}@test.com`, password: 'a' };
  const res = await request(app).post('/api/auth').send(newUser);
  expect(res.status).toBe(200);
  expectValidJwt(res.body.token);
  expect(res.body.user).toMatchObject({ name: newUser.name, email: newUser.email, roles: [{ role: 'diner' }] });
  expect(res.body.user.password).toBeUndefined();
});

test('register requires name, email, and password', async () => {
  const res = await request(app).post('/api/auth').send({ email: 'missing@test.com' });
  expect(res.status).toBe(400);
  expect(res.body.message).toBe('name, email, and password are required');
});

test('login returns the user and a token', async () => {
  const { user } = await registerDiner();
  const res = await request(app).put('/api/auth').send({ email: user.email, password: user.password });
  expect(res.status).toBe(200);
  expectValidJwt(res.body.token);
  expect(res.body.user).toMatchObject({ id: user.id, name: user.name, email: user.email, roles: [{ role: 'diner' }] });
  expect(res.body.user.password).toBeUndefined();
});

test('login with the wrong password fails', async () => {
  const { user } = await registerDiner();
  const res = await request(app).put('/api/auth').send({ email: user.email, password: 'wrong' });
  expect(res.status).toBe(404);
  expect(res.body.message).toBe('unknown user');
});

test('logout invalidates the token', async () => {
  const { token } = await registerDiner();
  const logoutRes = await request(app).delete('/api/auth').set('Authorization', `Bearer ${token}`);
  expect(logoutRes.status).toBe(200);
  expect(logoutRes.body.message).toBe('logout successful');

  const meRes = await request(app).get('/api/user/me').set('Authorization', `Bearer ${token}`);
  expect(meRes.status).toBe(401);
});

test('logout without a token is unauthorized', async () => {
  const res = await request(app).delete('/api/auth');
  expect(res.status).toBe(401);
  expect(res.body.message).toBe('unauthorized');
});

test('a failure while checking the token leaves the request unauthenticated', async () => {
  const { token } = await registerDiner();
  const spy = jest.spyOn(DB, 'isLoggedIn').mockRejectedValueOnce(new Error('db down'));
  const res = await request(app).get('/api/user/me').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(401);
  spy.mockRestore();
});
