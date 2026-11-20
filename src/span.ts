/** A range of character offsets into the Tuff source. */
export interface Span {
  /** Offset of the first character. */
  start: number;
  /** Offset just past the last character. */
  end: number;
}
