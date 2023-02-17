const express = require('express')
const bodyParser = require('body-parser')
const chatgpt = require('./modules/chatgpt.js')
const telegram = require('./modules/telegram.js')
const midjourney = require('./modules/midjourney.js')
const whisper = require('./modules/whisper.js')

const app = express();
app.use(bodyParser.json());

const port = process.env.PORT || 8000
app.listen(port, async () => {
    console.log(`Server is listening on ${port}`)
    telegram(app, await chatgpt(app), await midjourney(app), whisper)
})