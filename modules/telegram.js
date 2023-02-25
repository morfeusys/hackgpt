const redis = require('./redis.js')
const TelegramBot = require('node-telegram-bot-api')

const token = process.env.TELEGRAM_BOT_TOKEN
const externalUrl = process.env.EXTERNAL_URL
const imagineCommand = '/imagine'
const chatGPTCommand = '/chatgpt'

module.exports = async (app, services) => {
    const sessions = await redis('telegram-session')
    const jobMessages = await redis('telegram-image-job')
    const images = await redis('telegram-image')

    const bot = new TelegramBot(token, {
        polling: !externalUrl
    })

    if (externalUrl) {
        app.post('/telegram', async (req, res) => {
            bot.processUpdate(req.body)
            res.sendStatus(200);
        })
        bot.setWebHook(`${externalUrl}/telegram`);
    } else {
        bot.deleteWebHook()
    }

    services.midjourney.onJobComplete(async (job) => {
        if (!job.images || !job.images.length) return
        const image = job.images[job.images.length - 1]
        const messages = await jobMessages.get(job.id)
        if (!messages || !messages.length) {
            return
        }

        let message = messages.shift()
        jobMessages.set(job.id, messages)

        if (image.error) {
            await bot.deleteMessage(message.chatId, message.id)
            bot.sendMessage(message.chatId, `⚠️ Oops! I cannot create an image for _"${job.prompt}"_\n\n${image.error}`, {
                parse_mode: 'Markdown'
            })
            return
        }

        const markup = {
            inline_keyboard: image.actions.map(row => {
                return row.map(a => {
                    let btn = {text: a.label}
                    if (a.id) btn.callback_data = a.id.replace('MJ::JOB::', '')
                    if (a.url) btn.url = a.url
                    return btn
                })
            })
        }

        if (markup.inline_keyboard.length === 1) {
            markup.inline_keyboard = markup.inline_keyboard[0].map(btn => [btn])
        }

        if (image.upscaled) {
            markup.inline_keyboard.push([{text: 'Open full image', url: image.url}])
        }

        images.set(message.id, image.id)
        try {
            await bot.editMessageMedia( {
                type: 'photo',
                media: image.url,
                caption: job.prompt,
            }, {
                chat_id: message.chatId,
                message_id: message.id,
                reply_markup: JSON.stringify(markup)
            })
        } catch (e) {
            await bot.deleteMessage(message.chatId, message.id)
            bot.sendMessage(message.chatId, `[Here is your image](${image.url}) for _"${job.prompt}"_`, {
                parse_mode: 'Markdown',
                reply_markup: JSON.stringify(markup)
            })
        }
    })

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id
        if (msg.text === '/start') {
            await bot.sendMessage(chatId, 'Hello! I am here to help you somehow...\n\n' +
                'Send me a text message to talk to GPT. And use /reset once you\'d like to restart a conversation.\n\n' +
                'Send /chatgpt yourprompt to talk with chatGPT. Note that it is rate limited.\n\n' +
                'Send /imagine command to generate a beautiful Midjorney image.\n\n' +
                'Send a voice note to recognise it through Whisper.'
            )
            await bot.sendMessage(chatId, 'That is all I can, sorry...')
        } else if (msg.text === '/reset') {
            sessions.del(chatId)
            bot.sendMessage(chatId, restartMessages[Math.floor(Math.random() * restartMessages.length)])
        } else {
            process(msg)
        }
    })

    bot.on('callback_query', async (query) => {
        bot.answerCallbackQuery(query.id)
        if (query.data.startsWith('send:')) {
            send(query.message, query.data.substring(5))
        } else if (query.message.text === 'Select a language to transcribe') {
            transcribe(query.message.reply_to_message, query.data)
        } else {
            processMidjourney(query.message, query.data)
        }
    })

    function sendWaitingMessage(chatId) {
        return bot.sendMessage(chatId, waitingMessages[Math.floor(Math.random() * waitingMessages.length)])
    }

    async function send(msg, to) {
        if (to === 'gpt') {
            processGPT(msg, 'gpt')
        }
        if (to === 'chatgpt') {
            processGPT(msg, 'chatgpt')
        }
        if (to === 'midjourney') {
            processMidjourney(msg)
        }
    }

    function process(msg) {
        if (msg.text && msg.text.startsWith(imagineCommand)) {
            processMidjourney(msg)
        } else if (msg.voice) {
            processWhisper(msg)
        } else if (msg.text) {
            processGPT(msg)
        }
    }

    async function processWhisper(msg) {
        bot.sendMessage(msg.chat.id, 'Select a language to transcribe', {
            reply_to_message_id: msg.message_id,
            reply_markup: JSON.stringify({
                inline_keyboard: [[{text: 'Auto', callback_data: 'auto'}, {text: 'en', callback_data: 'en'}, {text: 'ru', callback_data: 'ru'}]]
            })
        })
    }

    async function transcribe(msg, lang) {
        const chatId = msg.chat.id
        const waitMessage = await sendWaitingMessage(chatId)
        const stream = await bot.getFileStream(msg.voice.file_id)
        const result = await services.whisper.transcribe(stream, lang === 'auto' ? null : lang)
        await bot.deleteMessage(chatId, waitMessage.message_id)
        if (result) {
            bot.sendMessage(chatId, result, {
                reply_to_message_id: msg.message_id,
                reply_markup: JSON.stringify({
                    inline_keyboard: [[
                        {text: 'To GPT', callback_data: 'send:gpt'},
                        {text: 'To Midjourney', callback_data: 'send:midjourney'}
                    ]]
                })
            })
        } else {
            bot.sendMessage(chatId, '😢 Sorry, but I cannot transcribe this voice note...', {
                reply_to_message_id: msg.message_id
            })
        }
    }

    async function processGPT(msg, type) {
        type = type || (msg.text.startsWith(chatGPTCommand) ? 'chatgpt' : 'gpt')
        const request = msg.text.startsWith(chatGPTCommand) ? msg.text.substring(chatGPTCommand.length).trim() : msg.text
        const chatId = msg.chat.id
        if (!request) {
            bot.sendMessage(chatId, `Usage: ${chatGPTCommand} yourpromtgoeshere`)
            return
        }
        const waitingMessage = await sendWaitingMessage(chatId)
        const session = await sessions.get(chatId) || {}
        const form = {reply_to_message_id: msg.message_id}
        try {
            const conversationId = session[type] ? session[type].conversationId : null
            const result = await services[type].conversation(request, conversationId)
            if (!conversationId) {
                session[type] = {conversationId: result.conversationId}
                sessions.set(chatId, session)
            }
            bot.sendMessage(chatId, result.response, Object.assign(form))
        } catch (e) {
            const err = e.response ? e.response.data.error.message : e.message
            console.error(`[Telegram] ${err}`)
            try {
                bot.sendMessage(chatId, `⚠️ ${err}`, form)
            } catch (e) {
                console.error(`Cannot process GPT text "${msg.text}"`, e.message)
                bot.sendMessage(chatId, '⚠️ Sorry, there is some error inside me...', form)
            }
        } finally {
            bot.deleteMessage(chatId, waitingMessage.message_id)
        }
    }

    async function processMidjourney(msg, actionId) {
        const chatId = msg.chat.id
        let job
        if (msg.text) {
            const prompt = msg.text.startsWith(imagineCommand) ? msg.text.substring(imagineCommand.length).trim() : msg.text
            if (!prompt) {
                bot.sendMessage(chatId, 'Use /imagine as described [here](https://docs.midjourney.com/docs/prompts)', {parse_mode: 'Markdown'})
                return
            } else {
                job = await services.midjourney.runJob({prompt: prompt})
            }
        } else if (actionId) {
            const imageId = await images.get(msg.message_id)
            if (imageId) {
                job = await services.midjourney.runAction(imageId, `MJ::JOB::${actionId}`)
            }
        }

        if (job) {
            const image = await bot.sendAnimation(chatId, paintingAnimations[Math.floor(Math.random() * paintingAnimations.length)], {
                caption: paintingMessages[Math.floor(Math.random() * paintingMessages.length)]
            })
            const messages = await jobMessages.get(job.id) || []
            messages.push({
                id: image.message_id,
                chatId: chatId
            })
            jobMessages.set(job.id, messages)
        } else {
            bot.sendMessage(chatId, '😱 Oh no! I cannot create such image for some reason...', {
                reply_to_message_id: msg.message_id
            })
        }
    }
}

