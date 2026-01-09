import type { RuntimeValue } from "./types";

export type PlainEnv = {
  [k: string]: RuntimeValue;
};

export type Env = Map<string, RuntimeValue> | PlainEnv;

// Type guard to check if a value is an Env (Map or plain object)
export function isEnv(v: RuntimeValue): v is Env {
  if (v instanceof Map) return true;
  if (typeof v !== "object" || v === undefined) return false;
  // This is an object; it qualifies as an Env by our type definition
  return true;
}

// Helper to check if object has a symbol property (for Proxy handlers)
// Uses Reflect API to avoid type assertions
function getSymbolProp(obj: object, prop: symbol): RuntimeValue {
  return Reflect.get(obj, prop);
}

// Common prefix handling for proxy `get` implementations - centralizes
// repeated checks for symbols and env flags to reduce duplication.
function commonGetPrefix(
  container: object,
  prop: string | symbol,
  isMap: boolean
): RuntimeValue {
  if (typeof prop === "symbol") return getSymbolProp(container, prop);
  if (prop === "__isEnvProxy") return true;
  if (prop === "__isMapProxy") return isMap;
  return undefined;
}

// Specialized handler factories to reduce duplication between Map-backed and
// object-backed proxy implementations without introducing `any` or casts.
function makeSetHandler(setFn: (k: string, v: RuntimeValue) => void) {
  return function (_: object, prop: string | symbol, value: RuntimeValue) {
    if (typeof prop === "symbol") return Reflect.set(_, prop, value);
    setFn(String(prop), value);
    return true;
  };
}

function makeHasHandler(hasFn: (k: string) => boolean) {
  return function (_: object, prop: string | symbol) {
    if (typeof prop === "symbol") return Reflect.has(_, prop);
    return hasFn(String(prop));
  };
}

function makeSetHandlerForMap(m: Map<string, unknown>) {
  return makeSetHandler((k, v) => m.set(k, v));
}

function makeSetHandlerForObj(obj: PlainEnv) {
  return makeSetHandler((k, v) => (obj[k] = v));
}

function makeHasHandlerForMap(m: Map<string, unknown>) {
  return makeHasHandler((k) => m.has(k));
}

function makeHasHandlerForObj(obj: PlainEnv) {
  return makeHasHandler((k) => Object.prototype.hasOwnProperty.call(obj, k));
}

// Helper to set value on object with string key using Reflect API
function setStringProp(obj: object, key: string, value: RuntimeValue): void {
  Reflect.set(obj, key, value);
}

// Helper to get value from object with string key using Reflect API
function getStringProp(obj: object, key: string): RuntimeValue {
  return Reflect.get(obj, key);
}

// Helper to delete string key from object using Reflect API
function deleteStringProp(obj: object, key: string): void {
  Reflect.deleteProperty(obj, key);
}

function makeProxyFromMap(m: Map<string, RuntimeValue>) {
  const proxyTarget = {};
  return new Proxy(proxyTarget, {
    get(_, prop: string | symbol) {
      const pfx = commonGetPrefix(m, prop, true);
      if (pfx !== undefined) return pfx;
      if (typeof prop === "string") {
        if (m.has(prop)) return m.get(prop);
        // expose Map methods to allow direct map usage
        const mapMethod = getStringProp(m, prop);
        if (typeof mapMethod === "function") {
          // Use Reflect.apply via a wrapper to bind to the map
          return (...args: RuntimeValue[]) => Reflect.apply(mapMethod, m, args);
        }
      }
      return undefined;
    },

    set: makeSetHandlerForMap(m),
    has: makeHasHandlerForMap(m),
    ownKeys() {
      return Array.from(m.keys());
    },
    getOwnPropertyDescriptor(_, prop: string | symbol) {
      if (typeof prop === "symbol") return undefined;
      if (m.has(String(prop)))
        return {
          configurable: true,
          enumerable: true,
          writable: true,
          value: m.get(String(prop)),
        };
      return undefined;
    },
  });
}

