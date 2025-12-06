const assert = require('assert').strict
const { interpret } = require('../src/interpret')

try {
  interpret('hello')
  throw new Error('expected interpret to throw')
} catch (err) {
  assert(err instanceof Error)
  assert.equal(err.message, 'interpret: stub not implemented')
}

module.exports = {}