const waitingMessages = [
    'Just a sec... or two, or three... 🤔',
    'Please wait while I work my magic... or Google it 🧙‍♂️🔍',
    'Hang on tight... or just go take a coffee 💪☕️',
    'One moment please... or the next hour 🕑🕒🕓',
    'Let me check that for you... or just pretend I did 🔍👀',
    'Please hold... or go play with your cat 🤲🐱',
    'Calculating... or just making some random numbers 🔢🤔',
    'Processing... or just scrolling Twitter 🖥️🐦',
    'Searching... or just checking my horoscope 🔍🔮',
    'Analyzing... or just watching cat videos 🧠😹',
    'Thinking... or just daydreaming 🤔🌈',
    'Brainstorming... or just people watching 💡🧐',
    'Meditating... or just napping 🧘‍♀️💤',
    'Considering... or just procrastinating 🤔🕰️',
    'Evaluating... or just making a guess 📈🤔',
    'Mulling it over... or just enjoying the silence 🤔😌',
    'Weighing the options... or just going with the flow 🤔🌊',
    'Making a decision... or just flipping a coin 🤔💰',
    'Contemplating... or just checking my phone 🤔📱',
    'Taking a break... or just watching a funny video 💤😆',
    "Your request is being processed faster than a cheetah on steroids 😎",
    "Hold tight, your request is cooking in the oven 🔥",
    "Your request is being taken care of like a baby 🤱",
    "Don't worry, your request is in the best hands 🤝",
    "Your request is getting handled like a priority 📢",
    "Just a few more minutes and your request will be handled 🤗",
    "I'm working hard to get your request done quickly 💪",
    "Hang on tight, I'm almost finished with your request 🙌",
    "Don't worry, your request is in the best hands of mine 🤝",
    "Get ready for a speedy response to your request from me 🚀",
    "It won't take long, I'm giving this request my full attention 👀",
    "You can count on me to deliver your request on time 🕰",
    "I'm handling your request with utmost care 🤗",
    "Hold tight, your request is cooking in the oven under my watchful eye 🔥"
]

