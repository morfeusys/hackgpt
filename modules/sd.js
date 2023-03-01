const axios = require('axios')
const image = require('./image.js')

module.exports = (app) => {

    async function interrogate(stream) {
        const base64 = await image.toBase64(stream)
        const resp = await axios.post(`${process.env.SD_API_URL}/sdapi/v1/interrogate`, {
            image: base64,
            model: 'clip'
        })
        let caption = resp.data['caption']
        if (!caption) {
            throw new Error('cannot generate prompt')
        }
        return caption.replace('<error>', '')
    }

    async function generate(endpoint, req, res) {
        try {
            const result = await axios.post(`${process.env.SD_API_URL}/${endpoint}`, req.body)
            if (result.data['images'] && result.data['images'].length) {
                const data = image.fromBase64(result.data['images'][0])
                res.writeHead(200, {
                    'Content-Type': 'image/png',
                    'Content-Length': data.length
                })
                res.end(data)
            } else {
                res.status(500).send(result.data)
            }
        } catch (e) {
            res.status(500).send(e.message)
        }
    }

    app.post('/sd/interrogate', async (req, res) => {
        try {
            const prompt = await interrogate(req)
            res.send(prompt)
        } catch (e) {
            res.status(500).send(e.message)
        }
    })

    app.post('/sd/txt2img', async (req, res) => {
        generate('sdapi/v1/txt2img', req, res)
    })

    app.post('/sd/img2img', async (req, res) => {
        generate('sdapi/v1/img2img', req, res)
    })

    app.post('/sd/controlnet/txt2img', async (req, res) => {
        generate('controlnet/txt2img', req, res)
    })

    app.post('/sd/controlnet/img2img', async (req, res) => {
        generate('controlnet/img2img', req, res)
    })

    return {
        interrogate: interrogate
    }
}