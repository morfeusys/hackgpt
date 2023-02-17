const fs = require('fs')
const readline = require('readline')
const redis = require('./redis.js')
const crypto = require('crypto')
const badWords = require('bad-words')
const { Client } = require('discord.js-selfbot-v13')

const midjourneyBotId = '936929561302675456'
const listeners = []
const errorMessages = ['Invalid', 'Banned']
const badWordsFilter = new badWords();

(async () => {
    const rl = readline.createInterface({
        input: fs.createReadStream('stopwords.txt'),
        crlfDelay: Infinity
    })
    for await (const line of rl) {
        badWordsFilter.addWords(line)
    }
})()


function getJobId(message) {
    const s = message.indexOf('#id:')
    const e = message.indexOf('#', s + 1)
    if (s !== -1 && e > s) {
        return message.substring(s + 4, e)
    }
}

function callJobListeners(job) {
    listeners.forEach(listener => listener(job))
}

async function startClient() {
    const jobs = await redis('midjourney-job')
    const queue = await redis('mj-task')

    let lastRun = 0
    let channel

    const client = new Client({checkUpdate: false})
    client.login(process.env.MJ_DISCORD_TOKEN)

    function findJob(message) {
        const id = getJobId(message)
        return jobs.get(id)
    }

    client.on('ready', async () => {
        console.log(`Discord ${client.user.username} is ready!`);
        channel = await client.channels.fetch(process.env.MJ_DISCORD_CHANNEL)

        setInterval( async () => {
            const now = new Date().getTime()
            if (now - lastRun > 5000) {
                const task = await queue.pop()
                if (task) {
                    lastRun = now
                    await runTask(task)
                }
            }
        }, 1000)
    })

    client.on('messageCreate', async (msg) => {
        if (msg.author &&  msg.author.id === midjourneyBotId && channel && msg.channelId === channel.id) {
            let job
            if (msg.content) {
                job = await findJob(msg.content)
            } else if (msg.embeds.length) {
                const title = msg.embeds[0].title
                if (title && errorMessages.find(m => title.startsWith(m))) {
                    job = await findJob(msg.embeds[0].footer.text)
                    if (job) {
                        job.images.push({
                            id: msg.id,
                            error: msg.embeds[0].description
                        })
                        jobs.set(job.id, job)
                        callJobListeners(job)
                    }
                }
            }

            let attachement = msg.attachments.size && msg.attachments.first()
            if (job && attachement) {
                console.log(`Midjourney done ${job.id} ${attachement.url}`)

                job.images.push({
                    id: msg.id,
                    url: attachement.url,
                    upscaled: msg.content.indexOf(' - Upscaled ') !== -1,
                    actions: msg.components.map(row => {
                        return row.components.filter(btn => btn.customId && btn.customId.indexOf('::RATING::') === -1).map(btn => {
                            return {label: btn.label || btn.emoji.name, id: btn.customId, type: btn.type, url: btn.url}
                        })
                    }).filter(row => row.length > 0)
                })

                let btn = msg.components[0].components.find(c => c.label === 'U1')
                if (job.upscale && btn) {
                    schedule({actionId: btn.customId, imageId: msg.id})
                }
                jobs.set(job.id, job)
                callJobListeners(job)
            }
        }
    })

    function schedule(task) {
        queue.push(task)
    }

    async function runTask(task) {
        if (task && channel) {
            console.log(`Running ${JSON.stringify(task)}`)
            if (task.prompt) {
                try {
                    await channel.sendSlash(midjourneyBotId, 'imagine', task.prompt)
                } catch (e) {
                    console.error(`Cannot run prompt "${task.prompt}"`, e)
                }
            } else if (task.actionId && task.imageId) {
                try {
                    const msg = await channel.messages.fetch(task.imageId)
                    await msg.clickButton(task.actionId)
                } catch (e) {
                    console.error(`Cannot run action ${task.actionId} on image ${task.imageId}`, e)
                }
            }
        }
    }

    return {
        onJobComplete: listener => listeners.push(listener),
        getJob: jobs.get,
        runAction: async (imageId, actionId) => {
            const msg = await channel.messages.fetch(imageId)
            const job = msg && await findJob(msg.content)
            if (job) {
                schedule({imageId: imageId, actionId: actionId})
                job.tasks += 1
                jobs.set(job.id, job)
            }
            return job
        },
        runJob: async (job) => {
            if (badWordsFilter.isProfane(job.prompt)) {
                return null
            }
            job = Object.assign(job, {id: crypto.randomBytes(10).toString('hex'), tasks: 1, images: []})
            job.prompt = job.prompt.replaceAll("—", '--')
            let cidx = job.prompt.indexOf('--')
            if (cidx === -1) cidx = job.prompt.length
            const prompt = job.prompt.substring(0, cidx) + `, #id:${job.id}# ` + job.prompt.substring(cidx)
            jobs.set(job.id, job)
            schedule({prompt: prompt})
            return job
        }
    }
}

module.exports = async (app) => {
    const client = await startClient()

    app.get('/midjourney/imagine', async (req, res) => {
        let prompt = req.query['prompt']
        let upscale = !!req.query['upscale']
        if (!prompt || !prompt.trim()) {
            res.sendStatus(400)
        } else {
            const job = await client.runJob({
                prompt: prompt,
                upscale: upscale
            })
            if (job) {
                res.send(job)
            } else {
                res.sendStatus(500)
            }
        }
    })

    app.get('/midjourney/action', async (req, res) => {
        let imageId = req.query['imageId']
        let actionId = req.query['actionId']
        if (!imageId || !actionId) {
            res.sendStatus(400)
        } else {
            const job = await client.runAction(imageId, actionId)
            if (job) {
                res.send(job)
            } else {
                res.sendStatus(500)
            }
        }
    })

    app.get('/midjourney/job', async (req, res) => {
        let id = req.query['id']
        if (!id || !id.trim()) {
            res.sendStatus(400)
        } else {
            let job = await client.getJob(id)
            if (job) {
                res.send(job)
            } else {
                res.sendStatus(404)
            }
        }
    })

    return client
}
