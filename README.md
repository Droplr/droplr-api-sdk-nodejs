# Droplr API SDK (Node.js)

Include in a package.json file using the github address:

```
  "dependencies": {
    "droplr-api-sdk-nodejs": "git://github.com/droplr/droplr-api-sdk-nodejs.git"
  }
```

```javascript
const {DroplrServer} = require('droplr-api-sdk-nodejs');

const droplr = new DroplrServer({
  url,
  publicKey,
  privateKey,
  // Default false, set to true to use old style plaintext auth schemes
  plaintext: false
});

// If not performing anonymous requests
droplr.useAccount(email, password);

droplr.createDropFromFile('mytest.png')
  .then(result => {
    console.log('Created', result.body.code);
  });

```
