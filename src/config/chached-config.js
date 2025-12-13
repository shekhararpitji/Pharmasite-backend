const Redis = require('ioredis');

// Create a mock Redis client for fallback when Redis is not available
const createMockRedisClient = () => {
  const mockCache = new Map();
  return {
    get: async (key) => {
      console.log(`[Mock Redis] Getting key ${key}`);
      return mockCache.get(key);
    },
    set: async (key, value) => {
      console.log(`[Mock Redis] Setting key ${key}`);
      mockCache.set(key, value);
      return 'OK';
    },
    setex: async (key, seconds, value) => {
      console.log(`[Mock Redis] Setting key ${key} with expiry ${seconds}s`);
      mockCache.set(key, value);
      setTimeout(() => mockCache.delete(key), seconds * 1000);
      return 'OK';
    },
    del: async (key) => {
      console.log(`[Mock Redis] Deleting key ${key}`);
      return mockCache.delete(key) ? 1 : 0;
    },
    config: async () => 'OK',
    on: () => {},
    disconnect: () => {},
    connect: () => {},
    status: 'ready'
  };
};

// Initialize a variable to hold either the real Redis client or mock
let redis;

try {
  // Try to create a real Redis client
  redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port:  6379,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      console.log(`Retrying Redis connection in ${delay}ms (attempt ${times})`);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
    connectTimeout: 5000, // 5 second timeout
    autoResendUnfulfilledCommands: false,
    reconnectOnError: (err) => {
      const targetError = 'READONLY';
      if (err.message.includes(targetError)) {
        // Only reconnect on specific errors
        return true;
      }
      return false;
    }
  });

  // Configure Redis for handling persistence issues
  redis.on('ready', () => {
    console.log('Redis connection established successfully');
    // Disable Redis persistence by setting CONFIG parameters
    redis.config('SET', 'stop-writes-on-bgsave-error', 'no')
      .catch(err => console.warn('Could not update Redis config:', err));
  });

  // Handle Redis errors
  redis.on('error', (err) => {
    console.error('Redis connection error:', err);
    
    // If connection is refused, switch to mock implementation after max retries
    if (err.code === 'ECONNREFUSED' && redis.status === 'end') {
      console.log('Switching to in-memory mock Redis implementation');
      redis = createMockRedisClient();
    }
  });
} catch (error) {
  console.error('Failed to initialize Redis, using in-memory fallback:', error);
  redis = createMockRedisClient();
}

module.exports = redis;
