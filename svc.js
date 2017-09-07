var Service = require('node-windows').Service;

// Create a new service object
var svc = new Service({
  name:'PWD Windows Service',
  description: 'This servie provides terminal connection support and file upload to PWD',
  script: 'C:\\pwd\\win-svc\\app.js'
});

// Listen for the "install" event, which indicates the
// process is available as a service.
svc.on('install',function(){
  svc.start();
});

svc.install();
