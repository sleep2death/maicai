import express from 'express'
import { resolve } from 'path'
import { createClient } from 'redis'
;(async () => {
  let client = null
  if (process.env.redis) {
    client = createClient({ url: process.env.redis })
  } else {
    client = createClient()
  }
  client.on('error', (err) => console.log('Redis Client Error', err))
  await client.connect()
  const app = express()

  app.set('views', resolve('views')) // pug views dir
  app.set('view engine', 'pug') // pug renderer
  app.use(express.static(resolve('public'))) // public files

  app.get('/', (req, res) => {
    res.render('index', { from: req.query.from })
  })

  app.get('/manage/:number', manage(client))

  const server = app.listen(3000, () => {
    console.log(`The application started on port ${server.address().port}`)
  })
})()

const phoneReg = /^1(3\d|4[5-9]|5[0-35-9]|6[2567]|7[0-8]|8\d|9[0-35-9])\d{8}$/
// 组织团购
function manage(client) {
  return async (req, res) => {
    const n = req.params.number
    const r = n.match(phoneReg)
    if (!r) {
      res.render('error', {
        title: '无效号码',
        headMessage: `无效手机号码:<br>"${n}"<br>请点击"返回"重试`,
        redirect: '/?from=manage&reason=error',
      })
    }

    const exists = await client.EXISTS(`phone:${n}`)
    if (!exists) {
      res.render('new-table', { phone: n })
    }
    // res.send(req.params.number + ' exists: ' + exists)
  }
}
