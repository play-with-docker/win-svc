var express = require('express');
var app = express();
var expressWs = require('express-ws')(app);
var os = require('os');
var pty = require('node-pty');
var fs = require('fs');
var path = require('path');
var osu = require('os-utils');

var terminals = {},
    logs = {};

app.post('/terminals/:id', function (req, res) {
  let id = req.params.id;
  if (terminals[id]) {
      res.end();
      return
  }
  var cols = parseInt(req.query.cols),
      rows = parseInt(req.query.rows),
      term = pty.spawn('powershell.exe', [], {
        name: 'xterm-color',
        cols: cols || 80,
        rows: rows || 24,
        cwd: 'C:\\',
        env: process.env
      });

  console.log('Created terminal ' + id + ' with PID: ' + term.pid);
  terminals[id] = term;
  logs[id] = '';
  term.fillCB = function(data) {
    logs[id] += data;
  }
  term.on('data', term.fillCB);
  res.end();
});

app.post('/terminals/:id/size', function (req, res) {
  var id = req.params.id,
      cols = parseInt(req.query.cols),
      rows = parseInt(req.query.rows),
      term = terminals[id];

  if (!term) {
    res.end();
    return;
  }
  term.resize(cols, rows);
  console.log('Resized terminal ' + id + ' to ' + cols + ' cols and ' + rows + ' rows.');
  res.end();
});

app.ws('/terminals/:id', function (ws, req) {
  let id = req.params.id;
  var term = terminals[id];
  console.log('Connected to terminal ' + id);

  if (term.fillCB && logs[id]) {
    ws.send(logs[id]);
    term.removeListener('data', term.fillCB);
    term.fillCB = null;
    logs[id] = '';
  }    

  ws.fillCallback = function(data) {
    try {
      ws.send(data);
    } catch (ex) {
      // The WebSocket is not open, ignore
    }
  }
  term.on('data', ws.fillCallback);
  ws.on('message', function(msg) {
    term.write(msg);
  });
  ws.on('close', function () {
      console.log('client disconnected from terminal ' + term.pid);
      term.removeListener('data', ws.fillCallback);
  });
});
app.post('/terminals/:id/uploads', function(req, res) {
    let id = req.params.id;
    var term = terminals[id];

    var dst = req.query.dest;
    var fileName = req.query.file_name;

    if (!dst) {
      dst = 'c:';
    }
    var p = path.join(dst, fileName);
    let ws = fs.createWriteStream(p);
    req.on('data', function(data) {
        ws.write(data);
    });
    req.on('end', function() {
        ws.end();
        res.end();
    });
});

app.get('/stats', function(req, res) {
    osu.cpuUsage(function(v){
        res.json({mem_total: os.totalmem(), mem_used: os.totalmem()-os.freemem(), cpu: v});
        res.end();
    });
});

var port = process.env.PORT || 222,
    host = '0.0.0.0';

console.log('App listening to http://' + host + ':' + port);
app.listen(port, host);
