const axios = require('axios')
const crypto = require('crypto')
const redis = require('./redis.js')
const { encode } = require('gpt-3-encoder')

function fitTokens(conversation) {
    while (conversation.length > 2) {
        const messages = conversation.map(c => c.content).join('\n')
        let tokens = 4000 - encode(messages).length
        if (tokens < 1000) {
            conversation.splice(2, 2)
        } else {
            break
        }
    }
}

module.exports = async () => {
    const conversations = await redis('chatgpt-conversations')

    async function conversation(request, conversationId, opts = {}) {
        console.log(`[chatGPT] "${request}" ${conversationId || ''}`)
        const conversation = JSON.parse(conversationId ? (await conversations.get(conversationId) || '[]') : '[]')
        conversation.push({role: 'user', content: request})
        fitTokens(conversation)

        if (!conversationId) {
            conversationId = crypto.randomUUID()
        }
        const req = Object.assign(opts, {model: 'gpt-3.5-turbo', messages: conversation})
        const resp = await axios.post('https://api.openai.com/v1/chat/completions', req, {
            headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
            }
        })

        if (!resp.data['choices'] || !resp.data['choices'].length) {
            throw new Error('cannot receive response from chatGPT')
        }

        const messages = resp.data['choices'].map(c => c['message']['content'].trim())
        conversation.push({role: 'assistant', content: messages[0]})
        conversations.set(conversationId, JSON.stringify(conversation))

        return {
            conversationId: conversationId,
            response: messages[0]
        }
    }

    return {
        conversation: conversation
    }
}