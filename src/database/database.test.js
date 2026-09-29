const { DB, Role } = require('./database.js');
const { randomName } = require('../testHelper.js');
const { StatusCodeError } = require('../endpointHelper.js');

test('getOffset converts a page number to a row offset', () => {
  expect(DB.getOffset(1, 10)).toBe(0);
  expect(DB.getOffset(3, 10)).toBe(20);
  expect(DB.getOffset(undefined, 10)).toBe(0);
});

test('getTokenSignature returns the signature part of a JWT', () => {
  expect(DB.getTokenSignature('header.payload.signature')).toBe('signature');
  expect(DB.getTokenSignature('not-a-jwt')).toBe('');
});

test('addUser can create a franchisee tied to an existing franchise', async () => {
  const admin = await DB.addUser({ name: randomName(), email: `${randomName()}@admin.com`, password: 'x', roles: [{ role: Role.Admin }] });
  const franchise = await DB.createFranchise({ name: `franchise-${randomName()}`, admins: [{ email: admin.email }] });

  const email = `${randomName()}@franchisee.com`;
  await DB.addUser({ name: randomName(), email, password: 'pw', roles: [{ role: Role.Franchisee, object: franchise.name }] });

  const user = await DB.getUser(email, 'pw');
  expect(user.roles).toEqual([{ role: Role.Franchisee, objectId: franchise.id }]);
});

test('getUser rejects an unknown email', async () => {
  await expect(DB.getUser(`${randomName()}@nobody.com`, 'pw')).rejects.toThrow(StatusCodeError);
});

test('login, isLoggedIn, and logout manage the auth table', async () => {
  const user = await DB.addUser({ name: randomName(), email: `${randomName()}@test.com`, password: 'x', roles: [{ role: Role.Diner }] });
  const token = `h.p.${randomName()}`;
  expect(await DB.isLoggedIn(token)).toBe(false);
  await DB.loginUser(user.id, token);
  expect(await DB.isLoggedIn(token)).toBe(true);
  await DB.logoutUser(token);
  expect(await DB.isLoggedIn(token)).toBe(false);
});

test('StatusCodeError carries a status code', () => {
  const err = new StatusCodeError('teapot', 418);
  expect(err.message).toBe('teapot');
  expect(err.statusCode).toBe(418);
});
