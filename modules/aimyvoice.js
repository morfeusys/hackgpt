const qs = require('qs')
const axios = require('axios')
const config = require('./aimyvoice.json')

async function synthesize(text, voice) {
    const token = config.voices[voice]
    text = text.trim()
    if (!token) throw new Error(`voice [${voice}] was not found`)
    if (!text) throw new Error('text is empty')
    if (text.length < 4 || text.length > 500) throw new Error('text must be from 4 to 500 symbols length')

    console.log(`[Aimyvoice] Synthesising [${text}] with voice [${voice}]`)
    return await axios.post('https://aimyvoice.com/api/v1/synthesize', qs.stringify({
        text: text
    }), {
        responseType: 'stream',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
            'api-key': token
        }
    })
}

module.exports = (app) => {
    app.get('/aimyvoice/synthesize', async (req, res) => {
        try {
            const response = await synthesize(req.query['text'], req.query['voice'])
            res.writeHead(200, {
                'Content-Type': 'audio/wav',
            })
            response.data.pipe(res)
        } catch (e) {
            console.error(`Cannot synthesise [${req.query['text']}] ${e.message}`)
            res.status(500).send(e.message)
        }
    })

    app.post('/aimyvoice/synthesize', async (req, res) => {
        try {
            const response = await synthesize(req.body['text'], req.body['voice'])
            res.writeHead(200, {
                'Content-Type': 'audio/wav',
            })
            response.data.pipe(res)
        } catch (e) {
            console.error(`Cannot synthesise [${req.body['text']}] ${e.message}`)
            res.status(500).send(e.message)
        }
    })
}