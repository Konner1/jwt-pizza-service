const request = require('supertest');
const app = require('./service.js');
const { DB, Role } = require('./database/database.js');

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}

// Registers a brand-new diner through the API and returns the user, password, and auth token.
async function registerDiner() {
  const user = { name: randomName(), email: `${randomName()}@test.com`, password: 'a' };
  const res = await request(app).post('/api/auth').send(user);
  return { user: { ...res.body.user, password: user.password }, token: res.body.token };
}

// Admins can't be created through the API, so insert one directly into the database and log in.
async function createAdmin() {
  const admin = { name: randomName(), email: `${randomName()}@admin.com`, password: 'toomanysecrets', roles: [{ role: Role.Admin }] };
  const created = await DB.addUser(admin);
  const res = await request(app).put('/api/auth').send({ email: admin.email, password: admin.password });
  return { user: { ...created, password: admin.password }, token: res.body.token };
}

// Creates a franchise (via an admin) whose franchisee is the given user.
async function createFranchise(adminToken, franchiseeEmail) {
  const res = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `franchise-${randomName()}`, admins: [{ email: franchiseeEmail }] });
  return res.body;
}

module.exports = { app, request, DB, Role, randomName, expectValidJwt, registerDiner, createAdmin, createFranchise };
