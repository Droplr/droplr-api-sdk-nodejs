'use strict';
const fs = require('fs');
const util = require('util');

const randomString = require('randomstring').generate;

const {DroplrServer} = require('..');

// Keys and user details from sandbox test data
const SERVER_CONFIGS = {
  // Test using 'droplr2' scheme
//   'default (droplr2)': {
//     url: process.env.API_SERVER_URL || 'http://localhost:80',
//     publicKey: 'app_1_publickey',
//     privateKey: 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3',
//   },
  // These requests should also work using old 'droplr' and 'droplranon' scheme
  'old-plaintext': {
    url: process.env.API_SERVER_URL || 'https://api-regiontest.droplr.com',
    publicKey: 'app_0_publickey',
    privateKey: 'app_0_privatekey',
    plaintext: true
  }
};

const TEST_USER = {
  email: 'test1@test.com',
  password: 'something'
};

const TEST_USER_TPL = 'api-test-user-%s@test.com';
const TEST_USER_PASSWORD = 'something%s';
const TEST_DROP_ASSET = process.env.UPLOAD_FILE || 'test/totinos-stock-06-2014.jpg';

Object.keys(SERVER_CONFIGS).forEach(serverConfigKey => {
  const serverConfig = SERVER_CONFIGS[serverConfigKey];
  const newCase = (name, testFun) => { exports[`${serverConfigKey} - ${name}`] = testFun };

//   newCase('canSearch', test => {
//     new DroplrServer(serverConfig)
//       .useAccount(TEST_USER.email, TEST_USER.password)
//       ._performRequest({
//         path: '/search/drop/does_not_exist'
//       })
//       .then(result => {
//         test.strictEqual(result.statusCode, 200,
//           'Incorrect status code');
//         test.ok('hits' in result.body,
//           'Missing body field');
//         test.done();
//       })
//       .catch(reason => {
//         test.ifError(reason);
//         test.done();
//       })
//   });
// 
//   newCase('unknownUser', test => {
//     new DroplrServer(serverConfig)
//       .useAccount('invalid@email.com', TEST_USER.password)
//       ._performRequest({
//         path: '/search/drop/does_not_exist',
//         skipParseResponse: true
//       })
//       .then(result => {
//         test.ok(false, 'Succeeded Erroneously');
//         test.done();
//       })
//       .catch(reason => {
//         test.strictEqual(reason.statusCode, 401,
//           'Incorrect status code');
//         test.strictEqual(reason.code, 'Authentication.UnknownUser',
//           'Incorrect error code');
//         test.done();
//       })
//   });
// 
//   newCase('noAuthorizationHeader', test => {
//     new DroplrServer(serverConfig)
//       .useAccount(TEST_USER.email, TEST_USER.password)
//       ._performRequest({
//         path: '/search/drop/does_not_exist',
//         skipParseResponse: true,
//         modifyRequest: req => {
//           delete req.headers['Authorization'];
//           return req;
//         }
//       })
//       .then(result => {
//         test.ok(false, 'Succeeded Erroneously');
//         test.done();
//       })
//       .catch(reason => {
//         test.strictEqual(reason.statusCode, 401,
//           'Incorrect status code');
//         test.strictEqual(reason.code, 'Request.NoAuthorizationHeader',
//           'Incorrect error code');
//         test.done();
//       })
//   });

  newCase('javaApiRequestError', test => {
    new DroplrServer(serverConfig)
      ._performRequest({
        skipParseResponse: true,
        path: '/drops/does_not_exist'
      })
      .then(result => {
        test.ok(false, 'Succeeded Erroneously');
        test.done();
      })
      .catch(reason => {
        test.strictEqual(reason.statusCode, 404,
          'Incorrect status code');
        test.strictEqual(reason.code, 'ReadDrop.NoSuchDrop',
          'Incorrect error code');
        test.done();
      })
  });

  newCase('createAccountAndDrop', test => {
    const testUser = {
      email: util.format(TEST_USER_TPL, randomString(10)),
      password: util.format(TEST_USER_PASSWORD, randomString(10))
    };
    let server, dropResponse;

    new DroplrServer(serverConfig)
      .createAccount(testUser)
      .then(result => {
        test.strictEqual(result.statusCode, 201,
          'Incorrect status code');
        test.strictEqual(result.body.email.toLowerCase(), testUser.email.toLowerCase(),
          'Incorrect account email reported');

        server = new DroplrServer(serverConfig)
          .useAccount(testUser.email, testUser.password);

        return server.createDropFromFile(TEST_DROP_ASSET);
      })
      .then(result => {
        test.strictEqual(result.statusCode, 201,
          'Incorrect status code');
        test.strictEqual(result.body.size, fs.statSync(TEST_DROP_ASSET).size,
          'Incorrect Drop size reported');

        dropResponse = result.body;

        return server._performRequest({
          path: '/drops'
        });
      })
      .then(result => {
        test.strictEqual(result.statusCode, 200,
          'Incorrect status code');
        test.strictEqual(result.body.length, 1,
          'Incorrect number of Drops returned');
        test.strictEqual(result.body[0].code, dropResponse.code,
          'Incorrect Drop code returned');
        test.done();
      })
      .catch(reason => {
        test.ok(false, 'Failed Erroneously');
        console.error(reason);
        test.done();
      })
  });
});
