'use strict';
const util = require('util');
const crypto = require('crypto');
const url = require('url');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const mime = require('mime');

const DEFAULT_USER_AGENT = 'droplr-node-client';
const ANONYMOUS_USER_EMAIL    = 'anonymous@droplr.com';
const ANONYMOUS_USER_PASSWORD = 'anonymous';
const AUTH_TYPE = {
  DROPLR: 'droplr',
  ANON: 'droplranon',
  DROPLR2: 'droplr2'
};

class DroplrServer {
  /*
   * @param  config     Object
   * @config url        String  URL of Droplr Server (Required)
   * @config publicKey  String  (Required)
   * @config privateKey String  (Required)
   * @config userAgent  String  (Optional)
   * @config plaintext  Boolean Use old plaintext authentication (Optional)
   */
  constructor(config) {
    [ 'url', 'publicKey', 'privateKey' ].forEach(setting => {
      if(typeof config[setting] !== 'string')
        throw new Error('Missing required configuration setting: ' + setting);
    });

    this.config = Object.assign({ userAgent: DEFAULT_USER_AGENT }, config);
    this.url = url.parse(config.url);
    this.email = ANONYMOUS_USER_EMAIL;
    this.password = ANONYMOUS_USER_PASSWORD;
    this.authType = config.plaintext === true ? AUTH_TYPE.ANON : AUTH_TYPE.DROPLR2;
    this.isHashed = false; // If use account is not set
  }
  useAccount(email, password, isHashed=false) {
    this.email = email;
    this.password = password;
    this.isHashed = isHashed;
    if(this.authType === AUTH_TYPE.ANON) {
      this.authType = AUTH_TYPE.DROPLR;
    }
    return this;
  }
  /*
   * @param user Object
   *    Fields defined at: https://github.com/Droplr/docs/blob/master/source/includes/_private-operations.md#input-parameters
   *    Password passed as plaintext, will automatically be hashed.
   */
  getAccount( token ) {
    return this._performRequest({
      method: 'GET',
      path: '/api/userinfo/' + token,
    })
  }
  createAccount(user) {
    return this._performRequest({
      method: 'POST',
      path: '/account',
      body: Object.assign({}, user, { password: sha1(user.password) })
    });
  }
  deleteAccount() {
    return this._performRequest({
      method: 'DELETE',
      path: '/account',
      skipParseResponse: true
    });
  }
  createDropForLink(url) {
    return this._performRequest({
      method: 'POST',
      path: '/links',
      headers: { 'Content-Type': 'text/plain' },
      body: url
    });
  }
  createDropForNote(note, type) {
    return this._performRequest({
      method: 'POST',
      path: '/notes',
      headers: { 'Content-Type': type },
      body: note
    });
  }
  createDropFromFile(file, filename, pixelDensity, uploadProgressCB) {
    let size = fs.lstatSync(file).size;
    let bytes = 0;

    return this._performRequest({
      method: 'POST',
      path: '/files?filename=' + encodeURIComponent(filename) + (`&pixel_density=${(pixelDensity ? pixelDensity : 1)}`),
      headers: {
        'Content-Type': mime.lookup(file),
        'Content-Length': size
      },
      body: fs.createReadStream(file).on('data', (chunk) => {
        bytes += chunk.length
        if(uploadProgressCB) uploadProgressCB(bytes/size)
      })
    })
  }
  updateDrop(dropId, updateFields) {
    return this._performRequest({
      method: 'PUT',
      path: '/drops/' + dropId,
      body: updateFields
    });
  }
  getDrop(dropId) {
    return this._performRequest({
      path: '/drops/' + dropId,
      skipParseResponse: true
    })
  }
  getDrops(amount=50) {
    return this._performRequest({
      path: `/drops?amount=${amount}`,
      skipParseResponse: false
    })
  }
  searchAllDrops(filter) {
    var tagPath = (filter != undefined) ? '?tags[]=' + filter : ''
    return this._performRequest({
      path: '/search/' + tagPath,
      skipParseResponse: false
    })
  }
  getMe() {
    return this._performRequest({
      path: '/users/me',
      skipParseResponse: false
    })
  }
  /*
   * @param options           Object
   * @option method           String
   *    HTTP method, default: 'GET'
   * @option path             String
   *    Path to request operation, without server URL, include query string
   * @option apiVersion       String
   *    Default: '0.9'
   * @option headers          Object
   *    Additional headers to apply to the request
   * @option body             Object/Buffer/String
   *    Pass Object to JSON serialize the body, automatically sets
   *     'Content-type: application/json' header
   *    Pass Buffer or String for other requests
   * @option skipParseResponse Boolean
   *    Pass true to skip JSON.parse on response body
   * @option modifyRequest     Function
   *    Optionally, pass function that modifies the request object
   *    Accepts one argument, returns same object
   * @option modifyConfig      Object
   *    Optionally, pass an object to assign over the instance's config for
   *    this request only
   */
  _performRequest(options) {
    const headers = Object.assign({
       'Date': new Date().toUTCString(),
       'Accept': 'application/json; version=' + (options.apiVersion || '0.9'),
       'User-Agent': this.config.userAgent
      }, options.headers);

    let req = {
      method: options.method || 'GET',
      protocol: this.url.protocol,
      hostname: this.url.hostname,
      port: this.url.port,
      path: options.path,
      headers
    };
    let sendBody;
    if(typeof options.body === 'object' && !(options.body instanceof Buffer) && !(options.body instanceof fs.ReadStream)) {
      headers['Content-Type'] = 'application/json';
      sendBody = JSON.stringify(options.body);
    } else {
      sendBody = options.body || '';
    }
    if(!headers['Content-Length'] && sendBody.length) headers['Content-Length'] = sendBody.length;

    headers['Authorization'] = this._getAuthToken(req, options.modifyConfig);
    if(options.modifyRequest) {
      req = options.modifyRequest(req);
    }

    return new Promise((resolve, reject) => {

      let reqHandle;
      const responseHandler = response => {
        // Server Error
        if('droplr-errorcode' in response.headers)
          return reject(new DroplrApiError(response));

        let body = '';
        response.setEncoding('utf8');
        response.on('data', chunk => body += chunk);
        response.on('end', () => {
          let parsedBody;
          if(!options.skipParseResponse) {
            try {
              //console.log(body)
              parsedBody = JSON.parse(body);
            } catch(error) {
              return reject(error);
            }
          } else { parsedBody = body; }
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body: parsedBody
          });
        });
      };
      if(req.protocol === 'https:')
        reqHandle = https.request(req, responseHandler);
      else if(req.protocol === 'http:')
        reqHandle = http.request(req, responseHandler);
      else throw new Error('Unsupported request protocol: ' + req.protocol);

      reqHandle.on('error', error => {
        reject(error)
      });

      // We have to handle file streams differently
      if(!(options.body instanceof fs.ReadStream)) {
        reqHandle.write(sendBody);
        reqHandle.end();
      } else {
        sendBody.pipe(reqHandle);
      }

    });
  }
  _getAuthToken(req, modifyConfig) {
    const config = Object.assign({}, this.config, modifyConfig);
    const key = toBase64(util.format('%s:%s', config.publicKey, this.email));
    const stringToSign = createStringToSign(req);
    switch(this.authType) {
      case AUTH_TYPE.DROPLR:
      case AUTH_TYPE.ANON:
        const secret = util.format('%s:%s', config.privateKey, (this.isHashed) ? this.password : sha1(this.password));
        const signature = calculateRfc2104Hmac(stringToSign, secret);
        return util.format('%s %s:%s', this.authType, key, signature);
      case AUTH_TYPE.DROPLR2:
        const signatureV2 = calculateRfc2104Hmac(stringToSign, config.privateKey);
        return util.format('%s %s:%s:%s', this.authType, key, signatureV2, (this.isHashed) ? this.password : sha1(this.password));
    }
  }
}
exports.DroplrServer = DroplrServer;

class DroplrApiError extends Error {
  constructor(response) {
    super(response.headers['droplr-errordetails']);
    this.statusCode = response.statusCode;
    this.code = response.headers['droplr-errorcode'];
  }
}
exports.DroplrApiError = DroplrApiError;

function sha1(data) {
  return crypto.createHash('sha1').update(data).digest('hex');
}

function calculateRfc2104Hmac(data, key) {
  return crypto.createHmac('sha1', key).update(data).digest('base64');
}

function toBase64(data) {
  return new Buffer(data).toString('base64');
}

function createStringToSign(req) {
  // Query parameters are not part of the string to sign
  const argsPos = req.path.indexOf('?');
  const origPath = argsPos !== -1 ? req.path.substr(0, argsPos) : req.path;
  return util.format('%s %s %s\n%s\n%s',
    req.method,
    origPath,
    'HTTP/1.1',
    req.headers['Content-Type'] || '',
    req.headers['Date']);
}

function readFileToBuffer(file) {
  return new Promise((resolve, reject) => {
    fs.readFile(file, (error, data) => {
      if(error) return reject(error);
      resolve(data);
    });
  });
}
