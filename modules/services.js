const gpt = require('./gpt.js')
const chatgpt = require('./chatgpt.js')
const bing = require('./bing.js')
const midjourney = require('./midjourney.js')
const whisper = require('./whisper.js')

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
            try {
                const prompt = req.query['prompt'] || req.body['prompt']
                const conversationId = req.query['conversation'] || req.body['conversation']
                const result = await service.conversation(prompt, conversationId)
                res.send({
                    text: result.response,
                    conversation: result.conversationId
                })
            } catch (e) {
                res.status(500).send(e.message)
            }
        } else {
            res.status(404).send(`${type} GPT service was not found`)
        }
    })

    return Object.assign({
        midjourney: await midjourney(app),
        whisper: whisper
    }, gptServices)
}