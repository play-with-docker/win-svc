var bodyParser = require('body-parser');
var express = require('express');
var app = express();
app.use(bodyParser.json());
var expressWs = require('express-ws')(app);
var os = require('os');
var pty = require('node-pty');
var fs = require('fs');
var path = require('path');
var osu = require('os-utils');
const { spawn } = require('child_process');
const uuidv4 = require('uuid/v4');

var terminals = {},
    logs = {},
    clients = {};

app.post('/terminals/:id', function (req, res) {
  let id = req.params.id;
  if (terminals[id]) {
      res.end();
      return
  }
  launchTerminal(id);
  res.end();
});

function launchTerminal(id) {
  var cols = parseInt(cols),
      rows = parseInt(rows),
      term = pty.spawn('powershell.exe', [], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: 'C:\\',
        env: process.env
      });

  console.log('Created terminal ' + id + ' with PID: ' + term.pid);
  term.id = id;
  terminals[id] = term;
  logs[id] = '';
  term.on('data', (data) => {
      logs[id] += data;
      if (logs[id].length > 10000) {
        logs[id] = logs[id].substr(logs[id].length - 10000);
      }
  });
  term.on('exit', function() {
    console.log('Exited terminal ' + term.id + '. Recreating');
    let newTerm = launchTerminal(term.id);
    if (clients[term.id]) {
        let subscribers = clients[term.id];
        for (var id in subscribers) {
            let ws = subscribers[id];
            connectWS(ws, term.id, newTerm);
        }
    }
  });
  return term;
}

function connectWS(ws, termId, term) {
  ws.send(logs[termId]);
  ws.term = term;
  term.on('data', ws.fill);
}

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
  ws.id = uuidv4();
  let id = req.params.id;
  var term = terminals[id];

  console.log('Client ' + ws.id + ' connected to terminal ' + id);
  if (!clients[id]) {
      clients[id] = {};
  }
  clients[id][ws.id] = ws;

  ws.fill = function(data) {
    try {
      ws.send(data);
    } catch (ex) {
      // The WebSocket is not open, ignore
    }
  }
  ws.on('message', function(msg) {
    if (ws.term) {
        try {
            ws.term.write(msg);
        } catch(ex) {
        }
    }
  });
  ws.on('close', function () {
      if (ws.term) {
	console.log('client disconnected from terminal ' + ws.term.pid);
        ws.term.removeListener('data', ws.fill);
      }
      delete clients[id][ws.id];
  });
  connectWS(ws, id, term);
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

app.post('/exec', function(req, res) {
    let cmd = req.body.cmd;

    const command = cmd.shift();
    const args = cmd;

    const exec = spawn(command, args);

    let stdout = '';
    let stderr = '';
    exec.stdout.on('data', (data) => {
        stdout += data;
    });
    exec.stderr.on('data', (data) => {
        stderr += data;
    });
    exec.on('error', (err) => {
        res.json({exit_code: -1, error: err, stdout: stdout, stderr: stderr});
    });
    exec.on('exit', (code) => {
        res.json({exit_code: code, stdout: stdout, stderr: stderr});
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
