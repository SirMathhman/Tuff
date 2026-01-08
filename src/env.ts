export type Env = Map<string, unknown> | { [k: string]: unknown };

type PropertyKeyed = { [k: string]: unknown } & { [k: symbol]: unknown };

function makeProxyFromMap(m: Map<string, unknown>) {
  const proxyTarget = {};
  return new Proxy(proxyTarget, {
    get(_, prop: string | symbol) {
      if (typeof prop === "symbol")
        return (m as unknown as PropertyKeyed)[prop];
      if (prop === "__isEnvProxy") return true;
      if (prop === "__isMapProxy") return true;
      if (m.has(prop as string)) return m.get(prop as string);
      // expose Map methods to allow direct map usage
      const mapMethod = (m as unknown as PropertyKeyed)[prop];
      if (typeof mapMethod === "function")
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
      if (typeof prop === "symbol")
        return (obj as unknown as PropertyKeyed)[prop];
      if (prop === "__isEnvProxy") return true;
      if (prop === "__isMapProxy") return false;
      if (Object.prototype.hasOwnProperty.call(obj, prop as string))
        return obj[prop as string];
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

export function ensureMapEnv(
  input?: { [k: string]: unknown } | Map<string, unknown>
): Env {
  if (!input) return makeProxyFromObject({});
  if (input instanceof Map) return makeProxyFromMap(new Map(input));
  // given a plain object, wrap it so mutations reflect back onto it
  return makeProxyFromObject(input as { [k: string]: unknown });
}

export function envClone(e: Env): Env {
  // Clone via iteration to support both map-backed and object-backed proxies.
  const mapFlag = (e as { __isMapProxy?: unknown }).__isMapProxy === true;
  if (mapFlag) {
    const m = new Map<string, unknown>();
    for (const [k, v] of envEntries(e)) m.set(k, v);
    return makeProxyFromMap(m);
  }

  const obj: { [k: string]: unknown } = {};
  for (const k of Object.keys(e as { [k: string]: unknown }))
    obj[k] = (e as { [k: string]: unknown })[k];
  return makeProxyFromObject(obj);
}

export function envHas(e: Env, k: string): boolean {
  if ((e as { __isMapProxy?: unknown }).__isMapProxy === true)
    return (e as unknown as { has: (_key: string) => boolean }).has(k);
  return Object.prototype.hasOwnProperty.call(e as { [k: string]: unknown }, k);
}

export function envGet(e: Env, k: string): unknown {
  if ((e as { __isMapProxy?: unknown }).__isMapProxy === true)
    return (e as unknown as { get: (_key: string) => unknown }).get(k);
  return (e as { [k: string]: unknown })[k];
}

export function envSet(e: Env, k: string, v: unknown): void {
  if ((e as { __isMapProxy?: unknown }).__isMapProxy === true)
    (e as unknown as { set: (_key: string, _value: unknown) => void }).set(
      k,
      v
    );
  else (e as { [k: string]: unknown })[k] = v;
}

export function envDelete(e: Env, k: string): void {
  if ((e as { __isMapProxy?: unknown }).__isMapProxy === true)
    (e as unknown as { delete: (_key: string) => boolean }).delete(k);
  else delete (e as { [k: string]: unknown })[k];
}

export function envEntries(e: Env): IterableIterator<[string, unknown]> {
  if ((e as { __isMapProxy?: unknown }).__isMapProxy === true)
    return (
      e as unknown as { entries: () => IterableIterator<[string, unknown]> }
    ).entries();
  return Object.entries(e as { [k: string]: unknown })[
    Symbol.iterator
  ]() as IterableIterator<[string, unknown]>;
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
      (v as { value?: unknown }).value !== undefined
    ) {
      obj[k] = (v as { value?: unknown }).value;
    } else {
      obj[k] = v;
    }
  }
  return obj;
}
