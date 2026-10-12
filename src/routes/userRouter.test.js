const { app, request, randomName, expectValidJwt, registerDiner, createAdmin } = require('../testHelper.js');

test('get the authenticated user', async () => {
  const { user, token } = await registerDiner();
  const res = await request(app).get('/api/user/me').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ id: user.id, name: user.name, email: user.email, roles: [{ role: 'diner' }] });
});

test('get the authenticated user requires auth', async () => {
  const res = await request(app).get('/api/user/me');
  expect(res.status).toBe(401);
});

test('a user can update themselves', async () => {
  const { user, token } = await registerDiner();
  const updated = { name: randomName(), email: `${randomName()}@test.com`, password: 'newpassword' };
  const res = await request(app).put(`/api/user/${user.id}`).set('Authorization', `Bearer ${token}`).send(updated);
  expect(res.status).toBe(200);
  expectValidJwt(res.body.token);
  expect(res.body.user).toMatchObject({ id: user.id, name: updated.name, email: updated.email });

  // The new credentials work for login.
  const loginRes = await request(app).put('/api/auth').send({ email: updated.email, password: updated.password });
  expect(loginRes.status).toBe(200);
});


test('an admin can update a different user', async () => {
  const { token: adminToken } = await createAdmin();
  const { user: diner } = await registerDiner();
  const newName = randomName();
  const res = await request(app).put(`/api/user/${diner.id}`).set('Authorization', `Bearer ${adminToken}`).send({ name: newName, email: diner.email });
  expect(res.status).toBe(200);
  expect(res.body.user).toMatchObject({ id: diner.id, name: newName, email: diner.email });
});

test('delete user requires auth', async () => {
  const res = await request(app).delete('/api/user/1');
  expect(res.status).toBe(401);
});

test('non-admin cannot delete users', async () => {
  const { user, token } = await registerDiner();
  const res = await request(app).delete(`/api/user/${user.id}`).set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(403);
});

test('admin can delete a user', async () => {
  const { token } = await createAdmin();
  const { user } = await registerDiner();
  const res = await request(app).delete(`/api/user/${user.id}`).set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);

  const list = await request(app).get(`/api/user?name=${user.name}`).set('Authorization', `Bearer ${token}`);
  expect(list.body.users.some((u) => u.id === user.id)).toBe(false);
});


test('list users requires auth', async () => {
  const res = await request(app).get('/api/user');
  expect(res.status).toBe(401);
});

test('non-admin cannot list users', async () => {
  const { token } = await registerDiner();
  const res = await request(app).get('/api/user').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(403);
});

test('admin can list, paginate and filter users', async () => {
  const { token } = await createAdmin();
  const { user } = await registerDiner();

  const res = await request(app).get('/api/user?page=0&limit=2').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.users.length).toBeLessThanOrEqual(2);
  expect(res.body.users[0]).toHaveProperty('email');
  expect(res.body.users[0]).not.toHaveProperty('password');
  expect(res.body.more).toBe(true);

  const filtered = await request(app).get(`/api/user?name=${user.name}`).set('Authorization', `Bearer ${token}`);
  expect(filtered.body.users.some((u) => u.id === user.id)).toBe(true);
});
