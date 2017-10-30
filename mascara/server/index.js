const path = require('path')
// const readDir = require('recursive-readdir')
const fs = require('fs')
const readdirp = require('readdirp')
const es = require('event-stream')
const crypto = require('crypto')
const concat = require('concat-stream')

const express = require('express')
const createBundle = require('./util').createBundle
const serveBundle = require('./util').serveBundle

module.exports = createMetamascaraServer


function createMetamascaraServer () {

  const chromeDistPath = path.join(__dirname, '/../../dist/chrome')

  // start bundlers
  const metamascaraBundle = createBundle(path.join(__dirname, '/../src/mascara.js'))
  const proxyBundle = createBundle(path.join(__dirname, '/../src/proxy.js'))
  const uiBundle = createBundle(path.join(__dirname, '/../src/ui.js'))
  const backgroundBuild = createBundle(path.join(__dirname, '/../src/background.js'))

  // serve bundles
  const server = express()

  // cdn seed manifest
  // readDir(chromeDistPath, (err, files) => {
  //   if (err) throw err
  //   console.log(files)
  // })
  let manifest = null
  var stream = readdirp({ root: chromeDistPath })
  stream
  .on('warn', function (err) {
    console.error('non-fatal error', err);
    // optionally call stream.destroy() here in order to abort and cause 'close' to be emitted
  })
  .on('error', function (err) { console.error('fatal error', err); })
  .pipe(es.mapSync((entry) => {
    // console.log('progress', entry)
    const fileContent = fs.readFileSync(entry.fullPath)
    return {
      url: `https://cdn-seed.metamask.io/${entry.path}`,
      byteSize: entry.stat.size,
      md5:  crypto.createHash('md5').update(fileContent).digest('base64'),
    }
  }))
  .on('error', function (err) { console.error('fatal error', err); })
  .pipe(concat(manifestIsDone))

  function manifestIsDone(assets) {
    // console.log(assets)
    manifest = 'TsvHttpData-1.0' + assets.map(asset => `\n${asset.url}\t${asset.byteSize}\t${asset.md5}`)
    console.log('manifest ready')
  }

  server.get('/manifest.tsv', (req, res, next) => {
    console.log('requesting manifest... ready?', !!manifest)
    res.send(manifest)
  })

  // ui window
  serveBundle(server, '/ui.js', uiBundle)
  server.use(express.static(path.join(__dirname, '/../ui/'), { setHeaders: (res) => res.set('X-Frame-Options', 'DENY') }))
  server.use(express.static(chromeDistPath))
  // metamascara
  serveBundle(server, '/metamascara.js', metamascaraBundle)
  // proxy
  serveBundle(server, '/proxy/proxy.js', proxyBundle)
  server.use('/proxy/', express.static(path.join(__dirname, '/../proxy')))
  // background
  serveBundle(server, '/background.js', backgroundBuild)

  return server

}
