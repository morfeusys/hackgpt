const redis = require('redis')

const redisClient = new Promise((resolve, reject) => {
    const client = redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
    })

    client.on('connect', () => {
        console.log('[Redis] client connected')
    })

    client.on('ready', () => {
        console.log("[Redis] ready")
        resolve(client)
    })

    client.on("error", (error) => {
        console.error(`[Redis] error: ${error}`)
        reject(error)
    })

    client.connect()
})

module.exports = async (namespace) => {
    const client = await redisClient
    return {
        get: async (key) => JSON.parse(await client.get(`${namespace}:${key}`)),
        set: (key, value) => client.set(`${namespace}:${key}`, JSON.stringify(value)),
        del: (key) => client.del(`${namespace}:${key}`),
        push: (value) => client.rPush(namespace, JSON.stringify(value)),
        pop: async () => JSON.parse(await client.lPop(namespace))
    }
}