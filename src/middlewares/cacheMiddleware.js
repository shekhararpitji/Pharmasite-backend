const redis = require('../config/chached-config');

const cacheMiddleware = async (req, res, next) => {
    // A unique key is generated from the request's URL and query parameters.
    const key = req.originalUrl + JSON.stringify(req.query);

    try {
        if (redis.status !== 'ready') {
            console.log('Redis not ready, skipping cache.');
            return next();
        }

        const cachedData = await redis.get(key);

        if (cachedData) {
            console.log('Cache hit for key:', key);
            const data = JSON.parse(cachedData);
            return res.status(data.statusCode || 200).json(data);
        } else {
            console.log('Cache miss for key:', key);
            const originalJson = res.json;

            res.json = (data) => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    // Cache successful responses for 1 hour (3600 seconds).
                    redis.setex(key, 3600, JSON.stringify(data));
                }
                res.json = originalJson;
                return res.json(data);
            };
            next();
        }
    } catch (error) {
        console.error('Redis error during caching middleware:', error);
        next(); // Proceed without cache on error.
    }
};

module.exports = cacheMiddleware; 