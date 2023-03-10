const gpt = require('./gpt.js')
const chatgpt = require('./chatgpt.js')
const bing = require('./bing.js')
const midjourney = require('./midjourney.js')
const sd = require('./sd.js')
const whisper = require('./whisper.js')
const aimyvoice = require('./aimyvoice.js')

const requests = {}

module.exports = async (app) => {
    const gptServices = {
        gpt: await gpt(app),
        chatgpt: await chatgpt(),
        bing: await bing()
    }

    app.all('/:type/chat', async (req, res) => {
        const type = req.params['type']
        const service = gptServices[type]
        if (service) {
            const now = new Date().getTime()
            const last = requests[req.clientIp] || 0
            if (now - last < 5000) {
                res.status(403).send('Please await your previous request to complete')
                return
            }
            requests[req.clientIp] = new Date().getTime()
            try {
                const prompt = req.query['prompt'] || req.body['prompt']
                const conversationId = req.query['conversation'] || req.body['conversation']
                const result = await service.conversation(prompt, conversationId, req.body['options'])
                res.send({
                    text: result.response,
                    conversation: result.conversationId
                })
            } catch (e) {
                res.status(500).send(e.message)
            } finally {
                delete requests[req.clientIp]
            }
        } else {
            res.status(404).send(`${type} GPT service was not found`)
        }
    })

    return Object.assign({
        midjourney: await midjourney(app),
        sd: sd(app),
        whisper: whisper(app),
        aimyvoice: aimyvoice(app)
    }, gptServices)
}