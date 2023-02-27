const axios = require('axios')
const image = require('./image.js')

module.exports = (app) => {

    async function interrogate(stream) {
        const base64 = await image.toBase64(stream)
        const resp = await axios.post(`${process.env.SD_API_URL}/interrogate`, {
            image: base64,
            model: 'clip'
        })
        let caption = resp.data['caption']
        if (!caption) {
            throw new Error('cannot generate prompt')
        }
        return caption.replace('<error>', '')
    }

    return {
        interrogate: interrogate
    }
}