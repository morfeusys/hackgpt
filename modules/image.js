const axios = require('axios')
const concat = require('concat-stream')
const { Base64Encode } = require('base64-stream')

function toBase64(stream) {
    return new Promise((resolve, reject) => {
        const base64 = new Base64Encode()

        const cbConcat = (base64) => {
            resolve(base64)
        }

        stream
            .pipe(base64)
            .pipe(concat(cbConcat))
            .on('error', (error) => {
                reject(error)
            })
    })
}

function fromBase64(base64) {
    return Buffer.from(base64, 'base64')
}

module.exports = {
    toBase64: toBase64,
    fromBase64: fromBase64,
    getLink: async (stream) => {
        const resp = await axios.post('https://api.imgur.com/3/image', stream, {
            headers: Object.assign({
                'Authorization': `Client-ID ${process.env.IMGUR_CLIENT_ID}`
            })
        })
        return resp.data['success'] === true ? resp.data['data']['link'] : null
    }
}