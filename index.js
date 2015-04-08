var fs = require('fs'),
    exif = require('exif-parser'),
    restify = require('restify'),
    shortid = require('shortid');

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

    console.log(metadata.tags.GPSLatitude, metadata.tags.GPSLongitude);

    var fileOutName = req.files.file.name.replace('.jpg', '') + "_" + shortid.generate();

    fs.writeFile(fileOutName, imgContent, function(err, data) {
      if(err) {
        console.error("Error writing file " + fileOutName);
        res.header('Location', req.params.callback + '?error=true');
        res.send(302, 'An error happened :(');
        return;
      }

      res.header('Location', req.params.callback + '?public_id=' + fileOutName);
      res.send(302, fileOutName);
      next();
    });
  });
}

var server = restify.createServer();
server.get('/spots', listSpots);
server.post('/spots', restify.bodyParser(), addSpot)

server.listen(process.env.PORT || 8080, function() {
  console.log('%s listening at %s', server.name, server.url);
});