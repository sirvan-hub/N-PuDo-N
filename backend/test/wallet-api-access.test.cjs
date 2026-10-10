const test = require('node:test');
const assert = require('node:assert/strict');

const { WalletsController } = require('../dist/modules/wallets/wallets.controller');
const { RolesGuard } = require('../dist/common/guards/roles.guard');
const { UserRole } = require('../dist/common/interfaces/user-payload.interface');

test('wallet API requires JWT and declares the supported authenticated roles', () => {
  const guards = Reflect.getMetadata('__guards__', WalletsController) || [];
  const roles = Reflect.getMetadata('roles', WalletsController);
  assert.equal(guards.length, 2);
  assert.deepEqual(roles, [
    UserRole.RECIPIENT,
    UserRole.COURIER,
    UserRole.HUB_OWNER,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  ]);
  assert.equal(typeof WalletsController.prototype.getMine, 'function');
  assert.equal(typeof WalletsController.prototype.getMyTransactions, 'function');
  assert.equal(WalletsController.prototype.credit, undefined);
});

test('role guard allows an included role and rejects an excluded role', () => {
  const permitted = [UserRole.RECIPIENT, UserRole.COURIER];
  const reflector = { getAllAndOverride: () => permitted };
  const guard = new RolesGuard(reflector);
  const contextFor = (role) => ({
    getHandler: () => function endpoint() {},
    getClass: () => function Controller() {},
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  });

  assert.equal(guard.canActivate(contextFor(UserRole.RECIPIENT)), true);
  assert.equal(guard.canActivate(contextFor(UserRole.COURIER)), true);
  assert.throws(
    () => guard.canActivate(contextFor(UserRole.ADMIN)),
    (error) => error && error.status === 403,
  );
});

test('wallet API handlers always scope data to the authenticated subject', () => {
  const service = {
    getOwnWallet: async (userId) => ({ userId }),
    getOwnTransactions: async (userId, limit, offset) => ({ userId, limit, offset }),
  };
  const controller = new WalletsController(service);
  return Promise.all([
    controller.getMine({ sub: 'user-A' }).then((result) => assert.deepEqual(result, { userId: 'user-A' })),
    controller.getMyTransactions({ sub: 'user-B' }, '1000', '-5').then((result) => {
      assert.deepEqual(result, { userId: 'user-B', limit: 1000, offset: -5 });
    }),
  ]);
});
