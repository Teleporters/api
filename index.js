var restify = require('restify');

function listSpots(req, res, next) {
  res.json(['zurich_1.jpg', 'zurich_1.jpg', 'zurich_2.jpg', 'zurich_3.jpg', 'zurich_4.jpg', 'zurich_5.jpg', 'zurich_6.jpg'])
  next();
}

function addSpot(req, res, next) {
  res.send("OK");
  next();
}

var server = restify.createServer();
server.get('/spots', listSpots);
server.post('/spots', addSpot)

server.listen(process.env.PORT || 8080, function() {
  console.log('%s listening at %s', server.name, server.url);
});