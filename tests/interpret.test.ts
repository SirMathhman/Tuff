const { expect: chaiExpect } = require('chai')
const { interpret: interpretFn } = require('../src/interpret')

describe('interpret', function () {
  it('throws a stub error', function () {
    chaiExpect(() => interpretFn('hello')).to.throw('interpret: stub not implemented')
  })
})

module.exports = {}
