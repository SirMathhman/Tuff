import { Binding } from "./matchEval";

export interface AddressInfo {
  env: Map<string, Binding>;
  name: string;
  baseType?: string;
  // whether the variable this address points to is mutable
  targetMutable: boolean;
}

let nextAddressId = 1;
const addressMap = new Map<number, AddressInfo>();

export function resetAddressMap() {
  nextAddressId = 1;
  addressMap.clear();
}

export function allocateAddress(env: Map<string, Binding>, name: string) {
  const id = nextAddressId++;
  const binding = env.get(name);
  const baseType =
    binding && binding.type === "var" ? binding.typeName : undefined;
  const targetMutable =
    binding && binding.type === "var" ? binding.mutable : false;
  addressMap.set(id, { env, name, baseType, targetMutable });
  return id;
}

export function getAddressInfo(id: number): AddressInfo | undefined {
  return addressMap.get(id);
}

export function isAddressId(v: number): boolean {
  return addressMap.has(v);
}
