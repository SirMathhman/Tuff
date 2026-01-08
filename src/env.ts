export type Env = Map<string, any> | { [k: string]: any };

function makeProxyFromMap(m: Map<string, any>) {
  const proxyTarget: any = {};
  return new Proxy(proxyTarget, {
    get(_, prop: string | symbol) {
      if (typeof prop === "symbol") return (m as any)[prop];
      if (prop === "__isEnvProxy") return true;
      if (prop === "__isMapProxy") return true;
      if (m.has(prop as string)) return m.get(prop as string);
      // expose Map methods to allow direct map usage
      const mapMethod = (m as any)[prop as any];
      if (typeof mapMethod === "function") return mapMethod.bind(m);
      return undefined;
    },

    set(_, prop: string | symbol, value: any) {
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
        return { configurable: true, enumerable: true, writable: true, value: m.get(String(prop)) };
      return undefined;
    },
  });
}

function makeProxyFromObject(obj: { [k: string]: any }) {
  const proxyTarget: any = {};
  return new Proxy(proxyTarget, {
    get(_, prop: string | symbol) {
      if (typeof prop === "symbol") return (obj as any)[prop];
      if (prop === "__isEnvProxy") return true;
      if (prop === "__isMapProxy") return false;
      if (Object.prototype.hasOwnProperty.call(obj, prop as string))
        return (obj as any)[prop as string];
      // provide Map-like helpers bound to object semantics
      if (prop === "get") return (k: string) => (obj as any)[k];
      if (prop === "set") return (k: string, v: any) => ((obj as any)[k] = v);
      if (prop === "has") return (k: string) => Object.prototype.hasOwnProperty.call(obj, k);
      if (prop === "entries") return () => Object.entries(obj)[Symbol.iterator]();
      return undefined;
    },

    set(_, prop: string | symbol, value: any) {
      if (typeof prop === "symbol") return Reflect.set(_, prop, value);
      (obj as any)[String(prop)] = value;
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
        return { configurable: true, enumerable: true, writable: true, value: (obj as any)[String(prop)] };
      return undefined;
    },
  });
}


export function ensureMapEnv(input?: { [k: string]: any } | Map<string, any>): Env {
  if (!input) return makeProxyFromObject({});
  if (input instanceof Map) return makeProxyFromMap(new Map(input));
  // given a plain object, wrap it so mutations reflect back onto it
  return makeProxyFromObject(input as { [k: string]: any });
}

export function envClone(e: Env): Env {
  // If this is a real Map, clone it into a map-backed proxy
  if ((e as any) instanceof Map) return makeProxyFromMap(new Map(e as Map<string, any>));
  // Otherwise assume object-backed (including proxy backing objects) and shallow-clone into a new object-backed proxy
  const m: { [k: string]: any } = {};
  for (const k of Object.keys(e as { [k: string]: any })) m[k] = (e as any)[k];
  return makeProxyFromObject(m);
}

export function envHas(e: Env, k: string): boolean {
  if ((e as any).__isMapProxy) return (e as any).has(k);
  return Object.prototype.hasOwnProperty.call(e as { [k: string]: any }, k);
}

export function envGet(e: Env, k: string): any {
  if ((e as any).__isMapProxy) return (e as any).get(k);
  return (e as { [k: string]: any })[k];
}

export function envSet(e: Env, k: string, v: any): void {
  if ((e as any).__isMapProxy) (e as any).set(k, v);
  else (e as { [k: string]: any })[k] = v;
}

export function envDelete(e: Env, k: string): void {
  if ((e as any).__isMapProxy) (e as any).delete(k);
  else delete (e as { [k: string]: any })[k];
}

export function envEntries(e: Env): IterableIterator<[string, any]> {
  if ((e as any).__isMapProxy) return (e as any).entries();
  return Object.entries(e as { [k: string]: any })[Symbol.iterator]() as IterableIterator<[
    string,
    any
  ]>;
}

export function envToThisObject(e: Env): { [k: string]: any } {
  const obj: { [k: string]: any } = {};
  const iter: IterableIterator<[string, any]> = (e as any).__isMapProxy
    ? (e as any).entries()
    : Object.entries(e as { [k: string]: any })[Symbol.iterator]() as IterableIterator<[string, any]>;
  for (const [k, v] of iter) {
    if (k === "this" || k.startsWith("__")) continue;
    obj[k] = v && (v as any).value !== undefined ? (v as any).value : v;
  }
  return obj;
}