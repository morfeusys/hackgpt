const axios = require('axios')
const FormData = require('form-data')

module.exports = {
    transcribe: async (stream, lang) => {
        const data = new FormData()
        data.append('type', 'audio/ogg')
        data.append('audio_file', stream)
        let url = process.env.WHISPER_API_URL + '/asr?task=transcribe&output=txt'
        if (lang) url += '&language='+lang
        try {
            const response = await axios.post(url, data, {
                headers: data.getHeaders()
            })
            return response.data
        } catch (e) {
            console.error('Cannot transcribe voice', e.message)
            return null
        }
    }
}