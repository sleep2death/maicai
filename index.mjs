import express from 'express'
import { resolve } from 'path'
import { createClient } from 'redis'
import { v4 as uuidv4 } from 'uuid'
import moment from 'moment'
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

  app.use(express.json())
  app.use(
    express.urlencoded({
      extended: false,
    })
  )

  app.get('/', (req, res) => {
    res.render('index', { from: req.query.from })
  })

  app.get('/new-table/:number', newTable(client))
  app.post('/save-table/:number', saveTable(client))
  app.get('/edit/:number', editTable(client))

  const server = app.listen(3000, () => {
    console.log(`The application started on port ${server.address().port}`)
  })
})()

const phoneReg = /^1(3\d|4[5-9]|5[0-35-9]|6[2567]|7[0-8]|8\d|9[0-35-9])\d{8}$/
// 组织团购
function newTable(client) {
  return async (req, res) => {
    const n = req.params.number
    const r = n.match(phoneReg)

    // create session
    const uuid = uuidv4()
    const session = `sess:${n}:${uuid}`
    await client.SET(`sess:${n}:${uuid}`, 'true')

    if (!r) {
      res.render('error', {
        title: '无效号码',
        headMessage: `无效手机号码:<br>"${n}"<br>请点击"返回"重试`,
        redirect: '/?from=new-table&reason=error',
      })
    }

    const exists = await client.EXISTS(`phone:${n}`)
    if (!exists) {
      res.render('new-table', { phone: n, session })
    }
    // res.send(req.params.number + ' exists: ' + exists)
  }
}

function saveTable(client) {
  return async (req, res) => {
    const n = req.params.number
    try {
      const session = req.body.session
      if (session && session !== '') {
        const exists = await client.EXISTS(session)
        console.log(session, exists)
        if (exists) {
          await client.DEL(session)
        } else {
          throw new Error('表单不存在')
        }
      } else {
        throw new Error('表单不存在')
      }

      const data = JSON.parse(req.body.data)
      const uuid = uuidv4()
      const randPin = getRandomPin('0123456789', 4)

      const keys = await client.KEYS(`uuid:${n}:*`)
      if (keys.length >= 99) {
        throw new Error('创建的团购数量超过上限')
      }

      const count = keys.length > 9 ? keys.length.toString() : '0' + keys.length
      const pwd = randPin + count

      const multi = client.multi()
      multi.SET(`uuid:${n}:${pwd}`, uuid)
      multi.json.SET(`table:${uuid}:data`, '.', data)
      multi.SET(`table:${uuid}:created`, moment().unix())

      const results = await multi.exec()

      for (let r of results) {
        if (r !== 'OK') {
          throw new Error('数据库错误', r)
        }
      }

      res.render('save-table', {
        title: '团购已保存!',
        phone: n,
        data: data,
        pwd,
      })
    } catch (e) {
      console.error(e)
      res.render('error', {
        title: '表单错误',
        headMessage: e.message + ', 请点击返回重试',
        redirect: `/new-table/${n}?data=${Buffer.from(req.body.data).toString(
          'base64'
        )}`,
      })
    }
  }
}

function editTable() {
  return async (req, res) => {
    const n = req.params.number
    res.render('edit-table', {
      title: '编辑团购',
      phone: n,
      pwd,
    })
  }
}

const getRandomPin = (chars, len) =>
  [...Array(len)]
    .map(() => chars[Math.floor(Math.random() * chars.length)])
    .join('')
