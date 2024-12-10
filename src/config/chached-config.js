const Redis = require('ioredis');

const redis = new Redis({
  host: 'localhost',
  port: 6375, 
});

module.exports = redis;
