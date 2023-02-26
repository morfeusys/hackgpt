const redis = require('./redis.js')
const crypto = require('crypto')
const axios = require('axios')
const { encode } = require('gpt-3-encoder')

const preamble = "You are ChatGPT, a large language model trained by OpenAI."
const maxTokens = 4000

module.exports = async (app) => {
    const conversations = await redis('gpt-conversation')

    async function complete(data) {
        data = Object.assign({
            "model": "text-davinci-003",
        }, data)
        return await axios.post('https://api.openai.com/v1/completions', data, {
            headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
            }
        })
    }

    async function conversation(request, conversationId, options = {}) {
        console.log(`[GPT] "${request}" ${conversationId || ''}`)
        conversationId = conversationId || crypto.randomUUID()
        let conversation = await conversations.get(conversationId)
        if (!conversation) {
            conversation = {
                history: preamble
            }
        }
        let prompt = `${conversation.history}\nHuman:${request}\nChatGPT:`
        let tokens = maxTokens - encode(prompt).length
        while (tokens < 1000) {
            let from = prompt.indexOf('\nHuman:')
            let to = prompt.indexOf('\nHuman:', from + 1)
            if (to !== -1) {
                prompt = prompt.substring(0, from) + prompt.substring(to)
            } else {
                prompt = preamble
            }

            tokens = maxTokens - encode(prompt).length
        }

        let data = options || {
            "temperature": 0.9,
            "frequency_penalty": 0,
            "presence_penalty": 0
        }
        if (data['max_tokens'] && data['max_tokens'] < tokens) {
            tokens = data['max_tokens']
        }
        data = Object.assign(data, {
            "model": "text-davinci-003",
            "max_tokens": tokens,
            "best_of": 1,
            "echo": false,
            "logprobs": 0,
            "stream": false,
            "stop": ["Human:", "ChatGPT:"],
            "prompt": prompt
        })
        let result = await complete(data)
        let text = !!result.data['choices'].length && result.data['choices'][0]['text'].trim() || ''
        conversation.history = prompt + text
        conversations.set(conversationId, conversation)
        console.log(`[GPT] ${conversationId} "${text}"`)
        return {
            response: text,
            conversationId: conversationId
        }
    }

    app.post('/gpt/complete', async (req, res) => {
        try {
            res.send((await complete(req.body)).data)
        } catch (e) {
            console.error(`[GPT] ${e.message}`)
            res.status(500).send(e.message)
        }
    })

    return {
        complete: complete,
        conversation: conversation
    }
}