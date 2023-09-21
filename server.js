const express = require('express');
const fileUpload = require('express-fileupload');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const azure = require('@azure/web-pubsub-socket.io');

const hubName = 'sample_draw';

azure.useAzureSocketIO(io, {
  hub: hubName,
  connectionString: process.argv[2] || process.env.Web_PubSub_ConnectionString
});

let diagram = {
  shapes: {},
  background: null,
  users: 0
};

const room = 'draw';

io.on('connection', async socket => {
  socket.on('disconnect', async (reason) => {
    if (--diagram.users < 0) diagram.users = 0;
    await io.to(room).emit('updateUser', diagram.users);
  });

  socket.on('addShape', message => {
    let [id, shape] = message;
    diagram.shapes[id] = shape;
  });

  socket.on('updateShape', message => {
    io.to(room).emit('updateShape', message);
  })

  socket.on('patchShape', message => {
    io.to(room).emit('patchShape', message);
  })

  socket.on('removeShape', message => {
    let [author, id] = message;
    delete diagram.shapes[id];
    io.to(room).emit('removeShape', message);
  });

  socket.on('clear', message => {
    diagram.shapes = {};
    diagram.background = null;
    io.to(room).emit('clear', message);
  })

  socket.on('newMessage', message => {
    io.to(room).emit('newMessage', message);
  })

  await socket.join(room);
  await io.to(room).emit('updateUser', ++diagram.users);
});

app.use(fileUpload());
// app.use(handler.getMiddleware());
app
  .get('/diagram', async (req, res) => {
    res.json({
      shapes: diagram.shapes,
      background: diagram.background && diagram.background.id
    });
  })
  .post('/background/upload', async (req, res) => {
    diagram.background = {
      id: Math.random().toString(36).substr(2, 8),
      data: req.files['file'].data,
      contentType: req.files['file'].mimetype
    };
    await io.emit('updateBackground', diagram.background.id);
    res.end();
  })
  .get('/background/:id', (req, res) => {
    if (diagram.background && diagram.background.id === req.params.id) {
      res.type(diagram.background.contentType);
      res.send(diagram.background.data);
    } else res.status(404).end();
  })
  .get('/negotiate', azure.negotiate(io));

app.use(express.static('dist'));
io.httpServer.listen(8080, () => console.log('app started. Open in http://localhost:8080')); 
