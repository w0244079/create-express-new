import { exec } from 'node:child_process'
import net from 'node:net'
import kill from 'tree-kill'
import * as utils from './utils.js'

export default class AppRunner {
  constructor (dir) {
    this.child = null
    this.dir = dir
    this.host = '127.0.0.1'
    this.port = 3000
  }

  address () {
    return { address: this.host, port: this.port }
  }

  start (callback) {
    let done = false
    const env = utils.childEnvironment()

    env.PORT = String(this.port)

    this.child = exec('npm start', {
      cwd: this.dir,
      env
    })

    this.child.stderr.pipe(process.stderr, { end: false })

    this.child.on('exit', (code) => {
      this.child = null

      if (!done) {
        done = true
        callback(new Error('Unexpected app exit with code ' + code))
      }
    })

    const tryConnect = () => {
      if (done || !this.child) return

      const socket = net.connect(this.port, this.host)

      socket.on('connect', () => {
        socket.end()

        if (!done) {
          done = true
          callback(null)
        }
      })

      socket.on('error', (err) => {
        socket.destroy()

        if (err.syscall !== 'connect') {
          return callback(err)
        }

        setImmediate(tryConnect)
      })
    }

    setImmediate(tryConnect)
  }

  stop (callback) {
    if (!this.child) {
      setImmediate(callback)
      return
    }

    this.child.stderr.unpipe()
    this.child.removeAllListeners('exit')

    kill(this.child.pid, 'SIGTERM', callback)

    this.child = null
  }
}
