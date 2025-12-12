import { compileToESM } from "../src/index";

export function compile(src: string, filePath = "/virtual/test.tuff") {
  return compileToESM({ filePath, source: src });
}
