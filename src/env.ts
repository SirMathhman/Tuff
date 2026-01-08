export type Env = Map<string, unknown> | { [k: string]: unknown };

// Type guard to check if a value is an Env (Map or plain object)
export function isEnv(v: unknown): v is Env {
  if (v instanceof Map) return true;
  if (typeof v !== "object" || v === undefined) return false;
  // This is an object; it qualifies as an Env by our type definition
  return true;
}

type PropertyKeyed = { [k: string]: unknown } & { [k: symbol]: unknown };

// Helper to check if object has a symbol property (for Proxy handlers)
function getSymbolProp(obj: object, prop: symbol): unknown {
  // eslint-disable-next-line no-restricted-syntax
  return (obj as PropertyKeyed)[prop];
}

// Helper to set value on object with string key
function setStringProp(obj: object, key: string, value: unknown): void {
  // eslint-disable-next-line no-restricted-syntax
  (obj as PropertyKeyed)[key] = value;
}

// Helper to get value from object with string key
function getStringProp(obj: object, key: string): unknown {
  // eslint-disable-next-line no-restricted-syntax
  return (obj as PropertyKeyed)[key];
}

// Helper to delete string key from object
function deleteStringProp(obj: object, key: string): void {
  // eslint-disable-next-line no-restricted-syntax
  delete (obj as PropertyKeyed)[key];
}

function makeProxyFromMap(m: Map<string, unknown>) {
  const proxyTarget = {};
  return new Proxy(proxyTarget, {
    get(_, prop: string | symbol) {
      if (typeof prop === "symbol") return getSymbolProp(m, prop);
      if (prop === "__isEnvProxy") return true;
      if (prop === "__isMapProxy") return true;
      if (m.has(prop)) return m.get(prop);
      // expose Map methods to allow direct map usage
      const mapMethod = getStringProp(m, prop);
      if (typeof mapMethod === "function")
        // eslint-disable-next-line no-restricted-syntax
        return (mapMethod as (..._args: unknown[]) => unknown).bind(m);
      return undefined;
    },

    set(_, prop: string | symbol, value: unknown) {
      if (typeof prop === "symbol") return Reflect.set(_, prop, value);
      m.set(String(prop), value);
      return true;
    },
    has(_, prop: string | symbol) {
      if (typeof prop === "symbol") return Reflect.has(_, prop);
      return m.has(String(prop));
    },
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

function makeProxyFromObject(obj: { [k: string]: unknown }) {
  const proxyTarget = {};
  return new Proxy(proxyTarget, {
    get(_, prop: string | symbol) {
      if (typeof prop === "symbol") return getSymbolProp(obj, prop);
      if (prop === "__isEnvProxy") return true;
      if (prop === "__isMapProxy") return false;
      if (Object.prototype.hasOwnProperty.call(obj, prop)) return obj[prop];
      // provide Map-like helpers bound to object semantics
      if (prop === "get") return (k: string) => obj[k];
      if (prop === "set") return (k: string, v: unknown) => (obj[k] = v);
      if (prop === "has")
        return (k: string) => Object.prototype.hasOwnProperty.call(obj, k);
      if (prop === "entries")
        return () => Object.entries(obj)[Symbol.iterator]();
      return undefined;
    },

    set(_, prop: string | symbol, value: unknown) {
      if (typeof prop === "symbol") return Reflect.set(_, prop, value);
      obj[String(prop)] = value;
      return true;
    },
    has(_, prop: string | symbol) {
      if (typeof prop === "symbol") return Reflect.has(_, prop);
      return Object.prototype.hasOwnProperty.call(obj, String(prop));
    },
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
  input?: { [k: string]: unknown } | Map<string, unknown>
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
    const m = new Map<string, unknown>();
    for (const [k, v] of envEntries(e)) m.set(k, v);
    return makeProxyFromMap(m);
  }

  const obj: { [k: string]: unknown } = {};
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

export function envGet(e: Env, k: string): unknown {
  if (isMapProxy(e)) {
    const getMethod = getStringProp(e, "get");
    if (typeof getMethod === "function") return getMethod(k);
  }
  return getStringProp(e, k);
}

export function envSet(e: Env, k: string, v: unknown): void {
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

export function envEntries(e: Env): IterableIterator<[string, unknown]> {
  if (isMapProxy(e)) {
    const entriesMethod = getStringProp(e, "entries");
    if (typeof entriesMethod === "function") return entriesMethod();
  }
  // eslint-disable-next-line no-restricted-syntax
  return Object.entries(e)[Symbol.iterator]() as IterableIterator<
    [string, unknown]
  >;
}

export function envToThisObject(e: Env): { [k: string]: unknown } {
  const obj: { [k: string]: unknown } = {};
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
