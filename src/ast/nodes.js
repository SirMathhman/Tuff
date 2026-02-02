"use strict";

function node(type, fields) {
  return { type, ...fields };
}

module.exports = {
  node,
};
