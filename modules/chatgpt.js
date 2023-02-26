const axios = require('axios')
const crypto = require('crypto')
const redis = require('./redis.js')

module.exports = async () => {
    const conversations = await redis('chatgpt-conversation')

    async function conversation(request, conversationId) {
        console.log(`[chatGPT] "${request}" ${conversationId || ''}`)
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

        if (typeof resp.data === 'string') {
            const data = resp.data.substring(resp.data.lastIndexOf('data: {') + 6, resp.data.indexOf('data: [DONE]')).trim()
            const json = JSON.parse(data)

            const result = {
                conversationId: json['conversation_id'],
                response: json['message']['content']['parts'][0]
            }

            console.log(`[chatGPT] ${result.conversationId} "${result.response}"`)
            conversations.set(result.conversationId, json['message']['id'])
            return result
        }

        if (typeof resp.data === 'object') {
            const detail = resp.data['detail']
            throw new Error(detail['message'] ? detail['message'] : detail)
        }
    }

    return {
        conversation: conversation
    }
}