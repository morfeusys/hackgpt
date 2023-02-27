const axios = require('axios')
const FormData = require('form-data')
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

module.exports = {
    toBase64: toBase64,
    getLink: async (stream) => {
        const base64 = await toBase64(stream)
        const data = new FormData()
        data.append('image', base64)
        const resp = await axios.post('https://api.imgur.com/3/image', data, {
            headers: Object.assign({
                'Authorization': `Client-ID ${process.env.IMGUR_CLIENT_ID}`
            }, data.getHeaders())
        })
        return resp.data['success'] === true ? resp.data['data']['link'] : null
    }
}