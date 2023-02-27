const express = require('express')
const swaggerUi = require("swagger-ui-express")
const YAML = require('yamljs')
const cors = require('cors')
const bodyParser = require('body-parser')
const requestIp = require('request-ip')
const services = require('./modules/services.js')
const telegram = require('./modules/telegram.js')

const app = express()

app.use(requestIp.mw())
app.use(bodyParser.json())
app.use(cors({origin: '*'}))
app.use(`/docs`, swaggerUi.serve, swaggerUi.setup(YAML.load('swagger.yaml')))

const port = process.env.PORT || 8000
app.listen(port, async () => {
    telegram(app, await services(app))
    console.log(`Server is listening on ${port}`)
})