const { app, request, DB, randomName, registerDiner, createAdmin, createFranchise } = require('../testHelper.js');

let admin;
let franchisee;
let outsider;

beforeAll(async () => {
  admin = await createAdmin();
  franchisee = await registerDiner();
  outsider = await registerDiner();
});

afterEach(() => {
  jest.restoreAllMocks();
});

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

describe('create franchise', () => {
  test('an admin can create a franchise', async () => {
    const name = `franchise-${randomName()}`;
    const res = await request(app).post('/api/franchise').set(auth(admin.token)).send({ name, admins: [{ email: franchisee.user.email }] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name, id: expect.any(Number), admins: [{ email: franchisee.user.email, id: franchisee.user.id, name: franchisee.user.name }] });
  });

  test('a diner cannot create a franchise', async () => {
    const res = await request(app).post('/api/franchise').set(auth(outsider.token)).send({ name: randomName(), admins: [] });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('unable to create a franchise');
  });

  test('the franchise admin must be an existing user', async () => {
    const res = await request(app).post('/api/franchise').set(auth(admin.token)).send({ name: randomName(), admins: [{ email: 'ghost@nowhere.com' }] });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('unknown user for franchise admin ghost@nowhere.com provided');
  });
});

describe('list franchises', () => {
  let prefix;
  beforeAll(async () => {
    prefix = randomName();
    for (const suffix of ['a', 'b']) {
      await request(app).post('/api/franchise').set(auth(admin.token)).send({ name: `${prefix}-${suffix}`, admins: [{ email: franchisee.user.email }] });
    }
  });

  test('an admin also sees franchise admins', async () => {
    const res = await request(app).get(`/api/franchise?name=${prefix}*`).set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.franchises[0].admins).toEqual([expect.objectContaining({ email: franchisee.user.email })]);
  });

  test('results are paged', async () => {
    const res = await request(app).get(`/api/franchise?page=0&limit=1&name=${prefix}*`);
    expect(res.status).toBe(200);
    expect(res.body.franchises).toHaveLength(1);
    expect(res.body.more).toBe(true);
  });

  test('listing with no query uses the defaults', async () => {
    const res = await request(app).get('/api/franchise');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.franchises)).toBe(true);
  });
});

describe('user franchises', () => {

  test('a user with no franchises gets an empty list', async () => {
    const res = await request(app).get(`/api/franchise/${outsider.user.id}`).set(auth(outsider.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test("a diner cannot see someone else's franchises", async () => {
    const res = await request(app).get(`/api/franchise/${franchisee.user.id}`).set(auth(outsider.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test("an admin can see anyone's franchises", async () => {
    const res = await request(app).get(`/api/franchise/${franchisee.user.id}`).set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('requires auth', async () => {
    const res = await request(app).get(`/api/franchise/${franchisee.user.id}`);
    expect(res.status).toBe(401);
  });
});

describe('stores', () => {
  let franchise;
  beforeAll(async () => {
    franchise = await createFranchise(admin.token, franchisee.user.email);
  });

  test('an admin can create a store', async () => {
    const res = await request(app).post(`/api/franchise/${franchise.id}/store`).set(auth(admin.token)).send({ name: 'Provo' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: expect.any(Number), franchiseId: franchise.id, name: 'Provo' });
  });

  test('the franchisee can create and delete a store', async () => {
    const createRes = await request(app).post(`/api/franchise/${franchise.id}/store`).set(auth(franchisee.token)).send({ name: 'Orem' });
    expect(createRes.status).toBe(200);

    const deleteRes = await request(app).delete(`/api/franchise/${franchise.id}/store/${createRes.body.id}`).set(auth(franchisee.token));
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.message).toBe('store deleted');

    const franchiseRes = await request(app).get(`/api/franchise/${franchisee.user.id}`).set(auth(franchisee.token));
    const stores = franchiseRes.body.find((f) => f.id === franchise.id).stores;
    expect(stores.map((s) => s.name)).not.toContain('Orem');
  });

  test('an outsider cannot create a store', async () => {
    const res = await request(app).post(`/api/franchise/${franchise.id}/store`).set(auth(outsider.token)).send({ name: 'Nope' });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('unable to create a store');
  });

  test('an outsider cannot delete a store', async () => {
    const createRes = await request(app).post(`/api/franchise/${franchise.id}/store`).set(auth(admin.token)).send({ name: 'Lehi' });
    const res = await request(app).delete(`/api/franchise/${franchise.id}/store/${createRes.body.id}`).set(auth(outsider.token));
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('unable to delete a store');
  });
});


