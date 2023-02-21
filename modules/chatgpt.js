const axios = require('axios')
const crypto = require('crypto')
const redis = require('./redis.js')

module.exports = async (app) => {
    const conversations = await redis('chatgpt-conversation')

    async function conversation(request, conversationId) {
        const messageId = conversationId ? await conversations.get(conversationId) : crypto.randomUUID()
        const req = {
            'model': 'text-davinci-002-render-sha',
            'parent_message_id': messageId,
            'action': 'next',
            'messages': [{
                'id': crypto.randomUUID(),
                'role': 'user',
                'content': {
                    'content_type': 'text',
                    'parts': [request]
                }
            }]
        }
        if (conversationId) {
            req['conversation_id'] = conversationId
        }
        const resp = await axios.post('https://chat.duti.tech/api/conversation', req, {
            headers: {
                Authorization: `Bearer ${process.env.OPENAI_ACCESS_TOKEN}`
            }
        })

        const data = resp.data.substring(resp.data.lastIndexOf('data: {') + 6, resp.data.indexOf('data: [DONE]')).trim()
        const json = JSON.parse(data)

        const result = {
            conversationId: json['conversation_id'],
            response: json['message']['content']['parts'][0]
        }

        conversations.set(result.conversationId, json['message']['id'])
        return result
    }

    app.get('/chatgpt/conversation', async (req, res) => {
        try {
            res.send(await conversation(req.query['prompt'], req.query['conversationId']))
        } catch (e) {
            console.error(e)
            res.sendStatus(500)
        }
    })

    return {
        conversation: conversation
    }
}