const restartMessages = [
    "Let's restart the conversation! 😃",
    "Ready to chat again! 💬",
    "Another round of chatting? Sure! 🙌",
    "Starting over, here we go! 🚀",
    "Let's give it another go! 💪",
    "Starting fresh, bring it on! 🔥",
    "Let's chat again! 😊",
    "Ready for more talking! 💬",
    "Bringing the conversation back to life! 💥",
    "Let's start anew! 💫",
    "Reviving the conversation! 🙏",
    "Ready for another chat session! 💬",
    "Starting over, let's do this! 💪",
    "Bringing back the chat! 🔜",
    "Another round of talking? Absolutely! 💯",
    "Let's start a new dialogue! 💬",
    "Bringing the conversation back to the top! 🔝",
    "Starting over, no problem! 💁‍♀️",
    "Here we go again, let's chat! 💬"
]

const paintingMessages = [
    "Brushin' up on my painting skills 🎨😆",
    "Canvas, meet paint 🖌️😜",
    "It's time to make a masterpiece 🎨🤩",
    "Ready, set, splatter! 🖌️💥",
    "Putting the 'art' in 'start' 🎨💪",
    "Here we go, painting like a pro! 🎨🎉",
    "Colors, I choose you! 🎨👊",
    "Let the creativity flow 🎨🌊",
    "Picture perfect, here I come! 🖌️😎",
    "Putting the brush to the test 🎨💯",
    "Dipping my brush in inspiration 🎨🌈",
    "Lets make a canvas sing 🎨🎶",
    "The paint and I, a match made in heaven 🎨😇",
    "Here's to a colorful creation 🎨🌈",
    "Making the blank canvas come to life 🎨👩‍🎨",
    "Let's turn this canvas into a story 🎨📚",
    "Putting my heart and soul on the canvas 🎨❤️",
    "The paintbrush is my magic wand 🎨🧙‍♀️",
    "Making every stroke count 🎨✍️",
    "The canvas is my playground 🎨🤸‍♀️"
]

const paintingAnimations = [
    'https://i.imgur.com/yO7Itca.gif'
]