export interface Location {
  line: number;
  column: number;
  offset: number;
}

export interface Span {
  start: Location;
  end: Location;
  sourceFile: string;
}
