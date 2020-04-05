const appUpload = require('./app-upload');
const multer = require('multer');

const multipartMiddleware = multer({ storage : multer.diskStorage({
  destination: function (req, file, callback) {
    callback(null, process.env.APP_TMP_DIR);
  },
  filename: function (req, file, callback) {
    callback(null, file.originalname);
  }
})});

const registryAuth = require('./registry_auth');

// eslint-disable-next-line no-unused-vars
module.exports = function (app) {
  app.post('/app-upload', multipartMiddleware.single('app'), appUpload());
  app.get('/registry_auth', registryAuth());
};