function makeProxyFromObject(obj: PlainEnv) {
  const proxyTarget = {};
  return new Proxy(proxyTarget, {
    get(_, prop: string | symbol) {
      const pfx = commonGetPrefix(obj, prop, false);
      if (pfx !== undefined) return pfx;
      if (typeof prop === "string") {
        if (Object.prototype.hasOwnProperty.call(obj, prop)) return obj[prop];
        // provide Map-like helpers bound to object semantics
        if (prop === "get") return (k: string) => obj[k];
        if (prop === "set") return (k: string, v: RuntimeValue) => (obj[k] = v);
        if (prop === "has")
          return (k: string) => Object.prototype.hasOwnProperty.call(obj, k);
        if (prop === "entries")
          return () => Object.entries(obj)[Symbol.iterator]();
      }
      return undefined;
    },

    set: makeSetHandlerForObj(obj),
    has: makeHasHandlerForObj(obj),
    ownKeys() {
      return Object.keys(obj);
    },
    getOwnPropertyDescriptor(_, prop: string | symbol) {
      if (typeof prop === "symbol") return undefined;
      if (Object.prototype.hasOwnProperty.call(obj, String(prop)))
        return {
          configurable: true,
          enumerable: true,
          writable: true,
          value: obj[String(prop)],
        };
      return undefined;
    },
  });
}

function isMapProxy(e: Env): boolean {
  return "__isMapProxy" in e && e.__isMapProxy === true;
}

export function ensureMapEnv(
  input?: PlainEnv | Map<string, RuntimeValue>
): Env {
  if (!input) return makeProxyFromObject({});
  if (input instanceof Map) return makeProxyFromMap(new Map(input));
  // given a plain object, wrap it so mutations reflect back onto it
  return makeProxyFromObject(input);
}

export function envClone(e: Env): Env {
  // Clone via iteration to support both map-backed and object-backed proxies.
  const mapFlag = isMapProxy(e);
  if (mapFlag) {
    const m = new Map<string, RuntimeValue>();
    for (const [k, v] of envEntries(e)) m.set(k, v);
    return makeProxyFromMap(m);
  }

  const obj: PlainEnv = {};
  for (const k of Object.keys(e)) obj[k] = getStringProp(e, k);
  return makeProxyFromObject(obj);
}

export function envHas(e: Env, k: string): boolean {
  if (isMapProxy(e)) {
    const hasMethod = getStringProp(e, "has");
    if (typeof hasMethod === "function") return hasMethod(k);
  }
  return Object.prototype.hasOwnProperty.call(e, k);
}

export function envGet(e: Env, k: string): RuntimeValue {
  if (isMapProxy(e)) {
    const getMethod = getStringProp(e, "get");
    if (typeof getMethod === "function") return getMethod(k);
  }
  return getStringProp(e, k);
}

export function envSet(e: Env, k: string, v: RuntimeValue): void {
  if (isMapProxy(e)) {
    const setMethod = getStringProp(e, "set");
    if (typeof setMethod === "function") {
      setMethod(k, v);
      return;
    }
  }
  setStringProp(e, k, v);
}

export function envDelete(e: Env, k: string): void {
  if (isMapProxy(e)) {
    const deleteMethod = getStringProp(e, "delete");
    if (typeof deleteMethod === "function") {
      deleteMethod(k);
      return;
    }
  }
  deleteStringProp(e, k);
}

export function envEntries(e: Env): IterableIterator<[string, RuntimeValue]> {
  if (isMapProxy(e)) {
    const entriesMethod = getStringProp(e, "entries");
    if (typeof entriesMethod === "function") return entriesMethod();
  }
  // Return a generator that iterates over Object.entries to satisfy the
  // IterableIterator<[string, RuntimeValue]> return type without type assertions.
  return (function* () {
    for (const entry of Object.entries(e)) {
      yield entry as [string, RuntimeValue]; // eslint-disable-line no-restricted-syntax
    }
  })();
}

export function envToThisObject(e: Env): PlainEnv {
  const obj: PlainEnv = {};
  const iter = envEntries(e);
  for (const [k, v] of iter) {
    if (k === "this" || k.startsWith("__")) continue;
    if (
      typeof v === "object" &&
      v != undefined &&
      Object.prototype.hasOwnProperty.call(v, "value") &&
      "value" in v &&
      v.value !== undefined
    ) {
      obj[k] = v.value;
    } else {
      obj[k] = v;
    }
  }
  return obj;
}
