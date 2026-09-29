const { app, request, randomName, registerDiner, createAdmin, createFranchise } = require('../testHelper.js');

let adminToken;
let dinerToken;
let menuItem;
let franchise;
let store;

beforeAll(async () => {
  ({ token: adminToken } = await createAdmin());
  const diner = await registerDiner();
  dinerToken = diner.token;

  const addRes = await request(app)
    .put('/api/order/menu')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: `pizza-${randomName()}`, description: 'test pie', image: 'pizza1.png', price: 0.0042 });
  menuItem = addRes.body.find((m) => m.description === 'test pie');

  franchise = await createFranchise(adminToken, diner.user.email);
  const storeRes = await request(app).post(`/api/franchise/${franchise.id}/store`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'SLC' });
  store = storeRes.body;
});

afterEach(() => {
  jest.restoreAllMocks();
});

function orderRequest() {
  return { franchiseId: franchise.id, storeId: store.id, items: [{ menuId: menuItem.id, description: menuItem.title, price: menuItem.price }] };
}

test('get the menu without auth', async () => {
  const res = await request(app).get('/api/order/menu');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: menuItem.id, price: 0.0042 })]));
});

test('an admin can add a menu item', async () => {
  expect(menuItem).toBeDefined();
  expect(menuItem.image).toBe('pizza1.png');
});

test('a diner cannot add a menu item', async () => {
  const res = await request(app).put('/api/order/menu').set('Authorization', `Bearer ${dinerToken}`).send({ title: 'nope', description: 'nope', image: 'x.png', price: 1 });
  expect(res.status).toBe(403);
  expect(res.body.message).toBe('unable to add menu item');
});

test('create an order that the factory fulfills', async () => {
  const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ reportUrl: 'https://report', jwt: 'factory.jwt.value' }) });
  const res = await request(app).post('/api/order').set('Authorization', `Bearer ${dinerToken}`).send(orderRequest());
  expect(res.status).toBe(200);
  expect(res.body.order).toMatchObject({ franchiseId: franchise.id, storeId: store.id, id: expect.any(Number) });
  expect(res.body.jwt).toBe('factory.jwt.value');
  expect(res.body.followLinkToEndChaos).toBe('https://report');

  // The service forwards the order to the factory with the API key.
  const [url, options] = fetchSpy.mock.calls[0];
  expect(url).toMatch(/\/api\/order$/);
  expect(options.headers.authorization).toMatch(/^Bearer /);
});

test('create an order that the factory rejects', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, json: async () => ({ reportUrl: 'https://report' }) });
  const res = await request(app).post('/api/order').set('Authorization', `Bearer ${dinerToken}`).send(orderRequest());
  expect(res.status).toBe(500);
  expect(res.body).toEqual({ message: 'Failed to fulfill order at factory', followLinkToEndChaos: 'https://report' });
});

test('ordering an unknown menu item fails', async () => {
  const badOrder = { ...orderRequest(), items: [{ menuId: 99999999, description: 'ghost', price: 1 }] };
  const res = await request(app).post('/api/order').set('Authorization', `Bearer ${dinerToken}`).send(badOrder);
  expect(res.status).toBe(500);
  expect(res.body.message).toBe('No ID found');
});

test('creating an order requires auth', async () => {
  const res = await request(app).post('/api/order').send(orderRequest());
  expect(res.status).toBe(401);
});

