var fs = require('fs'),
    S3 = require('streaming-s3'),
    exif = require('exif-parser'),
    mongo = require('mongojs'),
    restify = require('restify'),
    shortid = require('shortid');

// Init global stuff

var db = mongo(process.env.MONGOLAB_URI, ['teleports']);

// Helpers

function uploadToS3(localFile, uploadName, errorCallback, successCallback) {

  var fStream = fs.createReadStream(localFile);
  var uploader = new S3(fStream, {accessKeyId: process.env.AWS_ACCESS_KEY, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY},
    {
      Bucket: 'teleports',
      Key: 'portals/' + uploadName,
      ContentType: 'image/jpeg'
    }
  );

  uploader.begin();

  uploader.on('data', function (bytesRead) {
    console.log(bytesRead, ' bytes read.');
  });

  uploader.on('part', function (number) {
    console.log('Part ', number, ' uploaded.');
  });

  // All parts uploaded, but upload not yet acknowledged.
  uploader.on('uploaded', function (stats) {
    console.log('Upload stats: ', stats);
  });

  uploader.on('finished', function (resp, stats) {
    console.log('Upload finished: ', resp);
    successCallback();
  });

  uploader.on('error', errorCallback);
}

function saveToDatabase(record, errorCallback, successCallback) {
  db.teleports.insert(record, function(err) {
    if(err) errorCallback(err);
    else successCallback();
  });
}

// Handlers

function listSpots(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.json([
    {file: 'zurich_1.jpg', name: 'Zürich Platzspitz'},
    {file: 'zurich_2.jpg', name: 'Zürich Über den Dächern'},
    {file: 'zurich_3.jpg', name: 'Zürich HB Shopville'},
    {file: 'zurich_4.jpg', name: 'Zürich Schmiede Wiedikon'},
    {file: 'zurich_5.jpg', name: 'Zürich Uetliberg'},
    {file: 'zurich_6.jpg', name: 'Zürich Liebfrauenkirche'},
  ]);
  next();
}

function addSpot(req, res, next) {
  console.log(req.params);
  if(!req.files) {
    res.redirect(req.params)
    next();
    return;
  }

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

    uploadToS3(req.files.file.path, fileOutName + '.jpg', function error(err) {
      console.error("Error saving to S3 ", err, teleport);
      res.header('Location', req.params.callback + '?error=true');
      res.send(302, 'An error happened :(');
    }, function success() {
      console.log("S3 Upload successful");
      saveToDatabase(teleport, function(err) {
        console.error("Error saving to DB: " + err, teleport);
        res.header('Location', req.params.callback + '?error=true');
        res.send(302, 'An error happened :(');
      }, function() {
        console.log("DB insert successful");
        res.header('Location', req.params.callback + '?public_id=' + fileOutName);
        res.send(302, fileOutName);
        next();
      });
    });
  });
}

var server = restify.createServer();
server.get('/spots', listSpots);
server.post('/spots', restify.bodyParser(), addSpot)

server.listen(process.env.PORT || 8080, function() {
  console.log('%s listening at %s', server.name, server.url);
});