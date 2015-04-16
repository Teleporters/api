var fs = require('fs'),
    im = require('imagemagick-stream'),
    S3 = require('streaming-s3'),
    exif = require('exif-parser'),
    mongo = require('mongojs'),
    stream = require('stream'),
    restify = require('restify'),
    shortid = require('shortid'),
    nodemailer = require('nodemailer');

// Init global stuff

var db = mongo(process.env.MONGOLAB_URI, ['teleports']);

// Helpers

function flipImageStream(localFile) {
  var passthrough = new stream.PassThrough();
  im(localFile).op('flop').pipe(passthrough);
  return passthrough;
}

function makeThumbStream(localFile) {
  var passthrough = new stream.PassThrough();
  im(localFile).op('gravity', 'center').op('thumbnail', '500x500^').op('extent', '500x500').op('format', 'png').pipe(passthrough);
  return passthrough;
}

function uploadToS3(fileStream, uploadName, contentType, errorCallback, successCallback) {

  var uploader = new S3(fileStream, {accessKeyId: process.env.AWS_ACCESS_KEY, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY},
    {
      Bucket: 'teleports',
      Key: uploadName,
      ContentType: contentType || 'image/jpeg'
    }
  );

  uploader.begin();

  uploader.on('finished', function (resp, stats) {
    console.log('Upload finished: ', resp);
    successCallback();
  });
}

function saveToDatabase(record, errorCallback, successCallback) {
  db.teleports.insert(record, function(err) {
    if(err) errorCallback(err);
    else successCallback();
  });
}

// Handlers

function sendInquiryNotice(req, res, next) {
  console.log("INQUIRY FROM " + req.params.email)
  var transporter = nodemailer.createTransport();
  transporter.sendMail({
    from: 'inquiries@api.teleports.me',
    to: 'hello@teleports.me',
    subject: 'Inquiry',
    text: 'Inquiry received from ' + req.params.email
  });
  res.json({result: "OK"});
  next();
}

function listSpots(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');

  if(!req.params.page) page = 0;
  else page = req.params.page;

  db.teleports.find({}).limit(50).skip(page * 50).toArray(function(err, teleports) {
    if(err) res.send(500, '{"error": "Cannot list spots."}');
    else res.json(teleports);
    next();
  });
}

function addSpot(req, res, next) {
  if(!req.files) {
    res.redirect(req.params)
    next();
    return;
  }

  if(!req.params.callback) req.params.callback = 'http://teleports.me/';

  fs.readFile(req.files.file.path, function(err, imgContent) {
    if(err) {
      console.error("Error reading file " + req.files[0].path);
      res.header('Location', req.params.callback + '?error=true');
      res.send(302, 'An error happened :(');
      return;
    }

    try {
      var metadata = exif.create(imgContent).parse();
    } catch(e) {
      // i don't care.
    }

    var fileOutName = req.files.file.name.replace('.jpg', '') + "_" + shortid.generate(),
        teleport = { file: fileOutName };

    if(metadata && metadata.tags) {
      teleport.lat = metadata.tags.GPSLatitude;
      teleport.lng = metadata.tags.GPSLongitude;
    }

    uploadToS3(flipImageStream(req.files.file.path), 'portals/' + fileOutName + '.jpg', 'image/jpeg', function error(err) {
      console.error("Error saving to S3 ", err, teleport);
      res.header('Location', req.params.callback + '?error=true');
      res.send(302, 'An error happened :(');
      next();
    }, function success() {
      console.log("S3 Upload successful");
      uploadToS3(makeThumbStream(req.files.file.path), 'thumbs/' + fileOutName + '.png', 'image/png', function(err) {
        console.error("Thumbnail upload failed for " + fileOutName, err);
      }, function() {
        console.log("Thumbnail saved");
        saveToDatabase(teleport, function(err) {
          console.error("Error saving to DB: " + err, teleport);
          res.header('Location', req.params.callback + '?error=true');
          res.send(302, 'An error happened :(');
          next();
        }, function() {
          console.log("DB insert successful");
          res.header('Location', req.params.callback + '?public_id=' + fileOutName);
          res.send(302, fileOutName);
          next();
        });
      });
    });
  });
}

var server = restify.createServer();
server.get('/spots', listSpots);
server.post('/spots', restify.bodyParser(), addSpot);
server.post('/inquiry', restify.bodyParser(), sendInquiryNotice);

server.listen(process.env.PORT || 8080, function() {
  console.log('%s listening at %s', server.name, server.url);
});
