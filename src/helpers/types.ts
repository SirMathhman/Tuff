export interface ParamDecl {
  name: string;
  ann?: string;
}

export interface FunctionDescriptor {
  params: ParamDecl[];
  body: string;
  closure?: Map<string, Binding>;
}

export interface Binding {
  value: number;
  suffix?: string;
  assigned?: boolean;
  mutable?: boolean;
  fn?: FunctionDescriptor;
}
