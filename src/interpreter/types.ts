export interface FunctionValue {
  params: string[];
  body: string;
  env: Env; // closure capture
}

export interface EnvItem {
  value: number | FunctionValue;
  mutable: boolean;
  type?: string;
}

export type Env = Map<string, EnvItem>;
