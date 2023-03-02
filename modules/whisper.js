const axios = require('axios')
const FormData = require('form-data')

async function transcribe(stream, lang) {
    const data = new FormData()
    //data.append('type', type)
    data.append('audio_file', stream)
    let url = process.env.WHISPER_API_URL + '/asr?task=transcribe&output=txt'
    if (lang) url += '&language='+lang
    try {
        const response = await axios.post(url, data, {
            headers: data.getHeaders()
        })
        return response.data
    } catch (e) {
        console.error('[Whisper] cannot transcribe voice', e.message)
        return null
    }
}

module.exports = (app) => {
    app.post('/whisper/transcribe', async (req, res) => {
        try {
            res.send(await transcribe(req, req.query['language']))
        } catch (e) {
            res.status(500).send(e.message)
        }
    })

    return {
        transcribe: transcribe
    }
}