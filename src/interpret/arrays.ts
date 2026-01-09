import {
  isArrayInstance,
  type RuntimeValue,
  type ArrayInstance,
} from "../types";

export interface ArrayAnnotation {
  elemType?: string;
  length: number;
}

export function cloneArrayInstance(arr: RuntimeValue): ArrayInstance {
  if (!isArrayInstance(arr)) throw new Error("internal error: invalid array");
  return {
    type: "array-instance",
    isArray: true,
    elements: arr.elements.slice(),
    length: arr.length,
    initializedCount: arr.initializedCount,
    elemType: arr.elemType,
  };
}

export function makeArrayInstance(arrAnn: ArrayAnnotation): ArrayInstance {
  return {
    type: "array-instance",
    isArray: true,
    elements: new Array(arrAnn.length),
    length: arrAnn.length,
    initializedCount: 0,
    elemType: arrAnn.elemType,
  };
}
