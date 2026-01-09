import { isArrayInstance } from "../types";

export function cloneArrayInstance(arr: unknown) {
  if (!isArrayInstance(arr)) throw new Error("internal error: invalid array");
  return {
    isArray: true,
    elements: arr.elements.slice(),
    length: arr.length,
    initializedCount: arr.initializedCount,
    elemType: arr.elemType,
  };
}

export function makeArrayInstance(arrAnn: {
  elemType?: string;
  length: number;
}) {
  return {
    isArray: true,
    elements: new Array(arrAnn.length),
    length: arrAnn.length,
    initializedCount: 0,
    elemType: arrAnn.elemType,
  };
}
